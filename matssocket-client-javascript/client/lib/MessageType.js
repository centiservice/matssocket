export { MessageType }

/**
 * <b>Copied directly from MatsSocketServer.java</b>:
 * All Message Types (aka MatsSocket Envelope Types) used in the wire-protocol of MatsSocket.
 *
 * @enum {string}
 * @readonly
 */
const MessageType = Object.freeze({
    /**
     * A HELLO message must be part of the first Pipeline of messages, preferably alone. One of the messages in the
     * first Pipeline must have the "auth" field set, and it might as well be the HELLO.
     */
    HELLO: "HELLO",

    /**
     * The reply to a {@link #HELLO}, where the MatsSocketSession is established, and the MatsSocketSessionId is
     * returned. If you included a MatsSocketSessionId in the HELLO, signifying that you want to reconnect to an
     * existing session, and you actually get a WELCOME back, it will be the same as what you provided - otherwise
     * the connection is closed with {@link MatsSocketCloseCodes#SESSION_LOST}.
     */
    WELCOME: "WELCOME",

    /**
     * The sender sends a "fire and forget" style message.
     */
    SEND: "SEND",

    /**
     * The sender initiates a request, to which a {@link #RESOLVE} or {@link #REJECT} message is expected.
     */
    REQUEST: "REQUEST",

    /**
     * The sender should retry the message (the receiver could not handle it right now, but a Retry might fix it).
     */
    RETRY: "RETRY",

    /**
     * The specified message was Received, and acknowledged positively - i.e. the other party has decided to process
     * it.
     * <p/>
     * The sender of the ACK has now taken over responsibility of the specified message, put it (at least the
     * reference ClientMessageId) in its <i>Inbox</i>, and possibly started processing it. The reason for the Inbox
     * is so that if it Receives the message again, it may just insta-ACK/NACK it and toss this copy out the window
     * (since it has already handled it).
     * <p/>
     * When an ACK is received, the receiver may safely delete the acknowledged message from its <i>Outbox</i>.
     */
    ACK: "ACK",

    /**
     * The specified message was Received, but it did not acknowledge it - i.e. the other party has decided to NOT
     * process it.
     * <p/>
     * The sender of the NACK has now taken over responsibility of the specified message, put it (at least the
     * reference Client/Server MessageId) in its <i>Inbox</i> - but has evidently decided not to process it. The
     * reason for the Inbox is so that if it Receives the message again, it may just insta-ACK/NACK it and toss this
     * copy out the window (since it has already handled it).
     * <p/>
     * When an NACK is received, the receiver may safely delete the acknowledged message from its <i>Outbox</i>.
     */
    NACK: "NACK",

    /**
     * An "Acknowledge ^ 2", i.e. an acknowledge of the {@link #ACK} or {@link #NACK}. When the receiver gets this,
     * it may safely delete the entry it has for the specified message from its <i>Inbox</i>.
     * <p/>
     * The message is now fully transferred from one side to the other, and both parties again has no reference to
     * this message in their Inbox and Outbox.
     */
    ACK2: "ACK2",

    /**
     * A RESOLVE-reply to a previous {@link #REQUEST} - if the Client did the {@code REQUEST}, the Server will
     * answer with either a RESOLVE or {@link #REJECT}.
     */
    RESOLVE: "RESOLVE",

    /**
     * A REJECT-reply to a previous {@link #REQUEST} - if the Client did the {@code REQUEST}, the Server will answer
     * with either a REJECT or {@link #RESOLVE}.
     */
    REJECT: "REJECT",

    /**
     * Request from Client: The Client want to subscribe to a Topic, the TopicId is specified in 'eid'.
     */
    SUB: "SUB",

    /**
     * Request from Client: The Client want to unsubscribe to a Topic, the TopicId is specified in 'eid'.
     */
    UNSUB: "UNSUB",

    /**
     * Reply from Server: Subscription was OK. If this is a reconnect, this indicates that any messages that was
     * lost "while offline" will now be delivered/"replayed".
     */
    SUB_OK: "SUB_OK",

    /**
     * Reply from Server: Subscription went OK, but you've lost messages: The messageId that was referenced in the
     * {@link #SUB} was not known to the server, implying that there are at least one message that has expired, and
     * as such it can be many - so you won't get any "replayed".
     */
    SUB_LOST: "SUB_LOST",

    /**
     * Reply from Server: Subscription was not authorized - no messages for this Topic will be delivered.
     */
    SUB_NO_AUTH: "SUB_NO_AUTH",

    /**
     * Topic message from Server: A message is issued on Topic, the TopicId is specified in 'eid', while the message
     * is in 'msg'.
     */
    PUB: "PUB",

    /**
     * The server requests that the Client re-authenticates, where the Client should immediately get a fresh
     * authentication and send it back using either any message it has pending, or in a separate {@link #AUTH}
     * message. Message processing - both processing of received messages, and sending of outgoing messages (i.e.
     * Replies to REQUESTs, or Server-initiated SENDs and REQUESTs) will be stalled until such auth is gotten.
     */
    REAUTH: "REAUTH",

    /**
     * From Client: The client can use a separate AUTH message to send over the requested {@link #REAUTH} (it could
     * just as well put the 'auth' in a PING or any other message it had pending).
     */
    AUTH: "AUTH",

    /**
     * A PING, to which a {@link #PONG} is expected.
     */
    PING: "PING",

    /**
     * A Reply to a {@link #PING}.
     */
    PONG: "PONG"
});
