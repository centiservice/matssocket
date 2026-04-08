package io.mats3.matssocket.quarkus;

import java.nio.ByteBuffer;

import io.vertx.core.buffer.Buffer;

final class QuarkusBufferUtil {
    private QuarkusBufferUtil() {
    }

    static Buffer toVertxBuffer(ByteBuffer byteBuffer) {
        ByteBuffer copy = byteBuffer.slice();
        byte[] bytes = new byte[copy.remaining()];
        copy.get(bytes);
        return Buffer.buffer(bytes);
    }
}
