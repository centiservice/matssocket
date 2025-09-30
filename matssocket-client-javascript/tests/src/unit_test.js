import * as chai from "chai"
import * as mats from "matssocket"

let logging = false;

let webSocketCreated;

// :: Make mock WebSocket FACTORY
function makeMockWebSocket(url, protocol) {
    const ws = {url, protocol};

    webSocketCreated = true;

    // send: echo relevant protocol messages as the real server would
    ws.send = function (payload) {
        // Forward HELLO -> WELCOME, and ACKs for messages with cmid
        JSON.parse(payload).forEach(({ t, cmid }, idx) => {
            if (t === "HELLO") {
                setTimeout(() => {
                    ws.onmessage && ws.onmessage({ target: ws, data: JSON.stringify([{ t: "WELCOME" }]) });
                }, idx);
            }
            if (t !== "ACK2" && cmid !== undefined) {
                setTimeout(() => {
                    ws.onmessage && ws.onmessage({ target: ws, data: JSON.stringify([{ t: "ACK", cmid }]) });
                }, idx);
            }
        });
    };

    ws.close = function () { /* no-op for tests */ };

    // onopen setter: MatsSocket sets and unsets this; call the callback immediately when set
    Object.defineProperty(ws, "onopen", {
        set(callback) {
            if (callback !== undefined) {
                setTimeout(() => callback({ target: ws }), 0);
            }
        }
    });

    return ws;
}


// MatsSocket config object specifying Mock WebSocket factory.
// The factory will create a fresh WebSocket each time MatsSocket connects.
let config = {
    webSocketFactory: (url, protocol) => {
        return makeMockWebSocket(url, protocol);
    }
};

describe('MatsSocket unit tests', function () {
    describe('constructor', function () {

        it('Should fail on no arg invocation', function () {
            chai.assert.throws(() => new mats.MatsSocket());
        });

        it('Should fail if appVersion and urls are missing', function () {
            chai.assert.throws(() => new mats.MatsSocket("Test"));
        });

        it('Should fail if urls are missing', function () {
            chai.assert.throws(() => new mats.MatsSocket("Test", "1.0"));
        });
        it('Activity should invoke the WebSocket constructor', async function () {
            webSocketCreated = undefined;
            let matsSocket = new mats.MatsSocket("Test", "1.0", ["ws://localhost:8080/"], config);
            matsSocket.setCurrentAuthorization("Dummy");
            // We should not have created the WebSocket yet.
            chai.assert(!webSocketCreated);
            // This 'send' will create the WebSocket (sending HELLO+auth and SEND), and thus invoke the WebSocket constructor.
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});
            chai.assert(webSocketCreated);
            matsSocket.close("test done.");
            webSocketCreated = undefined;
        });
    });

    describe('authorization callback', function () {
        it('Should invoke authorization callback before making calls', async function () {
            const matsSocket = new mats.MatsSocket("Test", "1.0", ["ws://localhost:8080/"], config);
            matsSocket.logging = logging;

            let authCallbackCalled = false;
            matsSocket.setAuthorizationExpiredCallback(function (event) {
                authCallbackCalled = true;
                matsSocket.setCurrentAuthorization("Test", Date.now() + 20000, 0);
            });
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});

            chai.assert(authCallbackCalled);

            matsSocket.close("Test done");
        });

        it('Should not invoke authorization callback if authorization present', async function () {
            const matsSocket = new mats.MatsSocket("Test", "1.0", ["ws://localhost:8080/"], config);
            matsSocket.logging = logging;

            let authCallbackCalled = false;
            matsSocket.setCurrentAuthorization("Test", Date.now() + 20000, 0);
            matsSocket.setAuthorizationExpiredCallback(function (event) {
                authCallbackCalled = true;
            });
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});

            chai.assert(!authCallbackCalled);
            matsSocket.close("Test done");
        });

        it('Should invoke authorization callback when expired', async function () {
            const matsSocket = new mats.MatsSocket("Test", "1.0", ["ws://localhost:8080/"], config);
            matsSocket.logging = logging;

            let authCallbackCalled = false;
            matsSocket.setCurrentAuthorization("Test", Date.now() - 20000, 0);
            matsSocket.setAuthorizationExpiredCallback(function (event) {
                authCallbackCalled = true;
                matsSocket.setCurrentAuthorization("Test", Date.now() + 20000, 0);
            });
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});

            chai.assert(authCallbackCalled);
            matsSocket.close("Test done");
        });

        it('Should invoke authorization callback when room for latency expired', async function () {
            const matsSocket = new mats.MatsSocket("Test", "1.0", ["ws://localhost:8080/"], config);
            matsSocket.logging = logging;

            let authCallbackCalled = false;
            matsSocket.setCurrentAuthorization("Test", Date.now() + 1000, 2000);
            matsSocket.setAuthorizationExpiredCallback(function (event) {
                authCallbackCalled = true;
                matsSocket.setCurrentAuthorization("Test", Date.now() + 20000, 0);
            });
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});

            chai.assert(authCallbackCalled);
            matsSocket.close("Test done");
        });
    });

    describe('preconnectoperation callback', function () {
        it('Should invoke preconnectoperation callback if function', async function () {
            const url = "ws://localhost:8080/";
            const matsSocket = new mats.MatsSocket("Test", "1.0", url, config);
            matsSocket.logging = logging;

            let preConnectRequestCalled = false;
            matsSocket.preconnectoperation = function (params) {
                // Assert that the WebSocket URL that will be connected to is present.
                chai.assert.strictEqual(params.webSocketUrl, url);

                preConnectRequestCalled = true;

                // Return value as contract stipulates.
                let abortFunction = function () {
                    /* no-op abort, shall not be invoked in this test. */
                    chai.fail("Shall not be invoked");
                };
                let requestPromise = new Promise((resolve, reject) => {
                    resolve("rock on");
                });
                return [abortFunction, requestPromise];
            };

            let authCallbackCalled = false;

            matsSocket.setAuthorizationExpiredCallback(function (event) {
                authCallbackCalled = true;
                matsSocket.setCurrentAuthorization("Test", Date.now() + 20000, 0);
            });
            await matsSocket.send("Test.authCallback", "SEND_" + matsSocket.randomId(6), {});

            chai.assert(preConnectRequestCalled);
            chai.assert(authCallbackCalled);

            matsSocket.close("Test done");
        });
    });
});
