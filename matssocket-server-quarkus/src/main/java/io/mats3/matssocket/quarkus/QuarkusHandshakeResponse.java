package io.mats3.matssocket.quarkus;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.websocket.HandshakeResponse;

/**
 * Adapter for Jakarta WebSocket {@link HandshakeResponse}.
 * <p>
 * In Quarkus WebSockets Next, we can't actually modify the HTTP response headers after
 * the upgrade. This implementation captures any headers that MatsSocket's authentication
 * plugin might want to set, though they won't actually be sent.
 * <p>
 * For authentication, MatsSocket primarily uses the request headers (Authorization, cookies)
 * rather than response headers, so this limitation is acceptable.
 */
public class QuarkusHandshakeResponse implements HandshakeResponse {

    private final Map<String, List<String>> headers = new HashMap<>();

    @Override
    public Map<String, List<String>> getHeaders() {
        return headers;
    }

    /**
     * Add a header to the response.
     * Note: In Quarkus WebSockets Next, these headers may not actually be sent.
     */
    public void addHeader(String name, String value) {
        headers.computeIfAbsent(name, k -> new ArrayList<>()).add(value);
    }
}
