package io.mats3.matssocket.quarkus;

import java.util.List;
import java.util.Map;

import org.junit.Assert;
import org.junit.Test;

public class Test_QuarkusHandshakeRequest {

    @Test
    public void quarkusHandshakeIsMappedToCaseInsensitiveJakartaRequest() {
        QuarkusTestSupport.SimpleHandshakeRequest handshake = new QuarkusTestSupport.SimpleHandshakeRequest(
                Map.of(
                        "cookie", List.of("auth=abc"),
                        "x-test", List.of("one", "two")),
                "wss",
                "example.test",
                8443,
                "/socket",
                "foo=bar&foo=baz&encoded=hello+world&empty&equals=a%3Db");

        QuarkusHandshakeRequest request = new QuarkusHandshakeRequest(handshake);

        Assert.assertEquals(List.of("auth=abc"), request.getHeaders().get("Cookie"));
        Assert.assertEquals(List.of("one", "two"), request.getHeaders().get("X-Test"));
        Assert.assertEquals(List.of("bar", "baz"), request.getParameterMap().get("foo"));
        Assert.assertEquals(List.of("hello world"), request.getParameterMap().get("encoded"));
        Assert.assertEquals(List.of(""), request.getParameterMap().get("empty"));
        Assert.assertEquals(List.of("a=b"), request.getParameterMap().get("equals"));
        Assert.assertEquals("foo=bar&foo=baz&encoded=hello+world&empty&equals=a%3Db", request.getQueryString());
        Assert.assertEquals("wss://example.test:8443/socket?foo=bar&foo=baz&encoded=hello+world&empty&equals=a%3Db",
                request.getRequestURI().toString());
    }
}
