export { MatsSocketCloseCodes }

/**
 * <b>Copied directly from MatsSocketServer.java</b>:
 * WebSocket CloseCodes used in MatsSocket, and for what. Using both standard codes, and MatsSocket-specific/defined
 * codes.
 * <p/>
 * Note: Plural "Codes" since that is what the JSR 356 Java WebSocket API {@link CloseCodes does..!}
 *
 * @enum {int}
 * @readonly
 */
const MatsSocketCloseCodes = {
    /**
     * Standard code 1008 - From Server side, Client should REJECT all outstanding and "crash"/reboot application:
     * used when the we cannot authenticate.
     */
    VIOLATED_POLICY: 1008,

    /**
     * Standard code 1011 - From Server side, Client should REJECT all outstanding and "crash"/reboot application.
     * This is the default close code if the MatsSocket "onMessage"-handler throws anything, and may also explicitly
     * be used by the implementation if it encounters a situation it cannot recover from.
     */
    UNEXPECTED_CONDITION: 1011,

    /**
     * Standard code 1012 - From Server side, Client should REISSUE all outstanding upon reconnect: used when
     * {@link MatsSocketServer#stop(int)} is invoked. Please reconnect.
     */
    SERVICE_RESTART: 1012,

    /**
     * Standard code 1001 - From Client/Browser side, client should have REJECTed all outstanding: Synonym for
     * {@link #CLOSE_SESSION}, as the WebSocket documentation states <i>"indicates that an endpoint is "going away",
     * such as a server going down <b>or a browser having navigated away from a page.</b>"</i>, the latter point
     * being pretty much exactly correct wrt. when to close a session. So, if a browser decides to use this code
     * when the user navigates away and the client MatsSocket library or employing application does not catch it,
     * we'd want to catch this as a Close Session. Notice that I've not experienced a browser that actually utilizes
     * this close code yet, though!
     * <p/>
     * <b>Notice that if a close with this close code <i>is initiated from the Server-side</i>, this should NOT be
     * considered a CLOSE_SESSION by the neither the client nor the server!</b> At least Jetty's implementation of
     * JSR 356 WebSocket API for Java sends GOING_AWAY upon socket close due to timeout. Since a timeout can happen
     * if we loose connection and thus can't convey PINGs, the MatsSocketServer must not interpret Jetty's
     * timeout-close as Close Session. Likewise, if the client just experienced massive lag on the connection, and
     * thus didn't get the PING over to the server in a timely fashion, but then suddenly gets Jetty's timeout close
     * with GOING_AWAY, this should not be interpreted by the client as the server wants to close the session.
     */
    GOING_AWAY: 1001,

    /**
     * 4000: Both from Server side and Client/Browser side, client should REJECT all outstanding:
     * <ul>
     * <li>From Browser: Used when the browser closes WebSocket "on purpose", wanting to close the session -
     * typically when the user explicitly logs out, or navigates away from web page. All traces of the
     * MatsSocketSession are effectively deleted from the server, including any undelivered replies and messages
     * ("push") from server.</li>
     * <li>From Server: {@link MatsSocketServer#closeSession(String)} was invoked, and the WebSocket to that client
     * was still open, so we close it.</li>
     * </ul>
     */
    CLOSE_SESSION: 4000,

    /**
     * 4001: From Server side, Client should REJECT all outstanding and "crash"/reboot application: A
     * HELLO:RECONNECT was attempted, but the session was gone. A considerable amount of time has probably gone by
     * since it last was connected. The client application must get its state synchronized with the server side's
     * view of the world, thus the suggestion of "reboot".
     */
    SESSION_LOST: 4001,

    /**
     * 4002: Both from Server side and from Client/Browser side: REISSUE all outstanding upon reconnect:
     * <ul>
     * <li>From Client: The client just fancied a little break (just as if lost connection in a tunnel), used from
     * integration tests.</li>
     * <li>From Server: We ask that the client reconnects. This gets us a clean state and in particular new
     * authentication (In case of using OAuth/OIDC tokens, the client is expected to fetch a fresh token from token
     * server).</li>
     * </ul>
     */
    RECONNECT: 4002,

    /**
     * 4003: From Server side: Currently used in the specific situation where a MatsSocket client connects with
     * the same MatsSocketSessionId as an existing WebSocket connection. This could happen if the client has
     * realized that a connection is wonky and wants to ditch it, but the server has not realized the same yet.
     * When the server then gets the new connect, it'll see that there is an active WebSocket already. It needs
     * to close that. But the client "must not do anything" other than what it already is doing - reconnecting.
     */
    DISCONNECT: 4003,

    /**
     * 4004: From Server side: Client should REJECT all outstanding and "crash"/reboot application: Used when the
     * client does not speak the MatsSocket protocol correctly. Session is closed.
     */
    MATS_SOCKET_PROTOCOL_ERROR: 4004,

    /**
     * Resolves the numeric "close code" to the String key name of this enum, or <code>"UNKNOWN("+closeCode+")"</code>
     * for unknown numeric codes.
     *
     * @param closeCode the numeric "close code" of the WebSocket.
     * @returns {string} String key name of this enum, or <code>"UNKNOWN("+closeCode+")"</code> for unknown numeric codes.
     */
    nameFor: function (closeCode) {
        let keys = Object.keys(MatsSocketCloseCodes).filter(function (key) {
            return MatsSocketCloseCodes[key] === closeCode;
        });
        if (keys.length === 1) {
            return keys[0];
        }
        return "UNKNOWN(" + closeCode + ")";
    }
};
Object.freeze(MatsSocketCloseCodes);
