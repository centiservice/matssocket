# MatsSocket - Mats<sup>3</sup> to the client over WebSocket

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature
of [Mats<sup>3</sup>](https://mats3.io/) all the way out to your end user client applications, featuring bidirectional
communication. It consists of a small MatsSocketServer API which is implemented on top of the _Mats<sup>3</sup> API_ and
_JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as client libraries - for which
there currently exists JavaScript and Dart/Flutter implementations.

Java server API and implementation: [Maven Repository](https://mvnrepository.com/artifact/io.mats3.matssocket)  
JavaScript client: [npm](https://www.npmjs.com/package/matssocket)  
Dart/Flutter client: [pub.dev](https://pub.dev/packages/matssocket)

**The Java server API and implementation runs on Java 11+.**

There are also README files for the [JavaScript client](matssocket-client-javascript/client/README.md) and the
[Dart/Flutter client](matssocket-client-dart/README.md).

**Instant gratification after git clone**: _(You need Java 11 installed for development)_ To start the test server on
localhost, run `./gradlew matsSocketTestServer` from project root, or run the `io.mats3.matssocket.MatsSocketTestServer`
class from your IDE. Go to http://localhost:8080. It provides a webapp with a menu of different examples, and can run
the JS Client integration tests in the browser (which connects to the same server).

**A few Gradle tasks:**
* `./gradlew matsSocketTestServer` - starts a test server, with a test/examples webapp on localhost:8080.
* `./gradlew build` - builds the Java code, JS ESM and UMD bundles, and runs 'test' tasks.
* `./gradlew build -x test` - build, not running tests.
* `./gradlew test` - runs tests, both JS in ESM and UMD modes, and Dart in VM(Kernel,Src,Exe) and Node(JS,Wasm) modes.
  (You can run JS tests in the browser using the test server, see above.)
* `./gradlew matssocket-client-dart:testAll` - runs the Dart tests for all platforms and compilers, including in chrome
  (headless), read more in [matssocket-client-dart/README.md](matssocket-client-dart/README.md). _(Path to
  Chrome/Chromium can be set using `-PchromePath`)._
* `./gradlew clean` - deletes all build output.
* `./gradlew distclean` - .. also deletes all downloaded dependencies like Node and Dart SDKs - `distclean build` for a
  fully fresh build.
* `./gradlew npmCheckUpdates` - check all JS deps in package.json for newer versions, `npmCheckUpdatesUpdate` to force
  update.
* `./gradlew dartOutdated` - check all Dart deps in pubspec.yaml for newer versions, `dartUpgradeUpdate` to force
  update.
* `./gradlew publishDryRun` - runs dry-run publish of Dart (pub.dev) and JS (npm).
* `./gradlew versions` - displays versions of tooling: Java, Gradle, Groovy, Node, npm, Dart SDK.
* `./gradlew allDeps` - Library dependencies for Java projects.

## Overview

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

This could communicate with the following MatsSocket endpoint on the server side, which uses a Mats endpoint for
processing (Note that the setup of the MatsFactory and MatsSocketServer, including the authentication plugin, is elided
for brevity):

```java
// :: Make MatsSocket Endpoint, taking MatsSocketRequestDto and replying MatsSocketReplyDto
matsSocketServer.matsSocketEndpoint("MatsSocketEndpoint",
        MatsSocketRequestDto.class, MatsDataTO.class, MatsSocketReplyDto.class,
        // IncomingAuthorizationAndAdapter - the provided Principal is already set up by the
        // AuthenticationPlugin which the MatsSocketServer was instantiated with.
        (ctx, principal, msg) -> {
            // Perform Authorization, by casting the provided Principal to the application specific
            // instance and deciding whether to deny further processing.
            if (! ((ApplicationSpecificPrincipal) principal).canAccess("MatsSocketEndpoint")) {
                ctx.deny();
                return;
            }
            // Handle message by forwarding Request to Mats endpoint.
            ctx.forwardNonessential("MatsEndpoint.exampleEndpoint",
                                    new MatsDataTO(msg.number, ctx.getUserId()));
        },
        // ReplyAdapter - receives the Reply from the Mats endpoint, and resolves the client Promise.
        (ctx, matsReply) -> {
            // Adapting Mats endpoint's reply (type MatsDataTO) to the MatsSocket reply
            // (type MatsSocketReplyDto).
            ctx.resolve(new MatsSocketReplyDto(matsReply.string.length(), matsReply.number));
        });

// :: Make Mats Endpoint, both taking and replying with type MatsDataTO
// This Mats Endpoint could reside on a different service employing the same "Mats fabric"
// (i.e. MQ server), or reside on this service, but perform requests to a Mats Endpoint residing
// on a different service before Replying.
matsFactory.single("MatsEndpoint.exampleEndpoint", MatsDataTO.class, MatsDataTO.class, 
        (processContext, incomingDto) -> {
            // "Process" incoming message and return a Reply.
            return new MatsDataTO(incomingDto.number + 10,
                                  incomingDto.string + ":FromExampleMatsEndpoint");
        });
```

The client example first sets up the MatsSocket using two urls - the MatsSocket will randomize the array and cycle
through the result until it gets a reply. The authorization callback is set up, here using a dummy example with
expiration time. Since it starts out without a current authorization string set, any first operation on it will invoke
the callback.

It then sends a message to the "MatsSocketEndpoint", which is a named endpoint defined on the `MatsSocketServer`. That
endpoint will receive the message with its `IncomingAuthorizationAndAdapter`, and either act on it directly by denying,
replying or rejecting, or forward the request to a Mats endpoint - in this example it either denies or forwards to a
Mats endpoint. When the Mats endpoint replies, the reply will pass the MatsSocket endpoint's `ReplyAdapter`, which again
decides whether to resolve or reject - in this example it chooses resolve, which then resolves the Promise on the client.

## Bidirectional, Server-to-Client "Push", and Topics

The client may create both Terminators and Endpoints, which allows the server to send messages, and even Requests, to
the client. Terminators may also be the target for replies to client-to-server requests, by using `requestReplyTo(..)`
instead of `request(..)` as in the example above.

```javascript
// Client side Terminator
matsSocket.terminator("ClientSideTerminator", function (messageEvent) {
    console.log("Got message! CorrelationId:" + messageEvent.correlationId + ": "
        + JSON.stringify(messageEvent.data));
});

// Client side Endpoint
matsSocket.endpoint("ClientSideEndpoint", function (messageEvent) {
    return new Promise(function (resolve, reject) {
        // Resolve it a tad later, to emulate some kind of processing
        setTimeout(function () {
            let data = messageEvent.data;
            let msg = {
                string: data.string + ":AddedFromClientSideEndpoint",
                number: data.number + Math.PI
            };
            // We choose to resolve the request
            resolve(msg);
        }, 25);
    });
});
```

The client may subscribe to topics, which the server may use to broadcast messages. The server side authentication
plugin is queried whether a given user may subscribe to a given topic.

```javascript
matsSocket.subscribe("NewProductAnnouncements", function(messageEvent) {
    console.log("Got Topic message! " + JSON.stringify(messageEvent.data));
});
```

## Highly available, transparent reconnects

* **Multi node server**: The MatsSocketServer may run on multiple nodes, to ensure that at least one server is always
  up, both handling unexpected outages and rolling deploys. It utilizes a shared database to handle session state - so
  that if the MatsSocket client reconnects to a different instance, the state - including outstanding messages - will
  follow along.

* **Client side high availability**: The MatsSocket instance is instantiated using a set of URLs where it should
  connect. It will pick a random of these URLs and try to connect to that, rotating through the URLs if the first
  doesn't work.

* **Transparently handles lost connections**: MatsSocket client handles all connection aspects, including lost
  connections and reconnects. The system employs an outbox solution, where outgoing messages from both client-to-server,
  and server-to-client, will queue up if there is no connection. When the connection is reestablished, these outboxes
  will empty out. This means that if e.g. a message is received from the client on the server and forwarded to Mats, and
  then the connection drops, the reply from that Mats service will be queued up, and seamlessly delivered to the client
  when the connection is restored.

* **"Guaranteed", exactly-once processing**: When a message is sent from this side, the other side sends an
  acknowledgement - and puts a reference of the message in an inbox. When this side receives the acknowledgement, it
  removes the message from the outbox, and sends a second acknowledgement, which upon reception on the other side
  deletes the inbox-reference. This protocol ensures that even faced with lost connections, the state of a message
  transit can be recovered: messages which are in doubt will be redelivered, but if this would end up in a double
  delivery/processing, the message is deduplicated by the inbox reference - the result is exactly-once processing of
  messages.

## Authentication and Authorization

Authentication is handled by a small authentication plugin on both client and server side. It is simple enough that
you may use a cookie-based approach where the containing application already has authenticated and authorized the user
and thus just want the MatsSocket to ride on that authentication. It is however also advanced enough to handle
authentications with expiration times, e.g. direct use of Bearer access tokens, where both the MatsSocket and the
MatsSocketServer may request the client to refresh the token if it has expired, and then perform seamless
reauthentication.

Authorization is handled programmatically by the MatsSocket developer upon reception of messages, in
the `IncomingAuthorizationAndAdapter` lambda which the MatsSocket Endpoint was set up with.

## Compact and low overhead wire protocol

* **Persistent session-based setup, no per-request headers**: WebSockets are by their nature persistent, so each message
  does not need a heap of headers - the authentication and thus identification of the user is only done at session
  setup (and when reauthenticating if using authentication with expiry).

* **Low overhead protocol, small envelopes**: The system messages are few and compact, and the envelopes which carries
  the data messages are tiny.

* **Compression by default**: All browsers implement the compression extension of WebSockets, thus the wire size is as
  short as can be.

* **Batching**: MatsSockets has built-in batching of messages, both client-to-server and server-to-client, where if you
  issue multiple requests in a row, they will by default be batched, based on a small few-milliseconds timeout set after
  a request is issued. (This timeout may be overridden by `matsSocket.flush()`). This ensures that you do not need to
  think about e.g. how you perform the initial user information load upon login and make a "super request" that batches
  the content, you may instead use whatever amount and granularity of messages that is best appropriate for the backend
  storage. Batching also ensures that the compression has more information to go by, quite possibly getting multiple
  messages in a single TCP packet.

## Asynchronous, concurrent

Each message is independent of any other, including each Request with their subsequent Replies: A batch of incoming
messages are handled by a thread pool, being independently processed. Any Reply is sent over as soon as it is finished,
not caring about the order the Requests were issued in (Server-to-Client batching will kick in if they are finished very
close in time). This ensures that you do not need to care about ordering your requests in a particular way.

_(Note that a MatsSocket instance, running over a single WebSocket, is however affected by_ head-of-line blocking: _This
is not the transport you would send a Blu-ray movie over, as that direction of the channel would then be blocked until
this large message was finished transmitted. Keep your messages short and to the point!)_

## Long session times

A MatsSocketSession is either established, deregistered or closed. Deregister is what happens when the user looses
connection. When a session is deregistered, it only uses resources on the backing database. This makes it possible to
use long timeouts if this is desired, as in days - to let a user keep his state even through a long connection drop,
e.g. a flight.

## Instrumentable

There are a number of callbacks and event listening posts on both the client side, and the server side.

### Client

* `ReceivedEvents`: For each issuing of a message (Sends or Requests), you may be informed about your message being
  received (but not yet processed) by the other side. May be used for user information, e.g. when a button is clicked,
  it may transition to some "actually being processed" state. Also, the server may NACK your message.

* `matsSocket.addSessionClosedEventListener(..)`: Notifies about closing of the session, which might happen if e.g. the
  server gets uncorrectable problems with its backing store. It is suggested that you do register such a listener, as
  the session is then gone and you would need to "reboot" the application.

* `matsSocket.connected`, `matsSocket.state` and `matsSocket.addConnectionEventListener(..)`: Returns the current state
  of the underlying WebSocket, and the listener informs about the "state machine transitions" that the MatsSocket
  instance goes through, including lost connection and attempts to reconnect - enabling user feedback in the
  application (e.g. _"connection lost, reconnecting in 5, 4, 3.."_)

* `matsSocket.initiations` and `matsSocket.addInitiationProcessedEventListener(..)`: Every time a request or send is
  finished, an InitiationProcessedEvent is created which includes timing information. You may get the
  latest `matsSocket.numberOfInitiationsKept` (default 10) of these, or register an event listener. May be used for an
  app-internal "debug monitor" to survey the traffic the app performs, with timings - or submitting stats to your
  backend for inspection.

* `matsSocket.pings` and `matsSocket.addPingPongListener(..)`: MatsSocket issues pings and receives pongs, which
  includes timings. You may get the latest 100 ping-pongs, or listen in on these, possibly submitting stats to your
  backend for inspection.

* `matsSocket.addErrorEventListener(..)`: The MatsSocket may encounter different error conditions, which is reported
  here. You may add a listener that sends these back to your server by out-of-bands means (e.g. a HTTP POST), so that
  you can inspect the health of your application's MatsSockets usage.

### Server

* `server.get[Active|Live]MatsSocketSessions()`: Returns the current set of MatsSocketSessions.
* `server.getMatsSocketEndpoints()`: Introspection of the set up endpoints.
* `server.addSessionEstablishedEventListener(..)` and `server.addSessionRemovedEventListener(..)`: Listeners will be
  invoked when sessions are established (new or reconnect), deregistered, closed and timed out. Due to the nature of how
  MatsSocketSessions work wrt. reconnects, you may get multiple back-and-forths between states.
* `server.addMessageEventListener(..)`: Events issued both for client-to-server and server-to-client messages, so that
  you may create statistics and metrics on the usage and processing of all communications.

## Developer friendly

MatsSockets is made to be simple to use - at least once you're done with setting up the authentication part! In addition
to both a simple but rich API to actually do communications, and automatic handling of the connection lifecycle and
reconnects, and the instrumenting options mentioned above, it also has a couple of specific features that aid
development and debugging:

* **TraceId**: This is a mandatory parameter for all things Mats - and MatsSocket. This ensures that you can trace a
  message all the way from the client, through any Mats flows, and back to the client. Distributed logging becomes
  amazing.
* **AppName** and **AppVersion**: Mandatory parameters for creating a MatsSocket. This might be needed for
  server-to-client sends, as the client Terminator "NewProducts.personalized" is only available for the "ProductGuide"
  application, and was only added at version 1.2.5. Also, it aids debugging if you have different apps and versions of
  those apps out in the wild - these parameters are included in the logging on the server side, and available in
  the `server.get[..]MatsSocketSessions()` calls.
* **Debugging fields**: The MatsSocket system has built-in optional debugging fields on each message, which explains key
  datapoints wrt. how the message was processed, and timings.