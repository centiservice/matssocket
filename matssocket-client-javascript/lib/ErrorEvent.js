export { ErrorEvent }

/**
 * The Event object supplied to listeners added via {@link MatsSocket#addErrorEventListener()}.
 *
 * @param type {string}
 * @param message {string}
 * @param object {Object}
 * @constructor
 */
function ErrorEvent(type, message, object) {
    /**
     * Type of error - describes the situation where the error occurred. Currently has no event-type enum.
     *
     * @type {string}.
     */
    this.type = type;

    /**
     * The error message
     *
     * @type {string}.
     */
    this.message = message;

    /**
     * Some errors supply a relevant object: Event for WebSocket errors, The attempted processed MatsSocket Envelope
     * when envelope processing fails, or the caught Error in a try-catch (typically when invoking event listeners).
     * <b>For submitting errors back to the home server, check out {@link #referenceAsString}.</b>
     *
     * @type {Object}.
     */
    this.reference = object;

    /**
     * Makes a string (<b>chopped the specified max number of characters, default 1024 chars</b>) out of the
     * {@link #reference} Object, which might be useful if you want to send this back over HTTP - consider
     * <code>encodeURIComponent(referenceAsString)</code> if you want to send it over the URL. First tries to use
     * <code>JSON.stringify(reference)</code>, failing that, it uses <code>""+reference</code>. Then chops to max
     * 1024, using "..." to denote the chop.
     *
     * @param {number} maxLength the max number of characters that will be returned, with any chop denoted by "...".
     * @returns {string}
     */
    this.referenceAsString = function (maxLength = 1024) {
        let result;
        try {
            result = JSON.stringify(this.reference);
        } catch (err) {
            /* no-op */
        }
        if (typeof result !== 'string') {
            result = "" + this.reference;
        }
        return (result.length > maxLength ? result.substring(0, maxLength - 3) + "..." : result);
    };
}
