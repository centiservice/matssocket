import 'package:matssocket/matssocket.dart';
import 'package:logging/logging.dart';

import 'env_html.dart' if (dart.library.io) 'env_io.dart' as delegate;

var logContext = 'none';
var serverUris = delegate.loadServerUris();

/// Helper class to configure dart logging to print to stdout.
void configureLogging() {
  Logger.root.level = delegate.logLevel();

  print('Setting log level to ${Logger.root.level}');

  Logger.root.onRecord.listen((LogRecord rec) {
    print('${rec.time.toIso8601String()} ${rec.level.name} ${rec.loggerName.padRight(24)} |$logContext| ${rec.message}');
    if (rec.error != null) {
      print('\tError: ${rec.error}');
    }
    if (rec.stackTrace != null) {
      print(rec.stackTrace);
    }
  });
}

MatsSocket createMatsSocket() {
  var matsSocket = MatsSocket('TestApp', '1.2.3', serverUris);
  logContext = matsSocket.matsSocketInstanceId;
  return matsSocket;
}

int? code(ConnectionEvent connectionEvent) {
  return delegate.code(connectionEvent);
}

String? reason(ConnectionEvent connectionEvent) {
  return delegate.reason(connectionEvent);
}