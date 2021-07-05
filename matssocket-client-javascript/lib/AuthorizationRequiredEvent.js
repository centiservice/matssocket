export { AuthorizationRequiredEvent, AuthorizationRequiredEventType }

/**
 * @param {string} type type of the event, one of {@link AuthorizationRequiredEvent}.
 * @param {number} currentExpirationTimestamp millis-from-epoch when the current Authorization expires.
 * @constructor
 */
function AuthorizationRequiredEvent(type, currentExpirationTimestamp) {
    /**
     * Type of the event, one of {@link AuthorizationRequiredEvent}.
     *
     * @type {string}.
     */
    this.type = type;

    /**
     * Millis-from-epoch when the current Authorization expires - note that this might well still be in the future,
     * but the "slack" left before expiration is used up.
     *
     * @type {number}
     */
    this.currentExpirationTimestamp = currentExpirationTimestamp;
}

/**
 * Type of {@link AuthorizationRequiredEvent}.
 *
 * @enum {string}
 * @readonly
 */
const AuthorizationRequiredEventType = Object.freeze({
    /**
     * Initial state, if auth not already set by app.
     */
    NOT_PRESENT: "notpresent",

    /**
     * The authentication is expired - note that this might well still be in the future,
     * but the "slack" left before expiration is not long enough.
     */
    EXPIRED: "expired",

    /**
     * The server has requested that the app provides fresh auth to proceed - this needs to be fully fresh, even
     * though there might still be "slack" enough left on the current authorization to proceed. (The server side
     * might want the full expiry to proceed, or wants to ensure that the app can still produce new auth - i.e.
     * it might suspect that the current authentication session has been invalidated, and need proof that the app
     * can still produce new authorizations/tokens).
     */
    REAUTHENTICATE: "reauthenticate"
});