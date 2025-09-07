import 'package:web/web.dart' as web;
import 'package:logging/logging.dart';
import 'package:matssocket/src/ConnectionEvent.dart';

List<Uri> loadServerUris() {
  return [Uri.parse('ws://localhost:8080/matssocket'), Uri.parse('ws://localhost:8081/matssocket')];
}

int? code(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as web.CloseEvent).code;
}

String? reason(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as web.CloseEvent).reason;
}

Level logLevel() {
  return Level.INFO;
}