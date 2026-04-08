package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Future;

import jakarta.websocket.RemoteEndpoint;
import jakarta.websocket.SendHandler;
import jakarta.websocket.SendResult;

import io.quarkus.websockets.next.WebSocketConnection;

public class QuarkusAsyncRemote implements RemoteEndpoint.Async {

    private final WebSocketConnection connection;
    private final jakarta.websocket.Session session;
    private long sendTimeout = 0;
    private boolean batchingAllowed = false;

    public QuarkusAsyncRemote(WebSocketConnection connection, jakarta.websocket.Session session) {
        this.connection = connection;
        this.session = session;
    }

    @Override
    public long getSendTimeout() {
        return sendTimeout;
    }

    @Override
    public void setSendTimeout(long timeoutmillis) {
        this.sendTimeout = timeoutmillis;
    }

    @Override
    public void sendText(String text, SendHandler handler) {
        connection.sendText(text)
            .subscribe()
            .with(
                v -> handler.onResult(new SendResult(session)),
                e -> handler.onResult(new SendResult(session, e))
            );
    }

    @Override
    public Future<Void> sendText(String text) {
        CompletableFuture<Void> future = new CompletableFuture<>();
        connection.sendText(text)
            .subscribe()
            .with(
                v -> future.complete(null),
                future::completeExceptionally
            );
        return future;
    }

    @Override
    public void sendBinary(ByteBuffer data, SendHandler handler) {
        connection.sendBinary(QuarkusBufferUtil.toVertxBuffer(data))
            .subscribe()
            .with(
                v -> handler.onResult(new SendResult(session)),
                e -> handler.onResult(new SendResult(session, e))
            );
    }

    @Override
    public Future<Void> sendBinary(ByteBuffer data) {
        CompletableFuture<Void> future = new CompletableFuture<>();
        connection.sendBinary(QuarkusBufferUtil.toVertxBuffer(data))
            .subscribe()
            .with(
                v -> future.complete(null),
                future::completeExceptionally
            );
        return future;
    }

    @Override
    public Future<Void> sendObject(Object data) {
        throw new UnsupportedOperationException("sendObject not supported - MatsSocket handles serialization");
    }

    @Override
    public void sendObject(Object data, SendHandler handler) {
        throw new UnsupportedOperationException("sendObject not supported - MatsSocket handles serialization");
    }

    @Override
    public void setBatchingAllowed(boolean allowed) throws IOException {
        this.batchingAllowed = allowed;
    }

    @Override
    public boolean getBatchingAllowed() {
        return batchingAllowed;
    }

    @Override
    public void flushBatch() throws IOException {
    }

    @Override
    public void sendPing(ByteBuffer applicationData) throws IOException, IllegalArgumentException {
    }

    @Override
    public void sendPong(ByteBuffer applicationData) throws IOException, IllegalArgumentException {
    }
}
