package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.io.OutputStream;
import java.io.Writer;
import java.nio.ByteBuffer;

import jakarta.websocket.EncodeException;
import jakarta.websocket.RemoteEndpoint;

import io.quarkus.websockets.next.WebSocketConnection;

public class QuarkusBasicRemote implements RemoteEndpoint.Basic {

    private final WebSocketConnection connection;
    private boolean batchingAllowed = false;

    public QuarkusBasicRemote(WebSocketConnection connection) {
        this.connection = connection;
    }

    @Override
    public void sendText(String text) throws IOException {
        try {
            connection.sendTextAndAwait(text);
        } catch (Exception e) {
            throw new IOException("Failed to send text message", e);
        }
    }

    @Override
    public void sendBinary(ByteBuffer data) throws IOException {
        try {
            connection.sendBinaryAndAwait(QuarkusBufferUtil.toVertxBuffer(data));
        } catch (Exception e) {
            throw new IOException("Failed to send binary message", e);
        }
    }

    @Override
    public void sendText(String partialMessage, boolean isLast) throws IOException {
        if (isLast) {
            sendText(partialMessage);
        } else {
            throw new UnsupportedOperationException("Partial text messages not supported in Quarkus adapter");
        }
    }

    @Override
    public void sendBinary(ByteBuffer partialByte, boolean isLast) throws IOException {
        if (isLast) {
            sendBinary(partialByte);
        } else {
            throw new UnsupportedOperationException("Partial binary messages not supported in Quarkus adapter");
        }
    }

    @Override
    public OutputStream getSendStream() throws IOException {
        throw new UnsupportedOperationException("Streaming not supported in Quarkus adapter");
    }

    @Override
    public Writer getSendWriter() throws IOException {
        throw new UnsupportedOperationException("Streaming not supported in Quarkus adapter");
    }

    @Override
    public void sendObject(Object data) throws IOException, EncodeException {
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
