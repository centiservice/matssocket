export { MessageEvent, MessageEventType }

/**
 * Message Event - the event emitted for a {@link MatsSocket#request() Requests}'s Promise resolve() and reject()
 * (i.e. then() and catch()), and to a {@link MatsSocket#terminator() Terminator}'s resolveCallback and
 * rejectCallback functions for replies due to {@link MatsSocket#requestReplyTo() requestReplyTo}, and for Server
 * initiated Sends (to Terminators), and for the event to a {@link MatsSocket#endpoint() Endpoint} upon a Server
 * initiated Request, and for the event sent to a {@link MatsSocket#subscribe() Subscription}.
 *
 * @param {MessageEventType} type - {@link MessageEvent#type}
 * @param {object} data - {@link MessageEvent#data}
 * @param {string} traceId - {@link MessageEvent#traceId}
 * @param {string} messageId - {@link MessageEvent#messageId}
 * @param {number} receivedTimestamp - {@link MessageEvent#receivedTimestamp}
 * @class
 */
function MessageEvent(type, data, traceId, messageId, receivedTimestamp) {
    /**
     * Values are from {@link MessageEventType}: Either {@link MessageEventType#SEND "send"} (for a Client
     * Terminator when targeted for a Server initiated Send); {@link MessageEventType#REQUEST "request"} (for a
     * Client Endpoint when targeted for a Server initiated Request); or {@link MessageEventType#RESOLVE "resolve"}
     * or {@link MessageEventType#REJECT "reject"} (for settling of Promise from a Client-initiated Request, and
     * for a Client Terminator when targeted as the reply-endpoint for a Client initiated Request) - <b>or
     * {@link MessageEventType#SESSION_CLOSED "sessionclosed"} if the session was closed with outstanding Requests
     * and MatsSocket therefore "clears out" these Requests.</b>
     * <p/>
     * Notice: In the face of {@link MessageType#SESSION_CLOSED "sessionclosed"} or {@link MessageType#TIMEOUT "timeout"},
     * the {@link #data} property (i.e. the actual message from the server) will be <code>undefined</code>.
     * Wrt. "sessionclosed", this is <i>by definition</i>: The Request was outstanding, meaning that an answer from the
     * Server had yet to come. This is opposed to a normal REJECT settling from the Server-side MatsSocketEndpoint,
     * which may choose to include data with a rejection. The same basically goes wrt. "timeout", as the Server
     * has not replied yet.
     *
     * @type {MessageEventType}
     */
    this.type = type;

    /**
     * The actual data from the other peer.
     * <p/>
     * Notice: In the face of {@link MessageType#SESSION_CLOSED "sessionclosed"} or {@link MessageType#TIMEOUT "timeout"},
     * this value will be <code>undefined</code>.
     * Wrt. "sessionclosed", this is <i>by definition</i>: The Request was outstanding, meaning that an answer from the
     * Server had yet to come. This is opposed to a normal REJECT settling from the Server-side MatsSocketEndpoint,
     * which may choose to include data with a rejection. The same basically goes wrt. "timeout", as the Server
     * has not replied yet.
     *
     * @type {object}
     */
    this.data = data;

    /**
     * When a Terminator gets invoked to handle a Reply due to a Client initiated {@link MatsSocket#requestReplyTo},
     * this holds the 'correlationInformation' object that was supplied in the requestReplyTo(..) invocation.
     *
     * @type {object}
     */
    this.correlationInformation = undefined;

    /**
     * The TraceId for this call / message.
     *
     * @type {string}
     */
    this.traceId = traceId;

    /**
     * Either the ClientMessageId if this message is a Reply to a Client-initiated Request (i.e. this message is a
     * RESOLVE or REJECT), or ServerMessageId if this originated from the Server (i.e. SEND or REQUEST);
     *
     * @type {string}
     */
    this.messageId = messageId;

    /**
     * millis-since-epoch when the Request, for which this message is a Reply, was sent from the
     * Client. If this message is not a Reply to a Client-initiated Request, it is undefined.
     *
     * @type {number}
     */
    this.clientRequestTimestamp = undefined;

    /**
     * When the message was received on the Client, millis-since-epoch.
     *
     * @type {number}
     */
    this.receivedTimestamp = receivedTimestamp;

    /**
     * For {@link MatsSocket#request()} and {@link MatsSocket#requestReplyTo()} Requests: Round-trip time in
     * milliseconds from Request was performed to Reply was received, basically <code>{@link #receivedTimestamp} -
     * {@link #clientRequestTimestamp}</code>, but depending on the browser/runtime, you might get higher resolution
     * than integer milliseconds (i.e. fractions of milliseconds, a floating point number) - it depends on the
     * resolution of <code>performance.now()</code>.
     *
     * <b>Note that this number can be a float, not necessarily integer</b>.

     * @type {number}
     */
    this.roundTripMillis = undefined;

    /**
     * If debugging is requested, by means of {@link MatsSocket#debug} or the config object in the send, request and
     * requestReplyTo, this will contain a {@link DebugInformation} instance. However, the contents of that object
     * is decided by what you request, and what the authorized user is allowed to get as decided by the
     * AuthenticationPlugin when authenticating the user.
     */
    this.debug = undefined;
}

/**
 * Types of {@link MessageEvent}.
 *
 * @enum {string}
 * @readonly
 */
const MessageEventType = {
    RESOLVE: "resolve",

    REJECT: "reject",

    SEND: "send",

    REQUEST: "request",

    PUB: "pub",

    /**
     * "Synthetic" event in that it is not a message from Server: A Client-to-Server
     * {@link MatsSocket#request() Request} was not replied to by the server within the
     * {@link MatsSocket#requestTimeout default request timeout} - or a specific timeout specified in the request
     * invocation. In these situations, the Request Promise is rejected with a {@link MessageEvent} of this type,
     * and the {@link MessageEvent#data} value is undefined.
     */
    TIMEOUT: "timeout",

    /**
     * "Synthetic" event in that it is not a message from Server: This only happens if the MatsSocketSession is
     * closed with outstanding Client-to-Server {@link MatsSocket#request() Requests} not yet replied to by the
     * server. In these situations, the Request Promise is rejected with a {@link MessageEvent} of this type, and
     * the {@link MessageEvent#data} value is undefined.
     */
    SESSION_CLOSED: "sessionclosed"
};
Object.freeze(MessageEventType);
