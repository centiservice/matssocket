# MatsSocket JavaScript client library

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature
of [Mats<sup>3</sup>](https://mats3.io/) all the way out to your end user client applications, featuring bidirectional
communication. It consists of a small MatsSocketServer API which is implemented on top of the _Mats<sup>3</sup> API_ and
_JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as client libraries - for which
there currently exists JavaScript and Dart/Flutter implementations.

This is the JavaScript client library for MatsSocket. Compatible with web browsers and Node.js. The client is coded
using EcmaScript Modules (ESM), and bundled into USM (Universal Module Definition) modules, also minified, using Rollup.

* Native EcmaScript Modules (ESM) - use the files directly - `lib/MatsSocket.js` and siblings.
* Native EcmaScript Modules (ESM) - bundled - `dist/MatsSocket.esm.js`
* Native EcmaScript Modules (ESM) - bundled, minified - `dist/MatsSocket.esm.min.js`
* Universal Module Definition (UMD) - bundled ("by definition") - `dist/MatsSocket.umd.cjs`
* Universal Module Definition (UMD) - bundled, minified - `dist/MatsSocket.umd.min.cjs`
* A ZIP-file containing the source files - `build-gradle/dist/matssocket-<version>-js.zip`

Other deliverables:
* JSDoc is provided in `jsdoc/index.html`.
* TS type files are created in `dist/`.
* Map files of all are also created in `dist/`.

*This JS Client doesn't have any dependencies*, except for the WebSocket implementation provided by the
environment (browser or Node.js). When running in Node.js, it expects the module `ws` to be available, require()'ing it
dynamically.

MatsSocket code is at [GitHub](https://github.com/centiservice/matssocket), with the JavaScript client library residing
in the [matssocket-client-javascript](https://github.com/centiservice/matssocket/tree/main/matssocket-client-javascript) subproject.

For Development of the library itself, see [README-development.md](https://github.com/centiservice/matssocket/blob/main/matssocket-client-javascript/client/README-development.md).

To get a gist of how this works on the client, here is a small JavaScript client code example:
```javascript
// Set up the MatsSocket.
var matsSocket = new MatsSocket("TestApp", "1.2.3",
    ['wss://matssocketserver-one.example.com/matssocket',
     'wss://matssocketserver-two.example.com/matssocket']);

// Using bogus example authorization.
matsSocket.setAuthorizationExpiredCallback(function (event) {
    // Emulate that it takes some time to get new auth.
    setTimeout(function () {
        var expiry = Date.now() + 20000;
        matsSocket.setCurrentAuthorization("DummyAuth:example", expiry, 10000);
    }, 100);
});

// Perform a Request to server, which will forward the Request to a Mats endpoint, whose Reply comes
// back here, resolving the returned Promise.
matsSocket.request("MatsSocketEndpoint", "TraceId_" + matsSocket.id(6), {
    string: "Request String",
    number: Math.E
}).then(function (messageEvent) {
    console.log("REQUEST-with-Promise resolved, i.e. REPLY from Mats Endpoint. Took "
        + messageEvent.roundTripMillis + " ms: " + JSON.stringify(messageEvent.data));
});
```
More examples are in the [MatsSocket README.md](https://github.com/centiservice/matssocket/blob/main/README.md). The [JS integration tests](https://github.com/centiservice/matssocket/tree/main/matssocket-client-javascript/tests/src) shows all features of the
MatsSocket client.
