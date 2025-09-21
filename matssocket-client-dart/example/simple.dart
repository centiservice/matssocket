import 'dart:async';
import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';

void _configureLogging() {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((rec) => print('${rec.time.toIso8601String()} [${rec.level.name}] ${rec.loggerName}: ${rec.message}'));
}

Future<void> main() async {
  _configureLogging();

  var matsSocket = MatsSocket('TestApp', '1.2.3', [
    Uri.parse('ws://localhost:8080/matssocket'),
    Uri.parse('ws://localhost:8081/matssocket'),
  ]);

  // TOTALLY FAKE DUMMY Authentication, do NOT copy this in production code!!!
  matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:${DateTime.now().add(Duration(seconds: 10)).millisecondsSinceEpoch}');

  // Perform a request to MatsSocketEndpoint 'Test.single', which on server forwards to Mats endpoint 'Test.single'
  final result = await matsSocket.request('Test.single', 'REQUEST-with-Promise_${id(6)}', {
    'string': 'Request String',
    'number': 123.456,
    'requestTimestamp': DateTime.now().millisecondsSinceEpoch,
  });

  print(' == Request completed, result: type=${result.type} traceId=${result.traceId} rttMs=${result.roundTripMillis}');
  print('   \\- Data: ${result.data.toString()}');

  // NOTE: This makes no sense in the real world: You should never close the socket after a single request.
  // This is just for demonstration purposes. A MatsSocket should be kept open for the whole application lifetime.
  await matsSocket.close("Demo done!");
}
