package io.mats3.matssocket.quarkus;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.websocket.Endpoint;
import jakarta.websocket.EndpointConfig;
import jakarta.websocket.MessageHandler;
import jakarta.websocket.server.ServerEndpointConfig;

import io.quarkus.websockets.next.HandshakeRequest;
import io.quarkus.websockets.next.UserData;
import io.quarkus.websockets.next.WebSocketConnection;
import io.smallrye.mutiny.Uni;
import io.vertx.core.buffer.Buffer;

final class QuarkusTestSupport {
    private QuarkusTestSupport() {
    }

    static Object defaultValue(Class<?> returnType) {
        if (!returnType.isPrimitive()) {
            return null;
        }
        if (returnType == boolean.class) {
            return false;
        }
        if (returnType == byte.class) {
            return (byte) 0;
        }
        if (returnType == short.class) {
            return (short) 0;
        }
        if (returnType == int.class) {
            return 0;
        }
        if (returnType == long.class) {
            return 0L;
        }
        if (returnType == float.class) {
            return 0f;
        }
        if (returnType == double.class) {
            return 0d;
        }
        if (returnType == char.class) {
            return '\0';
        }
        throw new IllegalArgumentException("Unknown primitive type: " + returnType);
    }

    static final class SimpleHandshakeRequest implements HandshakeRequest {
        private final Map<String, List<String>> headers;
        private final String scheme;
        private final String host;
        private final int port;
        private final String path;
        private final String query;

        SimpleHandshakeRequest(Map<String, List<String>> headers, String scheme, String host, int port, String path,
                String query) {
            this.headers = new HashMap<>(headers);
            this.scheme = scheme;
            this.host = host;
            this.port = port;
            this.path = path;
            this.query = query;
        }

        @Override
        public String header(String name) {
            List<String> values = headers(name);
            return values.isEmpty() ? null : values.get(0);
        }

        @Override
        public List<String> headers(String name) {
            for (Map.Entry<String, List<String>> entry : headers.entrySet()) {
                if (entry.getKey().equalsIgnoreCase(name)) {
                    return entry.getValue();
                }
            }
            return List.of();
        }

        @Override
        public Map<String, List<String>> headers() {
            return headers;
        }

        @Override
        public String scheme() {
            return scheme;
        }

        @Override
        public String host() {
            return host;
        }

        @Override
        public int port() {
            return port;
        }

        @Override
        public String path() {
            return path;
        }

        @Override
        public String query() {
            return query;
        }
    }

    static final class RecordingWebSocketConnection implements WebSocketConnection {
        private final String id;
        private final HandshakeRequest handshakeRequest;

        private boolean closed;
        private Throwable nextSendFailure;
        private Throwable nextCloseFailure;
        private String lastText;
        private Buffer lastBinary;
        private int closeCalls;
        private io.quarkus.websockets.next.CloseReason closeReason;

        RecordingWebSocketConnection(String id, HandshakeRequest handshakeRequest) {
            this.id = id;
            this.handshakeRequest = handshakeRequest;
        }

        void failNextSend(Throwable throwable) {
            nextSendFailure = throwable;
        }

        void failNextClose(Throwable throwable) {
            nextCloseFailure = throwable;
        }

        String getLastText() {
            return lastText;
        }

        Buffer getLastBinary() {
            return lastBinary;
        }

        int getCloseCalls() {
            return closeCalls;
        }

        @Override
        public String endpointId() {
            return "endpoint";
        }

        @Override
        public BroadcastSender broadcast() {
            return null;
        }

        @Override
        public Set<WebSocketConnection> getOpenConnections() {
            return Set.of(this);
        }

        @Override
        public String subprotocol() {
            return "matssocket";
        }

        @Override
        public String id() {
            return id;
        }

        @Override
        public String pathParam(String name) {
            return null;
        }

        @Override
        public boolean isSecure() {
            return false;
        }

        @Override
        public boolean isClosed() {
            return closed;
        }

        @Override
        public io.quarkus.websockets.next.CloseReason closeReason() {
            return closeReason;
        }

        @Override
        public Uni<Void> close(io.quarkus.websockets.next.CloseReason reason) {
            closeCalls++;
            closeReason = reason;
            closed = true;
            if (nextCloseFailure != null) {
                Throwable throwable = nextCloseFailure;
                nextCloseFailure = null;
                return Uni.createFrom().failure(throwable);
            }
            return Uni.createFrom().voidItem();
        }

        @Override
        public HandshakeRequest handshakeRequest() {
            return handshakeRequest;
        }

        @Override
        public Instant creationTime() {
            return Instant.now();
        }

        @Override
        public UserData userData() {
            return null;
        }

        @Override
        public Uni<Void> sendText(String message) {
            if (nextSendFailure != null) {
                Throwable throwable = nextSendFailure;
                nextSendFailure = null;
                return Uni.createFrom().failure(throwable);
            }
            lastText = message;
            return Uni.createFrom().voidItem();
        }

        @Override
        public <M> Uni<Void> sendText(M message) {
            return sendText(String.valueOf(message));
        }

        @Override
        public Uni<Void> sendBinary(Buffer message) {
            if (nextSendFailure != null) {
                Throwable throwable = nextSendFailure;
                nextSendFailure = null;
                return Uni.createFrom().failure(throwable);
            }
            lastBinary = message;
            return Uni.createFrom().voidItem();
        }

        @Override
        public Uni<Void> sendPing(Buffer message) {
            return Uni.createFrom().voidItem();
        }

        @Override
        public Uni<Void> sendPong(Buffer message) {
            return Uni.createFrom().voidItem();
        }
    }

    static class RecordingEndpoint extends Endpoint {
        jakarta.websocket.Session openedSession;
        EndpointConfig openedConfig;
        final List<String> messages = new ArrayList<>();
        jakarta.websocket.CloseReason closedReason;
        Throwable error;

        @Override
        public void onOpen(jakarta.websocket.Session session, EndpointConfig config) {
            openedSession = session;
            openedConfig = config;
            session.addMessageHandler(new MessageHandler.Whole<String>() {
                @Override
                public void onMessage(String message) {
                    messages.add(message);
                }
            });
        }

        @Override
        public void onClose(jakarta.websocket.Session session, jakarta.websocket.CloseReason closeReason) {
            closedReason = closeReason;
        }

        @Override
        public void onError(jakarta.websocket.Session session, Throwable thr) {
            error = thr;
        }
    }

    static final class RecordingConfigurator extends ServerEndpointConfig.Configurator {
        private final Endpoint endpoint;
        private final boolean originAllowed;
        private final RuntimeException handshakeFailure;
        private int modifyHandshakeCalls;

        RecordingConfigurator(Endpoint endpoint, boolean originAllowed, RuntimeException handshakeFailure) {
            this.endpoint = endpoint;
            this.originAllowed = originAllowed;
            this.handshakeFailure = handshakeFailure;
        }

        int getModifyHandshakeCalls() {
            return modifyHandshakeCalls;
        }

        @Override
        public boolean checkOrigin(String originHeaderValue) {
            return originAllowed;
        }

        @Override
        public void modifyHandshake(ServerEndpointConfig sec, jakarta.websocket.server.HandshakeRequest request,
                jakarta.websocket.HandshakeResponse response) {
            modifyHandshakeCalls++;
            if (handshakeFailure != null) {
                throw handshakeFailure;
            }
        }

        @Override
        @SuppressWarnings("unchecked")
        public <T> T getEndpointInstance(Class<T> endpointClass) {
            return (T) endpoint;
        }
    }
}
