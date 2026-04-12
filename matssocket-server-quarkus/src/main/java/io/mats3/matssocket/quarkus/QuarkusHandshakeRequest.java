package io.mats3.matssocket.quarkus;

import java.net.URI;
import java.security.Principal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import jakarta.websocket.server.HandshakeRequest;

/**
 * Jakarta {@link HandshakeRequest} auth-edge shim wrapping Quarkus WebSockets Next handshake info. Exists because
 * {@link io.mats3.matssocket.AuthenticationPlugin.SessionAuthenticator#checkHandshake} and
 * {@link io.mats3.matssocket.AuthenticationPlugin.AuthenticationContext#getHandshakeRequest} expect Jakarta types.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
class QuarkusHandshakeRequest implements HandshakeRequest {

    private final Map<String, List<String>> _headers;
    private final Map<String, List<String>> _parameterMap;
    private final URI _requestUri;
    private final String _queryString;

    QuarkusHandshakeRequest(io.quarkus.websockets.next.HandshakeRequest quarkusHandshake) {
        _headers = quarkusHandshake != null ? new HashMap<>(quarkusHandshake.headers()) : new HashMap<>();
        _parameterMap = new HashMap<>();
        _queryString = quarkusHandshake != null ? quarkusHandshake.query() : null;

        if (_queryString != null && !_queryString.isEmpty()) {
            for (String pair : _queryString.split("&")) {
                int idx = pair.indexOf('=');
                String key = idx > 0 ? urlDecode(pair.substring(0, idx)) : urlDecode(pair);
                String value = idx > 0 && pair.length() > idx + 1 ? urlDecode(pair.substring(idx + 1)) : "";
                _parameterMap.computeIfAbsent(key, k -> new ArrayList<>()).add(value);
            }
        }

        if (quarkusHandshake != null) {
            try {
                String scheme = quarkusHandshake.scheme();
                String host = quarkusHandshake.host();
                int port = quarkusHandshake.port();
                String path = quarkusHandshake.path();
                int uriPort = isDefaultPort(scheme, port) ? -1 : port;
                URI baseUri = new URI(scheme, null, host, uriPort, path, null, null);
                _requestUri = _queryString != null && !_queryString.isEmpty()
                        ? new URI(baseUri.toASCIIString() + "?" + _queryString) : baseUri;
            }
            catch (Exception e) {
                throw new RuntimeException("Failed to construct request URI", e);
            }
        }
        else {
            _requestUri = null;
        }
    }

    private static String urlDecode(String value) {
        try {
            return java.net.URLDecoder.decode(value, "UTF-8");
        }
        catch (Exception e) {
            return value;
        }
    }

    private static boolean isDefaultPort(String scheme, int port) {
        return port <= 0
                || (("ws".equals(scheme) || "http".equals(scheme)) && port == 80)
                || (("wss".equals(scheme) || "https".equals(scheme)) && port == 443);
    }

    @Override
    public Map<String, List<String>> getHeaders() {
        return Collections.unmodifiableMap(_headers);
    }

    @Override
    public Principal getUserPrincipal() {
        return null; // MatsSocket handles authentication separately.
    }

    @Override
    public URI getRequestURI() {
        return _requestUri;
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
        return Collections.unmodifiableMap(_parameterMap);
    }

    @Override
    public String getQueryString() {
        return _queryString;
    }
}
