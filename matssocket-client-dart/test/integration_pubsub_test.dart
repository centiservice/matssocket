import 'dart:async';

import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';
import 'package:test/test.dart';
import 'package:http/http.dart' as http;

import 'lib/env.dart';

void main() {
  configureLogging();

  final log = Logger('integration_pubsub');

  group('MatsSocket integration tests of "pub/sub" - Publish and Subscribe', () {
    late MatsSocket matsSocket;

    void setAuth(
        [String userId = 'standard',
        Duration duration = const Duration(seconds: 20),
        roomForLatencyMillis = const Duration(seconds: 10)]) {
      var now = DateTime.now();
      var expiry = now.add(duration);
      matsSocket.setCurrentAuthorization(
          'DummyAuth:$userId:${expiry.millisecondsSinceEpoch}', expiry, roomForLatencyMillis);
    }

    setUp(() => matsSocket = createMatsSocket());

    tearDown(() async  {
      await matsSocket.close('Test done');
      log.info('=========== Closed MatsSocket [${matsSocket.matsSocketInstanceId}] ===========');
    });

    group('basic subscription with a publish from server', () {
      test('Subscribe, then send a message directing the server to publish a message.', () async {
        setAuth();
        var testTopic = "Test.topic.in-band.${matsSocket.randomId()}";
        var messageEvent = Completer<MessageEvent>();
        matsSocket.subscribe(testTopic, messageEvent.complete);

        // Refer to the other test, where we handle asyncness by only requesting server to publish after SUB_OK:
        // This is not necessary here, as this message is *in-band*, and guaranteed to happen *after* the sub.
        await matsSocket.send('Test.publish', 'PUBLISH_testSend${matsSocket.randomId(5)}', testTopic);
        await messageEvent.future;
      });

      /*
       * This was a bug (https://github.com/centiservice/matssocket/issues/11):
       * If you only subscribed to topics, no message would be sent to the server. The other similar test would still
       * work, since that performs a send after the subscribe, which then would also flush the topic subscribe message.
       */
      test('Subscribe, then use a side-channel over HTTP to direct the server to publish a message, verifying that a subscribe alone will still be sent to server.', () async {
        // Due to async nature, we'll only request the Server to publish *when we have been notified of SUB_OK*
        matsSocket.addSubscriptionEventListener((event) {
          if (event.type == SubscriptionEventType.OK) {
            // The subscription has gone through, so ask server - via HTTP - to publish a message.
            var requestToServerUri = getServerUris()[0].replace(scheme: 'http',
                path: '${getServerUris()[0].path}/sendMessageOnTestTopic',
                query: 'topic=Test.Topic_Http');

            http.get(requestToServerUri);
          }
        });

        setAuth();
        var messageEvent = Completer<MessageEvent>();
        matsSocket.subscribe('Test.Topic_Http', messageEvent.complete);
        await messageEvent.future;
      });
    });
  });
}
