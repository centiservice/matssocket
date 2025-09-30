import 'dart:async';
import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';

void _configureLogging() {
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((rec) {
    // Print time, level, logger name, message
    print('${rec.time.toIso8601String()}'' [${rec.level.name.padRight(6)}]'
        ' ${rec.loggerName.padRight(26)}| ${rec.message}');    // If an error and stacktrace are present, print them
    if (rec.error != null) {
      print('Error: ${rec.error}');
    }
    if (rec.stackTrace != null) {
      print('Stacktrace:\n${rec.stackTrace}');
    }
  });
}

Future<void> main() async {
  _configureLogging();

  print(' == Starting MatsSocket test...');

  var matsSocket = MatsSocket('TestApp', '1.2.3', [
    Uri.parse('ws://localhost:8080/matssocket'),
    Uri.parse('ws://localhost:8081/matssocket'),
  ]);

  // :: Add event listeners.
  matsSocket.addConnectionEventListener((e) {
    print(' == MatsSocket listener: ConnectionEvent: type=${e.type} url=${e.webSocketUri}'
        ' countdown=${e.countdownSeconds} elapsed=${e.elapsed}');
  });
  matsSocket.addErrorEventListener((e) {
    print(' == MatsSocket listener: ErrorEvent: type=${e.type} msg=${e.message} err=${e.reference}');
  });
  matsSocket.addSessionClosedEventListener((e) {
    print(' == MatsSocket listener: SessionClosedEvent: code=${e.code} reason=${e.reason}'
        ' outstandingInitiations=${e.outstandingInitiations}');
  });
  matsSocket.addInitiationProcessedEventListener((e) {
    print(' == MatsSocket listener: InitiationProcessedEvent: type=${e.type} traceId=${e.traceId}'
        ' sent=${e.sentTimestamp} ack.rttMs=${e.acknowledgeRoundTripMillis} endpoint:${e.endpointId}');
  });
  matsSocket.addPingPongListener((e) {
    // Won't be invoked unless we wait for a while before closing.
    print(' == MatsSocket listener: PingPong: pingId=${e.pingId} sent=${e.sentTimestamp} rttMs=${e.roundTripMillis}');
  });

  // :: Set Authentication - true gives a good auth, false gives a bad one, demonstrating errors downstream.
  if (true) {
    // TOTALLY FAKE DUMMY Authentication, do NOT copy this logic in production code!!!
    matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:'
        '${DateTime.now().add(Duration(minutes: 10)).millisecondsSinceEpoch}');
  }
  else {
    matsSocket.setCurrentAuthorization('ThisWontFly');
  }

  // Ask for "preconnect" auth
  matsSocket.preConnectOperation = true;

  // Special OutOfBandClose handler (true gives default handling (default), String sends POST there)
  matsSocket.outOfBandClose = (Uri webSocketUri, String sessionId) {
    print(" ----- Just a dummy for OutOfBandClose handling: uri=$webSocketUri, sessionId=$sessionId"
        " - would typically have sent a HTTP POST/GET to server as additional layer of session cleanup.");
  };

  // Wrap the request to capture both resolve and reject, and ensure stacktrace is shown
  // This is way overkill wrt. normal usage, but demonstrates all ways of handling the Future.
  try {
    final future = matsSocket.request('Test.single', 'REQUEST-with-Promise_${matsSocket.randomId(6)}',
      {'string': 'Request String', 'number': 123.456, 'requestTimestamp': DateTime.now().millisecondsSinceEpoch},
      receivedCallback: (received) {
        print(' == Received callback, ReceivedEvent: type=${received.type} traceId=${received.traceId}'
            ' rttMs=${received.roundTripMillis} desc=${received.description}');
      },
    ).catchError((Object err, StackTrace st) {
      print(' == Future catchError: $err');
      if (err is MessageEvent) {
        final m = err;
        print('    catchError: MessageEvent: type=${m.type} traceId=${m.traceId} msgId=${m.messageId}'
            ' rttMs=${m.roundTripMillis}');
      }
      print('    catchError Stacktrace:\n$st');
      // rethrow to let outer try/catch handle if desired
      throw (err, st);
    });

    final result = await future;
    print(' == Request completed, result: type=${result.type} traceId=${result.traceId} cmid=${result.messageId}'
        ' rttMs=${result.roundTripMillis} debug=${result.debug}');
    print('   \\- Data: ${result.data.toString()}');
  }
  catch (e, st) {
    print(' == Outer catch of exception: $e');
    print('    Stacktrace:\n$st');
  }
  finally {
    print("\n == Chilling before closing, so we can see how the MatsSocket normally behaves wrt. ACK/ACK2");
    await Future.delayed(const Duration(milliseconds: 1000));
    print('\n == Closing MatsSocket...');
    // NOTE: Closing the MatsSocket after one request makes no sense in the real world: The MatsSocket is a long-
    // lived connection, featuring automatic reconnects, keep-alive ping-pongs, reauthentication when needed etc,
    // and should be kept open for the whole application lifetime. This is just for demonstration purposes.
    await matsSocket.close('demo done!');
  }

  print(' == Finished MatsSocket test.');
}