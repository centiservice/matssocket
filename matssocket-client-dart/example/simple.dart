import 'package:matssocket/matssocket.dart';
import 'package:logging/logging.dart';
import 'dart:async';

void _configureLogging() {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((rec) => print('${rec.time.toIso8601String()}'
      ' [${rec.level.name.padRight(6)}] ${rec.loggerName.padRight(26)}| ${rec.message}'));
}

Future<void> main() async {
  _configureLogging();

  var matsSocket = MatsSocket('TestApp', '1.2.3', [
    Uri.parse('ws://localhost:8080/matssocket'),
    Uri.parse('ws://localhost:8081/matssocket'),
  ]);

  // TOTALLY FAKE DUMMY Authentication, do NOT copy this logic in production code!!!
  matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:'
      '${DateTime.now().add(Duration(minutes: 10)).millisecondsSinceEpoch}');

  // ----- Setup is now done, we can start interacting with the server -----

  // Perform a request to MatsSocketEndpoint 'Test.single', which on server forwards to Mats endpoint 'Test.single'
  final result = await matsSocket.request('Test.single', 'REQUEST-with-Promise_${matsSocket.randomId(6)}', {
    'string': 'Request String',
    'number': 123.456,
    'requestTimestamp': DateTime.now().millisecondsSinceEpoch,
  });

  print(' == Request completed, result: type=${result.type} traceId=${result.traceId} rttMs=${result.roundTripMillis}');
  print('   \\- Data: ${result.data.toString()}');

  // Close the MatsSocket.
  // NOTE: Closing the MatsSocket after one request makes no sense in a real application: A MatsSocket is a long-lived
  // connection, featuring automatic reconnects, keep-alive ping-pongs, reauthentication when needed etc, and should
  // be kept open for the whole application lifetime. This is just for demonstration purposes.
  await matsSocket.close("Demo done!");
}
