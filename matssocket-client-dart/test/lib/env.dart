import 'package:matssocket/matssocket.dart';
import 'package:logging/logging.dart';

import 'env_js.dart' if (dart.library.io) 'env_io.dart' as delegate;

var logContext = 'none';

// From compile - but it doesn't work when using 'dart -Dvar=value test', https://github.com/dart-lang/sdk/issues/51791
const matsSocketUrlsConst  = String.fromEnvironment('MATS_SOCKET_URLS', defaultValue: 'ws://localhost:8080/matssocket\$ws://localhost:8081/matssocket');
const logLevelConst  = String.fromEnvironment('LOG_LEVEL', defaultValue: 'INFO');

/// Helper class to configure dart logging to print to stdout.
void configureLogging() {
  // print('matsSocketUrls from compile: $matsSocketUrlsConst');
  // print('logLevel from compile: $logLevelConst');

  Logger.root.level = delegate.getLogLevel();

  print('Setting log level to ${Logger.root.level}');

  Logger.root.onRecord.listen((LogRecord rec) {
    print('${rec.time.toIso8601String()} ${rec.level.name} ${rec.loggerName.padRight(26)}|$logContext| ${rec.message}');
    if (rec.error != null) {
      print('\tError: ${rec.error}');
    }
    if (rec.stackTrace != null) {
      print(rec.stackTrace);
    }
  });
}

MatsSocket createMatsSocket() {
  var matsSocket = MatsSocket('TestApp', '1.2.3', delegate.getServerUris());
  logContext = matsSocket.matsSocketInstanceId;
  return matsSocket;
}

List<Uri> getServerUris() {
  return delegate.getServerUris();
}

int? code(ConnectionEvent connectionEvent) {
  return delegate.code(connectionEvent);
}

String? reason(ConnectionEvent connectionEvent) {
  return delegate.reason(connectionEvent);
}