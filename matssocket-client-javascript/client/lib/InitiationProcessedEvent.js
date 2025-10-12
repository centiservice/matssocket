import './typedefs.js';

import { MessageEvent, MessageEventType } from './MessageEvent.js';

export { InitiationProcessedEvent, InitiationProcessedEventType }


/**
 * (Metrics) Information about Client-to-Server SENDs and REQUESTs (aka <i>Client Initiations</i>), including
 * experienced round-trip times for both Received acknowledgement, and for Requests, the Request-to-Reply time.
 * <p />
 * For each message that, for sends, has been acknowledged received, and for requests, has been replied to, gives
 * this information:
 * <ul>
 *     <li>Client MessageId  (envelope's 'cmid').</li>
 *     <li>Timestamp of when message was sent.</li>
 *     <li>Target MatsSocket Endpoint or Terminator Id  (envelope's 'eid').</li>
 *     <li>TraceId for the SEND or REQUEST  (envelope's 'tid').</li>
 *     <li>The outgoing message, i.e. the SEND or the REQUEST message  (envelope's 'msg').</li>
 *     <li>Experienced Received Acknowledge round-trip time.</li>
 *     <li>For {@link MatsSocket#request() Requests}, the Reply's {@link MessageEventType}</li>
 *     <li>For {@link MatsSocket#requestReplyTo() requestReplyTo} Requests, the replyToTerminatorId.</li>
 *     <li>For Requests, the total experienced Request-to-Reply time.</li>
 *     <li>For Requests, the Reply {@link MessageEvent} object.</li>
 * </ul>
 * You may "subscribe" to <code>InitiationProcessedEvents</code> using
 * {@link MatsSocket#addInitiationProcessedEventListener()}, and you may get the latest such events from the
 * property {@link MatsSocket#initiations}.
 * <p />
 * <b>Note on event ordering</b>:
 * <ul>
 *     <li>send: First {@link ReceivedEvent} is issued. Then an {@link InitiationProcessedEvent} is added to
 *         {@link MatsSocket#initiations}, and then all {@link InitiationProcessedEvent} listeners are invoked</li>
 *     <li>request/requestReplyTo: First {@link ReceivedEvent} is issued (i.e. ack/nack), then when the reply
 *     comes back to the server, an {@link InitiationProcessedEvent} is added to {@link MatsSocket#initiations}, and
 *     then all {@link InitiationProcessedEvent} listeners are invoked, and finally the {@link MessageEvent} is
 *     delivered, either as settling of the return Reply-Promise (for 'request'), or invocation of the Terminator's
 *     message- or rejectCallbacks (for 'requestReplyTo').
 * </ul>
 *
 * @param {string} endpointId
 * @param {string} clientMessageId
 * @param {Timestamp} sentTimestamp
 * @param {FractionalMillis} sessionEstablishedOffsetMillis
 * @param {string} traceId
 * @param {Object} initiationMessage
 * @param {FractionalMillis} acknowledgeRoundTripMillis
 * @param {MessageEventType} replyMessageEventType
 * @param {string} replyToTerminatorId
 * @param {FractionalMillis} requestRoundTripMillis
 * @param {MessageEvent} replyMessageEvent
 * @class
 */
function InitiationProcessedEvent(endpointId, clientMessageId, sentTimestamp, sessionEstablishedOffsetMillis, traceId, initiationMessage, acknowledgeRoundTripMillis, replyMessageEventType, replyToTerminatorId, requestRoundTripMillis, replyMessageEvent) {
    /**
     * Which initiation type of this flow, enum of {@link InitiationProcessedEventType}.
     *
     * @type {InitiationProcessedEventType}
     */
    this.type = ((replyToTerminatorId ? InitiationProcessedEventType.REQUEST_REPLY_TO : (replyMessageEventType ? InitiationProcessedEventType.REQUEST : InitiationProcessedEventType.SEND)));

    /**
     * Target Server MatsSocket Endpoint or Terminator Id  (envelope's 'eid').
     *
     * @type {string}
     */
    this.endpointId = endpointId;

    /**
     * The Client MessageId of the Initiation  (envelope's 'cmid'). For this particular MatsSocket library, this
     * is currently an integer sequence id.
     *
     * @type {string}
     */
    this.clientMessageId = clientMessageId;

    /**
     * Millis-from-epoch when this initiation was sent.
     *
     * @type {Timestamp}
     */
    this.sentTimestamp = sentTimestamp;

    /**
     * The number of milliseconds offset for sending this message from the initial {@link ConnectionEventType#SESSION_ESTABLISHED} event for
     * this MatsSocket - <b>this number will typically be negative for the first messages</b>: A negative number
     * implies that the message was sent before the WELCOME was received, which again implies that the very first
     * message will by definition have a negative offset since it is this message that starts the HELLO/WELCOME
     * handshake and is thus enqueued before the WELCOME has been received. This is desirable: Upon application
     * startup, stack up all requests that you need answer for to show the initial screen, and they will all be
     * sent in a single pipeline, directly trailing the HELLO, their answers coming in as soon as possible after
     * the WELCOME.
     *
     * @type {FractionalMillis}
     */
    this.sessionEstablishedOffsetMillis = sessionEstablishedOffsetMillis;

    /**
     * TraceId for the initiation - which follows through all parts of the processing  (envelope's 'tid').
     *
     * @type {string}
     */
    this.traceId = traceId;

    /**
     * The message object that was sent with the initiation, i.e. on send(), request() or requestReplyTo()  (outgoing envelope's 'msg').
     *
     * @type {Object}
     */
    this.initiationMessage = initiationMessage;

    /**
     * The experienced round-trip time for the Received Acknowledgement - this is the time back-and-forth.
     *
     * <b>Note that this number can be a float, not necessarily integer</b>.
     *
     * @type {FractionalMillis}
     */
    this.acknowledgeRoundTripMillis = acknowledgeRoundTripMillis;

    // === For Requests.

    /**
     * The {@link MessageEventType} for Replies to Request Initiations.
     *
     * @type {string}
     */
    this.replyMessageEventType = replyMessageEventType;

    /**
     * The 'replyToTerminatorId' for {@link MatsSocket#requestReplyTo()}-Requests.
     *
     * @type {string}
     */
    this.replyToTerminatorId = replyToTerminatorId;

    /**
     * The experienced round-trip time from a Request initiation to the Reply (RESOLVE or REJECT) comes back.
     *
     * @type {FractionalMillis}
     */
    this.requestReplyRoundTripMillis = requestRoundTripMillis;

    /**
     * The Reply {@link MessageEvent} that was supplied to the Promise (on resolve/then or reject/catch) or ReplyTo
     * Client {@link #terminator() Terminator}.
     *
     * @type {MessageEvent}
     */
    this.replyMessageEvent = replyMessageEvent;
}

/**
 * Type of {@link InitiationProcessedEvent} - the type of the <i>initiation</i> of a flow, which also
 * determines which fields of the <code>InitiationProcessedEvent</code> are set.
 *
 * @enum {string}
 * @readonly
 */
const InitiationProcessedEventType = {
    /**
     * Flow initiated with {@link MatsSocket#send()}. Fields whose name does not start with "reply" or "request"
     * will be set.
     */
    SEND: "send",

    /**
     * Flow initiated with {@link MatsSocket#request()}. Will have all fields except
     * {@link InitiationProcessedEvent#replyToTerminatorId} set.
     */
    REQUEST: "request",

    /**
     * Flow initiated with {@link MatsSocket#requestReplyTo()}. Will have <i>all</i> fields set.
     */
    REQUEST_REPLY_TO: "requestreplyto"
};
Object.freeze(InitiationProcessedEventType);
