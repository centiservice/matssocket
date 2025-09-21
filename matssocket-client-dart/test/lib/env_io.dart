import 'dart:io';

import 'package:logging/logging.dart';
import 'package:matssocket/src/ConnectionEvent.dart';

import 'env.dart';

List<Uri> getServerUris() {
  var envUrls = Platform.environment['MATS_SOCKET_URLS'] ?? matsSocketUrlsConst;
  return envUrls.split('\$').map((url) => Uri.parse(url)).toList();
}

int? code(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as Map<String, dynamic>)['code'] as int?;
}

String? reason(ConnectionEvent connectionEvent) {
  return (connectionEvent.webSocketEvent as Map<String, dynamic>)['reason'] as String?;
}

/// Helper class to configure dart logging to print to stdout.
Level getLogLevel() {
  // We can set the log level through the environment variables, which enables
  // setting the level from gradle.
  var envLogLevel = Platform.environment['LOG_LEVEL'] ?? logLevelConst;
  switch (envLogLevel) {
    case 'ALL': return Level.ALL;
    case 'INFO': return Level.INFO;
    case 'SEVERE': return Level.SEVERE;
    default: return Level.INFO;
  }
}