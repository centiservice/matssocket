package io.mats3.matssocket.quarkus;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.websocket.CloseReason;
import jakarta.websocket.Endpoint;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.server.ServerEndpointConfig;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.quarkus.websockets.next.WebSocketConnection;

/**
 * Bridges Quarkus WebSocket callbacks to MatsSocket's Jakarta endpoint.
 */
public class QuarkusMatsSocketBridge {

    private static final Logger log = LoggerFactory.getLogger(QuarkusMatsSocketBridge.class);

    private final QuarkusServerContainer serverContainer;
    private final String websocketPath;

    private final Map<String, SessionData> activeSessions = new ConcurrentHashMap<>();

    private static class SessionData {
        final QuarkusWebSocketSession session;
        final Endpoint endpoint;
        MessageHandler.Whole<String> textHandler;

        SessionData(QuarkusWebSocketSession session, Endpoint endpoint) {
            this.session = session;
            this.endpoint = endpoint;
        }
    }

    public QuarkusMatsSocketBridge(QuarkusServerContainer serverContainer, String websocketPath) {
        this.serverContainer = serverContainer;
        this.websocketPath = websocketPath;
    }

    public void onOpen(WebSocketConnection connection, io.quarkus.websockets.next.HandshakeRequest handshakeRequest) {
        log.debug("WebSocket connection opened: {}", connection.id());

        ServerEndpointConfig config = serverContainer.getEndpointConfig(websocketPath);
        if (config == null) {
            log.error("No MatsSocket endpoint registered for path: {}", websocketPath);
            closeConnection(connection);
            return;
        }

        try {
            ServerEndpointConfig.Configurator configurator = config.getConfigurator();
            QuarkusHandshakeRequest jakartaHandshakeRequest = new QuarkusHandshakeRequest(handshakeRequest);
            String origin = handshakeRequest.header("Origin");
            if (origin != null && !configurator.checkOrigin(origin)) {
                log.warn("Origin check failed for: {}", origin);
                closeConnection(connection);
                return;
            }
            QuarkusWebSocketSession jakartaSession = new QuarkusWebSocketSession(connection, jakartaHandshakeRequest);
            QuarkusHandshakeResponse jakartaHandshakeResponse = new QuarkusHandshakeResponse();
            try {
                configurator.modifyHandshake(config, jakartaHandshakeRequest, jakartaHandshakeResponse);
            } catch (Exception e) {
                log.warn("Handshake rejected: {}", e.getMessage());
                closeConnection(connection);
                return;
            }
            @SuppressWarnings("unchecked")
            Class<? extends Endpoint> endpointClass = (Class<? extends Endpoint>) config.getEndpointClass();
            Endpoint endpoint = configurator.getEndpointInstance(endpointClass);
            SessionData sessionData = new SessionData(jakartaSession, endpoint);
            activeSessions.put(connection.id(), sessionData);
            endpoint.onOpen(jakartaSession, config);
            MessageHandler.Whole<String> registeredHandler = jakartaSession.getTextMessageHandler();
            if (registeredHandler != null) {
                sessionData.textHandler = registeredHandler;
                log.info("MatsSocket connection established with handler: {}", connection.id());
            } else {
                log.warn("MatsSocket endpoint did not register a message handler for: {}", connection.id());
            }

        } catch (Exception e) {
            log.error("Failed to initialize MatsSocket connection", e);
            closeConnection(connection);
        }
    }

    public void onMessage(WebSocketConnection connection, String message) {
        SessionData sessionData = activeSessions.get(connection.id());
        if (sessionData == null) {
            log.warn("Received message for unknown connection: {}", connection.id());
            return;
        }

        if (sessionData.textHandler != null) {
            try {
                sessionData.textHandler.onMessage(message);
            } catch (Exception e) {
                log.error("Error handling message", e);
            }
        } else {
            log.warn("No message handler registered for connection: {}", connection.id());
        }
    }

    public void onClose(WebSocketConnection connection) {
        SessionData sessionData = activeSessions.remove(connection.id());
        if (sessionData != null) {
            try {
                CloseReason closeReason = new CloseReason(
                    CloseReason.CloseCodes.NORMAL_CLOSURE,
                    "Connection closed"
                );
                sessionData.endpoint.onClose(sessionData.session, closeReason);
                log.debug("MatsSocket connection closed: {}", connection.id());
            } catch (Exception e) {
                log.error("Error during close handling", e);
            }
        }
    }

    public void onClose(WebSocketConnection connection, io.quarkus.websockets.next.CloseReason reason) {
        SessionData sessionData = activeSessions.remove(connection.id());
        if (sessionData != null) {
            try {
                CloseReason.CloseCode closeCode = CloseReason.CloseCodes.getCloseCode(reason.getCode());
                CloseReason closeReason = new CloseReason(closeCode, reason.getMessage());
                sessionData.endpoint.onClose(sessionData.session, closeReason);
                log.debug("MatsSocket connection closed: {} - {} {}",
                    connection.id(), reason.getCode(), reason.getMessage());
            } catch (Exception e) {
                log.error("Error during close handling", e);
            }
        }
    }

    public void onError(WebSocketConnection connection, Throwable throwable) {
        SessionData sessionData = activeSessions.get(connection.id());
        if (sessionData != null) {
            try {
                sessionData.endpoint.onError(sessionData.session, throwable);
            } catch (Exception e) {
                log.error("Error during error handling", e);
            }
        }
        log.error("WebSocket error for connection {}: {}", connection.id(), throwable.getMessage(), throwable);
    }

    public int getActiveConnectionCount() {
        return activeSessions.size();
    }

    private void closeConnection(WebSocketConnection connection) {
        connection.close().subscribe().with(
            ignored -> {},
            e -> log.warn("Error closing connection {}", connection.id(), e)
        );
    }
}
