import 'package:web/web.dart' as web;
import 'dart:async';
import 'dart:js_interop';
import 'package:logging/logging.dart';

import 'MatsSocketPlatform.dart';
import 'MatsSocket.dart' show CLIENT_LIB_NAME_AND_VERSION;

final Logger _logger = Logger('MatsSocket.transportHtml');

class MatsSocketPlatformWeb extends MatsSocketPlatform {
  String? cookies;
  // Keep a mapping from the Dart handler to the JS handler so we can remove by the same reference.
  final Map<Function, JSFunction> _beforeUnloadJsHandlers = {};

  @override
  WebSocket connect(Uri? webSocketUri, String protocol, String? authorization) {
    _logger.fine('Creating HTML WebSocket to $webSocketUri with protocol: $protocol');
    return WebWebSocket.create(webSocketUri.toString(), protocol, authorization);
  }

  @override
  Future<bool> closeSession(Uri closeUri, String sessionId) async {
    return web.window.navigator.sendBeacon(closeUri.toString(), null);
  }

  @override
  String get version {
    return '$CLIENT_LIB_NAME_AND_VERSION; User-Agent: ${web.window.navigator.userAgent}';
  }

  @override
  ConnectResult sendAuthorizationHeader(Uri? websocketUri, String? authorization) {
    final completer = Completer<int>();

    // Flip ws:// -> http:// and wss:// -> https:// safely (scheme only).
    final httpUri = websocketUri!.scheme == 'wss'
        ? websocketUri.replace(scheme: 'https')
        : websocketUri.replace(scheme: 'http');

    // Create an XMLHttpRequest (package:web)
    final xhr = web.XMLHttpRequest();
    xhr.open('GET', httpUri.toString());

    if (authorization != null) {
      xhr.setRequestHeader('Authorization', authorization);
    }

    xhr.onload = (web.Event e) {
      final status = xhr.status;
      if (status == 200 || status == 202 || status == 204) {
        completer.complete(status);
      } else {
        completer.completeError(status);
      }
    }.toJS;

    xhr.onerror = (web.Event e) {
      completer.completeError(-1);
    }.toJS;

    xhr.withCredentials = true;

    _logger.fine('Sending authorization headers to $httpUri using XMLHttpRequest $xhr');
    xhr.send();

    return ConnectResult(() => xhr.abort(), completer.future.timeout(const Duration(seconds: 10)));
  }

  @override
  void deregisterBeforeunload(Function(dynamic) beforeunloadHandler) {
    final jsHandler = _beforeUnloadJsHandlers.remove(beforeunloadHandler);
    if (jsHandler != null) {
      web.window.removeEventListener('beforeunload', jsHandler);
    }
  }

  @override
  void registerBeforeunload(Function(dynamic) beforeunloadHandler) {
    // Wrap the Dart handler into a JS-compatible EventListener and store its reference.
    final jsHandler = ((web.Event e) {
      beforeunloadHandler(e);
    }).toJS;
    _beforeUnloadJsHandlers[beforeunloadHandler] = jsHandler;
    web.window.addEventListener('beforeunload', jsHandler);
  }

  @override
  double performanceTime() {
    return web.window.performance.now();
  }
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

MatsSocketPlatform createTransport() => MatsSocketPlatformWeb();
