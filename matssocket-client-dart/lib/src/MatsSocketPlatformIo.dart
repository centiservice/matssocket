import 'package:logging/logging.dart';

import 'dart:io' as io;
import 'dart:async';

import 'MatsSocketPlatform.dart';
import 'package:matssocket/src/MatsSocket.dart';

final Logger _logger = Logger('MatsSocketPlatformIo');

MatsSocketPlatform createTransport() => MatsSocketPlatformIo();

class MatsSocketPlatformIo extends MatsSocketPlatform {
  final List<io.Cookie> _cookies = [];

  MatsSocketPlatformIo();

  Function(dynamic)? _beforeUnloadHandler;
  StreamSubscription<io.ProcessSignal>? _sigintSub;
  StreamSubscription<io.ProcessSignal>? _sigtermSub;

  @override
  void registerBeforeunload(Function(dynamic) beforeunloadHandler) {
    _beforeUnloadHandler = beforeunloadHandler;

    void listenAndFire(io.ProcessSignal signal, String name, void Function(StreamSubscription<io.ProcessSignal>) store) {
      final sub = signal.watch().listen((_) {
        _logger.info('Received $name signal');
        final h = _beforeUnloadHandler;
        // Ensure single-fire: clear handler before invoking.
        _beforeUnloadHandler = null;
        _sigintSub?.cancel();
        _sigtermSub?.cancel();
        _sigintSub = null;
        _sigtermSub = null;
        if (h != null) {
          try {
            h(null);
          } catch (e, st) {
            _logger.severe('beforeUnload handler threw on $name', e, st);
          }
        }
      });
      store(sub);
    }

    // ?: Is this NOT Windows? (Windows cannot handle SIGTERM)
    if (!io.Platform.isWindows) {
      // -> Not Windows, install handler for SIGTERM
      listenAndFire(io.ProcessSignal.sigterm, 'SIGTERM', (s) => _sigtermSub = s);
    }
    listenAndFire(io.ProcessSignal.sigint, 'SIGINT', (s) => _sigintSub = s);
  }

  @override
  void deregisterBeforeunload(Function(dynamic) beforeunloadHandler) {
    // Only one handler is supported. If it matches (or regardless, since single), clear and cancel watches.
    _beforeUnloadHandler = null;
    try { _sigintSub?.cancel(); } catch (_) {}
    try { _sigtermSub?.cancel(); } catch (_) {}
    _sigintSub = null;
    _sigtermSub = null;
  }

  @override
  ConnectResult sendPreConnectAuthorizationHeader(Uri currentWebSocketUri, String authorization) {
    final client = io.HttpClient();
    final response = Future<int>(() async {
      try {

        final preAuthHttpUri = currentWebSocketUri.scheme == 'wss'
            ? currentWebSocketUri.replace(scheme: 'https')
            : currentWebSocketUri.replace(scheme: 'http');

        final req = await client.getUrl(preAuthHttpUri);
        // Sending the actual auth-header, which is the entire point of this method.
        // (The server side can then move it over to a Cookie, which when on WebSocket connect will be sent along due
        // to common cookie jar between HTTP calls and WebSockets. This makes more sense on Browsers, where you for
        // some inexplicable reason cannot add headers to the initial WebSocket request.)
        req.headers.set('Authorization', authorization);
        // Premature optimization wrt. getting prompt release of connection.
        req.headers.set(io.HttpHeaders.connectionHeader, 'close');
        final resp = await req.close();
        _cookies.clear();
        _cookies.addAll(resp.cookies);

        // Drain any response to free connection.
        await resp.drain();

        // Get response status
        final status = resp.statusCode;
        // ?: Was it a GOOD return?
        if ((status == 200) || (status == 202) || (status == 204)) {
          // -> Yes, it was good - supplying the status code
          return status;
        } else {
          // -> Not, it was BAD - throwing the status code
          throw status;
        }
      }
      finally {
        client.close(force: true);
      }
    });
    return ConnectResult(() {
      _logger.info('  \\ - Abort requested, closing preconnect authorization attempt.');
      client.close(force: true);
    }, response);
  }

  @override
  WebSocket createAndConnectWebSocket(Uri webSocketUri, String protocol, String authorization) {
    _logger.fine('Creating dart:io WebSocket to $webSocketUri with protocol: $protocol');
    return IoWebSocket.create(webSocketUri.toString(), protocol, authorization, _cookies);
  }

  @override
  Future<bool> outOfBandCloseSession(Uri closeUri, String sessionId) async {
    final client = io.HttpClient();
    try {
      final req = await client.postUrl(closeUri);
      // Premature optimization wrt. getting prompt release of connection.
      req.headers.set(io.HttpHeaders.connectionHeader, 'close');
      final resp = await req.close();
      // Drain any response to free connection.
      await resp.drain();
      return true;
    } finally {
      client.close(force: true);
    }
  }

  @override
  String get runningOnVersions {
    // Since we are using ';' to split the pieces, we cannot allow its presence in other elements of the
    // version string. Also, ',' is used to split the name and version, thus that cannot be a part of the
    // name. For the name, we replace both with '|' (unlikely to ever happen), while for the version, we
    // replace ';' with ','.
    final osName = io.Platform.operatingSystem.replaceAll(RegExp('[;,]'), '|');
    final osVersion = io.Platform.operatingSystemVersion.replaceAll(RegExp(';'), ',');
    final dartVersion = io.Platform.version.replaceAll(RegExp(';'), ',');
    return 'Runtime: Dart VM/Exe $dartVersion; Host: $osName $osVersion';
  }

  @override
  double performanceTime() => DateTime.now().microsecondsSinceEpoch.toDouble() / 1000.0;
}

/// Implementation of WebSocket using native dart:io WebSocket.
class IoWebSocket extends WebSocket {
  final String _url;
  io.WebSocket? _ioWebSocket;

  IoWebSocket.create(String url, String protocol, String authorization, List<io.Cookie> cookies)
    : _url = url {
    var headers = {'Authorization': authorization};
    if (cookies.isNotEmpty) {
      headers['Cookie'] =
          cookies.map((cookie) => '${cookie.name}=${cookie.value}').reduce((cookie1, cookie2) => '$cookie1; $cookie2');
    }
    // Open the websocket in a future, so that we can run this async, and also handle any errors.
    Future(() async {
      _logger.info('Awaiting websocket connection');
      _ioWebSocket = await io.WebSocket.connect(url, protocols: [protocol], headers: headers);
      _logger.info('WebSocket connected');
      handleOpen();
      _ioWebSocket!.listen(handleMessage, cancelOnError: false, onError: handleError, onDone: () {
        // There really isn't a close event for the IO WebSocket, so we just create one as a map.
        // This is mainly used by unit tests, that read out the native event code and reason.
        var closeEvent = {'code': _ioWebSocket!.closeCode, 'reason': _ioWebSocket!.closeReason};
        handleClose(_ioWebSocket!.closeCode, _ioWebSocket!.closeReason, closeEvent);
        _ioWebSocket = null;
      });
    }).catchError((error, stack) {
      // Ensure the handler returns a value matching FutureOr<Null>
      handleError(error);
      return null;
    });
  }

  @override
  void close(int code, String reason) {
    _ioWebSocket?.close(code, reason);
  }

  @override
  void send(String data) {
    assert(_ioWebSocket != null, 'Cannot send to web socket unless it is present and open');
    _ioWebSocket!.add(data);
  }

  @override
  String get url => _url;
}