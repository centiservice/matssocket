package io.mats3.matssocket.quarkus;

import org.junit.Assert;
import org.junit.Test;

/**
 * Tests for {@link QuarkusServerEndpointConfigShim}.
 *
 * @author Thor Egil Kolltveit 2026-04-12 - thoregil@kolltveit.org
 */
public class Test_QuarkusServerEndpointConfigShim {

    @Test
    public void path_shouldMatchConstructorArg() {
        QuarkusServerEndpointConfigShim config = new QuarkusServerEndpointConfigShim("/matssocket");
        Assert.assertEquals("/matssocket", config.getPath());
    }

    @Test
    public void subprotocols_shouldContainMatssocket() {
        QuarkusServerEndpointConfigShim config = new QuarkusServerEndpointConfigShim("/ws");
        Assert.assertEquals(1, config.getSubprotocols().size());
        Assert.assertEquals("matssocket", config.getSubprotocols().get(0));
    }

    @Test
    public void userProperties_shouldBeMutableAndShared() {
        QuarkusServerEndpointConfigShim config = new QuarkusServerEndpointConfigShim("/ws");
        config.getUserProperties().put("key", "value");
        Assert.assertEquals("value", config.getUserProperties().get("key"));
    }
}
