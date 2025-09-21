import 'dart:async';
import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';

void _configureLogging() {
  Logger.root.level = Level.ALL;
  Logger.root.onRecord.listen((rec) {
    // Print time, level, logger name, message
    print('${rec.time.toIso8601String()} [${rec.level.name}] ${rec.loggerName}: ${rec.message}');
    // If an error and stacktrace are present, print them
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

  print('Starting MatsSocket test...');

  var matsSocket = MatsSocket('TestApp', '1.2.3', [
    Uri.parse('ws://localhost:8080/matssocket'),
    Uri.parse('ws://localhost:8081/matssocket'),
  ]);

  // Extra instrumentation: connection events
  matsSocket.addConnectionEventListener((e) {
    print(' == MatsSocket listener: ConnectionEvent: type=${e.type} url=${e.webSocketUri} countdown=${e.countdownSeconds} elapsed=${e.elapsed}');
  });

  // Extra instrumentation: errors coming from all MatsSocket internals
  matsSocket.addErrorEventListener((e) {
    print(' == MatsSocket listener: ErrorEvent: type=${e.type} msg=${e.message} err=${e.reference}');
  });

  // Extra instrumentation: session closed *from server* (only from server, not client-side 'matsSocket.close()')
  matsSocket.addSessionClosedEventListener((e) {
    print(' == MatsSocket listener: SessionClosedEvent: code=${e.code} reason=${e.reason} outstandingInitiations=${e.outstandingInitiations}');
  });

  matsSocket.addInitiationProcessedEventListener((e) {
    print(' == MatsSocket listener: InitiationProcessedEvent: traceId=${e.traceId} ack.rttMs=${e.acknowledgeRoundTripMillis}');
  });

  matsSocket.setCurrentAuthorization('DummyAuth:DummyUser:${DateTime.now().add(Duration(seconds: 10)).millisecondsSinceEpoch}');
  // matsSocket.setCurrentAuthorization('DummyAuth:WontFly');

  // Wrap the request to capture both resolve and reject, and ensure stacktrace is shown
  try {
    final future = matsSocket.request('Test.single', 'REQUEST-with-Promise_${id(6)}',
      {'string': 'Request String', 'number': 123.456, 'requestTimestamp': DateTime.now().millisecondsSinceEpoch},
      receivedCallback: (received) {
        print(' == ReceivedEvent: type=${received.type} traceId=${received.traceId} rttMs=${received.roundTripMillis} desc=${received.description}');
      },
    ).catchError((Object err, StackTrace st) {
      print(' == Future catchError: $err');
      if (err is MessageEvent) {
        final m = err;
        print('    catchError: MessageEvent: type=${m.type} traceId=${m.traceId} msgId=${m.messageId} rttMs=${m.roundTripMillis}');
      }
      print('    catchError Stacktrace:\n$st');
      // rethrow to let outer try/catch handle if desired
      throw (err, st);
    });

    final result = await future;
    print(' == Request completed, result: type=${result.type} traceId=${result.traceId} cmid=${result.messageId} rttMs=${result.roundTripMillis} debug=${result.debug}');
    print('   \\- Data: ${result.data.toString()}');
  }
  catch (e, st) {
    print(' == Outer catch of exception: $e');
    print('    Stacktrace:\n$st');
  }
  finally {
    print(" == Chilling before closing.");
    await Future.delayed(const Duration(milliseconds: 1000));
    print(' == Closing MatsSocket...');
    await matsSocket.close('demo done!');
    print(' == Finished');
  }

  print(' == Finished MatsSocket test.');
}