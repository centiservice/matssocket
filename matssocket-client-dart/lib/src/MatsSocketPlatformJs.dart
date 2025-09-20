import 'package:logging/logging.dart';
import 'package:web/web.dart' as web;
import 'package:http/http.dart' as http;
import 'package:http/browser_client.dart';

import 'dart:async';
import 'dart:js_interop';

import 'MatsSocketPlatform.dart';

final Logger _logger = Logger('MatsSocketPlatformJs');

const bool isNode = bool.fromEnvironment("node");

MatsSocketPlatform createTransport() => MatsSocketPlatformJs();

class MatsSocketPlatformJs extends MatsSocketPlatform {
  String? cookies;

  @override
  WebSocket connect(Uri? webSocketUri, String protocol, String? authorization) {
    _logger.fine('Creating web:web WebSocket to $webSocketUri with protocol: $protocol');
    return WebWebSocket.create(webSocketUri.toString(), protocol, authorization);
  }

  @override
  ConnectResult sendAuthorizationHeader(Uri? websocketUri, String? authorization) {
    // :: Make abortable request:
    final abortTrigger = Completer<void>();
    final client = BrowserClient()..withCredentials = true;

    final authFuture = () async {
      final httpUri = websocketUri!.scheme == 'wss'
          ? websocketUri.replace(scheme: 'https')
          : websocketUri.replace(scheme: 'http');

      // Create an AbortableRequest, passing the trigger's future.
      final request = http.AbortableRequest(
        'GET',
        httpUri,
        abortTrigger: abortTrigger.future,
      );

      if (authorization != null) {
        request.headers['Authorization'] = authorization;
      }

      _logger.fine('Sending Authorization headers to $httpUri');

      try {
        final streamedResponse = await client.send(request)
            .timeout(const Duration(seconds: 20));

        // Convert the streamed response to a regular response to get the body/status.
        final response = await http.Response.fromStream(streamedResponse);
        final status = response.statusCode;
        if (status == 200 || status == 202 || status == 204) {
          return status; // Success!
        } else {
          throw Exception('Server returned status $status');
        }
      } on http.RequestAbortedException {
        // Handle the specific case where the request was aborted by our trigger.
        _logger.fine('Authorization request to $httpUri was aborted.');
        throw Exception('Request was aborted');
      } finally {
        client.close(); // Always close the client.
      }
    }();

    // The abort function completes the abortTrigger, causing the request to be aborted.
    void abort() {
      if (!abortTrigger.isCompleted) {
        abortTrigger.complete();
      }
    }

    return ConnectResult(abort, authFuture);
  }
  @override
  Future<bool> outOfBandCloseSession(Uri closeUri, String sessionId) async {
    // ?: Node?
    if (isNode) {
      // We don't have async unload handling in Node.js, so we'll do a best-effort POST.
      final client = BrowserClient()..withCredentials = true;
      try {
        await client
            .post(closeUri, body: const <int>[]) // empty body
            .timeout(const Duration(seconds: 3));
      } catch (_) {
        // Intentionally ignore - best effort only.
      } finally {
        client.close();
      }
      return true;
    }
    // E-> In browser, use sendBeacon:
    return web.window.navigator.sendBeacon(closeUri.toString());
  }

  // Keep a mapping from the Dart handler to the JS handler so we can remove by the same reference.
  JSFunction? _beforeUnloadJsHandler;

  @override
  void registerBeforeunload(Function(dynamic) beforeunloadHandler) {
    // ?: Is this web or node?
    if (isNode) {
      // -> Node, we don't have a way to register beforeunload.
    }
    else {
      // -> Browser, so register unload handler
      // Make JS Function to register
      final jsHandler = ((web.Event e) {
        beforeunloadHandler(e);
      }).toJS;
      _beforeUnloadJsHandler = jsHandler;
      web.window.addEventListener('beforeunload', jsHandler);
    }
  }

  @override
  void deregisterBeforeunload(Function(dynamic) beforeunloadHandler) {
    // ?: Is this web or node?
    if (isNode) {
      // -> Node, nothing to do.
    }
    else {
      // -> Browser, so deregister:
      if (_beforeUnloadJsHandler != null) {
        web.window.removeEventListener('beforeunload', _beforeUnloadJsHandler);
      }
    }
  }

  @override
  String get runningOnVersions {
    // ?: Node?
    if (isNode) {
      // -> Node, use our magic NodeInfo class:
      return 'Runtime: Node.js ${NodeInfo.nodeVersion()}, V8 ${NodeInfo.v8Version()};'
          ' Host: ${NodeInfo.platform()} on ${NodeInfo.arch()}';
    }
    // E-> Browser, so use web.window:
    return 'Runtime: Browser, User-Agent ${web.window.navigator.userAgent}';
  }

  final _stopWatch = Stopwatch()..start();

  @override
  double performanceTime() => isNode ? _stopWatch.elapsedMicroseconds / 1000.0 : web.window.performance.now();
}

/// Implementation of WebSocket using the browser's WebSocket API (package:web).
class WebWebSocket extends WebSocket {
  String? _url;
  late web.WebSocket _htmlWebSocket;

  WebWebSocket.create(String url, String protocol, String? authorization) {
    _url = url;
    _htmlWebSocket = web.WebSocket(url, protocol.toJS);
    _htmlWebSocket.onClose.forEach((closeEvent) {
      handleClose(closeEvent.code, closeEvent.reason, closeEvent);
    });
    _htmlWebSocket.onError.forEach(handleError);
    _htmlWebSocket.onMessage.forEach((messageEvent) {
      handleMessage(messageEvent.data?.toString(), messageEvent);
    });
    _htmlWebSocket.onOpen.forEach(handleOpen);
  }

  static WebWebSocket connect(String url, String protocol, String authorization) {
    return WebWebSocket.create(url, protocol, authorization);
  }

  @override
  void close(int code, String reason) {
    _htmlWebSocket.close(code, reason);
  }

  @override
  void send(String data) {
    _htmlWebSocket.send(data.toJS);
  }

  @override
  String? get url => _url;
}

// ---- Node's global `process` ----
@JS('process')
external _Process get _process;

@JS()
@staticInterop
class _Process {}

extension _ProcessExt on _Process {
  external JSString get platform;
  external JSString get arch;
  external _Versions get versions;
}

@JS()
@staticInterop
class _Versions {}

extension _VersionsExt on _Versions {
  external JSString get v8;
  external JSString get node;
}

// ---- Convenience API ----
class NodeInfo {
  static String platform() => _process.platform.toDart;
  static String arch() => _process.arch.toDart;
  static String nodeVersion() => _process.versions.node.toDart;
  static String v8Version() => _process.versions.v8.toDart;
}
