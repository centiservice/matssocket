export { PingPong }

/**
 * (Metric) A "holding struct" for pings and their experienced round-trip times - you may "subscribe" to ping results
 * using {@link MatsSocket#addPingPongListener()}, and you may get the latest pings from the property
 * {@link MatsSocket#pings}.
 *
 * @param {number} pingId
 * @param {number} sentTimestamp
 * @constructor
 */
function PingPong(pingId, sentTimestamp) {
    /**
     * Sequence of the ping.
     *
     * @type {number}
     */
    this.pingId = pingId;

    /**
     * Millis-from-epoch when this ping was sent.
     *
     * @type {number}
     */
    this.sentTimestamp = sentTimestamp;

    /**
     * The experienced round-trip time for this ping-pong - this is the time back-and-forth.
     *
     * <b>Note that this number can be a float, not necessarily integer</b>.
     *
     * @type {number}
     */
    this.roundTripMillis = undefined;
}
