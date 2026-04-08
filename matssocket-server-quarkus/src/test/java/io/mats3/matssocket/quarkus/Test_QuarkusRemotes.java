package io.mats3.matssocket.quarkus;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.atomic.AtomicReference;

import jakarta.websocket.SendResult;

import org.junit.Assert;
import org.junit.Test;

import io.vertx.core.buffer.Buffer;

public class Test_QuarkusRemotes {

    @Test
    public void bufferUtilCopiesRemainingBytesFromDirectBuffer() {
        ByteBuffer byteBuffer = ByteBuffer.allocateDirect(6);
        byteBuffer.put(new byte[] { 1, 2, 3, 4, 5, 6 });
        byteBuffer.position(1);
        byteBuffer.limit(4);

        Buffer buffer = QuarkusBufferUtil.toVertxBuffer(byteBuffer);

        Assert.assertArrayEquals(new byte[] { 2, 3, 4 }, buffer.getBytes());
        Assert.assertEquals(1, byteBuffer.position());
        Assert.assertEquals(4, byteBuffer.limit());
    }

    @Test
    public void basicRemoteSendsOnlyRemainingBinaryBytes() throws IOException {
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-basic",
                new QuarkusTestSupport.SimpleHandshakeRequest(Map.of(), "ws", "localhost", 80, "/ws", null));
        ByteBuffer byteBuffer = ByteBuffer.allocateDirect(5);
        byteBuffer.put(new byte[] { 10, 11, 12, 13, 14 });
        byteBuffer.position(2);
        byteBuffer.limit(4);

        new QuarkusBasicRemote(connection).sendBinary(byteBuffer);

        Assert.assertArrayEquals(new byte[] { 12, 13 }, connection.getLastBinary().getBytes());
    }

    @Test
    public void asyncRemoteCompletesHandlerAndFuture() throws Exception {
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-async",
                new QuarkusTestSupport.SimpleHandshakeRequest(Map.of(), "ws", "localhost", 80, "/ws", null));
        QuarkusWebSocketSession session = new QuarkusWebSocketSession(connection, null);
        QuarkusAsyncRemote asyncRemote = new QuarkusAsyncRemote(connection, session);
        AtomicReference<SendResult> sendResult = new AtomicReference<>();

        asyncRemote.sendText("hello", sendResult::set);
        asyncRemote.sendBinary(ByteBuffer.wrap(new byte[] { 1, 2, 3 })).get();

        Assert.assertNull(sendResult.get().getException());
        Assert.assertEquals("hello", connection.getLastText());
        Assert.assertArrayEquals(new byte[] { 1, 2, 3 }, connection.getLastBinary().getBytes());
    }

    @Test
    public void asyncRemotePropagatesSendFailure() {
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-fail",
                new QuarkusTestSupport.SimpleHandshakeRequest(Map.of(), "ws", "localhost", 80, "/ws", null));
        QuarkusWebSocketSession session = new QuarkusWebSocketSession(connection, null);
        QuarkusAsyncRemote asyncRemote = new QuarkusAsyncRemote(connection, session);
        AtomicReference<SendResult> sendResult = new AtomicReference<>();
        IllegalStateException failure = new IllegalStateException("boom");

        connection.failNextSend(failure);
        asyncRemote.sendText("hello", sendResult::set);

        Assert.assertSame(failure, sendResult.get().getException());

        connection.failNextSend(failure);
        try {
            asyncRemote.sendText("again").get();
            Assert.fail("Expected send failure.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            Assert.fail("Interrupted while waiting for future.");
        } catch (ExecutionException e) {
            Assert.assertSame(failure, e.getCause());
        }
    }
}
