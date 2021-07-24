export { DebugInformation, DebugOption }

/**
 * Meta-information for the call, availability depends on the allowed debug options for the authenticated user,
 * and which information is requested in client. Notice that Client side and Server side might have wildly differing
 * ideas of what the time is, which means that timestamps comparison between Server and Client must be evaluated
 * with massive interpretation.
 *
 * @constructor
 */
function DebugInformation(sentTimestamp, requestedDebugOptions, envelope, receivedTimestamp) {
    this.clientMessageSent = sentTimestamp;
    this.requestedDebugOptions = requestedDebugOptions;
    this.resolvedDebugOptions = envelope.debug ? envelope.debug.resd : 0;

    if (envelope.debug) {
        this.resolvedDebugOptions = envelope.debug.resd;
        this.description = envelope.debug.desc;

        this.clientMessageReceived = envelope.debug.cmrts;
        this.clientMessageReceivedNodename = envelope.debug.cmrnn;

        this.matsMessageSent = envelope.debug.mmsts;
        this.matsMessageReplyReceived = envelope.debug.mmrrts;
        this.matsMessageReplyReceivedNodename = envelope.debug.mmrrnn;

        this.serverMessageCreated = envelope.debug.smcts;
        this.serverMessageCreatedNodename = envelope.debug.smcnn;

        this.messageSentToClient = envelope.debug.mscts;
        this.messageSentToClientNodename = envelope.debug.mscnn;
    }

    this.messageReceived = receivedTimestamp;
}

/**
 * <b>Copied directly from AuthenticationPlugin.java</b>:
 * Types of debug information you can request, read more at {@link MatsSocket#debug} and {@link MessageEvent#debug}.
 *
 * @enum {string}
 * @readonly
 */
const DebugOption = Object.freeze({
    /**
     * Timing info of the separate phases. Note that time-skew between different nodes must be taken into account.
     */
    TIMESTAMPS: 1, // was 0b0000_0001 (changed due to underscores and possibly binary being a bit too edgy for JS in 2021)

    /**
     * Node-name of the handling nodes of the separate phases.
     */
    NODES: 2, // was 0b0000_0010

    /**
     * <code>AuthenticationPlugin</code>-specific "Option A" - this is not used by MatsSocket itself, but can be employed
     * and given a meaning by the <code>AuthenticationPlugin</code>.
     * <p/>
     * Notice: You might be just as well off by implementing such functionality on the <code>Principal</code> returned by
     * the <code>AuthenticationPlugin</code> ("this user is allowed to request these things") - and on the request DTOs
     * from the Client ("I would like to request these things").
     */
    CUSTOM_A: 64, // was 0b0100_0000

    /**
     * <code>AuthenticationPlugin</code>-specific "Option B" - this is not used by MatsSocket itself, but can be employed
     * and given a meaning by the <code>AuthenticationPlugin</code>.
     * <p/>
     * Notice: You might be just as well off by implementing such functionality on the <code>Principal</code> returned by
     * the <code>AuthenticationPlugin</code> ("this user is allowed to request these things") - and on the request DTOs
     * from the Client ("I would like to request these things").
     */
    CUSTOM_B: 128 // was 0b1000_0000
});
