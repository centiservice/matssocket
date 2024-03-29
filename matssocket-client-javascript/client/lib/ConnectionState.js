export { ConnectionState }

/**
 * States for MatsSocket's {@link MatsSocket#state state}.
 *
 * @enum {string}
 * @readonly
 */
const ConnectionState = {
    /**
     * This is the initial State of a MatsSocket. Also, the MatsSocket is re-set back to this State in a
     * Session-Closed-from-Server situation (which is communicated via listeners registered with
     * {@link MatsSocket#addSessionClosedEventListener}), OR if you have explicitly performed a
     * {@link MatsSocket#close}.
     * <p/>
     * Only transition out of this state is into {@link ConnectionState.CONNECTING}.
     */
    NO_SESSION: "nosession",

    /**
     * Read doc at {@link ConnectionEventType.CONNECTING}.
     */
    CONNECTING: "connecting",

    /**
     * Read doc at {@link ConnectionEventType.WAITING}.
     */
    WAITING: "waiting",

    /**
     * Read doc at {@link ConnectionEventType.CONNECTED}.
     */
    CONNECTED: "connected",

    /**
     * Read doc at {@link ConnectionEventType.SESSION_ESTABLISHED}.
     */
    SESSION_ESTABLISHED: "sessionestablished"
};
Object.freeze(ConnectionState);
