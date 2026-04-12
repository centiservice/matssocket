package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.io.OutputStream;
import java.io.Writer;
import java.net.URI;
import java.nio.ByteBuffer;
import java.security.Principal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Future;

import jakarta.websocket.CloseReason;
import jakarta.websocket.Extension;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.RemoteEndpoint;
import jakarta.websocket.SendHandler;
import jakarta.websocket.Session;
import jakarta.websocket.WebSocketContainer;

/**
 * Jakarta {@link Session} auth-edge shim backed by a {@link QuarkusTransportSession}. Used for:
 * <ul>
 *     <li>{@link io.mats3.matssocket.AuthenticationPlugin.SessionAuthenticator#onOpen(Session,
 *     jakarta.websocket.server.ServerEndpointConfig)}</li>
 *     <li>{@link io.mats3.matssocket.MatsSocketServer.LiveMatsSocketSession#getWebSocketSession()}</li>
 * </ul>
 * Implements harmless getters/setters. Unsupported operations throw {@link UnsupportedOperationException}.
 */
class QuarkusSessionShim implements Session {

    private final QuarkusTransportSession _transportSession;
    private final QuarkusHandshakeRequest _handshakeRequest;
    private final Map<String, Object> _userProperties = new ConcurrentHashMap<>();
    private final RemoteEndpoint.Basic _basicRemote;

    QuarkusSessionShim(QuarkusTransportSession transportSession, QuarkusHandshakeRequest handshakeRequest) {
        _transportSession = transportSession;
        _handshakeRequest = handshakeRequest;
        _basicRemote = new BasicRemoteShim(transportSession);
    }

    @Override
    public String getId() {
        return _transportSession.getId();
    }

    @Override
    public boolean isOpen() {
        return _transportSession.isOpen();
    }

    @Override
    public void close() throws IOException {
        _transportSession.close(1000, "Normal closure");
    }

    @Override
    public void close(CloseReason closeReason) throws IOException {
        _transportSession.close(closeReason.getCloseCode().getCode(), closeReason.getReasonPhrase());
    }

    @Override
    public Map<String, Object> getUserProperties() {
        return _userProperties;
    }

    @Override
    public URI getRequestURI() {
        return _handshakeRequest.getRequestURI();
    }

    @Override
    public Map<String, List<String>> getRequestParameterMap() {
        return _handshakeRequest.getParameterMap();
    }

    @Override
    public String getQueryString() {
        return _handshakeRequest.getQueryString();
    }

    @Override
    public RemoteEndpoint.Basic getBasicRemote() {
        return _basicRemote;
    }

    // -- Timeout/buffer setters delegating to transport session --

    @Override
    public long getMaxIdleTimeout() {
        return _transportSession.getMaxIdleTimeout();
    }

    @Override
    public void setMaxIdleTimeout(long milliseconds) {
        _transportSession.setMaxIdleTimeout(milliseconds);
    }

    @Override
    public int getMaxTextMessageBufferSize() {
        return _transportSession.getMaxTextMessageBufferSize();
    }

    @Override
    public void setMaxTextMessageBufferSize(int length) {
        _transportSession.setMaxTextMessageBufferSize(length);
    }

    @Override
    public int getMaxBinaryMessageBufferSize() {
        return _transportSession.getMaxBinaryMessageBufferSize();
    }

    @Override
    public void setMaxBinaryMessageBufferSize(int length) {
        _transportSession.setMaxBinaryMessageBufferSize(length);
    }

    @Override
    public String getProtocolVersion() {
        return "13";
    }

    @Override
    public String getNegotiatedSubprotocol() {
        return "matssocket";
    }

    @Override
    public List<Extension> getNegotiatedExtensions() {
        return Collections.emptyList();
    }

    @Override
    public boolean isSecure() {
        URI uri = getRequestURI();
        return uri != null && ("wss".equals(uri.getScheme()) || "https".equals(uri.getScheme()));
    }

    @Override
    public WebSocketContainer getContainer() {
        return null;
    }

    @Override
    public Principal getUserPrincipal() {
        return null; // MatsSocket handles auth separately.
    }

    @Override
    public Map<String, String> getPathParameters() {
        return Collections.emptyMap();
    }

    @Override
    public Set<Session> getOpenSessions() {
        throw new UnsupportedOperationException("getOpenSessions() not supported in Quarkus transport shim");
    }

    @Override
    public void addMessageHandler(MessageHandler handler) {
        throw new UnsupportedOperationException("addMessageHandler() not supported in Quarkus transport shim"
                + " - message routing is handled by QuarkusMatsSocketTransport");
    }

    @Override
    public <T> void addMessageHandler(Class<T> clazz, MessageHandler.Whole<T> handler) {
        throw new UnsupportedOperationException("addMessageHandler() not supported in Quarkus transport shim");
    }

    @Override
    public <T> void addMessageHandler(Class<T> clazz, MessageHandler.Partial<T> handler) {
        throw new UnsupportedOperationException("addMessageHandler() not supported in Quarkus transport shim");
    }

    @Override
    public Set<MessageHandler> getMessageHandlers() {
        return Collections.emptySet();
    }

    @Override
    public void removeMessageHandler(MessageHandler handler) {
        // No-op.
    }

    @Override
    public RemoteEndpoint.Async getAsyncRemote() {
        throw new UnsupportedOperationException("getAsyncRemote() not supported in Quarkus transport shim");
    }

    // ---- Minimal BasicRemote shim, backed by QuarkusTransportSession.sendText(...) ----

    private static class BasicRemoteShim implements RemoteEndpoint.Basic {
        private final QuarkusTransportSession _transport;

        BasicRemoteShim(QuarkusTransportSession transport) {
            _transport = transport;
        }

        @Override
        public void sendText(String text) throws IOException {
            _transport.sendText(text);
        }

        @Override
        public void sendBinary(ByteBuffer data) throws IOException {
            throw new UnsupportedOperationException("sendBinary() not supported in Quarkus transport shim");
        }

        @Override
        public void sendText(String partialMessage, boolean isLast) throws IOException {
            throw new UnsupportedOperationException("Partial sendText() not supported");
        }

        @Override
        public void sendBinary(ByteBuffer partialByte, boolean isLast) throws IOException {
            throw new UnsupportedOperationException("Partial sendBinary() not supported");
        }

        @Override
        public OutputStream getSendStream() {
            throw new UnsupportedOperationException("getSendStream() not supported");
        }

        @Override
        public Writer getSendWriter() {
            throw new UnsupportedOperationException("getSendWriter() not supported");
        }

        @Override
        public void sendObject(Object data) throws IOException {
            throw new UnsupportedOperationException("sendObject() not supported");
        }

        @Override
        public void setBatchingAllowed(boolean allowed) {
            // No-op.
        }

        @Override
        public boolean getBatchingAllowed() {
            return false;
        }

        @Override
        public void flushBatch() {
            // No-op.
        }

        @Override
        public void sendPing(ByteBuffer applicationData) {
            // No-op, Quarkus handles ping/pong automatically.
        }

        @Override
        public void sendPong(ByteBuffer applicationData) {
            // No-op.
        }
    }
}
