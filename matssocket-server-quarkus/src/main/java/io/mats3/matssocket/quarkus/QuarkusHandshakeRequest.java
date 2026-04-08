package io.mats3.matssocket.quarkus;

import java.net.URI;
import java.net.URLDecoder;
import java.security.Principal;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import jakarta.websocket.server.HandshakeRequest;

/**
 * Maps Quarkus handshake data to Jakarta's {@link HandshakeRequest}.
 */
public class QuarkusHandshakeRequest implements HandshakeRequest {

    private final Map<String, List<String>> headers;
    private final Map<String, List<String>> parameterMap;
    private final URI requestUri;
    private final String queryString;
    private final Principal userPrincipal;

    public QuarkusHandshakeRequest(io.quarkus.websockets.next.HandshakeRequest quarkusHandshake) {
        this.headers = copyHeadersCaseInsensitive(quarkusHandshake != null ? quarkusHandshake.headers() : null);
        this.parameterMap = new HashMap<>();
        this.queryString = quarkusHandshake != null ? quarkusHandshake.query() : null;
        if (queryString != null && !queryString.isEmpty()) {
            parseQueryString(queryString, parameterMap);
        }
        if (quarkusHandshake != null) {
            try {
                String scheme = quarkusHandshake.scheme();
                String host = quarkusHandshake.host();
                int port = quarkusHandshake.port();
                String path = quarkusHandshake.path();
                String authority = host;
                if ((scheme.equals("ws") || scheme.equals("http")) && port != 80 && port > 0) {
                    authority = host + ":" + port;
                } else if ((scheme.equals("wss") || scheme.equals("https")) && port != 443 && port > 0) {
                    authority = host + ":" + port;
                }

                String fullPath = queryString != null && !queryString.isEmpty()
                    ? path + "?" + queryString
                    : path;
                this.requestUri = new URI(scheme + "://" + authority + fullPath);
            } catch (Exception e) {
                throw new RuntimeException("Failed to construct request URI", e);
            }
        } else {
            this.requestUri = null;
        }
        this.userPrincipal = null;
    }

    public QuarkusHandshakeRequest(Map<String, List<String>> headers,
                                   Map<String, List<String>> parameterMap,
                                   URI requestUri,
                                   Principal userPrincipal) {
        this.headers = copyHeadersCaseInsensitive(headers);
        this.parameterMap = parameterMap != null ? new HashMap<>(parameterMap) : new HashMap<>();
        this.requestUri = requestUri;
        this.queryString = requestUri != null ? requestUri.getQuery() : null;
        this.userPrincipal = userPrincipal;
    }

    private Map<String, List<String>> copyHeadersCaseInsensitive(Map<String, List<String>> sourceHeaders) {
        Map<String, List<String>> copiedHeaders = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        if (sourceHeaders != null) {
            sourceHeaders.forEach((name, values) -> copiedHeaders.put(name, List.copyOf(values)));
        }
        return copiedHeaders;
    }

    private void parseQueryString(String queryString, Map<String, List<String>> params) {
        if (queryString == null || queryString.isEmpty()) {
            return;
        }
        String[] pairs = queryString.split("&");
        for (String pair : pairs) {
            int idx = pair.indexOf('=');
            String key = idx > 0 ? decode(pair.substring(0, idx)) : decode(pair);
            String value = idx > 0 && pair.length() > idx + 1 ? decode(pair.substring(idx + 1)) : "";
            params.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
        }
    }

    private String decode(String value) {
        try {
            return URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return value;
        }
    }

    @Override
    public Map<String, List<String>> getHeaders() {
        return Collections.unmodifiableMap(headers);
    }

    @Override
    public Principal getUserPrincipal() {
        return userPrincipal;
    }

    @Override
    public URI getRequestURI() {
        return requestUri;
    }

    @Override
    public boolean isUserInRole(String role) {
        return false;
    }

    @Override
    public Object getHttpSession() {
        return null;
    }

    @Override
    public Map<String, List<String>> getParameterMap() {
        return Collections.unmodifiableMap(parameterMap);
    }

    @Override
    public String getQueryString() {
        return queryString;
    }
}
