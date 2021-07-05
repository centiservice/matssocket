import { ConnectionState } from "./ConnectionState.js";

export { ConnectionEvent, ConnectionEventType }

/**
 * Event object for {@link MatsSocket#addConnectionEventListener(function)}.
 * <p />
 * <b>Note on event ordering</b>: {@link ConnectionEvent}s are delivered ASAP. This means that for events that the
 * client controls, they are issued <i/>before</i> the operation they describe commences:
 * {@link ConnectionEventType#CONNECTING CONNECTING} and
 * {@link ConnectionEventType#SESSION_ESTABLISHED SESSION_ESTABLISHED}. However, for events where the client is
 * "reacting", e.g. when the WebSocket connects, or abruptly closes, they are issued ASAP when the Client gets to know about it:
 * {@link ConnectionEventType#CONNECTED CONNECTED}, {@link ConnectionEventType#LOST_CONNECTION LOST_CONNECTION},
 * {@link ConnectionEventType#CONNECTION_ERROR CONNECTION_ERROR} and {@link ConnectionEventType#WAITING WAITING}.
 * For {@link ConnectionEventType#COUNTDOWN COUNTDOWN}, there is not much to say wrt. timing, other than you won't typically
 * get a 'countdown'-event with 0 seconds left, as that is when we transition into 'connecting' again. For events
 * that also describe {@link ConnectionState}s, the {@link MatsSocket#state} is updated before the event is fired.
 *
 * @param {string} type
 * @param {string} webSocketUrl
 * @param {Event} webSocketEvent
 * @param {number} timeoutSeconds
 * @param {number} countdownSeconds
 * @param {number} connectionAttempt
 * @constructor
 */
function ConnectionEvent(type, webSocketUrl, webSocketEvent, timeoutSeconds, countdownSeconds, connectionAttempt) {
    /**
     * The type of the <code>ConnectionEvent</code>, returns an enum value of {@link ConnectionEventType}.
     *
     * @type {string}
     */
    this.type = type;

    /**
     * For all of the events this holds the current URL we're either connected to, was connected to, or trying to
     * connect to.
     *
     * @type {string}
     */
    this.webSocketUrl = webSocketUrl;

    /**
     * For several of the events (enumerated in {@link ConnectionEventType}), there is an underlying WebSocket event
     * that caused it. This field holds that.
     * <ul>
     *     <li>{@link ConnectionEventType#WAITING}: WebSocket {@link CloseEvent} that caused this transition.</li>
     *     <li>{@link ConnectionEventType#CONNECTED}: WebSocket {@link Event} that caused this transition.</li>
     *     <li>{@link ConnectionEventType#CONNECTION_ERROR}: WebSocket {@link Event} that caused this transition.</li>
     *     <li>{@link ConnectionEventType#LOST_CONNECTION}: WebSocket {@link CloseEvent} that caused it.</li>
     * </ul>
     *
     * @type {Event}
     */
    this.webSocketEvent = webSocketEvent;

    /**
     * For {@link ConnectionEventType#CONNECTING}, {@link ConnectionEventType#WAITING} and {@link ConnectionEventType#COUNTDOWN},
     * tells how long the timeout for this attempt is, i.e. what the COUNTDOWN events start out with. Together with
     * {@link #countdownSeconds} of the COUNTDOWN events, this can be used to calculate a fraction if you want to
     * make a "progress bar" of sorts.
     * <p/>
     * The timeouts starts at 500 ms (unless there is only 1 URL configured, in which case 5 seconds), and then
     * increases exponentially, but maxes out at 15 seconds.
     *
     * @type {number}
     */
    this.timeoutSeconds = timeoutSeconds;

    /**
     * For {@link ConnectionEventType#CONNECTING}, {@link ConnectionEventType#WAITING} and {@link ConnectionEventType#COUNTDOWN},
     * tells how many seconds there are left for this attempt (of the {@link #timeoutSeconds} it started with),
     * with a tenth of a second as precision. With the COUNTDOWN events, these come in each 100 ms (1/10 second),
     * and show how long time there is left before trying again (if MatsSocket is configured with multiple URLs,
     * the next attempt will be a different URL).
     * <p/>
     * The countdown is started when the state transitions to {@link ConnectionEventType#CONNECTING}, and
     * stops either when {@link ConnectionEventType#CONNECTED} or the timeout reaches zero. If the
     * state is still CONNECTING when the countdown reaches zero, implying that the "new WebSocket(..)" call still
     * has not either opened or closed, the connection attempt is aborted by calling webSocket.close(). It then
     * tries again, possibly with a different URL - and the countdown starts over.
     * <p/>
     * Notice that the countdown is not affected by any state transition into {@link ConnectionEventType#WAITING} -
     * such transition only means that the "new WebSocket(..)" call failed and emitted a close-event, but we will
     * still wait out the countdown before trying again.
     * <p/>
     * Notice that you will most probably not get an event with 0 seconds, as that is when we transition into
     * {@link #CONNECTING} and the countdown starts over (possibly with a larger timeout).
     * <p/>
     * Truncated exponential backoff: The timeouts starts at 500 ms (unless there is only 1 URL configured, in which
     * case 5 seconds), and then increases exponentially, but maxes out at 15 seconds.
     *
     * @type {number}
     */
    this.countdownSeconds = countdownSeconds;

    /**
     * The connection attempt count, starts at 0th attempt and increases for each time the connection attempt fails.
     */
    this.connectionAttempt = connectionAttempt;
}


/**
 * The event types of {@link ConnectionEvent} - four of the event types are state-transitions into different states
 * of {@link ConnectionState}.
 *
 * @enum {string}
 * @readonly
 */
const ConnectionEventType = Object.freeze({
    /**
     * State, and fires as ConnectionEvent when we transition into this state, which is when the WebSocket is literally trying to connect.
     * This is between <code>new WebSocket(url)</code> (or the {@link MatsSocket#preconnectoperation "PreConnectOperation"} if configured),
     * and either webSocket.onopen or webSocket.onclose is fired, or countdown reaches 0. If webSocket.onopen,
     * we transition into {@link #CONNECTED}, if webSocket.onclose, we transition into
     * {@link #WAITING}. If we reach countdown 0 while in CONNECTING, we will "re-transition" to the same state, and
     * thus get one more event of CONNECTING.
     * <p/>
     * User Info Tip: Show a info-box, stating "Connecting! <4.0 seconds..>", countdown in "grayed out" style, box is
     * some neutral information color, e.g. yellow (fading over to this color if already red or orange due to
     * {@link #CONNECTION_ERROR} or {@link #LOST_CONNECTION}).
     * Each time it transitions into CONNECTING, it will start a new countdown. Let's say it starts from say 4
     * seconds: If this connection attempt fails after 1 second, it will transition into WAITING and continue the
     * countdown with 3 seconds remaining.
     */
    CONNECTING: ConnectionState.CONNECTING,

    /**
     * State, and fires as ConnectionEvent when we transition into this state, which is when {@link #CONNECTING} fails.
     * The only transition out of this state is {@link #CONNECTING}, when the {@link #COUNTDOWN} reaches 0.
     * <p/>
     * Notice that the {@link ConnectionEvent} contains the {@link Event} that came with webSocket.close (while CONNECTING).
     * <p/>
     * User Info Tip: Show a info-box, stating "Waiting! <2.9 seconds..>", countdown in normal visibility, box is
     * some neutral information color, e.g. yellow (keeping the box color fading if in progress).
     * It will come into this state from {@link #CONNECTING}, and have the time remaining from the initial countdown.
     * So if the attempt countdown started from 4 seconds, and it took 1 second before the connection attempt failed,
     * then there will be 3 seconds left in WAITING state.
     */
    WAITING: ConnectionState.WAITING,

    /**
     * State, and fires as ConnectionEvent when we transition into this state, which is when WebSocket.onopen is fired.
     * Notice that the MatsSocket is still not fully established, as we have not yet exchanged HELLO and WELCOME -
     * the MatsSocket is fully established at {@link #SESSION_ESTABLISHED}.
     * <p/>
     * Notice that the {@link ConnectionEvent} contains the WebSocket 'onopen' {@link Event} that was issued when
     * the WebSocket opened.
     * <p/>
     * User Info Tip: Show a info-box, stating "Connected!", happy-color, e.g. green, with no countdown.
     */
    CONNECTED: ConnectionState.CONNECTED,

    /**
     * State, and fires as ConnectionEvent when we transition into this state, which is when when the WELCOME MatsSocket message comes
     * from the Server, also implying that it has been authenticated: The MatsSocket is now fully established, and
     * actual messages can be exchanged.
     * <p/>
     * User Info Tip: Show a info-box, stating "Session OK!", happy-color, e.g. green, with no countdown - and the
     * entire info-box fades away fast, e.g. after 1 second.
     */
    SESSION_ESTABLISHED: ConnectionState.SESSION_ESTABLISHED,

    /**
     * This is a pretty worthless event. It comes from WebSocket.onerror. It will <i>always</i> be trailed by a
     * WebSocket.onclose, which gives the event {@link #LOST_CONNECTION}.
     * <p/>
     * Notice that the {@link ConnectionEvent} contains the {@link Event} that caused the error.
     * <p/>
     * User Info Tip: Show a info-box, which is some reddish color (no need for text since next event {@link #LOST_CONNECTION}) comes immediately).
     */
    CONNECTION_ERROR: "connectionerror",

    /**
     * This comes when WebSocket.onclose is fired "unexpectedly", <b>and the reason for this close is NOT a SessionClosed Event</b> (The latter will
     * instead invoke the listeners registered with {@link MatsSocket#addSessionClosedEventListener(listener)}).
     * A LOST_CONNECTION will start a reconnection attempt after a very brief delay (couple of hundred milliseconds),
     * and the next state transition and thus event is {@link #CONNECTING}.
     * <p/>
     * Notice that the {@link ConnectionEvent} contains the {@link CloseEvent} that caused the lost connection.
     * <p/>
     * User Info Tip: Show a info-box, stating "Connection broken!", which is some orange color (unless it already
     * is red due to {@link #CONNECTION_ERROR}), fading over to the next color when next event ({@link #CONNECTING}
     * comes in.
     */
    LOST_CONNECTION: "lostconnection",

    /**
     * Events fired every 100ms while in state {@link #CONNECTING}, possibly continuing over to {@link #WAITING}.
     * Notice that you will most probably not get an event with 0 seconds left, as that is when we (re-)transition to
     * {@link #CONNECTING} and the countdown starts over (possibly with a larger timeout). Read more at
     * {@link ConnectionEvent#countdownSeconds}.
     * <p/>
     * User Info Tip: Read more at {@link #CONNECTING} and {@linl #WAITING}.
     */
    COUNTDOWN: "countdown"

});
