package io.mats3.matssocket.quarkus;

import java.io.IOException;

import jakarta.websocket.Session;

import io.mats3.matssocket.impl.MatsSocketTransportSession;
import io.quarkus.websockets.next.WebSocketConnection;

/**
 * Quarkus WebSockets Next implementation of {@link MatsSocketTransportSession}. Wraps a {@link WebSocketConnection}
 * for use by MatsSocket core's session/message handling.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
class QuarkusTransportSession implements MatsSocketTransportSession {

    private final WebSocketConnection _connection;
    private final QuarkusSessionShim _sessionShim;

    // Stored locally since Quarkus may not support per-connection configuration.
    private long _maxIdleTimeout;
    private int _maxTextMessageBufferSize;
    private int _maxBinaryMessageBufferSize;

    QuarkusTransportSession(WebSocketConnection connection, QuarkusHandshakeRequest handshakeRequest) {
        _connection = connection;
        _sessionShim = new QuarkusSessionShim(this, handshakeRequest);
    }

    @Override
    public String getId() {
        return _connection.id();
    }

    @Override
    public boolean isOpen() {
        return !_connection.isClosed();
    }

    @Override
    public void sendText(String text) throws IOException {
        _connection.sendTextAndAwait(text);
    }

    @Override
    public void close(int closeCode, String reasonPhrase) throws IOException {
        _connection.closeAndAwait(new io.quarkus.websockets.next.CloseReason(closeCode, reasonPhrase));
    }

    @Override
    public void setMaxIdleTimeout(long millis) {
        _maxIdleTimeout = millis;
    }

    @Override
    public void setMaxTextMessageBufferSize(int size) {
        _maxTextMessageBufferSize = size;
    }

    @Override
    public void setMaxBinaryMessageBufferSize(int size) {
        _maxBinaryMessageBufferSize = size;
    }

    @Override
    public Session getJakartaSessionView() {
        return _sessionShim;
    }

    long getMaxIdleTimeout() {
        return _maxIdleTimeout;
    }

    int getMaxTextMessageBufferSize() {
        return _maxTextMessageBufferSize;
    }

    int getMaxBinaryMessageBufferSize() {
        return _maxBinaryMessageBufferSize;
    }
}
