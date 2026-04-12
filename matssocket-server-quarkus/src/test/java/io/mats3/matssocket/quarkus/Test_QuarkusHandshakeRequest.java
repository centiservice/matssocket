package io.mats3.matssocket.quarkus;

import java.net.URI;
import java.util.List;
import java.util.Map;

import org.junit.Assert;
import org.junit.Test;

/**
 * Tests for {@link QuarkusHandshakeRequest} - verifies header copying, query string parsing, and URI construction.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public class Test_QuarkusHandshakeRequest {

    @Test
    public void headers_shouldBeCopiedFromQuarkusHandshake() {
        StubQuarkusHandshakeRequest stub = new StubQuarkusHandshakeRequest();
        stub._headers = Map.of("Authorization", List.of("Bearer token123"), "Origin", List.of("http://localhost:3000"));
        stub._scheme = "ws";
        stub._host = "localhost";
        stub._port = 8080;
        stub._path = "/matssocket";

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(stub);

        Assert.assertEquals(List.of("Bearer token123"), request.getHeaders().get("Authorization"));
        Assert.assertEquals(List.of("http://localhost:3000"), request.getHeaders().get("Origin"));
    }

    @Test
    public void queryString_shouldBeParsedIntoParameterMap() {
        StubQuarkusHandshakeRequest stub = new StubQuarkusHandshakeRequest();
        stub._query = "token=abc&mode=debug&token=def";
        stub._scheme = "ws";
        stub._host = "localhost";
        stub._port = 8080;
        stub._path = "/matssocket";

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(stub);

        Assert.assertEquals("abc", request.getParameterMap().get("token").get(0));
        Assert.assertEquals("def", request.getParameterMap().get("token").get(1));
        Assert.assertEquals("debug", request.getParameterMap().get("mode").get(0));
        Assert.assertEquals("token=abc&mode=debug&token=def", request.getQueryString());
    }

    @Test
    public void requestUri_shouldBeConstructedCorrectly() {
        StubQuarkusHandshakeRequest stub = new StubQuarkusHandshakeRequest();
        stub._scheme = "wss";
        stub._host = "app.finansen.no";
        stub._port = 443;
        stub._path = "/matssocket";
        stub._query = "v=1";

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(stub);

        URI uri = request.getRequestURI();
        Assert.assertEquals("wss", uri.getScheme());
        Assert.assertEquals("app.finansen.no", uri.getHost());
        Assert.assertEquals("/matssocket", uri.getPath());
        Assert.assertEquals("v=1", uri.getQuery());
    }

    @Test
    public void requestUri_nonStandardPort_shouldBeIncluded() {
        StubQuarkusHandshakeRequest stub = new StubQuarkusHandshakeRequest();
        stub._scheme = "ws";
        stub._host = "localhost";
        stub._port = 9090;
        stub._path = "/ws";

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(stub);

        Assert.assertEquals(9090, request.getRequestURI().getPort());
    }

    @Test
    public void userPrincipalAndHttpSession_shouldBeNull() {
        StubQuarkusHandshakeRequest stub = new StubQuarkusHandshakeRequest();
        stub._scheme = "ws";
        stub._host = "localhost";
        stub._port = 80;
        stub._path = "/ws";

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(stub);

        Assert.assertNull(request.getUserPrincipal());
        Assert.assertNull(request.getHttpSession());
        Assert.assertFalse(request.isUserInRole("admin"));
    }

    // ---- Stub for Quarkus HandshakeRequest ----

    private static class StubQuarkusHandshakeRequest implements io.quarkus.websockets.next.HandshakeRequest {
        Map<String, List<String>> _headers = Map.of();
        String _scheme = "ws";
        String _host = "localhost";
        int _port = 80;
        String _path = "/";
        String _query;

        @Override
        public String header(String name) {
            List<String> values = _headers.get(name);
            return values != null && !values.isEmpty() ? values.get(0) : null;
        }

        @Override
        public List<String> headers(String name) {
            return _headers.getOrDefault(name, List.of());
        }

        @Override
        public Map<String, List<String>> headers() {
            return _headers;
        }

        @Override
        public String scheme() {
            return _scheme;
        }

        @Override
        public String host() {
            return _host;
        }

        @Override
        public int port() {
            return _port;
        }

        @Override
        public String path() {
            return _path;
        }

        @Override
        public String query() {
            return _query;
        }
    }
}
