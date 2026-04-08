package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.net.URI;
import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import jakarta.websocket.CloseReason;
import jakarta.websocket.Extension;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.RemoteEndpoint;
import jakarta.websocket.Session;
import jakarta.websocket.WebSocketContainer;

import io.quarkus.websockets.next.WebSocketConnection;

/**
 * Maps a Quarkus {@link WebSocketConnection} to Jakarta's {@link Session}.
 */
public class QuarkusWebSocketSession implements Session {

    private final WebSocketConnection quarkusConnection;
    private final QuarkusHandshakeRequest handshakeRequest;
    private final Map<String, Object> userProperties = new ConcurrentHashMap<>();

    private long maxIdleTimeout = 0;
    private int maxBinaryMessageBufferSize = 8192;
    private int maxTextMessageBufferSize = 8192;

    private volatile MessageHandler.Whole<String> textMessageHandler;

    public QuarkusWebSocketSession(WebSocketConnection quarkusConnection, QuarkusHandshakeRequest handshakeRequest) {
        this.quarkusConnection = quarkusConnection;
        this.handshakeRequest = handshakeRequest;
    }

    @Override
    public String getId() {
        return quarkusConnection.id();
    }

    @Override
    public WebSocketContainer getContainer() {
        return null;
    }

    @Override
    @SuppressWarnings("unchecked")
    public void addMessageHandler(MessageHandler handler) throws IllegalStateException {
        if (handler instanceof MessageHandler.Whole) {
            this.textMessageHandler = (MessageHandler.Whole<String>) handler;
        }
    }

    @Override
    @SuppressWarnings("unchecked")
    public <T> void addMessageHandler(Class<T> clazz, MessageHandler.Whole<T> handler) {
        if (clazz == String.class) {
            this.textMessageHandler = (MessageHandler.Whole<String>) handler;
        }
    }

    @Override
    public <T> void addMessageHandler(Class<T> clazz, MessageHandler.Partial<T> handler) {
    }

    @Override
    public Set<MessageHandler> getMessageHandlers() {
        return textMessageHandler != null ? Set.of(textMessageHandler) : Set.of();
    }

    @Override
    public void removeMessageHandler(MessageHandler handler) {
        if (handler == textMessageHandler) {
            textMessageHandler = null;
        }
    }

    public MessageHandler.Whole<String> getTextMessageHandler() {
        return textMessageHandler;
    }

    @Override
    public String getProtocolVersion() {
        return "13";
    }

    @Override
    public String getNegotiatedSubprotocol() {
        return quarkusConnection.subprotocol() != null ? quarkusConnection.subprotocol() : "";
    }

    @Override
    public List<Extension> getNegotiatedExtensions() {
        return List.of();
    }

    @Override
    public boolean isSecure() {
        return handshakeRequest != null &&
               handshakeRequest.getRequestURI() != null &&
               "wss".equalsIgnoreCase(handshakeRequest.getRequestURI().getScheme());
    }

    @Override
    public boolean isOpen() {
        return !quarkusConnection.isClosed();
    }

    @Override
    public long getMaxIdleTimeout() {
        return maxIdleTimeout;
    }

    @Override
    public void setMaxIdleTimeout(long milliseconds) {
        this.maxIdleTimeout = milliseconds;
    }

    @Override
    public void setMaxBinaryMessageBufferSize(int length) {
        this.maxBinaryMessageBufferSize = length;
    }

    @Override
    public int getMaxBinaryMessageBufferSize() {
        return maxBinaryMessageBufferSize;
    }

    @Override
    public void setMaxTextMessageBufferSize(int length) {
        this.maxTextMessageBufferSize = length;
    }

    @Override
    public int getMaxTextMessageBufferSize() {
        return maxTextMessageBufferSize;
    }

    @Override
    public RemoteEndpoint.Async getAsyncRemote() {
        return new QuarkusAsyncRemote(quarkusConnection, this);
    }

    @Override
    public RemoteEndpoint.Basic getBasicRemote() {
        return new QuarkusBasicRemote(quarkusConnection);
    }

    @Override
    public URI getRequestURI() {
        return handshakeRequest != null ? handshakeRequest.getRequestURI() : null;
    }

    @Override
    public Map<String, List<String>> getRequestParameterMap() {
        return handshakeRequest != null ? handshakeRequest.getParameterMap() : Map.of();
    }

    @Override
    public String getQueryString() {
        URI uri = getRequestURI();
        return uri != null ? uri.getQuery() : null;
    }

    @Override
    public Map<String, String> getPathParameters() {
        return Map.of();
    }

    @Override
    public Map<String, Object> getUserProperties() {
        return userProperties;
    }

    @Override
    public Principal getUserPrincipal() {
        return null;
    }

    @Override
    public Set<Session> getOpenSessions() {
        return Set.of(this);
    }

    @Override
    public void close() throws IOException {
        quarkusConnection.close().await().indefinitely();
    }

    @Override
    public void close(CloseReason closeReason) throws IOException {
        quarkusConnection.close(
            new io.quarkus.websockets.next.CloseReason(
                closeReason.getCloseCode().getCode(),
                closeReason.getReasonPhrase()
            )
        ).await().indefinitely();
    }
}
