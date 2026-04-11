package io.mats3.matssocket.impl;

import java.io.IOException;

import jakarta.websocket.Session;

/**
 * Internal transport session abstraction for MatsSocket. Decouples core session/message handling from the concrete
 * WebSocket implementation (Jakarta WebSocket, Quarkus WebSockets Next, etc.).
 * <p>
 * Covers only runtime socket operations: send, close, connection state and buffer/timeout configuration. Does not
 * abstract authentication or handshake - those remain at the transport edge.
 *
 * @author Thor Egil Kolltveit 2026-04-10 - thoregil@kolltveit.org
 */
public interface MatsSocketTransportSession {

    /** @return unique id for this WebSocket connection. */
    String getId();

    /** @return whether the underlying WebSocket connection is open. */
    boolean isOpen();

    /** Send a text message synchronously. */
    void sendText(String text) throws IOException;

    /** Close the connection with the given close code and reason phrase. */
    void close(int closeCode, String reasonPhrase) throws IOException;

    /** Set the idle timeout in milliseconds. Best-effort; some transports may not support per-connection timeouts. */
    void setMaxIdleTimeout(long millis);

    /** Set the max text message buffer size in bytes. Best-effort. */
    void setMaxTextMessageBufferSize(int size);

    /** Set the max binary message buffer size in bytes. Best-effort. */
    void setMaxBinaryMessageBufferSize(int size);

    /**
     * @return a Jakarta WebSocket {@link Session} view of this transport session, for backwards compatibility with
     *         {@link io.mats3.matssocket.MatsSocketServer.LiveMatsSocketSession#getWebSocketSession()
     *         LiveMatsSocketSession.getWebSocketSession()}. Jakarta transport returns the real Session; Quarkus
     *         transport returns a shim.
     */
    Session getJakartaSessionView();
}
