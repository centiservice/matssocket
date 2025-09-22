Very simple example:
1. Creates the MatsSocket
2. Sets Authentication (very fake auth system here!)
3. Performs a request
4. Prints the response
5. Closes the MatsSocket

Standalone in [simple.dart](simple.dart).

_(There's a more elaborate example in [listeners_and_callback.dart](listeners_and_callback.dart), and the
[integration tests](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart/test) in
the source code exercises all the features of the client library)_

This will run if you have started the `MatsSocketTestServer` from the source code; git clone and run
`./gradlew matsSocketTestServer`.

```dart
import 'dart:async';
import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';

void _configureLogging() {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((rec) => print('${rec.time.toIso8601String()}'
      ' [${rec.level.name}] ${rec.loggerName}: ${rec.message}'));
}

Future<void> main() async {
  _configureLogging();

  var matsSocket = MatsSocket('TestApp', '1.2.3', [
    Uri.parse('ws://localhost:8080/matssocket'),
    Uri.parse('ws://localhost:8081/matssocket'),
  ]);

  // TOTALLY FAKE DUMMY Authentication, do NOT copy this in production code!!!
  matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:'
      '${DateTime.now().add(Duration(seconds: 10)).millisecondsSinceEpoch}');

  // Perform a request to MatsSocketEndpoint 'Test.single', which on server forwards to Mats endpoint 'Test.single'
  final result = await matsSocket.request('Test.single', 'REQUEST-with-Promise_${id(6)}', {
    'string': 'Request String',
    'number': 123.456,
    'requestTimestamp': DateTime.now().millisecondsSinceEpoch,
  });

  print(' == Request completed, result: type=${result.type} traceId=${result.traceId} rttMs=${result.roundTripMillis}');
  print('   \\- Data: ${result.data.toString()}');

  // Close the MatsSocket.
  // NOTE: Closing the MatsSocket after one request makes no sense in the real world: The MatsSocket is a long-lived
  // connection, featuring automatic reconnects, keep-alive ping-pongs, reauthentication when needed etc, and should
  // be kept open for the whole application lifetime. This is just for demonstration purposes.
  await matsSocket.close("Demo done!");
}
```