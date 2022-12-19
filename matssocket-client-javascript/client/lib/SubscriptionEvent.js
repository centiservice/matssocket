export { SubscriptionEvent, SubscriptionEventType }

/**
 * Information about how a subscription went on the server side. If you do two subscriptions to the same Topic,
 * you will still only get one such message - thus if you want one for each, you'd better add two listeners too,
 * <i>before</i> doing any of the subscribes.
 * <p />
 * Note: this also fires upon every reconnect. <b>Make note of the {@link SubscriptionEventType#LOST_MESSAGES}!</b>
 *
 * @param type {SubscriptionEventType}
 * @param topicId {string}
 * @class
 */
function SubscriptionEvent(type, topicId) {
    /**
     * How the subscription fared.
     *
     * @type {SubscriptionEventType}
     */
    this.type = type;

    /**
     * What TopicIc this relates to.
     *
     * @type {string}
     */
    this.topicId = topicId;

}

/**
 * Type of {@link SubscriptionEvent}.
 *
 * @enum {string}
 * @readonly
 */
const SubscriptionEventType = Object.freeze({
    /**
     * The subscription on the server side went ok. If reconnect, any missing messages are now being sent.
     */
    OK: "ok",

    /**
     * You were not authorized to subscribe to this Topic.
     */
    NOT_AUTHORIZED: "notauthorized",

    /**
     * Upon reconnect, the "last message Id" was not known to the server, implying that there are lost messages.
     * Since you will now have to handle this situation by other means anyway (e.g. do a request for all stock ticks
     * between the last know timestamp and now), you will thus not get any of the lost messages even if the server
     * has some.
     */
    LOST_MESSAGES: "lostmessages"
});
