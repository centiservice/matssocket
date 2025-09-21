import 'package:web/web.dart' as web;
import 'package:logging/logging.dart';
import 'package:matssocket/src/ConnectionEvent.dart';

import 'env.dart';

List<Uri> getServerUris() {
  return matsSocketUrlsConst.split('\$').map((url) => Uri.parse(url)).toList();
}

int? code(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as web.CloseEvent).code;
}

String? reason(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as web.CloseEvent).reason;
}

Level getLogLevel() {
  return Level.INFO;
}