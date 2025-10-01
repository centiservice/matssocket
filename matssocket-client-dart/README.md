# MatsSocket Dart/Flutter client library

This is the Dart client library for MatsSocket. It handles both VM, Node and Web platforms (using conditional
imports and dynamic resolving for the few platform specifics, notably the WebSocket implementation), and is
compatible with Flutter. It runs on all platforms (VM, Node, Web) with all compiler targets
(Kernel, Source, Exe, JS, Wasm).

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature
of [Mats<sup>3</sup>](https://mats3.io/) all the way out to your end user client applications, featuring
bidirectional communication. It consists of a small MatsSocketServer API which is implemented on top of the
_Mats<sup>3</sup> API_ and _JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as
client libraries - for which there currently exists JavaScript and Dart/Flutter implementations.

Dependencies: `logging` for all targets, and `web` and `http` for the JS targets (Node and Web).

MatsSocket code is at [GitHub](https://github.com/centiservice/matssocket), with the Dart client library residing
in the [matssocket-client-dart](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart)
subproject.

There are a few examples in the
[example](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart/example) directory, and the
[integration tests](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart/test)
exercises all features of the MatsSocket client.

For Development of the library itself, see
[README-development.md](https://github.com/centiservice/matssocket/blob/main/matssocket-client-dart/README-development.md).

Here's a very simple example:
1. Creates the MatsSocket
2. Sets Authentication _(very fake auth system here!)_
3. Performs a request
4. Prints the response
5. Closes the MatsSocket _(.. only done on application close; A MatsSocket is a long-lived connection)_

This will run if you have started the `MatsSocketTestServer` from the source code; git clone and run
`./gradlew matsSocketTestServer`.

```dart
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

  // ----- Setup is now done, we can start interacting with the server -----

  // TOTALLY FAKE DUMMY Authentication, do NOT copy this logic in production code!!!
  matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:'
      '${DateTime.now().add(Duration(minutes: 10)).millisecondsSinceEpoch}');

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
```