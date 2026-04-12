package io.mats3.matssocket.quarkus;

import org.junit.Assert;
import org.junit.Test;

/**
 * Tests for {@link QuarkusHandshakeResponse} - verifies header capture and lossy warning behavior.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public class Test_QuarkusHandshakeResponse {

    @Test
    public void emptyHeaders_shouldNotWarn() {
        QuarkusHandshakeResponse response = new QuarkusHandshakeResponse();
        // Should not throw or log warning
        response.warnIfHeadersWereSet();
        Assert.assertTrue(response.getHeaders().isEmpty());
    }

    @Test
    public void headersSet_shouldBeCaptured() {
        QuarkusHandshakeResponse response = new QuarkusHandshakeResponse();
        response.getHeaders().put("Set-Cookie", java.util.List.of("session=abc123"));

        Assert.assertEquals(1, response.getHeaders().size());
        Assert.assertEquals("session=abc123", response.getHeaders().get("Set-Cookie").get(0));
    }

    @Test
    public void headersSet_warnShouldNotThrow() {
        QuarkusHandshakeResponse response = new QuarkusHandshakeResponse();
        response.getHeaders().put("Set-Cookie", java.util.List.of("session=abc123"));
        // Should log warning but not throw
        response.warnIfHeadersWereSet();
    }
}
