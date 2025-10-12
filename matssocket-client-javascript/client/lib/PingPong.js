import './typedefs.js';

export { PingPong }

/**
 * (Metric) A "holding struct" for pings and their experienced round-trip times - you may "subscribe" to ping results
 * using {@link MatsSocket#addPingPongListener()}, and you may get the latest pings from the property
 * {@link MatsSocket#pings}.
 *
 * @param {number} pingId
 * @param {number} sentTimestamp
 * @class
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
     * @type {Timestamp}
     */
    this.sentTimestamp = sentTimestamp;

    /**
     * The experienced round-trip time for this ping-pong - this is the time back-and-forth.
     *
     * @type {FractionalMillis}
     */
    this.roundTripMillis = undefined;
}
