# MatsSocket Quarkus Adapter

Adapter that bridges [Quarkus WebSockets Next](https://quarkus.io/guides/websockets-next-reference) to
[MatsSocket](https://matssocket.io/), enabling MatsSocket to run on Quarkus without modification.

## Overview

MatsSocket is built on Jakarta WebSocket (JSR 356), which is the standard WebSocket API in Java EE / Jakarta EE.
Quarkus WebSockets Next is a newer, reactive WebSocket implementation that is not directly compatible.

This adapter implements the Jakarta WebSocket interfaces that MatsSocket requires, delegating to Quarkus
WebSockets Next under the hood.

## Installation

```xml
<dependency>
    <groupId>io.mats3</groupId>
    <artifactId>matssocket-server-quarkus</artifactId>
    <version>2.0.0+2025-11-01</version>
</dependency>
```

## Usage

### 1. Create the MatsSocketServer

```java
@ApplicationScoped
public class MatsSocketSetup {

    @Inject MatsFactory matsFactory;
    @Inject ClusterStoreAndForward csaf;

    private MatsSocketQuarkusFactory.MatsSocketQuarkusSetup setup;

    void onStart(@Observes StartupEvent event) {
        setup = MatsSocketQuarkusFactory.create(
            matsFactory, csaf, new MyAuthenticationPlugin(), "/matssocket");
    }

    @Produces @ApplicationScoped
    public MatsSocketServer matsSocketServer() { return setup.server(); }

    @Produces @ApplicationScoped
    public QuarkusMatsSocketBridge matsSocketBridge() { return setup.bridge(); }
}
```

### 2. Create the WebSocket Endpoint

```java
@WebSocket(path = "/matssocket")
public class MatsSocketEndpoint {

    @Inject QuarkusMatsSocketBridge bridge;

    @OnOpen
    void onOpen(WebSocketConnection conn, HandshakeRequest req) {
        bridge.onOpen(conn, req);
    }

    @OnTextMessage
    void onMessage(WebSocketConnection conn, String msg) {
        bridge.onMessage(conn, msg);
    }

    @OnClose
    void onClose(WebSocketConnection conn, CloseReason reason) {
        bridge.onClose(conn, reason);
    }

    @OnError
    void onError(WebSocketConnection conn, Throwable t) {
        bridge.onError(conn, t);
    }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Your Quarkus Application                      │
├─────────────────────────────────────────────────────────────────┤
│  @WebSocket Endpoint  ────────►  QuarkusMatsSocketBridge        │
│         │                              │                         │
│         ▼                              ▼                         │
│  Quarkus WebSockets Next ◄────  QuarkusWebSocketSession         │
│                                 (implements jakarta.websocket)   │
├─────────────────────────────────────────────────────────────────┤
│                       MatsSocket Server                          │
│  (Official io.mats3.matssocket:matssocket-server-impl)          │
└─────────────────────────────────────────────────────────────────┘
```

## Adapter Components

| Component | Jakarta Interface | Purpose |
|-----------|------------------|---------|
| `QuarkusServerContainer` | `ServerContainer` | Captures endpoint registration |
| `QuarkusWebSocketSession` | `Session` | Wraps Quarkus WebSocketConnection |
| `QuarkusBasicRemote` | `RemoteEndpoint.Basic` | Synchronous message sending |
| `QuarkusAsyncRemote` | `RemoteEndpoint.Async` | Async message sending |
| `QuarkusHandshakeRequest` | `HandshakeRequest` | Access to headers/params |
| `QuarkusHandshakeResponse` | `HandshakeResponse` | Handshake response (limited) |
| `QuarkusMatsSocketBridge` | - | Routes events to MatsSocket |

## MatsSocket API Compatibility

### Full Support

| Feature | Implementation |
|---------|---------------|
| `Session.getId()` | Maps to `WebSocketConnection.id()` |
| `Session.getBasicRemote().sendText()` | Maps to `sendTextAndAwait()` |
| `Session.getAsyncRemote().sendText()` | Maps to `sendText()` (reactive) |
| `Session.addMessageHandler()` | Captures handler for routing |
| `Session.getUserProperties()` | ConcurrentHashMap per session |
| `Session.isOpen()` | Maps to `!connection.isClosed()` |
| `Session.close()` | Maps to `connection.close()` |
| `HandshakeRequest.getHeaders()` | ALL headers captured |
| `HandshakeRequest.getParameterMap()` | Query string parsed |
| `HandshakeRequest.getRequestURI()` | Constructed from Quarkus API |
| `ServerEndpointConfig.Configurator` | Lifecycle support (see limitations below) |

### Known Limitations

| Feature | Limitation | Workaround |
|---------|------------|------------|
| `Session.setMaxIdleTimeout()` | No per-session timeout | Configure globally via `quarkus.websockets-next.server.idle-timeout` |
| `Session.setMaxTextMessageBufferSize()` | No per-session buffer | Configure globally via `quarkus.websockets-next.server.max-message-size` |
| Partial messages | Not supported | MatsSocket sends complete messages only |
| `RemoteEndpoint.getSendStream()` | Not supported | MatsSocket doesn't use streaming |
| Ping/Pong manual control | Automatic | Quarkus handles ping/pong automatically |
| `getOpenSessions()` | Returns only self | Would need server-level tracking |
| Remote address | Not exposed | Quarkus WebSockets Next doesn't expose client IP directly |
| `HandshakeResponse` headers | Mutations not sent to client | Quarkus WebSockets Next does not support setting response headers during upgrade. Auth plugins that set `Set-Cookie` or similar on the handshake response will not take effect. |

### Configuration

Add to `application.properties`:

```properties
# WebSocket idle timeout (default: no timeout)
quarkus.websockets-next.server.idle-timeout=PT5M

# Max message size (default: 65536)
quarkus.websockets-next.server.max-message-size=131072

# Auto ping interval (default: disabled)
quarkus.websockets-next.server.auto-ping-interval=PT30S
```

## Implementation Notes

### Message Handler Capture

MatsSocket registers its message handler via `Session.addMessageHandler()` during the `Endpoint.onOpen()`
call. This adapter captures the handler and uses it in `QuarkusMatsSocketBridge.onMessage()`:

```java
// During onOpen, MatsSocket calls:
session.addMessageHandler(new MatsSocketSessionAndMessageHandler(...));

// The adapter captures this and routes incoming messages:
sessionData.textHandler.onMessage(message);
```

### Authentication Flow

The adapter supports MatsSocket's authentication flow with one caveat — response header mutations during handshake are not sent to the client (see Known Limitations):

1. `Configurator.checkOrigin()` - Called with Origin header
2. `Configurator.modifyHandshake()` - Called for authentication
3. `Configurator.getEndpointInstance()` - Creates MatsSocket endpoint

If authentication fails in `modifyHandshake()`, the connection is closed.

## Contributing

This adapter is designed to be self-contained with no application-specific dependencies.
It could potentially be contributed upstream to the [MatsSocket project](https://github.com/centiservice/matssocket).

## License

Apache License 2.0 (same as MatsSocket)
