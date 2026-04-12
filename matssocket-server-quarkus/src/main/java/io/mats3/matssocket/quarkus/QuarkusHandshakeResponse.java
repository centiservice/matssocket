package io.mats3.matssocket.quarkus;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import jakarta.websocket.HandshakeResponse;

/**
 * Jakarta {@link HandshakeResponse} auth-edge shim. <b>Lossy:</b> Quarkus WebSockets Next cannot mutate HTTP response
 * headers after the WebSocket upgrade. If an {@link io.mats3.matssocket.AuthenticationPlugin.SessionAuthenticator}
 * sets headers during {@code checkHandshake(...)}, a warning is logged since those headers will not be delivered.
 */
public class QuarkusHandshakeResponse implements HandshakeResponse {
    private static final Logger log = LoggerFactory.getLogger(QuarkusHandshakeResponse.class);

    private final Map<String, List<String>> _headers = new HashMap<>();

    @Override
    public Map<String, List<String>> getHeaders() {
        return _headers;
    }

    /**
     * Called after {@code checkHandshake(...)} to warn if the auth plugin set response headers that cannot be delivered.
     */
    public void warnIfHeadersWereSet() {
        if (!_headers.isEmpty()) {
            log.warn("Auth plugin set response headers during checkHandshake(), but Quarkus WebSockets Next cannot"
                    + " send response headers after upgrade. Headers lost: " + _headers.keySet());
        }
    }
}
