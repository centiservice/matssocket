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

export { PingPong }

/**
 * (Metric) A "holding struct" for pings and their experienced round-trip times - you may "subscribe" to ping results
 * using {@link MatsSocket#addPingPongListener()}, and you may get the latest pings from the property
 * {@link MatsSocket#pings}.
 *
 * @param {number} pingId
 * @param {Timestamp} sentTimestamp
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
