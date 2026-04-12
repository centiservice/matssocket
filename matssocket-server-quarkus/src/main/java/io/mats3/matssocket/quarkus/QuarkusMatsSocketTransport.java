package io.mats3.matssocket.quarkus;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.mats3.matssocket.AuthenticationPlugin;
import io.mats3.matssocket.AuthenticationPlugin.SessionAuthenticator;
import io.mats3.matssocket.MatsSocketServer.MatsSocketCloseCodes;
import io.mats3.matssocket.impl.DefaultMatsSocketServer;
import io.mats3.matssocket.impl.MatsSocketTransportHandler;
import io.quarkus.websockets.next.WebSocketConnection;

/**
 * Bridges Quarkus WebSockets Next events into MatsSocket without pretending to be a Jakarta ServerContainer or
 * Endpoint lifecycle. The application's {@code @WebSocket} endpoint delegates its {@code @OnOpen}, {@code @OnTextMessage},
 * {@code @OnClose} and {@code @OnError} callbacks to this class.
 * <p>
 * Auth shims are created for each connection to satisfy the Jakarta-typed
 * {@link io.mats3.matssocket.AuthenticationPlugin} API.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public class QuarkusMatsSocketTransport {
    private static final Logger log = LoggerFactory.getLogger(QuarkusMatsSocketTransport.class);

    private final DefaultMatsSocketServer _matsSocketServer;
    private final AuthenticationPlugin _authenticationPlugin;
    private final String _websocketPath;

    // Per-connection state: connectionId -> SessionData
    private final Map<String, SessionData> _sessions = new ConcurrentHashMap<>();

    QuarkusMatsSocketTransport(DefaultMatsSocketServer matsSocketServer, AuthenticationPlugin authenticationPlugin,
            String websocketPath) {
        _matsSocketServer = matsSocketServer;
        _authenticationPlugin = authenticationPlugin;
        _websocketPath = websocketPath;
    }

    /**
     * Called from the application's {@code @OnOpen} handler.
     */
    public void onOpen(WebSocketConnection connection,
            io.quarkus.websockets.next.HandshakeRequest quarkusHandshake) {
        String connectionId = connection.id() + "_Q";

        // :: Create auth shims
        QuarkusHandshakeRequest handshakeRequest = new QuarkusHandshakeRequest(quarkusHandshake);
        QuarkusHandshakeResponse handshakeResponse = new QuarkusHandshakeResponse();
        QuarkusServerEndpointConfigShim serverEndpointConfig = new QuarkusServerEndpointConfigShim(_websocketPath);

        // :: Create transport session + session shim (backed by same transport)
        QuarkusTransportSession transportSession = new QuarkusTransportSession(connection, handshakeRequest);

        // ?: If we are going down, then immediately close it.
        if (_matsSocketServer.isStopped()) {
            DefaultMatsSocketServer.closeTransportSession(transportSession,
                    MatsSocketCloseCodes.SERVICE_RESTART.getCode(),
                    "This server is going down, perform a (re)connect to another instance.");
            return;
        }

        // :: Set low pre-HELLO limits before auth
        _matsSocketServer.configurePreAuthSession(transportSession);

        // :: Create SessionAuthenticator
        SessionAuthenticator sessionAuthenticator = _authenticationPlugin.newSessionAuthenticator();

        // :: Run auth flow - same methods as Jakarta, just invoked sequentially after accept

        // 1. checkOrigin
        String origin = getOriginHeader(handshakeRequest);
        boolean originOk = sessionAuthenticator.checkOrigin(origin);
        log.info("checkOrigin({}). SessionAuthenticator returned: {}", origin, originOk ? "OK" : "NOT OK!");
        if (!originOk) {
            DefaultMatsSocketServer.closeTransportSession(transportSession,
                    MatsSocketCloseCodes.VIOLATED_POLICY.getCode(), "Origin check failed");
            return;
        }

        // 2. checkHandshake
        boolean handshakeOk = sessionAuthenticator.checkHandshake(serverEndpointConfig, handshakeRequest,
                handshakeResponse);
        log.info("checkHandshake(). SessionAuthenticator returned: {}", handshakeOk ? "OK" : "NOT OK!");
        handshakeResponse.warnIfHeadersWereSet();
        if (!handshakeOk) {
            DefaultMatsSocketServer.closeTransportSession(transportSession,
                    MatsSocketCloseCodes.VIOLATED_POLICY.getCode(), "Handshake check failed");
            return;
        }

        // 3. onOpen
        try {
            boolean openOk = sessionAuthenticator.onOpen(transportSession.getJakartaSessionView(),
                    serverEndpointConfig);
            log.info("onOpen(). SessionAuthenticator returned: {}", openOk ? "OK" : "NOT OK!");
            if (!openOk) {
                DefaultMatsSocketServer.closeTransportSession(transportSession,
                        MatsSocketCloseCodes.VIOLATED_POLICY.getCode(),
                        "SessionAuthenticator did not want this session to proceed");
                return;
            }
        }
        catch (Throwable t) {
            log.error("Got throwable when invoking SessionAuthenticator.onOpen(). Closing.", t);
            DefaultMatsSocketServer.closeTransportSession(transportSession,
                    MatsSocketCloseCodes.VIOLATED_POLICY.getCode(),
                    "SessionAuthenticator did not want this session to proceed");
            return;
        }

        // :: Resolve remote address (best-effort from headers)
        String remoteAddr = resolveRemoteAddr(handshakeRequest);

        // :: Create MatsSocket session handler
        MatsSocketTransportHandler handler = _matsSocketServer.createSessionHandlerAfterAuth(
                transportSession, connectionId, handshakeRequest, sessionAuthenticator, remoteAddr);

        _sessions.put(connection.id(), new SessionData(transportSession, handler, connectionId));

        log.info("MatsSocket connection established: connectionId={}", connectionId);
    }

    /**
     * Called from the application's {@code @OnTextMessage} handler.
     */
    public void onMessage(WebSocketConnection connection, String message) {
        SessionData sessionData = _sessions.get(connection.id());
        if (sessionData != null) {
            sessionData._handler.onMessage(message);
        }
        else {
            log.warn("Received message for unknown connection: " + connection.id());
        }
    }

    /**
     * Called from the application's {@code @OnClose} handler.
     */
    public void onClose(WebSocketConnection connection, io.quarkus.websockets.next.CloseReason closeReason) {
        SessionData sessionData = _sessions.remove(connection.id());
        if (sessionData != null) {
            int code = closeReason != null ? closeReason.getCode() : 1000;
            String message = closeReason != null ? closeReason.getMessage() : null;
            String reason = message != null ? message : "Connection closed";
            DefaultMatsSocketServer.handleTransportClose(sessionData._handler, sessionData._transportSession,
                    sessionData._connectionId, code, reason, sessionData._isTimeoutException);
        }
    }

    /**
     * Called from the application's {@code @OnError} handler.
     */
    public void onError(WebSocketConnection connection, Throwable thr) {
        SessionData sessionData = _sessions.get(connection.id());
        if (sessionData != null) {
            sessionData._isTimeoutException = DefaultMatsSocketServer.handleTransportError(
                    sessionData._handler, sessionData._transportSession, thr);
        }
        else {
            log.warn("Error on unknown/pre-auth connection: " + connection.id(), thr);
        }
    }

    public int getActiveConnectionCount() {
        return _sessions.size();
    }

    // :: Internals

    private static String getOriginHeader(QuarkusHandshakeRequest handshakeRequest) {
        List<String> origins = getHeaderValuesIgnoreCase(handshakeRequest.getHeaders(), "Origin");
        return (origins != null && !origins.isEmpty()) ? origins.get(0) : null;
    }

    private static String resolveRemoteAddr(QuarkusHandshakeRequest handshakeRequest) {
        // Try X-Forwarded-For first (common in proxied setups)
        List<String> xff = getHeaderValuesIgnoreCase(handshakeRequest.getHeaders(), "X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            // Take the first (leftmost) IP
            String first = xff.get(0);
            int comma = first.indexOf(',');
            return comma > 0 ? first.substring(0, comma).trim() : first.trim();
        }
        return null; // Quarkus WebSockets Next doesn't expose remote address directly.
    }

    private static List<String> getHeaderValuesIgnoreCase(Map<String, List<String>> headers, String headerName) {
        for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(headerName)) {
                return entry.getValue();
            }
        }
        return null;
    }

    private static class SessionData {
        final QuarkusTransportSession _transportSession;
        final MatsSocketTransportHandler _handler;
        final String _connectionId;
        volatile boolean _isTimeoutException;

        SessionData(QuarkusTransportSession transportSession, MatsSocketTransportHandler handler,
                String connectionId) {
            _transportSession = transportSession;
            _handler = handler;
            _connectionId = connectionId;
        }
    }
}
