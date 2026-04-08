package io.mats3.matssocket.quarkus;

import java.util.List;
import java.util.Map;

import jakarta.websocket.CloseReason;
import jakarta.websocket.MessageHandler;

import org.junit.Assert;
import org.junit.Test;

public class Test_QuarkusWebSocketSession {

    @Test
    public void sessionExposesHandshakeDataAndHandlerRegistration() {
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-session",
                new QuarkusTestSupport.SimpleHandshakeRequest(
                        Map.of("Cookie", List.of("auth=abc")),
                        "wss",
                        "example.test",
                        443,
                        "/socket",
                        "client=1"));
        QuarkusHandshakeRequest handshakeRequest = new QuarkusHandshakeRequest(connection.handshakeRequest());
        QuarkusWebSocketSession session = new QuarkusWebSocketSession(connection, handshakeRequest);
        MessageHandler.Whole<String> handler = message -> { };

        session.addMessageHandler(handler);

        Assert.assertEquals("conn-session", session.getId());
        Assert.assertEquals("matssocket", session.getNegotiatedSubprotocol());
        Assert.assertTrue(session.isSecure());
        Assert.assertTrue(session.isOpen());
        Assert.assertEquals("wss://example.test/socket?client=1", session.getRequestURI().toString());
        Assert.assertEquals(List.of("1"), session.getRequestParameterMap().get("client"));
        Assert.assertEquals("client=1", session.getQueryString());
        Assert.assertEquals(1, session.getMessageHandlers().size());
        Assert.assertSame(handler, session.getTextMessageHandler());
        Assert.assertEquals(1, session.getOpenSessions().size());

        session.removeMessageHandler(handler);

        Assert.assertTrue(session.getMessageHandlers().isEmpty());
        Assert.assertNull(session.getTextMessageHandler());
    }

    @Test
    public void sessionClosePropagatesReasonToConnection() throws Exception {
        QuarkusTestSupport.RecordingWebSocketConnection connection = new QuarkusTestSupport.RecordingWebSocketConnection(
                "conn-close",
                new QuarkusTestSupport.SimpleHandshakeRequest(Map.of(), "ws", "localhost", 80, "/socket", null));
        QuarkusWebSocketSession session = new QuarkusWebSocketSession(connection, null);

        session.close(new CloseReason(CloseReason.CloseCodes.GOING_AWAY, "restart"));

        Assert.assertEquals(1, connection.getCloseCalls());
        Assert.assertEquals(1001, connection.closeReason().getCode());
        Assert.assertEquals("restart", connection.closeReason().getMessage());
        Assert.assertFalse(session.isOpen());
    }
}
