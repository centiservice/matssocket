package io.mats3.matssocket.quarkus;

import java.util.List;
import java.util.Map;

import jakarta.websocket.server.ServerEndpointConfig;

import org.junit.Assert;
import org.junit.Test;

public class Test_QuarkusMatsSocketBridge {

    @Test
    public void bridgeForwardsOpenMessageCloseAndError() throws Exception {
        QuarkusServerContainer serverContainer = new QuarkusServerContainer();
        QuarkusTestSupport.RecordingEndpoint endpoint = new QuarkusTestSupport.RecordingEndpoint();
        QuarkusTestSupport.RecordingConfigurator configurator = new QuarkusTestSupport.RecordingConfigurator(
                endpoint, true, null);
        ServerEndpointConfig config = ServerEndpointConfig.Builder
                .create(QuarkusTestSupport.RecordingEndpoint.class, "/socket")
                .configurator(configurator)
                .build();
        serverContainer.addEndpoint(config);

        QuarkusMatsSocketBridge bridge = new QuarkusMatsSocketBridge(serverContainer, "/socket");
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-1",
                new QuarkusTestSupport.SimpleHandshakeRequest(
                        Map.of("Origin", List.of("https://client.test")),
                        "wss",
                        "example.test",
                        443,
                        "/socket",
                        "client=1"));

        bridge.onOpen(connection, connection.handshakeRequest());
        bridge.onMessage(connection, "payload");
        RuntimeException error = new RuntimeException("boom");
        bridge.onError(connection, error);
        bridge.onClose(connection, new io.quarkus.websockets.next.CloseReason(1001, "going away"));

        Assert.assertNotNull(endpoint.openedSession);
        Assert.assertSame(config, endpoint.openedConfig);
        Assert.assertEquals(List.of("payload"), endpoint.messages);
        Assert.assertSame(error, endpoint.error);
        Assert.assertEquals(1001, endpoint.closedReason.getCloseCode().getCode());
        Assert.assertEquals("going away", endpoint.closedReason.getReasonPhrase());
        Assert.assertEquals(0, bridge.getActiveConnectionCount());
        Assert.assertEquals(1, configurator.getModifyHandshakeCalls());
    }

    @Test
    public void bridgeRejectsOriginBeforeOpeningSession() throws Exception {
        QuarkusServerContainer serverContainer = new QuarkusServerContainer();
        QuarkusTestSupport.RecordingEndpoint endpoint = new QuarkusTestSupport.RecordingEndpoint();
        QuarkusTestSupport.RecordingConfigurator configurator = new QuarkusTestSupport.RecordingConfigurator(
                endpoint, false, null);
        serverContainer.addEndpoint(ServerEndpointConfig.Builder
                .create(QuarkusTestSupport.RecordingEndpoint.class, "/socket")
                .configurator(configurator)
                .build());

        QuarkusMatsSocketBridge bridge = new QuarkusMatsSocketBridge(serverContainer, "/socket");
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-origin",
                new QuarkusTestSupport.SimpleHandshakeRequest(
                        Map.of("Origin", List.of("https://blocked.test")),
                        "ws",
                        "localhost",
                        80,
                        "/socket",
                        null));

        bridge.onOpen(connection, connection.handshakeRequest());

        Assert.assertNull(endpoint.openedSession);
        Assert.assertEquals(1, connection.getCloseCalls());
        Assert.assertEquals(0, bridge.getActiveConnectionCount());
        Assert.assertEquals(0, configurator.getModifyHandshakeCalls());
    }

    @Test
    public void bridgeClosesConnectionWhenHandshakeFails() throws Exception {
        QuarkusServerContainer serverContainer = new QuarkusServerContainer();
        QuarkusTestSupport.RecordingEndpoint endpoint = new QuarkusTestSupport.RecordingEndpoint();
        QuarkusTestSupport.RecordingConfigurator configurator = new QuarkusTestSupport.RecordingConfigurator(
                endpoint, true, new IllegalStateException("nope"));
        serverContainer.addEndpoint(ServerEndpointConfig.Builder
                .create(QuarkusTestSupport.RecordingEndpoint.class, "/socket")
                .configurator(configurator)
                .build());

        QuarkusMatsSocketBridge bridge = new QuarkusMatsSocketBridge(serverContainer, "/socket");
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-handshake",
                new QuarkusTestSupport.SimpleHandshakeRequest(
                        Map.of("Origin", List.of("https://client.test")),
                        "ws",
                        "localhost",
                        80,
                        "/socket",
                        null));

        bridge.onOpen(connection, connection.handshakeRequest());

        Assert.assertNull(endpoint.openedSession);
        Assert.assertEquals(1, connection.getCloseCalls());
        Assert.assertEquals(1, configurator.getModifyHandshakeCalls());
        Assert.assertEquals(0, bridge.getActiveConnectionCount());
    }
}
