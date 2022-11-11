import * as mats from "matssocket"

let logging = false;

let matsSocket;

const urls = (typeof process !== 'undefined') && process.env.MATS_SOCKET_URLS
    || "ws://localhost:8080/matssocket,ws://localhost:8081/matssocket";

function createMatsSocket() {
    matsSocket = new mats.MatsSocket("TestApp", "1.2.3", urls.split(","));
    matsSocket.logging = logging;
}

function closeMatsSocket() {
    // :: Chill the close slightly, so as to get the final "ACK2" envelope over to delete server's inbox.
    // NOTE: This is done async, so for the fast tests, the closings will come in "behind".
    let toClose = matsSocket;
    setTimeout(function () {
        toClose.close("Test done");
    }, 120);
}

function setAuth(userId = "standard", duration = 20000, roomForLatencyMillis = 10000) {
    const now = Date.now();
    const expiry = now + duration;
    matsSocket.setCurrentAuthorization("DummyAuth:" + userId + ":" + expiry, expiry, roomForLatencyMillis);
}


describe('MatsSocket integration tests of "pub/sub" - Publish and Subscribe', function () {

    describe('basic subscription with a publish from server', function () {
        // Create Socket before each request
        beforeEach(() => {
            createMatsSocket();
        });
        afterEach(() => {
            closeMatsSocket();
        });


        it('Subscribe, then send a message directing the server to publish a message.', function (done) {
            setAuth();
            matsSocket.subscribe("Test.topic", function (messageEvent) {
                done();
            });

            // Refer to the other test, where we handle asyncness by only requesting server to publish after SUB_OK:
            // This is not necessary here, as this message is *in-band*, and guaranteed to happen *after* the sub.
            matsSocket.send("Test.publish", "PUBLISH_testSend" + matsSocket.id(5), "Testmessage");
        });

        /*
         * This was a bug (https://github.com/centiservice/matssocket/issues/11):
         * If you only subscribed to topics, no message would be sent to the server. The other similar test would still
         * work, since that performs a send after the subscribe, which then would also flush the topic subscribe message.
         */
        it('Subscribe, then use a side-channel over HTTP to direct the server to publish a message, verifying that a subscribe alone will still be sent to server.', function (done) {
            // Due to async nature, we'll only request the Server to publish *when we have been notified of SUB_OK*
            matsSocket.addSubscriptionEventListener((event) => {
                if (event.type === mats.SubscriptionEventType.OK) {
                    // The subscription has gone through, so ask server - via HTTP - to publish a message.
                    let url = urls.split(",")[0].replace('ws', 'http');
                    fetch(url + '/sendMessageOnTestTopic?topic=Test.Topic_Http');
                }
            })

            setAuth();
            matsSocket.subscribe("Test.Topic_Http", function (messageEvent) {
                done();
            });
        });
    });
});
