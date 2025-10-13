import './typedefs.js';
// Repeating typedefs here, since 'tsc' otherwise don't create the 'export type FractionalMillis = number;' line.
/**
 * Fractional milliseconds for high-res timing.
 * @typedef {number} FractionalMillis
 */

/**
 * Timestamp, millis-since-epoch.
 * @typedef {number} Timestamp
 */

export { ReceivedEvent, ReceivedEventType }

/**
 * Message Received on Server event: "acknowledge" or "negative acknowledge" - these are the events which the
 * returned Promise of a send(..) is settled with (i.e. then() and catch()), and which
 * {@link MatsSocket#request request}'s receivedCallback function are invoked with.
 *
 * @param {ReceivedEventType} type - {@link ReceivedEvent#type}
 * @param {string} traceId - {@link ReceivedEvent#traceId}
 * @param {Timestamp} sentTimestamp - {@link ReceivedEvent#sentTimestamp}
 * @param {Timestamp} receivedTimestamp - {@link ReceivedEvent#receivedTimestamp}
 * @param {Timestamp} roundTripMillis - {@link ReceivedEvent#roundTripMillis}
 * @param {string} description - {@link ReceivedEvent#description}
 * @class
 */
function ReceivedEvent(type, traceId, sentTimestamp, receivedTimestamp, roundTripMillis, description) {
    /**
     * Values are from {@link ReceivedEventType}: Type of received event, either {@link ReceivedEventType#ACK "ack"},
     * {@link ReceivedEventType#NACK "nack"} - <b>or {@link ReceivedEventType#SESSION_CLOSED "sessionclosed"} if the
     * session was closed with outstanding initiations and MatsSocket therefore "clears out" these initiations.</b>
     *s
     * @type {ReceivedEventType}
     */
    this.type = type;

    /**
     * TraceId for this call / message.
     *
     * @type {string}
     */
    this.traceId = traceId;

    /**
     * Millis-since-epoch when the message was sent from the Client.
     *
     * @type {Timestamp}
     */
    this.sentTimestamp = sentTimestamp;

    /**
     * Millis-since-epoch when the ACK or NACK was received on the Client, millis-since-epoch.
     *
     * @type {Timestamp}
     */
    this.receivedTimestamp = receivedTimestamp;

    /**
     * Round-trip time in milliseconds from Initiation of flow (send, request, requestReplyTo) to Received
     * acknowledgement (ACK/NACK) was received, basically <code>{@link #receivedTimestamp}
     * - {@link #sentTimestamp}</code>, but depending on the browser/runtime, you might get higher resolution
     * than integer milliseconds (i.e. fractions of milliseconds, a floating point number) - it depends on
     * the resolution of <code>performance.now()</code>.
     * <p/>
     * Notice that Received-events might be de-prioritized on the Server side (batched up, with micro-delays
     * to get multiple into the same batch), so this number should not be taken as the "ping time".
     *
     * @type {FractionalMillis}
     */
    this.roundTripMillis = roundTripMillis;

    /**
     * Sometimes, typically on Server NACKs (e.g. targetting non-existing Endpoint), the Server supplies a
     * description to why this was no good.
     *
     * @type {string}
     */
    this.description = description;
}

/**
 * Types of {@link ReceivedEvent}.
 *
 * @enum {string}
 * @readonly
 */
const ReceivedEventType = {
    /**
     * If the Server-side MatsSocketEndpoint/Terminator accepted the message for handling (and if relevant,
     * forwarded it to the Mats fabric). The returned Promise of send() is <i>resolved</i> with this type of event.
     * The 'receivedCallback' of a request() will get both "ack" and {@link #NACK "nack"}, thus must check on
     * the type if it makes a difference.
     */
    ACK: "ack",

    /**
     * If the Server-side MatsSocketEndpoint/Terminator dit NOT accept the message, either explicitly with
     * context.deny(), or by failing with Exception. The returned Promise of send() is <i>rejected</i> with this
     * type of event. The 'receivedCallback' of a request() will get both "nack" and {@link #ACK "ack"}, thus must
     * check on the type if it makes a difference.
     * <p/>
     * Notice that a for a Client-initiated Request which is insta-rejected in the incomingHandler by invocation of
     * context.reject(..), this implies <i>acknowledge</i> of the <i>reception</i> of the message, but <i>reject</i>
     * as with regard to the </i>reply</i> (the Promise returned from request(..)).
     */
    NACK: "nack",

    /**
     * "Synthetic" event in that it is not a message from Server: A Client-to-Server
     * {@link MatsSocket#request() Request} was not ACKed or NACKed by the server within the
     * {@link MatsSocket#requestTimeoutMillis default request timeout} - or a specific timeout specified in the request
     * invocation. In these situations, any nack- or receivedCallback will be invoked with a {@link ReceivedEvent}
     * of this type.
     */
    TIMEOUT: "timeout",

    /**
     * "Synthetic" event in that it is not a message from Server: This only happens if the MatsSocketSession is
     * closed with outstanding Initiations not yet Received on Server. In these situations, any nack- or
     * receivedCallback will be invoked with a {@link ReceivedEvent} of this type.
     */
    SESSION_CLOSED: "sessionclosed"
};
Object.freeze(ReceivedEventType);
