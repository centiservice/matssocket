import 'package:logging/logging.dart';

import 'dart:io' as io;
import 'dart:async';

import 'MatsSocketPlatform.dart';

final Logger _logger = Logger('MatsSocketPlatformIo');

MatsSocketPlatform createTransport() => MatsSocketPlatformIo();

class MatsSocketPlatformIo extends MatsSocketPlatform {
  final List<io.Cookie> _cookies = [];

  MatsSocketPlatformIo();

  @override
  WebSocket connect(Uri? webSocketUri, String protocol, String? authorization) {
    _logger.fine('Creating dart:io WebSocket to $webSocketUri with protocol: $protocol');
    return IoWebSocket.create(webSocketUri.toString(), protocol, authorization, _cookies);
  }

  @override
  Future<bool> outOfBandCloseSession(Uri closeUri, String sessionId) async {
    final client = io.HttpClient();
    final request = await client.postUrl(closeUri);
    await request.close();
    return true;
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
  ConnectResult sendAuthorizationHeader(Uri? websocketUri, String? authorization) {
    final client = io.HttpClient();
    final response = Future<int>(() async {
      var preAuthUri = websocketUri!.replace(scheme: websocketUri.scheme.replaceAll('ws', 'http'));

      var req = await client.getUrl(preAuthUri);
      req.headers.set('Authorization', '$authorization');
      var response = await req.close();
      _cookies.clear();
      _cookies.addAll(response.cookies);

      // Get response status
      var status = response.statusCode;
      // ?: Was it a GOOD return?
      if ((status == 200) || (status == 202) || (status == 204)) {
        // -> Yes, it was good - supplying the status code
        return status;
      } else {
        // -> Not, it was BAD - supplying the status code
        throw status;
      }
    });
    return ConnectResult(() {
      _logger.info('  \\ - Abort requested, closing client');
      client.close(force: true);
    }, response);
  }

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
  double performanceTime() => DateTime.now().microsecondsSinceEpoch.toDouble() / 1000.0;
}

/// Implementation of WebSocket using native dart:io WebSocket.
class IoWebSocket extends WebSocket {
  String? _url;
  io.WebSocket? _ioWebSocket;

  IoWebSocket.create(String url, String protocol, String? authorization, List<io.Cookie> cookies) {
    _url = url;
    var headers = {'Authorization': '$authorization'};
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
  String? get url => _url;
}