import * as mats from "matssocket"

let logging = false;

let matsSocket;

const urls = process && process.env && process.env.MATS_SOCKET_URLS || "ws://localhost:8080/matssocket,ws://localhost:8081/matssocket";

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

    describe('reconnect', function () {
        // Create Socket before each request
        beforeEach(() => {
            createMatsSocket();
        });
        afterEach(() => {
            closeMatsSocket();
        });


        it('Sub/Pub - preliminary.', function (done) {
            setAuth();
            matsSocket.subscribe("Test.topic", function (messageEvent) {
                done();
            });

            matsSocket.send("Test.publish", "PUBLISH_testSend" + matsSocket.id(5), "Testmessage");
        });
    });
});
