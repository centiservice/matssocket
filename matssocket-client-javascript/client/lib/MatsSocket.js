import {AuthorizationRequiredEvent, AuthorizationRequiredEventType} from './AuthorizationRequiredEvent.js';
import {ConnectionState} from './ConnectionState.js';
import {ConnectionEvent, ConnectionEventType} from './ConnectionEvent.js';
import {MessageType} from './MessageType.js';
import {ReceivedEvent, ReceivedEventType} from './ReceivedEvent.js';
import {MessageEvent, MessageEventType} from './MessageEvent.js';
import {SubscriptionEvent, SubscriptionEventType} from "./SubscriptionEvent.js";
import {InitiationProcessedEvent, InitiationProcessedEventType} from './InitiationProcessedEvent.js';
import {PingPong} from './PingPong.js';
import {MatsSocketCloseCodes} from './MatsSocketCloseCodes.js';
import {ErrorEvent} from './ErrorEvent.js';
import {DebugInformation, DebugOption} from "./DebugInformation.js";

export {
    MatsSocket,
    AuthorizationRequiredEvent, AuthorizationRequiredEventType,
    ConnectionState,
    ConnectionEvent, ConnectionEventType,
    MessageType,
    ReceivedEvent, ReceivedEventType,
    MessageEvent, MessageEventType,
    SubscriptionEvent, SubscriptionEventType,
    InitiationProcessedEvent, InitiationProcessedEventType,
    PingPong,
    MatsSocketCloseCodes,
    ErrorEvent,
    DebugOption, DebugInformation
}

/**
 * Creates a MatsSocket, requiring the using Application's name and version, and which URLs to connect to.
 *
 * Note: Public, Private and Privileged modelled after http://crockford.com/javascript/private.html
 *
 * @param {string} appName the name of the application using this MatsSocket.js client library
 * @param {string} appVersion the version of the application using this MatsSocket.js client library
 * @param {array} urls an array of WebSocket URLs speaking 'matssocket' protocol, or a single string URL.
 * @param {object} config-object. Current sole key: 'webSocketFactory': how to make WebSockets, optional in browser
 * setting as it will use window.WebSocket.
 * @constructor
 */
function MatsSocket(appName, appVersion, urls, config) {
    let clientLibNameAndVersion = "MatsSocket.js,v0.16.4 (2021-05-24)";

    // :: Validate primary arguments
    if (typeof appName !== "string") {
        throw new Error("appName must be a string, was: [" + appName + "]");
    }
    if (typeof appVersion !== "string") {
        throw new Error("appVersion must be a string, was: [" + appVersion + "]");
    }
    // 'urls' must either be a string, String, or an Array that is not 0 elements.
    let urlsOk = ((typeof urls === 'string') || (urls instanceof String)) || (Array.isArray(urls) && urls.length > 0);
    if (!urlsOk) {
        throw new Error("urls must have at least 1 url set, got: [" + urls + "]");
    }


    // :: Provide default for socket factory if not defined.
    let webSocketFactory = undefined;
    if (config) {
        if (config.webSocketFactory) {
            if (typeof config.webSocketFactory !== "function") {
                throw new Error("config.webSocketFactory should be a function, instead got [" + (typeof config.webSocketFactory) + "].");
            }
            webSocketFactory = config.webSocketFactory;
        } else if (config.webSocket) {
            if (typeof config.webSocket !== "function") {
                throw new Error("config.webSocket should be a function (constructor), instead got [" + (typeof config.webSocket) + "].");
            }
            webSocketFactory = function (url, protocol) {
                return new config.webSocket(url, protocol);
            };
        }
    }

    // ?: Did we get it on 'config'?
    if (!webSocketFactory) {
        // -> No, so try for global WebSocket
        if (typeof WebSocket === "function") {
            webSocketFactory = function (url, protocol) {
                return new WebSocket(url, protocol);
            };
        } else throw new Error("Missing config.webSocket, config.webSocketFactory and global WebSocket (window.WebSocket) - cannot create MatsSocket.");
    }

    // :: Polyfill performance.now() for Node.js
    let performance = ((typeof (window) === "object" && window.performance) || {
        now: function now() {
            return Date.now();
        }
    });

    const that = this;
    const userAgent = (typeof (self) === 'object' && typeof (self.navigator) === 'object') ? self.navigator.userAgent : "Unknown";

    // Ensure that 'urls' is an array or 1 or several URLs.
    urls = [].concat(urls);


    // ==============================================================================================
    // PUBLIC:
    // ==============================================================================================

    // NOTE!! There is an "implicit"/"hidden" 'sessionId' field too, but we do not make it explicit.
    // 'sessionId' is set when we get the SessionId from WELCOME, cleared (deleted) upon SessionClose
    // (along with _matsSocketOpen = false)

    /**
     * Whether to log via console.log. The logging is quite extensive.
     *
     * @type {boolean}
     */
    this.logging = false;

    /**
     * "Out-of-band Close" refers to a small hack to notify the server about a MatsSocketSession being Closed even
     * if the WebSocket is not live anymore: When {@link MatsSocket#close} is invoked, an attempt is done to close
     * the WebSocket with CloseCode {@link MatsSocketCloseCodes#CLOSE_SESSION} - but whether the WebSocket is open
     * or not, this "Out-of-band Close" will also be invoked if enabled and MatsSocket SessionId is present.
     * <p/>
     * Values:
     * <ul>
     *     <li>"Falsy", e.g. <code>false</code>: Disables this functionality</li>
     *     <li>A <code>function</code>: The function is invoked when close(..) is invoked, the
     *         single parameter being an object with two keys: <code>'webSocketUrl'</code> is the current WebSocket
     *         url, i.e. the URL that the WebSocket was connected to, e.g. "wss://example.com/matssocket".
     *         <code>'sessionId'</code> is the current MatsSocket SessionId - the one we're trying to close.</li>
     *     <li>Otherwise "truthy", e.g. <code>true</code> <b>(default)</b>: When this MatsSocket library is used in
     *         a web browser context, the following code is executed:
     *         <code>navigator.sendBeacon(webSocketUrl.replace('ws', 'http)+"/close_session?sessionId={sessionId}")</code>.
     *         Note that replace is replace-first, and that an extra 's' in 'wss' thus results in 'https'.</li>
     * </ul>
     * The default is <code>true</code>.
     * <p/>
     * Note: A 'beforeunload' listener invoking {@link MatsSocket#close} is attached when running in a web browser,
     * so that if the user navigates away, the current MatsSocketSession is closed.
     *
     * @type {(function|boolean)}
     */
    this.outofbandclose = true;

    /**
     * "Pre Connection Operation" refers to a hack whereby the MatsSocket performs a specified operation - by default
     * a {@link XMLHttpRequest} to the same URL as the WebSocket will be connected to - before initiating the
     * WebSocket connection. The goal of this solution is to overcome a deficiency with the WebSocket Web API
     * where it is impossible to add headers, in particular "Authorization": The XHR adds the Authorization header
     * as normal, and the server side can transfer this header value over to a Cookie (e.g. named "MatsSocketAuthCookie").
     * When the WebSocket connect is performed, the cookies will be transferred along with the initial "handshake"
     * HTTP Request - and the AuthenticationPlugin on the server side can then validate the Authorization header -
     * now present in a cookie. <i>Note: One could of course have supplied it in the URL of the WebSocket HTTP Handshake,
     * but this is very far from ideal, as a live authentication then could be stored in several ACCESS LOG style
     * logging systems along the path of the WebSocket HTTP Handshake Request call.</i>
     * <p/>
     * Values:
     * <ul>
     *     <li>"Falsy", e.g. <code>false</code> <b>(default)</b>: Disables this functionality.</li>
     *     <li>A <code>string</code>: Performs a <code>XMLHttpRequest</code> with the URL set to the specified string, with the
     *     HTTP Header "<code>Authorization</code>" set to the current AuthorizationValue. Expects 200, 202 or 204
     *     as returned status code to go on.</li>
     *     <li>A <code>function</code>: Invokes the function with a parameter object containing <code>'webSocketUrl'</code>,
     *     which is the current WebSocket URL that we will connect to when this PreConnectionOperation has gone through,
     *     and <code>'authorization'</code>, which is the current Authorization Value. <b>Expects
     *     a two-element array returned</b>: [abortFunction, requestPromise]. The abortFunction is invoked when
     *     the connection-retry system deems the current attempt to have taken too long time. The requestPromise must
     *     be resolved by your code when the request has been successfully performed, or rejected if it didn't go through.
     *     In the latter case, a new invocation of the 'preconnectoperation' will be performed after a countdown,
     *     possibly with a different 'webSocketUrl' value if the MatsSocket is configured with multiple URLs.</li>
     *     <li>Otherwise "truthy", e.g. <code>true</code>: Performs a <code>XMLHttpRequest</code> to the same URL as
     *     the WebSocket URL, with "ws" replaced with "http", similar to {@link #outofbandclose}, and the HTTP Header
     *     "<code>Authorization</code>" set to the current Authorization Value. Expects 200, 202 or 204 as returned
     *     status code to go on.</li>
     * </ul>
     * The default is <code>false</code>.
     * <p/>
     * Note: For inspiration for the function-style value of this config, look in the source for the method
     * <code>w_defaultXhrPromiseFactory(params)</code>.
     * <p/>
     * Note: A WebSocket is set up with a single HTTP Request, called the "Upgrade" or "Handshake" request. The
     * point about being able to send Authorization along with the WebSocket connect only refers to this initial
     * HTTP Request. Subsequent updates of the Authorization by means of invocation of
     * {@link MatsSocket#setCurrentAuthorization} will not result in new HTTP calls - these new Authorization
     * strings are sent in-band with WebSocket messages (MatsSocket envelopes).
     *
     * @type {(boolean|string|function)}
     */
    this.preconnectoperation = false;

    /**
     * A bit field requesting different types of debug information, the bits defined in {@link DebugOption}. It is
     * read each time an information bearing message is added to the pipeline, and if not 'undefined' or 0, the
     * debug options flags is added to the message. The server may then add {@link DebugInformation} to outgoing
     * messages depending on whether the authorized user is allowed to ask for it, most obviously on Replies to
     * Client Requests, but also Server initiated SENDs and REQUESTs.
     * <p/>
     * The debug options on the outgoing Client-to-Server requests are tied to that particular request flow -
     * but to facilitate debug information also on Server initiated messages, the <i>last set</i> debug options is
     * also stored on the server and used when messages originate there (i.e. Server-to-Client SENDs and REQUESTs).
     * <p/>
     * If you only want debug information on a particular Client-to-Server request, you'll need to first set the
     * debug flags, then do the request (adding the message to the pipeline), and then reset the debug flags back,
     * and send some new message to reset the value for Server-initiated messages (Just to be precise: Any message
     * from Server-to-Client which happens to be performed in the timespan between the request and the subsequent
     * message which resets the debug flags will therefore also have debug information attached).
     * <p/>
     * The value is a bit field (values in {@link DebugOption}, so you bitwise-or (or simply add) together the
     * different things you want. Difference between <code>undefined</code> and <code>0</code> is that undefined
     * turns debug totally off (the {@link DebugInformation} instance won't be present in the {@link MessageEvent},
     * while 0 means that the server is not requested to add debug info - but the Client will still create the
     * {@link DebugInformation} instance and populate it with what any local debug information.
     * <p/>
     * The value from the client is bitwise-and'ed together with the debug capabilities the authenticated user has
     * gotten by the AuthenticationPlugin on the Server side.
     *
     * @type {number}
     */
    this.debug = undefined;


    /**
     * When performing a {@link #request() Request} and {@link #requestReplyTo() RequestReplyTo}, you may not
     * always get a (timely) answer: Either you can loose
     * the connection, thus lagging potentially forever - or, depending on the Mats message handling on the server
     * (i.e. using "non-persistent messaging" for blazing fast performance for non-state changing operations),
     * there is a minuscule chance that the message may be lost - or, if there is a massive backlog of messages
     * for the particular Mats endpoint that is interfaced, you might not get an answer for 20 minutes. This setting
     * controls the default timeout in milliseconds for Requests, and is default 45000 milliseconds (45 seconds),
     * but you may override this per Request by specifying a different timeout in the config object for the request.
     * When the timeout is hit, the Promise of a {@link #request()} - or the specified ReplyTo Terminator for a
     * {@link #requestReplyTo()} - will be rejected with a {@link MessageEvent} of type
     * {@link MessageEventType#TIMEOUT}. In addition, if the Received acknowledgement has not gotten in
     * either, this will also (<i>before</i> the Promise reject!) be NACK'ed with {@link ReceivedEventType#TIMEOUT}
     *
     * @type {number}
     */
    this.requestTimeout = 45000;

    /**
     * <b>Note: You <i>should</i> register a SessionClosedEvent listener, as any invocation of this listener by this
     * client library means that you've either not managed to do initial authentication, or lost sync with the
     * server, and you should crash or "reboot" the application employing the library to regain sync.</b>
     * <p />
     * The registered event listener functions are called when the Server kicks us off the socket and the session is
     * closed due to a multitude of reasons, where most should never happen if you use the library correctly, in
     * particular wrt. authentication. <b>It is NOT invoked when you explicitly invoke matsSocket.close() from
     * the client yourself!</b>
     * <p />
     * The event object is the WebSocket's {@link CloseEvent}, adorned with properties 'codeName', giving the
     * <i>key name</i> of the {@link MatsSocketCloseCodes} (as provided by {@link MatsSocketCloseCodes#nameFor()}),
     * and 'outstandingInitiations', giving the number of outstanding initiations when the session was closed.
     * You can use the 'code' to "enum-compare" to <code>MatsSocketCloseCodes</code>, the enum keys are listed here:
     * <ul>
     *   <li>{@link MatsSocketCloseCodes#UNEXPECTED_CONDITION UNEXPECTED_CONDITION}: Error on the Server side,
     *   typically that the data store (DB) was unavailable, and the MatsSocketServer could not reliably recover
     *   the processing of your message.</li>
     *   <li>{@link MatsSocketCloseCodes#MATS_SOCKET_PROTOCOL_ERROR MATS_SOCKET_PROTOCOL_ERROR}: This client library
     *   has a bug!</li>
     *   <li>{@link MatsSocketCloseCodes#VIOLATED_POLICY VIOLATED_POLICY}: Initial Authorization was wrong. Always
     *   supply a correct and non-expired Authorization value, which has sufficient 'roomForLatency' wrt.
     *   the expiry time.</li>
     *   <li>{@link MatsSocketCloseCodes#CLOSE_SESSION CLOSE_SESSION}:
     *   <code>MatsSocketServer.closeSession(sessionId)</code> was invoked Server side for this MatsSocketSession</li>
     *   <li>{@link MatsSocketCloseCodes#SESSION_LOST SESSION_LOST}: A reconnect attempt was performed, but the
     *   MatsSocketSession was timed out on the Server. The Session will never time out if the WebSocket connection
     *   is open. Only if the Client has lost connection, the timer will start. The Session timeout is measured in
     *   hours or days. This could conceivably happen if you close the lid of a laptop, and open it again days later
     *   - but one would think that the Authentication session (the one giving you Authorization headers) had timed
     *   out long before.</li>
     * </ul>
     * Again, note: No such error should happen if this client is used properly, and the server does not get
     * problems with its data store.
     * <p />
     * Note that when this event listener is invoked, the MatsSocketSession is just as closed as if you invoked
     * {@link MatsSocket#close()} on it: All outstanding send/requests are NACK'ed (with
     * {@link ReceivedEventType#SESSION_CLOSED}), all request Promises are rejected
     * (with {@link MessageEventType#SESSION_CLOSED}), and the MatsSocket object is as if just constructed and
     * configured. You may "boot it up again" by sending a new message where you then will get a new MatsSocket
     * SessionId. However, you should consider restarting the application if this happens, or otherwise "reboot"
     * it as if it just started up (gather all required state and null out any other that uses lazy fetching).
     * Realize that any outstanding "addOrder" request's Promise will now have been rejected - and you don't really
     * know whether the order was placed or not, so you should get the entire order list. On the received event,
     * the property 'outstandingInitiations' details the number of outstanding send/requests and Promises that was
     * rejected: If this is zero, you <i>might</i> actually be in sync (barring failed/missing Server-to-Client
     * SENDs or REQUESTs), and could <i>consider</i> to just "act as if nothing happened" - by sending a new message
     * and thus get a new MatsSocket Session going.
     *
     * @param {function<CloseEvent>} sessionClosedEventListener a function that is invoked when the library gets the current
     * MatsSocketSession closed from the server. The event object is the WebSocket's {@link CloseEvent}.
     */
    this.addSessionClosedEventListener = function (sessionClosedEventListener) {
        if (!(typeof sessionClosedEventListener === 'function')) {
            throw Error("SessionClosedEvent listener must be a function");
        }
        _sessionClosedEventListeners.push(sessionClosedEventListener);
    };

    /**
     * <b>Note: You <i>could</i> register a ConnectionEvent listener, as these are only informational messages
     * about the state of the Connection.</b> It is nice if the user gets a small notification about <i>"Connection
     * Lost, trying to reconnect in 2 seconds"</i> to keep him in the loop of why the application's data fetching
     * seems to be lagging. There are suggestions of how to approach this with each of the enum values of
     * {@link ConnectionEventType}.
     * <p />
     * The registered event listener functions are called when this client library performs WebSocket connection
     * operations, including connection closed events that are not "Session Close" style. This includes the simple
     * situation of "lost connection, reconnecting" because you passed through an area with limited or no
     * connectivity.
     * <p />
     * Read more at {@link ConnectionEvent} and {@link ConnectionEventType}.
     *
     * @param {function<ConnectionEvent>} connectionEventListener a function that is invoked when the library issues
     * {@link ConnectionEvent}s.
     */
    this.addConnectionEventListener = function (connectionEventListener) {
        if (!(typeof connectionEventListener === 'function')) {
            throw Error("SessionClosedEvent listener must be a function");
        }
        _connectionEventListeners.push(connectionEventListener);
    };

    /**
     * <b>Note: If you use {@link #subscribe() subscriptions}, you <i>should</i> register a
     * {@link SubscriptionEvent} listener, as you should be concerned about {@link SubscriptionEventType#NOT_AUTHORIZED}
     * and {@link SubscriptionEventType#LOST_MESSAGES}.</b>
     * <p />
     * Read more at {@link SubscriptionEvent} and {@link SubscriptionEventType}.
     *
     * @param {function<SubscriptionEvent>} subscriptionEventListener a function that is invoked when the library
     * gets information from the Server wrt. subscriptions.
     */
    this.addSubscriptionEventListener = function (subscriptionEventListener) {
        if (!(typeof subscriptionEventListener === 'function')) {
            throw Error("SubscriptionEvent listener must be a function");
        }
        _subscriptionEventListeners.push(subscriptionEventListener);
    };

    /**
     * Some 25 places within the MatsSocket client catches errors of different kinds, typically where listeners
     * cough up errors, or if the library catches mistakes with the protocol, or if the WebSocket emits an error.
     * Add a ErrorEvent listener to get hold of these, and send them back to your server for
     * inspection - it is best to do this via out-of-band means, e.g. via HTTP. For browsers, consider
     * window.sendBeacon(..).
     * <p />
     * The event object is {@link ErrorEvent}.
     *
     * @param {function<ErrorEvent>} errorEventListener
     */
    this.addErrorEventListener = function (errorEventListener) {
        if (!(typeof errorEventListener === 'function')) {
            throw Error("ErrorEvent listener must be a function");
        }
        _errorEventListeners.push(errorEventListener);
    };

    /**
     * If this MatsSockets client realizes that the expiration time (minus the room for latency) of the authorization
     * has passed when about to send a message, it will invoke this callback function. A new authorization must then
     * be provided by invoking the 'setCurrentAuthorization' function - only when this is invoked, the MatsSocket
     * will send messages. The MatsSocket will queue up any messages that are initiated while waiting for new
     * authorization, and send them all at once in a single pipeline when the new authorization is in.
     *
     * @param {function<AuthorizationRequiredEvent>} authorizationExpiredCallback function which will be invoked
     * when about to send a new message <i>if</i>
     * '<code>Date.now() > (expirationTimeMillisSinceEpoch - roomForLatencyMillis)</code>' from the paramaters of
     * the last invocation of {@link #setCurrentAuthorization()}.
     */
    this.setAuthorizationExpiredCallback = function (authorizationExpiredCallback) {
        if (!(typeof authorizationExpiredCallback === 'function')) {
            throw Error("AuthorizationExpiredCallback must be a function");
        }
        _authorizationExpiredCallback = authorizationExpiredCallback;

        // Evaluate whether there are stuff in the pipeline that should be sent now.
        // (Not-yet-sent HELLO does not count..)
        that.flush();
    };

    /**
     * Sets an authorization String, which for several types of authorization must be invoked on a regular basis with
     * fresh authorization - this holds for a OAuth/JWT/OIDC-type system where an access token will expire within a short time
     * frame (e.g. expires within minutes). For an Oauth2-style authorization scheme, this could be "Bearer: ......".
     * This must correspond to what the server side authorization plugin expects.
     * <p />
     * <b>NOTE: This SHALL NOT be used to CHANGE the user!</b> It should only refresh an existing authorization for the
     * initially authenticated user. One MatsSocket (Session) shall only be used by a single user: If changing
     * user, you should ditch the existing MatsSocket after invoking {@link #close()} to properly clean up the current
     * MatsSocketSession on the server side too, and then make a new MatsSocket thus getting a new Session.
     * <p />
     * Note: If the underlying WebSocket has not been established and HELLO sent, then invoking this method will NOT
     * do that - only the first actual MatsSocket message will start the WebSocket and perform the HELLO/WELCOME
     * handshake.
     *
     * @param {string} authorizationValue the string Value which will be transfered to the Server and there resolved
     *        to a Principal and UserId on the server side by the AuthorizationPlugin. Note that this value potentially
     *        also will be forwarded to other resources that requires authorization.
     * @param {number} expirationTimestamp the millis-since-epoch at which this authorization expires
     *        (in case of OAuth-style tokens), or -1 if it never expires or otherwise has no defined expiration mechanism.
     *        <i>Notice that in a JWT token, the expiration time is in seconds, not millis: Multiply by 1000.</i>
     * @param {number} roomForLatencyMillis the number of millis which is subtracted from the 'expirationTimestamp' to
     *        find the point in time where the MatsSocket will refuse to use the authorization and instead invoke the
     *        {@link #setAuthorizationExpiredCallback AuthorizationExpiredCallback} and wait for a new authorization
     *        being set by invocation of the present method. Depending on what the usage of the Authorization string
     *        is on server side is, this should probably <b>at least</b> be 10000, i.e. 10 seconds - but if the Mats
     *        endpoints uses the Authorization string to do further accesses, both latency and queue time must be
     *        taken into account (e.g. for calling into another API that also needs a valid token). If
     *        expirationTimestamp is '-1', then this parameter is not used. <i>Default value is 30000 (30 seconds).</i>
     */
    this.setCurrentAuthorization = function (authorizationValue, expirationTimestamp, roomForLatencyMillis = 30000) {
        if (this.logging) log("Got Authorization which "
            + (expirationTimestamp !== -1 ? "Expires in [" + (expirationTimestamp - Date.now()) + " ms]" : "[Never expires]")
            + ", roomForLatencyMillis: " + roomForLatencyMillis);

        _authorization = authorizationValue;
        _expirationTimestamp = expirationTimestamp;
        _roomForLatencyMillis = roomForLatencyMillis;
        // ?: Should we send it now?
        if (_authExpiredCallbackInvoked_EventType === AuthorizationRequiredEventType.REAUTHENTICATE) {
            log("Immediate send of new authentication due to REAUTHENTICATE");
            _forcePipelineProcessing = true;
        }
        // We're now back to "normal", i.e. not outstanding authorization request.
        _authExpiredCallbackInvoked_EventType = undefined;

        // Evaluate whether there are stuff in the pipeline that should be sent now.
        // (Not-yet-sent HELLO does not count..)
        that.flush();
    };

    /**
     * This can be used by the mechanism invoking 'setCurrentAuthorization(..)' to decide whether it should keep the
     * authorization fresh (i.e. no latency waiting for new authorization is introduced when a new message is
     * enqueued), or fall back to relying on the 'authorizationExpiredCallback' being invoked when a new message needs
     * it (thus introducing latency while waiting for authorization). One could envision keeping fresh auth for 5
     * minutes, but if the user has not done anything requiring authentication (i.e. sending information bearing
     * messages SEND, REQUEST or Replies) in that timespan, you stop doing continuous authentication refresh, falling
     * back to the "on demand" based logic, where when the user does something, the 'authorizationExpiredCallback'
     * is invoked if the authentication is expired.
     *
     * @member {number} lastMessageEnqueuedTimestamp millis-since-epoch of last message enqueued.
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "lastMessageEnqueuedTimestamp", {
        get: function () {
            return _lastMessageEnqueuedTimestamp;
        }
    });

    /**
     * Returns whether this MatsSocket <i>currently</i> have a WebSocket connection open. It can both go down
     * by lost connection (driving through a tunnel), where it will start to do reconnection attempts, or because
     * you (the Client) have closed this MatsSocketSession, or because the <i>Server</i> has closed the
     * MatsSocketSession. In the latter cases, where the MatsSocketSession is closed, the WebSocket connection will
     * stay down - until you open a new MatsSocketSession.
     * <p/>
     * Pretty much the same as <code>({@link #state} === {@link ConnectionState#CONNECTED})
     * || ({@link #state} === {@link ConnectionState#SESSION_ESTABLISHED})</code> - however, in the face of
     * {@link MessageType#DISCONNECT}, the state will not change, but the connection is dead ('connected' returns
     * false).
     *
     * @member {string} connected
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "connected", {
        get: function () {
            return _webSocket != null;
        }
    });

    /**
     * Returns which one of the {@link ConnectionState} state enums the MatsSocket is in.
     * <ul>
     *     <li>NO_SESSION - initial state, and after Session Close (both from client and server side)</li>
     *     <li>CONNECTING - when we're actively trying to connect, i.e. "new WebSocket(..)" has been invoked, but not yet either opened or closed.</li>
     *     <li>WAITING - if the "new WebSocket(..)" invocation ended in the socket closing, i.e. connection failed, but we're still counting down to next (re)connection attempt.</li>
     *     <li>CONNECTED - if the "new WebSocket(..)" resulted in the socket opening. We still have not established the MatsSocketSession with the server, though.</li>
     *     <li>SESSION_ESTABLISHED - when we're open for business: Connected, authenticated, and established MatsSocketSession with the server.</li>
     * </ul>
     *
     * @member {string} state
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "state", {
        get: function () {
            return _state;
        }
    });

    /**
     * Metrics/Introspection: Returns an array of the 100 latest {@link PingPong}s. Note that a PingPong entry
     * is added to this array <i>before</i> it gets the Pong, thus the latest may not have its
     * {@link PingPong#roundTripMillis} set yet. Also, if a ping is performed right before the connection goes down,
     * it will never get the Pong, thus there might be entries in the middle of the list too that does not have
     * roundTripMillis set. This is opposed to the {@link #addPingPongListener}, which only gets invoked when
     * the pong has arrived.
     *
     * @see #addPingPongListener()
     *
     * @member {array<PingPong>}
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "pings", {
        get: function () {
            return _pings;
        }
    });

    /**
     * A {@link PingPong} listener is invoked each time a {@link MessageType#PONG} message comes in, giving you
     * information about the experienced {@link PingPong#roundTripMillis round-trip time}. The PINGs and PONGs are
     * handled slightly special in that they always are handled ASAP with short-path code routes, and should thus
     * give a good indication about experienced latency from the network. That said, they are sent on the same
     * connection as all data, so if there is a gigabyte document "in the pipe", the PING will come behind that
     * and thus get a big hit. Thus, you should consider this when interpreting the results - a high outlier should
     * be seen in conjunction with a message that was sent at the same time.
     *
     * @param {function<PingPong>} pingPongListener a function that is invoked when the library issues
     */
    this.addPingPongListener = function (pingPongListener) {
        if (!(typeof pingPongListener === 'function')) {
            throw Error("PingPong listener must be a function");
        }
        _pingPongListeners.push(pingPongListener);
    };

    /**
     * Metrics/Introspection: Returns an array of the {@link #numberOfInitiationsKept} latest
     * {@link InitiationProcessedEvent}s.
     * <p />
     * Note: These objects will always have the {@link InitiationProcessedEvent#initiationMessage} and (if Request)
     * {@link InitiationProcessedEvent#replyMessageEvent} set, as opposed to the events issued to
     * {@link #addInitiationProcessedEventListener}, which can decide whether to include them.
     *
     * @see #addInitiationProcessedEventListener()
     *
     * @member {InitiationProcessedEvent<InitiationProcessedEvent>}
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "initiations", {
        get: function () {
            return _initiationProcessedEvents;
        }
    });

    /**
     * Metrics/Introspection: How many {@link InitiationProcessedEvent}s to keep in {@link #initiations}.
     * If the current number of initiations is more than what you set it to, it will be culled.
     * You can use this to "reset" the {@link #initiations array of initiations} by setting it to 0, then right
     * back up to whatever you fancy.
     * <p />
     * Default is 10.
     *
     * @member {number}
     * @memberOf MatsSocket
     * @readonly
     */
    Object.defineProperty(this, "numberOfInitiationsKept", {
        get: function () {
            return _numberOfInitiationsKept;
        },
        set: function (numberOfInitiationsKept) {
            if (numberOfInitiationsKept < 0) {
                throw new Error("numberOfInitiationsKept must be >= 0");
            }
            _numberOfInitiationsKept = numberOfInitiationsKept;
            while (_initiationProcessedEvents.length > numberOfInitiationsKept) {
                _initiationProcessedEvents.shift();
            }
        }
    });

    /**
     * Registering an {@link InitiationProcessedEvent} listener will give you meta information about each Send
     * and Request that is performed through the library when it is fully processed, thus also containing
     * information about experienced round-trip times. The idea is that you thus can gather metrics of
     * performance as experienced out on the client, by e.g. periodically sending this gathering to the Server.
     * <b>Make sure that you understand that if you send to the server each time this listener is invoked, using
     * the MatsSocket itself, you WILL end up in a tight loop!</b> This is because the sending of the statistics
     * message itself will again trigger a new invocation of this listener. This can be avoided in two ways: Either
     * instead send periodically - in which case you can include the statistics message itself, OR specify that
     * you do NOT want a listener-invocation of these messages by use of the config object on the send, request
     * and requestReplyTo methods.
     * <p />
     * Note: Each listener gets its own instance of {@link InitiationProcessedEvent}, which also is different from
     * the ones in the {@link #initiations} array.
     *
     * @param {function<InitiationProcessedEvent>} initiationProcessedEventListener a function that is invoked when
     * the library issues {@link InitiationProcessedEvent}s.
     * @param {boolean} includeInitiationMessage whether to include the {@link InitiationProcessedEvent#initiationMessage}
     * @param {boolean} includeReplyMessageEvent whether to include the {@link InitiationProcessedEvent#replyMessageEvent}
     * Reply {@link MessageEvent}s.
     */
    this.addInitiationProcessedEventListener = function (initiationProcessedEventListener, includeInitiationMessage, includeReplyMessageEvent) {
        if (!(typeof initiationProcessedEventListener === 'function')) {
            throw Error("InitiationProcessedEvent listener must be a function");
        }
        _initiationProcessedEventListeners.push({
            listener: initiationProcessedEventListener,
            includeInitiationMessage: includeInitiationMessage,
            includeReplyMessageEvent: includeReplyMessageEvent
        });
    };

    // ========== Terminator and Endpoint registration ==========

    /**
     * Registers a Terminator, on the specified terminatorId, and with the specified callbacks. A Terminator is
     * the target for Server-to-Client SENDs, and the Server's REPLYs from invocations of
     * <code>requestReplyTo(terminatorId ..)</code> where the terminatorId points to this Terminator.
     * <p />
     * Note: You cannot register any Terminators, Endpoints or Subscriptions starting with "MatsSocket".
     *
     * @param terminatorId the id of this client side Terminator.
     * @param messageCallback receives an Event when everything went OK, containing the message on the "data" property.
     * @param rejectCallback is relevant if this endpoint is set as the replyTo-target on a requestReplyTo(..) invocation, and will
     * get invoked with the Event if the corresponding Promise-variant would have been rejected.
     */
    this.terminator = function (terminatorId, messageCallback, rejectCallback) {
        // :: Assert for double-registrations
        if (_terminators[terminatorId] !== undefined) {
            throw new Error("Cannot register more than one Terminator to same terminatorId [" + terminatorId + "], existing: " + _terminators[terminatorId]);
        }
        if (_endpoints[terminatorId] !== undefined) {
            throw new Error("Cannot register a Terminator to same terminatorId [" + terminatorId + "] as an Endpoint's endpointId, existing: " + _endpoints[terminatorId]);
        }
        // :: Assert that the namespace "MatsSocket" is not used
        if (terminatorId.startsWith("MatsSocket")) {
            throw new Error('The namespace "MatsSocket" is reserved, terminatorId [' + terminatorId + '] is illegal.');
        }
        // :: Assert that the messageCallback is a function
        if (typeof messageCallback !== 'function') {
            throw new Error("The 'messageCallback' must be a function.");
        }
        // :: Assert that the rejectCallback is either undefined or a function
        if ((rejectCallback !== undefined) && (typeof rejectCallback !== 'function')) {
            throw new Error("The 'rejectCallback' must either be undefined or a function.");
        }
        log("Registering Terminator on id [" + terminatorId + "]:\n #messageCallback: " + messageCallback + "\n #rejectCallback: " + rejectCallback);
        _terminators[terminatorId] = {
            resolve: messageCallback,
            reject: rejectCallback
        };
    };

    /**
     * Registers an Endpoint, on the specified endpointId, with the specified "promiseProducer". An Endpoint is
     * the target for Server-to-Client REQUESTs. The promiseProducer is a function that takes a message event
     * (the incoming REQUEST) and produces a Promise, whose return (resolve or reject) is the return value of the
     * endpoint.
     * <p />
     * Note: You cannot register any Terminators, Endpoints or Subscriptions starting with "MatsSocket".
     *
     * @param endpointId the id of this client side Endpoint.
     * @param {function} promiseProducer a function that takes a Message Event and returns a Promise which when
     * later either Resolve or Reject will be the return value of the endpoint call.
     */
    this.endpoint = function (endpointId, promiseProducer) {
        // :: Assert for double-registrations
        if (_endpoints[endpointId] !== undefined) {
            throw new Error("Cannot register more than one Endpoint to same endpointId [" + endpointId + "], existing: " + _endpoints[endpointId]);
        }
        if (_terminators[endpointId] !== undefined) {
            throw new Error("Cannot register an Endpoint to same endpointId [" + endpointId + "] as a Terminator, existing: " + _terminators[endpointId]);
        }
        // :: Assert that the namespace "MatsSocket" is not used
        if (endpointId.startsWith("MatsSocket")) {
            throw new Error('The namespace "MatsSocket" is reserved, EndpointId [' + endpointId + '] is illegal.');
        }
        // :: Assert that the promiseProducer is a function
        if (typeof promiseProducer !== 'function') {
            throw new Error("The 'promiseProducer' must be a function.");
        }
        log("Registering Endpoint on id [" + endpointId + "]:\n #promiseProducer: " + promiseProducer);
        _endpoints[endpointId] = promiseProducer;
    };

    /**
     * Subscribes to a Topic. The Server may do an authorization check for the subscription. If you are not allowed,
     * a {@link SubscriptionEvent} of type {@link SubscriptionEventType#NOT_AUTHORIZED} is issued, and the callback
     * will not get any messages. Otherwise, the event type is {@link SubscriptionEventType#OK}.
     * <p />
     * Note: If the 'messageCallback' was already registered, an error is emitted, but the method otherwise returns
     * silently.
     * <p />
     * Note: You will not get messages that was issued before the subscription initially is registered with the
     * server, which means that you by definition cannot get any messages issued earlier than the initial
     * {@link ConnectionEventType#SESSION_ESTABLISHED}. Code accordingly. <i>Tip for a "ticker stream" or "cache
     * update stream" or similar: Make sure you have some concept of event sequence number on updates. Do the MatsSocket
     * connect with the Subscription in place, but for now just queue up any updates. Do the request for "full initial load", whose reply
     * contains the last applied sequence number. Now process the queued events that arrived while getting the
     * initial load (i.e. in front, or immediately after), taking into account which event sequence numbers that
     * already was applied in the initial load: Discard the earlier and same, apply the later. Finally, go over to
     * immediate processing of the events. If you get a reconnect telling you that messages was lost (next "Note"!),
     * you could start this process over.</i>
     * <p />
     * Note: Reconnects are somewhat catered for, in that a "re-subscription" after re-establishing the session will
     * contain the latest messageId the client has received, and the server will then send along all the messages
     * <i>after</i> this that was lost - up to some limit specified on the server. If the messageId is not known by the server,
     * implying that the client has been gone for too long time, a {@link SubscriptionEvent} of type
     * {@link SubscriptionEventType#LOST_MESSAGES} is issued. Otherwise, the event type is
     * {@link SubscriptionEventType#OK}.
     * <p />
     * Note: You should preferably add all "static" subscriptions in the "configuration phase" while setting up
     * your MatsSocket, before starting it (i.e. sending first message). However, dynamic adding and
     * {@link #deleteSubscription() deleting} is also supported.
     * <p />
     * Note: Pub/sub is not designed to be as reliable as send/request - but it should be pretty ok anyway!
     * <p />
     * Wrt. to how many topics a client can subscribe to: Mainly bandwidth constrained wrt. to the total number of
     * messages, although there is a slight memory and CPU usage to consider too (several hundred should not really
     * be a problem). In addition, the client needs to send over the actual subscriptions, and if these number in
     * the thousands, the connect and any reconnects could end up with tens or hundreds of kilobytes of "system
     * information" passed over the WebSocket.
     * <p />
     * Wrt. to how many topics that can exist: Mainly memory constrained on the server based on the number of topics
     * multiplied by the number of subscriptions per topic, in addition to the number of messages passed in total
     * as each node in the cluster will have to listen to either the full total of messages, or at least a
     * substantial subset of the messages - and it will also retain these messages for hours to allow for client
     * reconnects.
     * <p />
     * Note: You cannot register any Terminators, Endpoints or Subscriptions starting with "MatsSocket".
     */
    this.subscribe = function (topicId, messageCallback) {
        // :: Assert that the namespace "MatsSocket" is not used
        if (topicId.startsWith("MatsSocket")) {
            throw new Error('The namespace "MatsSocket" is reserved, Topic [' + topicId + '] is illegal.');
        }
        if (topicId.startsWith("!")) {
            throw new Error('Topic cannot start with "!" (and why would you use chars like that anyway?!), Topic [' + topicId + '] is illegal.');
        }
        // :: Assert that the messageCallback is a function
        if (typeof messageCallback !== 'function') {
            throw new Error("The 'messageCallback' must be a function.");
        }
        log("Registering Subscription on Topic [" + topicId + "]:\n #messageCallback: " + messageCallback);
        // ?: Check if we have an active subscription holder here already
        let subs = _subscriptions[topicId];
        if (!subs) {
            // -> No, we do not have subscription holder going
            // Add a holder
            subs = {
                listeners: [],
                lastSmid: undefined,
                subscriptionSentToServer: false
            };
            _subscriptions[topicId] = subs;
        }
        // :: Assert that the messageCallback is not already there
        for (let i = 0; i < subs.listeners.length; i++) {
            if (subs.listeners[i] === messageCallback) {
                error("subscription_already_exists", "The specified messageCallback [" + messageCallback + "] was already subscribed to Topic [" + topicId + "].");
                return;
            }
        }
        // Add the present messageCallback to the subscription holder
        subs.listeners.push(messageCallback);

        // :: Handle dynamic subscription

        // ?: Have we NOT already subscribed with Server, AND 'HELLO' is sent?
        if ((!subs.subscriptionSentToServer) && _helloSent) {
            // -> Yes, so do stuff dynamic (Handling of Topics with HELLO-handling won't help us..!)
            // Subscribe this TopicId with the server - using PRE-pipeline to get it done ASAP
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.SUB,
                eid: topicId
            }, true);
            // Flush to get it over ASAP.
            that.flush();
            // The subscription is now sent to Server
            subs.subscriptionSentToServer = true;
        }
    };

    /**
     * Removes a previously added {@link #subscribe() subscription}. If there are no more listeners for this topic,
     * it is de-subscribed from the server. If the 'messageCallback' was not already registered, an error is
     * emitted, but the method otherwise returns silently.
     *
     * @param topicId
     * @param messageCallback
     */
    this.deleteSubscription = function (topicId, messageCallback) {
        let subs = _subscriptions[topicId];
        if (!subs) {
            throw new Error("The topicId [" + topicId + "] had no subscriptions! (thus definitely not this [" + messageCallback + "].");
        }
        let found = false;
        for (let i = 0; i < subs.listeners.length; i++) {
            if (subs.listeners[i] === messageCallback) {
                found = true;
                subs.listeners = subs.listeners.splice(i, 1);
                break;
            }
        }
        if (!found) {
            error("subscription_not_found", "The specified messageCallback [" + messageCallback + "] was not subscribed with Topic [" + topicId + "].");
            return;
        }

        // :: Handle dynamic de-subscription

        // ?: Are we empty of listeners, AND we are already subscribed with Server, AND 'HELLO' is sent?
        if ((subs.listeners.length === 0) && subs.subscriptionSentToServer && _helloSent) {
            // -> Yes, so do stuff dynamic (Handling of Topic subscriptions at HELLO-handling won't help us..!)
            // De-subscribe this TopicId with the server - using PRE-pipeline since subscriptions are using that, and we need subs and de-subs in sequential correct order
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.UNSUB,
                eid: topicId
            }, true);
            // Remove locally
            delete _subscriptions[topicId];
        }
    };

    /**
     * "Fire-and-forget"-style send-a-message. The returned promise is Resolved when the Server receives and accepts
     * the message for processing, while it is Rejected if the Server denies it.
     * <p/>
     * The config object has a single key - <i>which is optional</i>:
     * <ul>
     *     <li>suppressInitiationProcessedEvent: If <code>true</code>, no event will be sent to listeners added
     *         using {@link #addInitiationProcessedEventListener()}.</li>
     * </ul>
     *
     * @param endpointId the Server MatsSocket Endpoint/Terminator that this message should go to.
     * @param traceId the TraceId for this message - will go through all parts of the call, including the Mats flow.
     * @param message the actual message for the Server MatsSocket Endpoint.
     * @param {object} config an optional configuration object - read JSDoc.
     * @returns {Promise<ReceivedEvent>}
     */
    this.send = function (endpointId, traceId, message, config = undefined) {
        return new Promise(function (resolve, reject) {
            // Make lambda for what happens when it has been RECEIVED on server.
            let initiation = Object.create(null);
            // Set the Sends's returned Promise's settle functions for ACK and NACK.
            initiation.ack = resolve;
            initiation.nack = reject;

            // Parse config object
            if (config) {
                if (typeof (config) !== 'object') {
                    throw new Error("The 'config' parameter wasn't an object.");
                }
                // ?: 'suppressInitiationProcessedEvent' setting?
                if (config.suppressInitiationProcessedEvent) {
                    initiation.suppressInitiationProcessedEvent = true;
                }
            }

            let envelope = Object.create(null);
            envelope.t = MessageType.SEND;
            envelope.eid = endpointId;
            envelope.msg = message;

            _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, undefined);
        });
    };


    /**
     * Perform a Request, and have the reply come back via the returned Promise. As opposed to Send, where the
     * returned Promise is resolved when the server accepts the message, the Promise is now resolved by the Reply.
     * To get information of whether the server accepted or did not accept the message, you can provide either
     * a receivedCallback function (set the 'config' parameter to this function) or set the two config properties
     * 'ackCallback' and 'nackCallback' to functions. If you supply the single function variant, this is equivalent
     * to setting both ack- and nackCallback to the same function. The {@link ReceivedEvent}'s type will distinguish
     * between {@link ReceivedEventType#ACK ACK} or {@link ReceivedEventType#NACK NACK}.
     * <p/>
     * The config object has keys as such - <i>all are optional</i>:
     * <ul>
     *     <li><b><code>receivedCallback</code></b>: {function} invoked when the Server receives the event and either ACK or NACKs it
     *         - or when {@link MessageEventType#TIMEOUT} or {@link MessageEventType#SESSION_CLOSED} happens.
     *         This overrides the ack- and nackCallbacks.</li>
     *     <li><b><code>ackCallback</code></b>: {function} invoked when the Server receives the event and ACKs it.</li>
     *     <li><b><code>nackCallback</code></b>: {function} invoked when the Server receives the event and NACKs it
     *         - or when {@link MessageEventType#TIMEOUT} or {@link MessageEventType#SESSION_CLOSED} happens.</li>
     *     <li><b><code>timeout</code></b>: number of milliseconds before the Client times out the Server reply. When this happens,
     *         the 'nackCallback' (or receivedCallback if this is used) is invoked with a {@link ReceivedEvent} of
     *         type {@link ReceivedEventType#TIMEOUT}, and the Request's Promise will be <i>rejected</i> with a
     *         {@link MessageEvent} of type {@link MessageEventType#TIMEOUT}.</li>
     *     <li><b><code>suppressInitiationProcessedEvent</code></b>: if <code>true</code>, no event will be sent to listeners added
     *         using {@link #addInitiationProcessedEventListener()}.</li>
     *     <li><b><code>debug</code></b>: If set, this specific call flow overrides the global {@link MatsSocket#debug} setting, read
     *         more about debug and {@link DebugOption}s there.</li>
     * </ul>
     * <p />
     * <b>Note on event ordering:</b> {@link ReceivedEvent}s shall always be delivered <i>before</i> {@link MessageEvent}s.
     * This means that for a <i>request</i>, if receivedCallback (or ack- or nackCallback) is provided, it shall be
     * invoked <i>before</i> the return Reply-Promise will be settled. For more on event ordering wrt. message
     * processing, read {@link InitiationProcessedEvent}.
     *
     * @param endpointId the Server MatsSocket Endpoint that this message should go to.
     * @param traceId the TraceId for this message - will go through all parts of the call, including the Mats flow.
     * @param message the actual message for the Server MatsSocket Endpoint.
     * @param {function|object} configOrCallback (optional) either directly a "receivedCallback" function as
     *        described in the config object, or a config object - read JSDoc above.
     * @returns {Promise<MessageEvent>}
     */
    this.request = function (endpointId, traceId, message, configOrCallback = undefined) {
        return new Promise(function (resolve, reject) {
            // Default Timeout is MatsSocket's default
            let timeout = that.requestTimeout;

            // Make lambda for what happens when it has been RECEIVED on server.
            let initiation = Object.create(null);

            // :: Handle the different configOrCallback situations

            // ?: Is the 'configOrCallback' a function?
            if (typeof (configOrCallback) === 'function') {
                // -> Yes, function, so then it is a receivedCallback: Set both ACN and NACK to the this function
                initiation.ack = configOrCallback;
                initiation.nack = configOrCallback;

                // ?: Is the 'configOrCallback' an object?
            } else if (typeof (configOrCallback) === 'object') {
                // -> Yes, object, so then it is a config object

                // ?: Do we have a 'receivedCallback' defined?
                if (configOrCallback.receivedCallback) {
                    // -> Yes, we have a 'receivedCallback': Set both ACN and NACK to the this function
                    if (typeof (configOrCallback.receivedCallback) !== 'function') {
                        throw new Error("The 'configOrCallback.receivedCallback' is not a function.");
                    }
                    // Set both ACN and NACK to the 'receivedCallback'
                    initiation.ack = configOrCallback.receivedCallback;
                    initiation.nack = configOrCallback.receivedCallback;
                } else {
                    // -> No, no 'receivedCallback', so then handle if we have ack- or nackCallback
                    // ?: Do we have 'ackCallback'?
                    if (configOrCallback.ackCallback) {
                        // -> Yes, 'ackCallback' present - assert that it is a function, and then set it.
                        if (typeof (configOrCallback.ackCallback) !== 'function') {
                            throw new Error("The 'configOrCallback.ackCallback' is not a function.");
                        }
                        initiation.ack = configOrCallback.ackCallback;
                    }
                    // ?: Do we have 'nackCallback'?
                    if (configOrCallback.nackCallback) {
                        // -> Yes, 'nackCallback' present - assert that it is a function, and then set it.
                        if (typeof (configOrCallback.nackCallback) !== 'function') {
                            throw new Error("The 'configOrCallback.nackCallback' is not a function.");
                        }
                        initiation.nack = configOrCallback.nackCallback;
                    }
                }

                // ?: Do we have a timeout configured?
                if (configOrCallback.timeout !== undefined) {
                    // -> Yes, there was a timeout configured - assert that it is a number, then override default.
                    if (typeof (configOrCallback.timeout) !== 'number') {
                        throw new Error("The 'configOrCallback.timeout' is not a number.");
                    }
                    timeout = configOrCallback.timeout;
                }

                // ?: 'suppressInitiationProcessedEvent' setting?
                if (configOrCallback.suppressInitiationProcessedEvent) {
                    initiation.suppressInitiationProcessedEvent = true;
                }

                // ?: 'debug' setting?
                if (configOrCallback.debug !== undefined) {
                    initiation.debug = configOrCallback.debug;
                }

                // ?: Is the 'configOrCallback' /undefined/?
            } else if (typeof (configOrCallback) === 'undefined') {
                // -> Yes, undefined - which is default, and legal!
                /* n/a */

            } else {
                // -> It is something else than 'function', 'object' or /undefined/ -> illegal!
                throw new Error("The 'configOrCallback' parameter was neither a function or an object.");
            }

            // Make Request for the Reply
            let request = Object.create(null);
            request.resolve = resolve;
            request.reject = reject;
            request.timeout = timeout;

            // Make the MatsSocket Envelope that will be sent.
            let envelope = Object.create(null);
            envelope.t = MessageType.REQUEST;
            envelope.eid = endpointId;
            envelope.msg = message;
            envelope.to = timeout;

            _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, request);
        });
    };

    /**
     * Perform a Request, but send the reply to a specific client terminator registered on this MatsSocket instance.
     * The returned Promise functions as for Send, since the reply will not go to the Promise, but to the
     * terminator. Notice that you can set any CorrelationInformation object which will be available for the Client
     * terminator when it receives the reply - this is kept on the client (not serialized and sent along with
     * request and reply), so it can be any object: An identifier, some object to apply the result on, or even a
     * function.
     * <p/>
     * The config object has keys as such - <i>all are optional</i>:
     * <ul>
     *     <li><b><code>timeout</code></b>: number of milliseconds before the Client times out the Server reply. When this happens,
     *         the returned Promise is <i>rejected</> with a {@link ReceivedEvent} of
     *         type {@link ReceivedEventType#TIMEOUT}, and the specified Client Terminator will have its
     *         rejectCallback invoked with a {@link MessageEvent} of type {@link MessageEventType#TIMEOUT}.</li>
     *     <li><b><code>suppressInitiationProcessedEvent</code></b>: if <code>true</code>, no event will be sent to listeners added
     *         using {@link #addInitiationProcessedEventListener()}.</li>
     *     <li><b><code>debug</code></b>: If set, this specific call flow overrides the global {@link MatsSocket#debug} setting, read
     *         more about debug and {@link DebugOption}s there.</li>
     * </ul>
     * <p />
     * <b>Note on event ordering:</b> {@link ReceivedEvent}s shall always be delivered before {@link MessageEvent}s. This means
     * that for a <i>requestReplyTo</i>, the returned Received-Promise shall be settled <i>before</i> the
     * Terminator gets its resolve- or rejectCallback invoked. For more on event ordering wrt. message
     * processing, read {@link InitiationProcessedEvent}.
     *
     * @param endpointId the Server MatsSocket Endpoint that this message should go to.
     * @param traceId the TraceId for this message - will go through all parts of the call, including the Mats flow.
     * @param message the actual message for the Server MatsSocket Endpoint.
     * @param replyToTerminatorId which Client Terminator the reply should go to
     * @param correlationInformation information that will be available to the Client Terminator
     *        (in {@link MessageEvent#correlationInformation}) when the reply comes back.
     * @param {object} config an optional configuration object - the one parameter you can set is 'timeout', which
     *        works like it does for {@link #request()}.
     * @returns {Promise<ReceivedEvent>}
     */
    this.requestReplyTo = function (endpointId, traceId, message, replyToTerminatorId, correlationInformation, config = undefined) {
        // ?: Do we have the Terminator the client requests reply should go to?
        if (!_terminators[replyToTerminatorId]) {
            // -> No, we do not have this. Programming error from app.
            throw new Error("The Client Terminator [" + replyToTerminatorId + "] is not present, !");
        }

        return new Promise(function (resolve, reject) {
            // Make lambda for what happens when it has been RECEIVED on server.
            let initiation = Object.create(null);
            // Set the RequestReplyTop's returned Promise's settle functions for ACK and NACK.
            initiation.ack = resolve;
            initiation.nack = reject;

            // :: Find which timeout to use
            let timeout = that.requestTimeout;

            // Parse config object
            if (config) {
                if (typeof (config) !== 'object') {
                    throw new Error("The 'config' parameter wasn't an object.");
                }

                // ?: Do we have a timeout configured?
                if (config.timeout !== undefined) {
                    // -> Yes, there was a timeout configured - assert that it is a number, then override default.
                    if (typeof (config.timeout) !== 'number') {
                        throw new Error("The 'config.timeout' is not a number.");
                    }
                    timeout = config.timeout;
                }

                // ?: 'suppressInitiationProcessedEvent' setting?
                if (config.suppressInitiationProcessedEvent) {
                    initiation.suppressInitiationProcessedEvent = true;
                }

                // ?: 'debug' setting?
                if (config.debug !== undefined) {
                    initiation.debug = config.debug;
                }
            }

            // Make Request for the Reply
            let request = Object.create(null);
            request.replyToTerminatorId = replyToTerminatorId;
            request.correlationInformation = correlationInformation;
            request.timeout = timeout;

            // Make the MatsSocket Envelope that will be sent.
            let envelope = Object.create(null);
            envelope.t = MessageType.REQUEST;
            envelope.eid = endpointId;
            envelope.msg = message;
            envelope.to = timeout;

            _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, request);
        });
    };

    /**
     * Synchronously flush any pipelined messages, i.e. when the method exits, webSocket.send(..) has been invoked
     * with the serialized pipelined messages, <i>unless</i> the authorization had expired (read more at
     * {@link #setCurrentAuthorization()} and {@link #setAuthorizationExpiredCallback()}).
     */
    this.flush = function () {
        // ?: Are we currently doing "auto-pipelining"?
        if (_evaluatePipelineLater_timeoutId) {
            // -> Yes, so clear this timeout, since we're flushing now.
            clearTimeout(_evaluatePipelineLater_timeoutId);
            _evaluatePipelineLater_timeoutId = undefined;
        }
        // Do flush
        _evaluatePipelineSend();
    };

    /**
     * Closes any currently open WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION (4000). Depending
     * of the value of {@link #outofbandclose}, it <i>also</i> uses <code>navigator.sendBeacon(..)</code>
     * (if present, i.e. web browser context) to send an out-of-band Close Session HTTP POST, or, if
     * 'outofbancclose' is a function, this is invoked (if 'outofbandclose' is <code>false</code>, this
     * functionality is disabled). Upon receiving the WebSocket close, the server terminates the MatsSocketSession.
     * The MatsSocket instance's SessionId is made undefined. If there currently is a pipeline,
     * this will be dropped (i.e. messages deleted), any outstanding receiveCallbacks
     * (from Requests) are invoked, and received Promises (from sends) are rejected, with type
     * {@link ReceivedEventType#SESSION_CLOSED}, outstanding Reply Promises (from Requests)
     * are rejected with {@link MessageEventType#SESSION_CLOSED}. The effect is to cleanly shut down the
     * MatsSocketSession (all session data removed from server), and also clean the MatsSocket instance.
     * <p />
     * Afterwards, the MatsSocket can be started up again by sending a message - keeping its configuration wrt.
     * terminators, endpoints and listeners. As The SessionId on this client MatsSocket was cleared (and the
     * previous Session on the server is deleted), this will result in a new server side Session. If you want a
     * totally clean MatsSocket instance, then just ditch the current instance and make a new one (which then will
     * have to be configured with terminators etc).
     * <p />
     * <b>Note: A 'beforeunload' event handler is registered on 'window' (if present), which invokes this
     * method</b>, so that if the user navigates away, the session will be closed.
     *
     * @param {string} reason short descriptive string. Will be supplied with the webSocket close reason string,
     * and must therefore be quite short (max 123 chars).
     */
    this.close = function (reason) {
        // Fetch properties we need before clearing state
        let webSocketUrl = _currentWebSocketUrl;
        let existingSessionId = that.sessionId;
        log("close(): Closing MatsSocketSession, id:[" + existingSessionId + "] due to [" + reason
            + "], currently connected: [" + (_webSocket ? _webSocket.url : "not connected") + "]");

        // :: In-band Session Close: Close the WebSocket itself with CLOSE_SESSION Close Code.
        // ?: Do we have _webSocket?
        if (_webSocket) {
            // -> Yes, so close WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION 4000.
            log(" \\-> WebSocket is open, so we perform in-band Session Close by closing the WebSocket with MatsSocketCloseCode.CLOSE_SESSION (4000).");
            // Perform the close
            _webSocket.close(MatsSocketCloseCodes.CLOSE_SESSION, "From client: " + reason);
        }

        // Close Session and clear all state of this MatsSocket.
        _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();

        // :: Out-of-band Session Close
        // ?: Do we have a sessionId?
        if (existingSessionId) {
            // ?: Is the out-of-band close function defined?
            if (typeof (this.outofbandclose) === "function") {
                // -> Yes, function, so invoke it
                this.outofbandclose({
                    webSocketUrl: webSocketUrl,
                    sessionId: existingSessionId
                });
                // ?: Is the out-of-band close 'truthy'?
            } else if (this.outofbandclose) {
                // -> Yes, truthy, so do default logic
                // ?: Do we have 'navigator'?
                if ((typeof window !== 'undefined') && (typeof window.navigator !== 'undefined')) {
                    // -> Yes, navigator present, so then we can fire off the out-of-band close too
                    // Fire off a "close" over HTTP using navigator.sendBeacon(), so that even if the socket is closed, it is possible to terminate the MatsSocket SessionId.
                    let closeSesionUrl = webSocketUrl.replace("ws", "http") + "/close_session?session_id=" + existingSessionId;
                    log("  \\- Send an out-of-band (i.e. HTTP) close_session, using navigator.sendBeacon('" + closeSesionUrl + "').");
                    let success = window.navigator.sendBeacon(closeSesionUrl);
                    log("    \\- Result: " + (success ? "Enqueued POST, but do not know whether anyone received it - check Network tab of Dev Tools." : "Did NOT manage to enqueue a POST."));
                }
            }
        }
    };

    /**
     * Effectively emulates "lost connection". Used in testing.
     * <p />
     * If the "disconnect" parameter is true, it will disconnect with {@link MatsSocketCloseCodes#DISCONNECT}
     * instead of {@link MatsSocketCloseCodes#RECONNECT}, which will result in the MatsSocket not immediately
     * starting the reconnection procedure until a new message is added.
     *
     * @param reason {String} a string saying why.
     * @param disconnect {Boolean} whether to close with {@link MatsSocketCloseCodes#DISCONNECT} instead of
     * {@link MatsSocketCloseCodes#RECONNECT} - default <code>false</code>. AFAIK, only useful in testing..!
     */
    this.reconnect = function (reason, disconnect = false) {
        let closeCode = disconnect ? MatsSocketCloseCodes.DISCONNECT : MatsSocketCloseCodes.RECONNECT;
        if (that.logging) log("reconnect(): Closing WebSocket with CloseCode '" + MatsSocketCloseCodes.nameFor(closeCode) + " (" + closeCode + ")'," +
            " MatsSocketSessionId:[" + that.sessionId + "] due to [" + reason + "], currently connected: [" + (_webSocket ? _webSocket.url : "not connected") + "]");
        if (!_webSocket) {
            throw new Error("There is no live WebSocket to close with " + MatsSocketCloseCodes.nameFor(closeCode) + " closeCode!");
        }
        // Hack for Node: Node is too fast wrt. handling the reply message, so one of the integration tests fails.
        // The test in question reconnect in face of having the test RESOLVE in the incomingHandler, which exercises
        // the double-delivery catching when getting a direct RESOLVE instead of an ACK from the server.
        // However, the following RECONNECT-close is handled /after/ the RESOLVE message comes in, and ok's the test.
        // So then, MatsSocket dutifully starts reconnecting - /after/ the test is finished. Thus, Node sees the
        // outstanding timeout "thread" which pings, and never exits. To better emulate an actual lost connection,
        // we /first/ unset the 'onmessage' handler (so that any pending messages surely will be lost), before we
        // close the socket. Notice that a "_matsSocketOpen" guard was also added, so that it shall explicitly stop
        // such reconnecting in face of an actual .close(..) invocation.

        // First unset message handler so that we do not receive any more WebSocket messages (but NOT unset 'onclose', nor 'onerror')
        _webSocket.onmessage = undefined;
        // Now closing the WebSocket (thus getting the 'onclose' handler invoked - just as if we'd lost connection, or got this RECONNECT close from Server).
        _webSocket.close(closeCode, reason);
    };

    /**
     * Convenience method for making random strings meant for user reading, e.g. in TraceIds, since this
     * alphabet only consists of lower and upper case letters, and digits. To make a traceId "unique enough" for
     * finding it in a log system, a length of 6 should be plenty.
     *
     * @param {number} length how long the string should be. 6 should be enough to make a TraceId "unique enough"
     * to uniquely find it in a log system. If you want "absolute certainty" that there never will be any collisions,
     * i.e. a "GUID", go for 20.
     * @returns {string} a random string consisting of characters from from digits, lower and upper case letters
     * (62 chars).
     */
    this.id = function (length) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += _alphabet[Math.floor(Math.random() * _alphabet.length)];
        }
        return result;
    };

    /**
     * Convenience method for making random strings for correlationIds, not meant for human reading
     * (choose e.g. length=8), as the alphabet consist of all visible ACSII chars that won't be quoted in a JSON
     * string. If you want "absolute certainty" that there never will be any collisions, i.e. a "GUID", go for 16.
     *
     * @param {number} length how long the string should be, e.g. 8 chars for a very safe correlationId.
     * @returns {string} a random string consisting of characters from all visible and non-JSON-quoted chars of
     * ASCII (92 chars).
     */
    this.jid = function (length) {
        let result = '';
        for (let i = 0; i < length; i++) {
            result += _jsonAlphabet[Math.floor(Math.random() * _jsonAlphabet.length)];
        }
        return result;
    };

    // ==============================================================================================
    // PRIVATE
    // ==============================================================================================

    const start = Date.now();

    function log(msg, object) {
        if (that.logging) {
            if (object) {
                console.log(_matsSocketInstanceId + "/" + that.sessionId + "{" + (Date.now() - start) + "}: " + msg, object);
            } else {
                console.log(_matsSocketInstanceId + "/" + that.sessionId + "{" + (Date.now() - start) + "}: " + msg);
            }
        }
    }

    function error(type, msg, err) {
        let event = new ErrorEvent(type, msg, err);
        // Notify ErrorEvent listeners, synchronously.
        for (let i = 0; i < _errorEventListeners.length; i++) {
            try {
                _errorEventListeners[i](event);
            } catch (err) {
                // NOTICE! NOT using error(..) - THIS method - to notify about errors, in fear of ending up with infinite recursion
                console.error("Caught error when notifying one of the [" + _errorEventListeners.length + "] ErrorEvent listeners - NOT notifying using ErrorEvent in fear of creating infinite recursion.", err);
            }
        }

        if (err) {
            console.error(type + ": " + msg, err);
        } else {
            console.error(type + ": " + msg);
        }
    }

    // ==== Fields

    // Simple Alphabet: All digits, lower and upper ASCII chars: 10 + 26 x 2 = 62 chars.
    const _alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    // Alphabet of JSON-non-quoted and visible chars: 92 chars.
    const _jsonAlphabet = "!#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";

    // The URLs to use - will be shuffled. Can be reset to not randomized by this.disableUrlRandomize()
    let _useUrls = [].concat(urls);
    // Shuffle the URLs
    _shuffleArray(_useUrls);

    const _matsSocketInstanceId = that.id(3);
    let _lastMessageEnqueuedTimestamp = Date.now(); // Start by assuming that it was just used.
    let _initialSessionEstablished_PerformanceNow = undefined;

    // If true, we're currently already trying to get a WebSocket
    let _webSocketConnecting = false;
    // If NOT undefined, we have an open WebSocket available.
    let _webSocket = undefined; // NOTE: It is set upon "onopen", and unset upon "onclose".
    // If false, we should not accidentally try to reconnect or similar
    let _matsSocketOpen = false; // NOTE: Set to true upon enqueuing of information-bearing message.

    let _prePipeline = [];
    let _pipeline = [];
    let _terminators = Object.create(null);
    let _endpoints = Object.create(null);
    let _subscriptions = Object.create(null);

    let _sessionClosedEventListeners = [];
    let _connectionEventListeners = [];
    let _subscriptionEventListeners = [];
    let _pingPongListeners = [];
    let _initiationProcessedEventListeners = [];
    let _errorEventListeners = [];

    let _state = ConnectionState.NO_SESSION;

    let _helloSent = false;
    let _forcePipelineProcessing = false;

    let _authorization = undefined;
    let _lastAuthorizationSentToServer = undefined;
    let _lastDebugOptionsSentToServer = undefined;
    let _expirationTimestamp = undefined;
    let _roomForLatencyMillis = undefined;
    let _authorizationExpiredCallback = undefined;

    let _messageSequenceId = 0; // Increases for each SEND, REQUEST and REPLY

    // When we've informed the app that we need auth, we do not need to do it again until it has set it.
    let _authExpiredCallbackInvoked_EventType = undefined;

    // Outstanding Pings
    const _outstandingPings = Object.create(null);
    // Outstanding Request "futures", i.e. the resolve() and reject() functions of the returned Promise.
    const _outstandingRequests = Object.create(null);
    // Outbox for SEND and REQUEST messages waiting for Received ACK/NACK
    const _outboxInitiations = Object.create(null);
    // .. "guard object" to avoid having to retransmit messages sent /before/ the WELCOME is received for the HELLO handshake
    let _outboxInitiations_RetransmitGuard = this.jid(5);
    // Outbox for REPLYs
    const _outboxReplies = Object.create(null);
    // The Inbox - to be able to catch double deliveries from Server
    let _inbox = Object.create(null);

    // :: STATS
    // Last 100 PingPong instances
    const _pings = [];
    // Last X InitationProcessedEvent instances.
    let _numberOfInitiationsKept = 10;
    const _initiationProcessedEvents = [];

    // ==== Register "system" endpoints

    _endpoints['MatsSocket.renewAuth'] = function (messageEvent) {
        return new Promise(function (resolve, _) {
            // Immediately ask for new Authorization
            _requestNewAuthorizationFromApp("MatsSocket.renewAuth was invoked", new AuthorizationRequiredEvent(AuthorizationRequiredEventType.REAUTHENTICATE, undefined));
            // .. then immediately resolve the server side request.
            // This will add a message to the pipeline, but the pipeline will not be sent until new auth present.
            // When the new auth comes in, the message will be sent, and resolve on the server side - and new auth
            // is then "magically" present on the incoming-context.
            resolve({});
        });
    };

    // ==== Implementation ====

    function _invokeLater(that) {
        setTimeout(that, 0);
    }

    // https://stackoverflow.com/a/12646864/39334
    function _shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            let j = Math.floor(Math.random() * (i + 1));
            let temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    function _beforeunloadHandler() {
        that.close(clientLibNameAndVersion + " window.onbeforeunload close");
    }

    function _registerBeforeunload() {
        // ?: Is the self object an EventTarget (ie. window in a Browser context)
        if (typeof (self) === 'object' && typeof (self.addEventListener) === 'function') {
            // Yes -> Add "onbeforeunload" event listener to shut down the MatsSocket cleanly (closing session) when user navigates away from page.
            self.addEventListener("beforeunload", _beforeunloadHandler);
        }
    }

    function _deregisterBeforeunload() {
        if (typeof (self) === 'object' && typeof (self.addEventListener) === 'function') {
            self.removeEventListener("beforeunload", _beforeunloadHandler);
        }
    }

    function _clearWebSocketStateAndInfrastructure() {
        log("clearWebSocketStateAndInfrastructure(). Current WebSocket:" + _webSocket);
        // Stop pinger
        _stopPinger();
        // Remove beforeunload eventlistener
        _deregisterBeforeunload();
        // Reset Reconnect state vars
        _resetReconnectStateVars();
        // Make new RetransmitGuard - so that any previously "guarded" messages now will be retransmitted.
        _outboxInitiations_RetransmitGuard = that.jid(5);
        // :: Clear out _webSocket;
        if (_webSocket) {
            // We don't want the onclose callback invoked from this event that we initiated ourselves.
            _webSocket.onclose = undefined;
            // We don't want any messages either
            _webSocket.onmessage = undefined;
            // Also drop onerror for good measure.
            _webSocket.onerror = undefined;
        }
        _webSocket = undefined;
    }

    function _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages() {
        log("closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages(). Current WebSocket:" + _webSocket);
        // Clear state
        delete (that.sessionId);
        _state = ConnectionState.NO_SESSION;

        _clearWebSocketStateAndInfrastructure();

        // :: Clear pipeline
        _pipeline.length = 0;

        // Were now also NOT open, until a new message is enqueued.
        _matsSocketOpen = false;

        // :: NACK all outstanding messages
        for (let cmid in _outboxInitiations) {
            let initiation = _outboxInitiations[cmid];
            delete _outboxInitiations[cmid];

            if (that.logging) log("Close Session: Clearing outstanding Initiation [" + initiation.envelope.t + "] to [" + initiation.envelope.eid + "], cmid:[" + initiation.envelope.cmid + "], TraceId:[" + initiation.envelope.tid + "].");
            _completeReceived(ReceivedEventType.SESSION_CLOSED, initiation, Date.now());
        }

        // :: Reject all Requests
        for (let cmid in _outstandingRequests) {
            let request = _outstandingRequests[cmid];
            delete _outstandingRequests[cmid];

            if (that.logging) log("Close Session: Clearing outstanding REQUEST to [" + request.envelope.eid + "], cmid:[" + request.envelope.cmid + "], TraceId:[" + request.envelope.tid + "].", request);
            _completeRequest(request, MessageEventType.SESSION_CLOSED, {}, Date.now());
        }
    }

    function _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, request) {
        // This is an information-bearing message, so now this MatsSocket instance is open.
        _matsSocketOpen = true;
        let now = Date.now();
        let performanceNow = performance.now();

        // Add the traceId to the message
        envelope.tid = traceId;
        // Add next message Sequence Id
        let thisMessageSequenceId = _messageSequenceId++;
        envelope.cmid = thisMessageSequenceId;

        // :: Debug
        // Set to either specific override, or global default.
        initiation.debug = (initiation.debug !== undefined ? initiation.debug : (that.debug ? that.debug : 0));
        // ?: Is the debut not 0?
        if (initiation.debug !== 0) {
            // -> Yes, not 0 - so send it in request.
            envelope.rd = initiation.debug;
        }
        // ?: If the last transferred was /something/, while now it is 0, then we must sent it over to reset
        if ((initiation.debug === 0) && (_lastDebugOptionsSentToServer !== 0)) {
            // -> Yes, was reset to 0 - so must send to server.
            envelope.rd = 0;
        }
        // This is the last known server knows.
        _lastDebugOptionsSentToServer = initiation.debug;

        // Update timestamp of last "information bearing message" sent.
        _lastMessageEnqueuedTimestamp = now;

        // Make lambda for what happens when it has been RECEIVED on server.
        // Store the outgoing envelope
        initiation.envelope = envelope;
        // Store which "retransmitGuard" we were at when sending this (look up usage for why)
        initiation.retransmitGuard = _outboxInitiations_RetransmitGuard;
        // Start the attempt counter. We start at 1, as we immediately will enqueue this envelope..
        initiation.attempt = 1;
        // Store the sent timestamp.
        initiation.sentTimestamp = now;
        // Store performance.now for round-trip timing
        initiation.messageSent_PerformanceNow = performanceNow;
        // Make a (mental) slot for the messageAcked_PerformanceNow (set at ACK processing)
        initiation.messageAcked_PerformanceNow = undefined;

        // Initiation state created - store the outstanding Send or Request
        _outboxInitiations[thisMessageSequenceId] = initiation;

        // ?: Do we have a request?
        if (request) {
            // -> Yes, this is a REQUEST!
            // Store the initiation
            request.initiation = initiation;
            // Store the outgoing envelope (could have gotten it through request.initiation, but too much hassle too many places)
            request.envelope = envelope;

            // Make timeouter
            request.timeoutId = setTimeout(function () {
                // :: The Request timeout was hit.
                let performanceNow = performance.now();
                if (that.logging) log("TIMEOUT! Request with TraceId:[" + request.envelope.tid + "], cmid:[" + request.envelope.cmid + "] overshot timeout [" + (performanceNow - request.initiation.messageSent_PerformanceNow) + " ms of " + request.timeout + "]");
                // Check if we've gotten the ACK/NACK
                let initiation = _outboxInitiations[thisMessageSequenceId];
                // ?: Was the initiation still present?
                if (initiation) {
                    // -> Yes, still present, so we have not gotten the ACK/NACK from Server yet, thus NACK it with ReceivedEventType.TIMEOUT
                    delete _outboxInitiations[thisMessageSequenceId];
                    _completeReceived(ReceivedEventType.TIMEOUT, initiation, Date.now());
                }

                // :: Complete the Request with MessageEventType.TIMEOUT

                /*
                 * NOTICE!! HACK-ALERT! The ordering of events wrt. Requests is as such:
                 * 1. ReceivedEvent (receivedCallback for requests, and Received-Promise for requestReplyTo)
                 * 2. InitiationProcessedEvent stored on matsSocket.initiations
                 * 3. InitiationProcessedEvent listeners
                 * 4. MessageEvent (Reply-Promise for requests, Terminator callbacks for requestReplyTo)
                 *
                 * WITH a requestReplyTo, the ReceivedEvent becomes async in nature, since requestReplyTo returns
                 * a Promise<ReceivedEvent>. Also, with a requestReplyTo, the completing of the requestReplyTo is
                 * then done on a Terminator, using its specified callbacks - and this is done using
                 * setTimeout(.., 0) to "emulate" the same async-ness as a Reply-Promise with ordinary requests.
                 * However, the timing between the ReceivedEvent and InitiationProcessedEvent then becomes
                 * rather shaky. Therefore, IF the initiation is still in place (ReceivedEvent not yet issued),
                 * AND this is a requestReplyTo, THEN we delay the completion of the Request (i.e. issue
                 * InitiationProcessedEvent and MessageEvent) to be more certain that the ReceivedEvent is
                 * processed before the rest.
                 */
                // ?: Did we still have the initiation in place, AND this is a requestReplyTo?
                if (initiation && request.replyToTerminatorId) {
                    // -> Yes, the initiation was still in place (i.e. ReceivedEvent not issued), and this was
                    // a requestReplyTo:
                    // Therefore we delay the entire completion of the request (InitiationProcessedEvent and
                    // MessageEvent), to be sure that they happen AFTER the ReceivedEvent issued above.
                    setTimeout(function () {
                        _completeRequest(request, MessageEventType.TIMEOUT, {}, Date.now());
                    }, 50);
                } else {
                    // -> No, either the initiation was already gone (ReceivedEvent already issued), OR it was
                    // not a requestReplyTo:
                    // Therefore, we run the completion right away (InitiationProcessedEvent is sync, while
                    // MessageEvent is a Promise settling).
                    _completeRequest(request, MessageEventType.TIMEOUT, {}, Date.now());
                }
            }, request.timeout);

            // Request state created - store this outstanding Request.
            _outstandingRequests[thisMessageSequenceId] = request;
        }

        _addEnvelopeToPipeline_EvaluatePipelineLater(envelope);
    }

    /**
     * Unconditionally adds the supplied envelope to the pipeline, and then evaluates the pipeline,
     * invokeLater-style so as to get "auth-pipelining". Use flush() to get sync send.
     */
    function _addEnvelopeToPipeline_EvaluatePipelineLater(envelope, prePipeline = false) {
        // ?: Should we add it to the pre-pipeline, or the ordinary?
        if (prePipeline) {
            // -> To pre-pipeline
            if (that.logging) log("ENQUEUE: Envelope of type [" + envelope.t + "] enqueued to PRE-pipeline: " + JSON.stringify(envelope));
            _prePipeline.push(envelope);
        } else {
            // -> To ordinary pipeline.
            if (that.logging) log("ENQUEUE: Envelope of type [" + envelope.t + "] enqueued to pipeline: " + JSON.stringify(envelope));
            _pipeline.push(envelope);
        }
        // Perform "auto-pipelining", by waiting a minimal amount of time before actually sending.
        _evaluatePipelineLater();
    }

    let _evaluatePipelineLater_timeoutId = undefined;

    function _evaluatePipelineLater() {
        if (_evaluatePipelineLater_timeoutId) {
            clearTimeout(_evaluatePipelineLater_timeoutId);
        }
        _evaluatePipelineLater_timeoutId = setTimeout(function () {
            _evaluatePipelineLater_timeoutId = undefined;
            _evaluatePipelineSend();
        }, 2);
    }

    /**
     * Sends pipelined messages
     */
    function _evaluatePipelineSend() {
        // ?: Are there any messages in pipeline or PRE-pipeline, or should we force pipeline processing (either to get AUTH or HELLO over)
        if ((_pipeline.length === 0) && (_prePipeline.length === 0) && !_forcePipelineProcessing) {
            // -> No, no message in pipeline, and we should not force processing to get HELLO or AUTH over
            // Nothing to do, drop out.
            return;
        }
        // ?: Is the MatsSocket open yet? (I.e. an information-bearing message has been enqueued)
        if (!_matsSocketOpen) {
            // -> No, so ignore this invocation - come back when there is something to send!
            log("evaluatePipelineSend(), but MatsSocket is not open - ignoring.");
            return;
        }
        // ?: Do we have authorization?!
        if (_authorization === undefined) {
            // -> No, authorization not present.
            _requestNewAuthorizationFromApp("Authorization not present", new AuthorizationRequiredEvent(AuthorizationRequiredEventType.NOT_PRESENT, undefined));
            return;
        }
        // ?: Check whether we have expired authorization
        if ((_expirationTimestamp !== undefined) && (_expirationTimestamp !== -1)
            && ((_expirationTimestamp - _roomForLatencyMillis) < Date.now())) {
            // -> Yes, authorization is expired.
            _requestNewAuthorizationFromApp("Authorization is expired", new AuthorizationRequiredEvent(AuthorizationRequiredEventType.EXPIRED, _expirationTimestamp));
            return;
        }
        // ?: Check that we are not already waiting for new auth
        // (This is needed here since we might actually have valid authentication, but server has still asked us, via "REAUTH", to get new)
        if (_authExpiredCallbackInvoked_EventType) {
            log("We have asked app for new authorization, and still waiting for it.");
            return;
        }

        // ----- We have good authentication, and should send pipeline.

        // ?: Are we trying to open websocket?
        if (_webSocketConnecting) {
            log("evaluatePipelineSend(): WebSocket is currently connecting. Cannot send yet.");
            // -> Yes, so then the socket is not open yet, but we are in the process.
            // Return now, as opening is async. When the socket opens, it will re-run 'evaluatePipelineSend()'.
            return;
        }

        // ?: Is the WebSocket present?
        if (_webSocket === undefined) {
            log("evaluatePipelineSend(): WebSocket is not present, so initiate creation. Cannot send yet.");
            // -> No, so go get it.
            _initiateWebSocketCreation();
            // Returning now, as opening is async. When the socket opens, it will re-run 'evaluatePipelineSend()'.
            return;
        }

        // ----- WebSocket is open, so send any outstanding messages!!

        // ?: Have we sent HELLO?
        if (!_helloSent) {
            // -> No, HELLO not sent, so we create it now (auth is present, check above)
            let helloMessage = {
                t: MessageType.HELLO,
                clv: clientLibNameAndVersion + "; User-Agent: " + userAgent,
                ts: Date.now(),
                an: appName,
                av: appVersion,
                auth: _authorization,  // This is guaranteed to be in place and valid, see above
                cid: that.id(10)
            };
            // ?: Have we requested a reconnect?
            if (that.sessionId !== undefined) {
                log("HELLO not send, adding to pre-pipeline. HELLO (\"Reconnect\") to MatsSocketSessionId:[" + that.sessionId + "]");
                // -> Evidently yes, so add the requested reconnect-to-sessionId.
                helloMessage.sid = that.sessionId;
            } else {
                // -> We want a new session (which is default anyway)
                log("HELLO not sent, adding to pre-pipeline. HELLO (\"New\"), we will get assigned a MatsSocketSessionId upon WELCOME.");
            }
            // Add the HELLO to the prePipeline
            _prePipeline.unshift(helloMessage);
            // We will now have sent the HELLO, so do not send it again.
            _helloSent = true;
            // We've sent the current auth
            _lastAuthorizationSentToServer = _authorization;

            // :: Handle subscriptions
            for (let topicId in _subscriptions) {
                let subs = _subscriptions[topicId];
                // ?: Do we have subscribers, but not sent to server?
                if ((subs.listeners.length > 0) && (!subs.subscriptionSentToServer)) {
                    // -> Yes, so we need to subscribe
                    _prePipeline.push({
                        t: MessageType.SUB,
                        eid: topicId,
                        smid: subs.lastSmid
                    });
                }
                // ?: Do we NOT have subscribers, but sub is sent to Server?
                if ((subs.listeners.length === 0) && (subs.subscriptionSentToServer)) {
                    // -> Yes, so we need to unsubscribe - and delete the subscription
                    _prePipeline.push({
                        t: MessageType.UNSUB,
                        eid: topicId
                    });
                    // Delete this local subscription.
                    delete _subscriptions[topicId];
                }
            }
        }

        // ?: Have we sent HELLO, i.e. session is "active", but the authorization has changed since last we sent over authorization?
        if (_helloSent && (_lastAuthorizationSentToServer !== _authorization)) {
            // -> Yes, it has changed, so add it to some envelope - either last in pipeline, or if empty pipe, then make an AUTH message.
            if (_pipeline.length > 0) {
                let lastEnvelope = _pipeline[_pipeline.length - 1];
                if (that.logging) log("Authorization has changed, and there is a message in pipeline of type [" + lastEnvelope.t + "], so so we add 'auth' to it.");
                lastEnvelope.auth = _authorization;
            } else {
                if (that.logging) log("Authorization has changed, but there is no message in pipeline, so we add an AUTH message now.");
                _pipeline.push({t: MessageType.AUTH, auth: _authorization});
            }
            // The current authorization is now sent
            _lastAuthorizationSentToServer = _authorization;
        }

        // We're now doing a round of pipeline processing, so turn of forcing.
        _forcePipelineProcessing = false;

        // :: Send PRE-pipeline messages, if there are any
        // (Before the HELLO is sent and sessionId is established, the max size of message is low on the server)
        if (_prePipeline.length > 0) {
            if (that.logging) log("Flushing prePipeline of [" + _prePipeline.length + "] messages.");
            _webSocket.send(JSON.stringify(_prePipeline));
            // Clear prePipeline
            _prePipeline.length = 0;
        }
        // :: Send any pipelined messages.
        if (_pipeline.length > 0) {
            if (that.logging) log("Flushing pipeline of [" + _pipeline.length + "] messages:" + JSON.stringify(_pipeline));
            _webSocket.send(JSON.stringify(_pipeline));
            // Clear pipeline
            _pipeline.length = 0;
        }
    }

    function _requestNewAuthorizationFromApp(what, event) {
        // ?: Have we already asked app for new auth?
        if (_authExpiredCallbackInvoked_EventType) {
            // -> Yes, so just return.
            log(what + ", but we've already asked app for it due to: [" + _authExpiredCallbackInvoked_EventType + "].");
            return;
        }
        // E-> No, not asked for auth - so do it.
        log(what + ". Will not send pipeline until gotten. Invoking 'authorizationExpiredCallback', type:[" + event.type + "].");
        // We will have asked for auth after this.
        _authExpiredCallbackInvoked_EventType = event.type;
        // Assert that we have callback
        if (!_authorizationExpiredCallback) {
            // -> We do not have callback! This is actually disaster.
            let reason = "From Client: Need new authorization, but missing 'authorizationExpiredCallback'. This is fatal, cannot continue.";
            error("missingauthcallback", reason);
            // !! We need to close down
            if (_webSocket) {
                // -> Yes, so close WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION 4000.
                log(" \\-> WebSocket is open, so we perform in-band Session Close by closing the WebSocket with MatsSocketCloseCode.CLOSE_SESSION (4000).");
                // Perform the close
                _webSocket.close(MatsSocketCloseCodes.CLOSE_SESSION, reason);
            }
            let outstandingInitiations = Object.keys(_outboxInitiations).length;
            // Close Session and clear all state of this MatsSocket.
            _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();
            // Notify SessionClosedEventListeners - with a fake CloseEvent
            _notifySessionClosedEventListeners({
                type: "close",
                code: MatsSocketCloseCodes.VIOLATED_POLICY,
                codeName: "VIOLATED_POLICY",
                reason: reason,
                outstandingInitiations: outstandingInitiations
            });

            return;
        }
        // E-> We do have 'authorizationExpiredCallback', so ask app for new auth
        _authorizationExpiredCallback(event);
    }

    let _connectionAttempt = 0; // A counter of how many times a connection attempt has been performed, starts at 0th attempt.

    let _urlIndexCurrentlyConnecting = 0; // Cycles through the URLs
    let _connectionAttemptRound = 0; // When cycled one time through URLs, this increases.
    let _currentWebSocketUrl = undefined;

    let _connectionTimeoutBase = 500; // Base timout, milliseconds. Doubles, up to max defined below.
    let _connectionTimeoutMinIfSingleUrl = 5000; // Min timeout if single-URL configured, milliseconds.
    // Based on whether there is multiple URLs, or just a single one, we choose the short "timeout base", or a longer one, as minimum.
    let _connectionTimeoutMin = _useUrls.length > 1 ? _connectionTimeoutBase : _connectionTimeoutMinIfSingleUrl;
    let _connectionTimeoutMax = 15000; // Milliseconds max between connection attempts.

    function _maxConnectionAttempts() {
        // Way to let integration tests take a bit less time.
        return that.maxConnectionAttempts ? that.maxConnectionAttempts : 40320; // The default should be about a week..! 15 sec per attempt: 40320*15 = 60*60*24*7
    }

    function _increaseReconnectStateVars() {
        _connectionAttempt++;
        _urlIndexCurrentlyConnecting++;
        if (_urlIndexCurrentlyConnecting >= _useUrls.length) {
            _urlIndexCurrentlyConnecting = 0;
            _connectionAttemptRound++;
        }
        _currentWebSocketUrl = _useUrls[_urlIndexCurrentlyConnecting];
        log("## _increaseReconnectStateVars(): round:[" + _connectionAttemptRound + "], urlIndex:[" + _urlIndexCurrentlyConnecting + "] = " + _currentWebSocketUrl);
    }

    function _resetReconnectStateVars() {
        _connectionAttempt = 0;
        _urlIndexCurrentlyConnecting = 0;
        _connectionAttemptRound = 0;
        _currentWebSocketUrl = _useUrls[_urlIndexCurrentlyConnecting];
        log("## _resetReconnectStateVars(): round:[" + _connectionAttemptRound + "], urlIndex:[" + _urlIndexCurrentlyConnecting + "] = " + _currentWebSocketUrl);
    }

    // .. Invoke resetConnectStateVars() right away to get URL set.
    _resetReconnectStateVars();

    function _secondsTenths(milliseconds) {
        // Rounds to tenth of second, e.g. 2730 -> 2.7.
        return Math.round(milliseconds / 100) / 10;
    }

    function _updateStateAndNotifyConnectionEventListeners(connectionEvent) {
        // ?: Should we log? Logging is on, AND (either NOT CountDown, OR CountDown == initialSeconds, OR Countdown == whole second).
        if (that.logging && ((connectionEvent.type !== ConnectionEventType.COUNTDOWN)
            || (connectionEvent.countdownSeconds === connectionEvent.timeoutSeconds)
            || (Math.round(connectionEvent.countdownSeconds) === connectionEvent.countdownSeconds))) {
            log("Sending ConnectionEvent to listeners", connectionEvent);
        }
        // ?: Is this a state?
        let result = Object.keys(ConnectionState).filter(function (key) {
            return ConnectionState[key] === connectionEvent.type;
        });
        if (result.length === 1) {
            // -> Yes, this is a state - so update the state..!
            _state = ConnectionState[result[0]];
            log("The ConnectionEventType [" + result[0] + "] is also a ConnectionState - setting MatsSocket state [" + _state + "].");
        }

        // :: Notify all ConnectionEvent listeners.
        for (let i = 0; i < _connectionEventListeners.length; i++) {
            try {
                _connectionEventListeners[i](connectionEvent);
            } catch (err) {
                error("notify ConnectionEvent listeners", "Caught error when notifying one of the [" + _connectionEventListeners.length + "] ConnectionEvent listeners about [" + connectionEvent.type + "].", err);
            }
        }
    }

    function _notifySessionClosedEventListeners(closeEvent) {
        if (that.logging) log("Sending SessionClosedEvent to listeners", closeEvent);
        for (let i = 0; i < _sessionClosedEventListeners.length; i++) {
            try {
                _sessionClosedEventListeners[i](closeEvent);
            } catch (err) {
                error("notify SessionClosedEvent listeners", "Caught error when notifying one of the [" + _sessionClosedEventListeners.length + "] SessionClosedEvent listeners.", err);
            }
        }
    }

    function _initiateWebSocketCreation() {
        // ?: Assert that we do not have the WebSocket already
        if (_webSocket !== undefined) {
            // -> Damn, we did have a WebSocket. Why are we here?!
            throw (new Error("Should not be here, as WebSocket is already in place!"));
        }
        // ?: Verify that we are actually open - we should not be trying to connect otherwise.
        if (!_matsSocketOpen) {
            // -> We've been asynchronously closed - bail out from opening WebSocket
            throw (new Error("The MatsSocket instance is closed, so we should not open WebSocket"));
        }

        // ----- We do not already have a WebSocket and the MatsSocket instance is Open!

        // :: First need to check whether we have OK Authorization - if not, we must terminate entire connection procedure, ask for new, and start over.
        // Note: The start-over will happen when new auth comes in, _evaluatePipelineSend(..) is invoked, and there is no WebSocket there.
        // ?: Check whether we have expired authorization
        if ((_expirationTimestamp !== undefined) && (_expirationTimestamp !== -1)
            && ((_expirationTimestamp - _roomForLatencyMillis) < Date.now())) {
            // -> Yes, authorization is expired.
            log("InitiateWebSocketCreation: Authorization is expired, we need new to continue.");
            // We are not connecting anymore
            _webSocketConnecting = false;
            // Request new auth
            _requestNewAuthorizationFromApp("Authorization is expired", new AuthorizationRequiredEvent(AuthorizationRequiredEventType.EXPIRED, _expirationTimestamp));
            return;
        }

        // ------ We have a valid, unexpired authorization token ready to use for connection

        // :: We are currently trying to connect! (This will be set to true repeatedly while in the process of opening)
        _webSocketConnecting = true;

        // Timeout: LESSER of "max" and "timeoutBase * (2^round)", which should lead to timeoutBase x1, x2, x4, x8 - but capped at max.
        // .. but at least '_connectionTimeoutMin', which handles the special case of longer minimum if just 1 URL.
        let timeout = Math.max(_connectionTimeoutMin,
            Math.min(_connectionTimeoutMax, _connectionTimeoutBase * Math.pow(2, _connectionAttemptRound)));
        let currentCountdownTargetTimestamp = Date.now();
        let targetTimeoutTimestamp = currentCountdownTargetTimestamp + timeout;
        let secondsLeft = function () {
            return Math.round(((targetTimeoutTimestamp - Date.now()) / 100)) / 10;
        };

        // About to create WebSocket, so notify our listeners about this.
        _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.CONNECTING, _currentWebSocketUrl, undefined, _secondsTenths(timeout), secondsLeft(), _connectionAttempt));

        let preConnectOperationAbortFunction = undefined;
        let websocketAttempt = undefined;
        let countdownId = undefined;

        /*
         * Make a "connection timeout" countdown,
         * This will re-invoke itself every 100 ms to create the COUNTDOWN events - until either cancelled by connect going through,
         *  or it reaches targetTimeoutTimestamp (timeout), where it aborts the attempt, bumps the state vars,
         *  and then re-runs the '_initiateWebSocketCreation' method.
         */
        function w_countDownTimer() {
            // ?: Assert that we're still open
            if (!_matsSocketOpen) {
                log("When doing countdown rounds, we realize that this MatsSocket instance is closed! - stopping right here.");
                w_abortAttempt();
                return;
            }
            // :: Find next target
            while (currentCountdownTargetTimestamp <= Date.now()) {
                currentCountdownTargetTimestamp += 100;
            }
            // ?: Have we now hit or overshot the target?
            if (currentCountdownTargetTimestamp >= targetTimeoutTimestamp) {
                // -> Yes, we've hit target, so this did not work out - abort attempt, bump state vars, and reschedule the entire show.
                w_connectTimeout_AbortAttemptAndReschedule();
            } else {
                // -> No, we've NOT hit timeout-target, so sleep till next countdown-target, where we re-invoke ourselves (this w_countDownTimer())
                // Notify ConnectionEvent listeners about this COUNTDOWN event.
                _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.COUNTDOWN, _currentWebSocketUrl, undefined, _secondsTenths(timeout), secondsLeft(), _connectionAttempt));
                let sleep = Math.max(5, currentCountdownTargetTimestamp - Date.now());
                countdownId = setTimeout(function () {
                    w_countDownTimer();
                }, sleep);
            }
        }

        function w_abortAttempt() {
            // ?: Are we in progress with the PreConnectionOperation?
            if (preConnectOperationAbortFunction) {
                // -> Evidently still doing PreConnectionRequest - kill it.
                log("  \\- Within PreConnectionOperation phase - invoking preConnectOperationFunction's abort() function.");
                // null out the 'preConnectOperationAbortFunction', as this is used for indication for whether the preConnectRequestPromise's resolve&reject should act.
                let abortFunctionTemp = preConnectOperationAbortFunction;
                // Clear out
                preConnectOperationAbortFunction = undefined;
                // Invoke the abort.
                abortFunctionTemp();
            }

            // ?: Are we in progress with opening WebSocket?
            if (websocketAttempt) {
                // -> Evidently still trying to connect WebSocket - kill it.
                log("  \\- Within WebSocket connect phase - clearing handlers and invoking webSocket.close().");
                websocketAttempt.onopen = undefined;
                websocketAttempt.onerror = function (closeEvent) {
                    if (that.logging) log("!! websocketAttempt.onerror: Forced close by timeout, instanceId:[" + closeEvent.target.webSocketInstanceId + "]", closeEvent);
                };
                websocketAttempt.onclose = function (closeEvent) {
                    if (that.logging) log("!! websocketAttempt.onclose: Forced close by timeout, instanceId:[" + closeEvent.target.webSocketInstanceId + "]", closeEvent);
                };
                // Close the current WebSocket connection attempt (i.e. abort connect if still trying).
                websocketAttempt.close(MatsSocketCloseCodes.CLOSE_SESSION, "WebSocket connect aborted");
                // Clear out the attempt
                websocketAttempt = undefined;
            }
        }

        function w_defaultXhrPromiseFactory(params) {
            let xhr = new XMLHttpRequest();
            let abort = function () {
                xhr.abort();
            };
            let preConnectPromise = new Promise(function (resolve, reject) {
                    xhr.addEventListener("loadend", function (event) {
                        // Get XHR's status
                        let status = xhr.status;
                        // ?: Was it a GOOD return?
                        if ((status === 200) || (status === 202) || (status === 204)) {
                            // -> Yes, it was good - supplying the status code
                            resolve(status);
                        } else {
                            // -> Not, it was BAD - supplying the status code
                            reject(status);
                        }
                    });
                    xhr.withCredentials = true;
                    // Note: 'params.directUrl' is only relevant for this internal code, look at the usage of this method.
                    xhr.open("GET", (params.directUrl ? params.directUrl : params.webSocketUrl.replace("ws", "http")));
                    xhr.setRequestHeader("Authorization", params.authorization);
                    xhr.send();
                }
            );
            return [abort, preConnectPromise];
        }

        function w_attemptPreConnectionOperation() {
            // :: Decide based on type of 'preconnectoperation' how to do the .. PreConnectOperation..!
            let abortAndPromise;
            let params = {
                webSocketUrl: _currentWebSocketUrl,
                authorization: _authorization
            };
            if (typeof (that.preconnectoperation) === 'function') {
                // -> Function, so invoke it, with contract-specified params object containing 'webSocketUrl'.
                abortAndPromise = that.preconnectoperation(params);
            } else if (typeof (that.preconnectoperation) === 'string') {
                // -> String, so invoke our default promise factory with special 'directUrl' property, which overrides 'webSocketUrl'.
                params.directUrl = that.preconnectoperation;
                abortAndPromise = w_defaultXhrPromiseFactory(params);
            } else {
                // -> Truthy, so invoke our default promise factory with params object containing 'webSocketUrl'.
                abortAndPromise = w_defaultXhrPromiseFactory(params);
            }

            // Deconstruct the return
            preConnectOperationAbortFunction = abortAndPromise[0];
            let preConnectRequestPromise = abortAndPromise[1];

            // Handle the resolve or reject from the preConnectionOperation
            preConnectRequestPromise
                .then(function (statusMessage) {
                    // -> Yes, good return - so go onto next phase, which is creating the WebSocket
                    // ?: Are we still trying to perform the preConnectOperation? (not timed out)
                    if (preConnectOperationAbortFunction) {
                        // -> Yes, not timed out, so then we're good to go with the next phase
                        log("PreConnectionOperation went OK [" + statusMessage + "], going on to create WebSocket.");
                        // Create the WebSocket
                        w_attemptWebSocket();
                    }
                })
                .catch(function (statusMessage) {
                    // -> No, bad return - so go for next
                    // ?: Are we still trying to perform the preConnectOperation? (not timed out)
                    if (preConnectOperationAbortFunction) {
                        // -> Yes, not timed out, so then we'll notify about our failed attempt
                        log("PreConnectionOperation failed [" + statusMessage + "] - retrying.");
                        // Go for next retry
                        w_connectFailed_RetryOrWaitForTimeout();
                    }
                });
        }

        function w_attemptWebSocket() {
            // We're not trying to perform the preConnectOperation anymore, so clear it.
            preConnectOperationAbortFunction = undefined;
            // ?: Assert that we're not already trying to make a WebSocket
            if (websocketAttempt) {
                throw Error("When going for attempt on creating WebSocket, there was already an attempt in place.");
            }

            // ?: Assert that we're still open
            if (!_matsSocketOpen) {
                log("Upon WebSocket.open, we realize that this MatsSocket instance is closed! - stopping right here.");
                w_abortAttempt();
                return;
            }

            // :: Actually create the WebSocket instance
            let url = _currentWebSocketUrl + (that.preconnectoperation ? "?preconnect=true" : "");
            const webSocketInstanceId = that.id(6);
            if (that.logging) log("INSTANTIATING new WebSocket(\"" + url + "\", \"matssocket\") - InstanceId:[" + webSocketInstanceId + "]");
            websocketAttempt = webSocketFactory(url, "matssocket");
            websocketAttempt.webSocketInstanceId = webSocketInstanceId;

            // :: Add the handlers for this "trying to acquire" procedure.

            // Error: Just log for debugging, as an "onclose" will always follow.
            websocketAttempt.onerror = function (event) {
                log("Create WebSocket: error. InstanceId:[" + event.target.webSocketInstanceId + "]", event);
            };

            // Close: Log + IF this is the first "round" AND there is multiple URLs, then immediately try the next URL. (Close may happen way before the Connection Timeout)
            websocketAttempt.onclose = function (closeEvent) {
                log("Create WebSocket: close. InstanceId:[" + closeEvent.target.webSocketInstanceId + "], Code:" + closeEvent.code + ", Reason:" + closeEvent.reason, closeEvent);
                _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.WAITING, _currentWebSocketUrl, closeEvent, _secondsTenths(timeout), secondsLeft(), _connectionAttempt));
                w_connectFailed_RetryOrWaitForTimeout();
            };

            // Open: Success! Cancel countdown timer, and set WebSocket in MatsSocket, clear flags, set proper WebSocket event handlers including onMessage.
            websocketAttempt.onopen = function (event) {
                // First and foremost: Cancel the "connection timeout" thingy - we're done!
                clearTimeout(countdownId);

                // ?: Assert that we're still open
                if (!_matsSocketOpen) {
                    log("Upon WebSocket.open, we realize that this MatsSocket instance is closed! - stopping right here.");
                    w_abortAttempt();
                    return;
                }

                log("Create WebSocket: opened! InstanceId:[" + event.target.webSocketInstanceId + "].", event);

                // Store our brand new, soon-ready-for-business WebSocket.
                _webSocket = websocketAttempt;
                // We're not /trying/ to connect anymore.. (Because, *hell yeah!*, we /have/ connected!!)
                _webSocketConnecting = false;
                // Since we've just established this WebSocket, we have obviously not sent HELLO yet.
                _helloSent = false;

                // Set our proper handlers
                _webSocket.onopen = undefined; // No need for 'onopen', it is already open. Also, node.js evidently immediately fires it again, even though it was already fired.
                _webSocket.onerror = _onerror;
                _webSocket.onclose = _onclose;
                _webSocket.onmessage = _onmessage;

                _registerBeforeunload();

                _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.CONNECTED, _currentWebSocketUrl, event, _secondsTenths(timeout), secondsLeft(), _connectionAttempt));

                // Fire off any waiting messages, next tick
                _invokeLater(function () {
                    log("WebSocket is open! Running evaluatePipelineSend() to start HELLO/WELCOME handshake.");
                    _evaluatePipelineSend();
                });
            };
        }

        function w_connectFailed_RetryOrWaitForTimeout() {
            // :: Attempt failed, either immediate retry or wait for timeout
            log("Create WebSocket: Attempt failed, URL [" + _currentWebSocketUrl + "] didn't work out.");
            // ?: Assert that we're still open
            if (!_matsSocketOpen) {
                log("After failed attempt, we realize that this MatsSocket instance is closed! - stopping right here.");
                // Abort connecting
                w_abortAttempt();
                // Cancel the "reconnect scheduler" thingy.
                clearTimeout(countdownId);
                return;
            }
            // ?: Have we had WAY too many connection attempts?
            if (_connectionAttempt >= _maxConnectionAttempts()) {
                // -> Yes, too much fails or errors - stop nagging server.
                let reason = "Trying to create WebSocket: Too many consecutive connection attempts [" + _connectionAttempt + "]";
                error("too many connection attempts", reason);
                // Hold on to how many outstanding initiations there are now
                let outstandingInitiations = Object.keys(_outboxInitiations).length;
                // Abort connecting
                w_abortAttempt();
                // Cancel the "reconnect scheduler" thingy.
                clearTimeout(countdownId);
                // Close Session
                _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();
                // Notify SessionClosedEventListeners - with a fake CloseEvent
                _notifySessionClosedEventListeners({
                    type: "close",
                    code: MatsSocketCloseCodes.VIOLATED_POLICY,
                    codeName: "VIOLATED_POLICY",
                    reason: reason,
                    outstandingInitiations: outstandingInitiations
                });
                return;
            }
            // Clear out the attempt instances
            preConnectOperationAbortFunction = undefined;
            websocketAttempt = undefined;
            // ?: If we are on the FIRST (0th) round of trying out the different URLs, then immediately try the next
            // .. But only if there are multiple URLs configured.
            if ((_connectionAttemptRound === 0) && (_useUrls.length > 1)) {
                // -> YES, we are on the 0th round of connection attempts, and there are multiple URLs, so immediately try the next.
                // Cancel the "reconnect scheduler" thingy.
                clearTimeout(countdownId);

                // Invoke on next tick: Bump state vars, re-run _initiateWebSocketCreation
                _invokeLater(function () {
                    _increaseReconnectStateVars();
                    _initiateWebSocketCreation();
                });
            }
            // E-> NO, we are either not on the 0th round of attempts, OR there is just a single URL.
            // Therefore, let the countdown timer do its stuff.
        }

        function w_connectTimeout_AbortAttemptAndReschedule() {
            // :: Attempt timed out, clear this WebSocket out
            log("Create WebSocket: Attempt timeout exceeded [" + timeout + " ms], URL [" + _currentWebSocketUrl + "] didn't work out.");
            // Abort the attempt.
            w_abortAttempt();
            // ?: Assert that we're still open
            if (!_matsSocketOpen) {
                log("After timed out attempt, we realize that this MatsSocket instance is closed! - stopping right here.");
                return;
            }
            // Invoke after a small random number of millis: Bump reconnect state vars, re-run _initiateWebSocketCreation
            setTimeout(function () {
                _increaseReconnectStateVars();
                _initiateWebSocketCreation();
            }, Math.round(Math.random() * 200));
        }

        // Start the countdown-timer.
        // NOTICE! Order here is important - as the 'w_attemptPreConnectionOperation' right below may cancel it!
        w_countDownTimer();

        // :: Start the actual connection attempt!
        // ?: Should we do a PreConnectionOperation?
        if (that.preconnectoperation) {
            // -> function, string URL or 'true': Attempt tp perform the PreConnectionOperation - which upon success goes on to invoke 'w_attemptWebSocket()'.
            w_attemptPreConnectionOperation();
        } else {
            // -> Falsy: No PreConnectionOperation, attempt to create the WebSocket directly.
            w_attemptWebSocket();
        }
    }

    function _onerror(event) {
        error("websocket.onerror", "Got 'onerror' event from WebSocket, instanceId:[" + event.target.webSocketInstanceId + "].", event);
        // :: Synchronously notify our ConnectionEvent listeners.
        _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.CONNECTION_ERROR, _currentWebSocketUrl, event, undefined, undefined, _connectionAttempt));
    }

    function _onclose(closeEvent) {
        log("websocket.onclose, instanceId:[" + closeEvent.target.webSocketInstanceId + "]", closeEvent);

        // Note: Here (as opposed to matsSocket.close()) the WebSocket is already closed, so we don't have to close it..!

        // ?: Special codes, that signifies that we should close (terminate) the MatsSocketSession.
        if ((closeEvent.code === MatsSocketCloseCodes.UNEXPECTED_CONDITION)
            || (closeEvent.code === MatsSocketCloseCodes.MATS_SOCKET_PROTOCOL_ERROR)
            || (closeEvent.code === MatsSocketCloseCodes.VIOLATED_POLICY)
            || (closeEvent.code === MatsSocketCloseCodes.CLOSE_SESSION)
            || (closeEvent.code === MatsSocketCloseCodes.SESSION_LOST)) {
            // -> One of the specific "Session is closed" CloseCodes -> Reject all outstanding, this MatsSocket is trashed.
            error("session closed from server", "The WebSocket was closed with a CloseCode [" + MatsSocketCloseCodes.nameFor(closeEvent.code) + "] signifying that our MatsSocketSession is closed, reason:[" + closeEvent.reason + "].", closeEvent);

            // Hold on to how many outstanding initiations there are now
            let outstandingInitiations = Object.keys(_outboxInitiations).length;

            // Close Session, Clear all state.
            _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();

            // :: Synchronously notify our SessionClosedEvent listeners
            // NOTE: This shall only happen if Close Session is from ServerSide (that is, here), otherwise, if the app invoked matsSocket.close(), one would think the app knew about the close itself..!
            closeEvent.codeName = MatsSocketCloseCodes.nameFor(closeEvent.code);
            closeEvent.outstandingInitiations = outstandingInitiations;
            _notifySessionClosedEventListeners(closeEvent);

        } else {
            // -> NOT one of the specific "Session is closed" CloseCodes -> Reconnect and Reissue all outstanding..
            if (closeEvent.code !== MatsSocketCloseCodes.DISCONNECT) {
                log("We were closed with a CloseCode [" + MatsSocketCloseCodes.nameFor(closeEvent.code) + "] that does NOT denote that we should close the session. Initiate reconnect and reissue all outstanding.");
            } else {
                log("We were closed with the special DISCONNECT close code - act as we lost connection, but do NOT start to reconnect.");
            }

            // Clear out WebSocket "infrastructure", i.e. state and "pinger thread".
            _clearWebSocketStateAndInfrastructure();

            // :: This is a reconnect - so we should do pipeline processing right away, to get the HELLO over.
            _forcePipelineProcessing = true;

            // :: Synchronously notify our ConnectionEvent listeners.
            _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.LOST_CONNECTION, _currentWebSocketUrl, closeEvent, undefined, undefined, _connectionAttempt));

            // ?: Is this the special DISCONNECT that asks us to NOT start reconnecting?
            if (closeEvent.code !== MatsSocketCloseCodes.DISCONNECT) {
                // -> No, not special DISCONNECT - so start reconnecting.
                // :: Start reconnecting, but give the server a little time to settle, and a tad randomness to handle any reconnect floods.
                setTimeout(function () {
                    // ?: Have we already gotten a new WebSocket, or started the process of creating one (due to a new
                    // message having been sent in the meantime, having started the WebSocket creation process)?
                    if ((_webSocket !== undefined) || _webSocketConnecting) {
                        // -> Yes, so we should not start again (the _initiateWebSocketCreation asserts these states)
                        log("Start reconnect after LOST_CONNECTION: Already gotten WebSocket, or started creation process. Bail out.");
                        return;
                    }
                    // ?: Has the MatsSocket been closed in the meantime?
                    if (!_matsSocketOpen) {
                        // -> We've been asynchronously closed - bail out from creating WebSocket  (the _initiateWebSocketCreation asserts this state)
                        log("Start reconnect after LOST_CONNECTION: MatsSocket is closed. Bail out.");
                        return;
                    }
                    // E-> We should start creation process.
                    _initiateWebSocketCreation();
                }, 250 + Math.random() * 750);
            }
        }
    }

    function _onmessage(messageEvent) {
        let receivedTimestamp = Date.now();
        let data = messageEvent.data;
        let envelopes = JSON.parse(data);

        let numEnvelopes = envelopes.length;
        if (that.logging) log("websocket.onmessage, instanceId:[" + messageEvent.target.webSocketInstanceId + "]: Got " + numEnvelopes + " messages.");

        for (let i = 0; i < numEnvelopes; i++) {
            let envelope = envelopes[i];
            try {
                if (that.logging) log(" \\- onmessage: handling message " + i + ": " + envelope.t + ", envelope:" + JSON.stringify(envelope));

                if (envelope.t === MessageType.WELCOME) {
                    // Fetch our assigned MatsSocketSessionId
                    that.sessionId = envelope.sid;
                    if (that.logging) log("We're WELCOME! SessionId:" + that.sessionId + ", there are [" + Object.keys(_outboxInitiations).length + "] outstanding sends-or-requests, and [" + Object.keys(_outboxReplies).length + "] outstanding replies.");
                    // If this is the very first time we get SESSION_ESTABLISHED, then record time (can happen again due to reconnects)
                    if (!_initialSessionEstablished_PerformanceNow) {
                        _initialSessionEstablished_PerformanceNow = performance.now();
                    }
                    // :: Synchronously notify our ConnectionEvent listeners.
                    _updateStateAndNotifyConnectionEventListeners(new ConnectionEvent(ConnectionEventType.SESSION_ESTABLISHED, _currentWebSocketUrl, undefined, undefined, undefined, _connectionAttempt));
                    // Start pinger (AFTER having set ConnectionState to SESSION_ESTABLISHED, otherwise it'll exit!)
                    _startPinger();

                    // TODO: Test this outstanding-stuff! Both that they are actually sent again, and that server handles the (quite possible) double-delivery.

                    // ::: RETRANSMIT: If we have stuff in our outboxes, we might have to send them again (we send unless "RetransmitGuard" tells otherwise).

                    // :: Outstanding SENDs and REQUESTs
                    for (let key in _outboxInitiations) {
                        let initiation = _outboxInitiations[key];
                        let initiationEnvelope = initiation.envelope;
                        // ?: Is the RetransmitGuard the same as we currently have?
                        if (initiation.retransmitGuard === _outboxInitiations_RetransmitGuard) {
                            // -> Yes, so it makes little sense in sending these messages again just yet.
                            if (that.logging) log("RetransmitGuard: The outstanding Initiation [" + initiationEnvelope.t + "] with cmid:[" + initiationEnvelope.cmid + "] and TraceId:[" + initiationEnvelope.tid
                                + "] was created with the same RetransmitGuard as we currently have [" + _outboxInitiations_RetransmitGuard + "] - they were sent directly trailing HELLO, before WELCOME came back in. No use in sending again.");
                            continue;
                        }
                        initiation.attempt++;
                        if (initiation.attempt > 10) {
                            error("toomanyretries", "Upon reconnect: Too many attempts at sending Initiation [" + initiationEnvelope.t + "] with cmid:[" + initiationEnvelope.cmid + "], TraceId[" + initiationEnvelope.tid + "], size:[" + JSON.stringify(initiationEnvelope).length + "].", initiationEnvelope);
                            continue;
                        }
                        // NOTICE: Won't delete it here - that is done when we process the ACK from server
                        _addEnvelopeToPipeline_EvaluatePipelineLater(initiationEnvelope);
                        // Flush for each message, in case the size of the message was of issue why we closed (maybe pipeline was too big).
                        that.flush();
                    }

                    // :: Outstanding Replies
                    // NOTICE: Since we cannot possibly have replied to a Server Request BEFORE we get the WELCOME, we do not need RetransmitGuard for Replies
                    // (Point is that the RetransmitGuard guards against sending again messages that we sent "along with" the HELLO, before we got the WELCOME.
                    // A Request from the Server cannot possibly come in before WELCOME (as that is by protcol definition the first message we get from the Server),
                    // so there will "axiomatically" not be any outstanding Replies with the same RetransmitGuard as we currently have: Therefore, /all should be retransmitted/).
                    for (let key in _outboxReplies) {
                        let reply = _outboxReplies[key];
                        let replyEnvelope = reply.envelope;
                        reply.attempt++;
                        if (reply.attempt > 10) {
                            error("toomanyretries", "Upon reconnect: Too many attempts at sending Reply [" + replyEnvelope.t + "] with smid:[" + replyEnvelope.smid + "], TraceId[" + replyEnvelope.tid + "], size:[" + JSON.stringify(replyEnvelope).length + "].", replyEnvelope);
                            continue;
                        }
                        // NOTICE: Won't delete it here - that is done when we process the ACK from server
                        _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
                        // Flush for each message, in case the size of the message was of issue why we closed (maybe pipeline was too big).
                        that.flush();
                    }

                } else if (envelope.t === MessageType.REAUTH) {
                    // -> Server asks us to get new Authentication, as the one he has "on hand" is too old to send us outgoing messages
                    _requestNewAuthorizationFromApp("Server demands new Authorization", new AuthorizationRequiredEvent(AuthorizationRequiredEventType.REAUTHENTICATE, undefined));


                } else if (envelope.t === MessageType.RETRY) {
                    // -> Server asks us to RETRY the information-bearing-message

                    // TODO: Test RETRY!

                    // ?: Is it an outstanding Send or Request
                    let initiation = _outboxInitiations[envelope.cmid];
                    if (initiation) {
                        let initiationEnvelope = initiation.envelope;
                        initiation.attempt++;
                        if (initiation.attempt > 10) {
                            error("toomanyretries", "Upon RETRY-request: Too many attempts at sending [" + initiationEnvelope.t + "] with cmid:[" + initiationEnvelope.cmid + "], TraceId[" + initiationEnvelope.tid + "], size:[" + JSON.stringify(initiationEnvelope).length + "].", initiationEnvelope);
                            continue;
                        }
                        // Note: the retry-cycles will start at attempt=2, since we initialize it with 1, and have already increased it by now.
                        let retryDelay = Math.pow(2, (initiation.attempt - 2)) * 500 + Math.round(Math.random() * 1000);
                        setTimeout(function () {
                            _addEnvelopeToPipeline_EvaluatePipelineLater(initiationEnvelope);
                        }, retryDelay);
                        continue;
                    }
                    // E-> Was not outstanding Send or Request

                    // ?: Is it an outstanding Reply, i.e. Resolve or Reject?
                    let reply = _outboxReplies[envelope.cmid];
                    if (reply) {
                        let replyEnvelope = reply.envelope;
                        reply.attempt++;
                        if (reply.attempt > 10) {
                            error("toomanyretries", "Upon RETRY-request: Too many attempts at sending [" + replyEnvelope.t + "] with smid:[" + replyEnvelope.smid + "], TraceId[" + replyEnvelope.tid + "], size:[" + JSON.stringify(replyEnvelope).length + "].", replyEnvelope);
                            continue;
                        }
                        // Note: the retry-cycles will start at attempt=2, since we initialize it with 1, and have already increased it by now.
                        let retryDelay = Math.pow(2, (initiation.attempt - 2)) * 500 + Math.round(Math.random() * 1000);
                        setTimeout(function () {
                            _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
                        }, retryDelay);
                    }
                } else if ((envelope.t === MessageType.ACK) || (envelope.t === MessageType.NACK)) {
                    // -> Server Acknowledges information-bearing message from Client.

                    if ((envelope.cmid === undefined) && (envelope.ids === undefined)) {
                        // -> No, we do not have this. Programming error from Server.
                        error("ack missing ids", "The ACK/NACK envelope is missing 'cmid' or 'ids'.", envelope);
                        continue;
                    }

                    let ids = [];
                    if (envelope.cmid !== undefined) ids.push(envelope.cmid);
                    if (envelope.ids !== undefined) ids = ids.concat(envelope.ids);

                    _sendAck2Later(ids);

                    // :: Handling if this was an ACK for outstanding SEND or REQUEST
                    for (let i = 0; i < ids.length; i++) {
                        let cmid = ids[i];
                        let initiation = _outboxInitiations[cmid];
                        // ?: Check that we found it.
                        if (initiation === undefined) {
                            // -> No, NOT initiation. Assume it was a for a Reply (RESOLVE or REJECT), delete the outbox entry.
                            delete _outboxReplies[cmid];
                            continue;
                        }
                        // E-> ----- Yes, we had an outstanding Initiation (SEND or REQUEST).

                        initiation.messageAcked_PerformanceNow = performance.now();

                        // Fetch Request, if any.

                        let receivedEventType = (envelope.t === MessageType.ACK ? ReceivedEventType.ACK : ReceivedEventType.NACK);
                        _completeReceived(receivedEventType, initiation, receivedTimestamp, envelope.desc);

                        let request = _outstandingRequests[cmid];
                        // ?: If this was a REQUEST, and it is a !ACK - it will never get a Reply..
                        if (request && (envelope.t !== MessageType.ACK)) {
                            // -> Yes, this was a REQUEST that got an !ACK
                            // We have to reject the REQUEST too - it was never processed, and will thus never get a Reply
                            // (Note: This is either a reject for a Promise, or errorCallback on Endpoint).
                            _completeRequest(request, MessageEventType.REJECT, {}, receivedTimestamp);
                        }
                    }

                } else if (envelope.t === MessageType.ACK2) {
                    // -> ACKNOWLEDGE of the RECEIVED: We can delete from our inbox
                    if ((envelope.smid === undefined) && (envelope.ids === undefined)) {
                        // -> No, we do not have this. Programming error from Server.
                        error("ack2 missing ids", "The ACK2 envelope is missing 'smid' or 'ids'", envelope);
                        continue;
                    }
                    // Delete it from inbox - that is what ACK2 means: Other side has now deleted it from outbox,
                    // and can thus not ever deliver it again (so we can delete the guard against double delivery).
                    if (envelope.smid) {
                        delete _inbox[envelope.smid];
                    }
                    if (envelope.ids) {
                        for (let i = 0; i < envelope.ids.length; i++) {
                            delete _inbox[envelope.ids[i]];
                        }
                    }

                } else if ((envelope.t === MessageType.SEND) || (envelope.t === MessageType.REQUEST)) {
                    // -> SEND: Sever-to-Client Send a message to client terminatorOrEndpoint

                    let termOrEndp = envelope.t === MessageType.SEND ? "Terminator" : "Endpoint";

                    if (envelope.smid === undefined) {
                        // -> No, we do not have this. Programming error from Server.
                        error(envelope.t.toLowerCase() + " missing smid", "The " + envelope.t + " envelope is missing 'smid'", envelope);
                        continue;
                    }

                    // Find the (client) Terminator/Endpoint which the Send should go to
                    let terminatorOrEndpoint = (envelope.t === MessageType.SEND ? _terminators[envelope.eid] : _endpoints[envelope.eid]);

                    // :: Send receipt unconditionally
                    _sendAckLater((terminatorOrEndpoint ? MessageType.ACK : MessageType.NACK), envelope.smid, terminatorOrEndpoint ? undefined : "The Client " + termOrEndp + " [" + envelope.eid + "] does not exist!");


                    // ?: Do we have the desired Terminator?
                    if (terminatorOrEndpoint === undefined) {
                        // -> No, we do not have this. Programming error from app.
                        error("client " + termOrEndp.toLowerCase() + " does not exist", "The Client " + termOrEndp + " [" + envelope.eid + "] does not exist!!", envelope);
                        continue;
                    }
                    // E-> We found the Terminator to tell

                    // ?: Have we already gotten this message? (Double delivery)
                    if (_inbox[envelope.smid]) {
                        // -> Yes, so this was a double delivery. Drop processing, we've already done it.
                        if (that.logging) log("Caught double delivery of " + envelope.t + " with smid:[" + envelope.smid + "], sending ACK, but won't process again.", envelope);
                        continue;
                    }

                    // Add the message to inbox
                    _inbox[envelope.smid] = envelope;

                    // :: Handle the SEND or REQUEST

                    // ?: Is this a SEND?
                    if (envelope.t === MessageType.SEND) {
                        // Yes, SEND, so invoke the Terminator
                        let messageEvent = _createMessageEventForIncoming(envelope, receivedTimestamp);
                        terminatorOrEndpoint.resolve(messageEvent);
                    } else {
                        // No, this is REQUEST - so invoke the Endpoint to get a Promise, and send its settling using RESOLVE or REJECT.
                        // :: Create a Resolve and Reject handler
                        let fulfilled = function (resolveReject, msg) {
                            // Update timestamp of last "information bearing message" sent.
                            _lastMessageEnqueuedTimestamp = Date.now();
                            // Create the Reply message
                            let replyEnvelope = {
                                t: resolveReject,
                                smid: envelope.smid,
                                tid: envelope.tid,
                                msg: msg
                            };
                            // Add the message Sequence Id
                            replyEnvelope.cmid = _messageSequenceId++;
                            // Add it to outbox
                            _outboxReplies[replyEnvelope.cmid] = {
                                attempt: 1,
                                envelope: replyEnvelope
                            };
                            // Send it down the wire
                            _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
                        };

                        // :: Invoke the Endpoint, getting a Promise back.
                        let messageEvent = _createMessageEventForIncoming(envelope, receivedTimestamp);
                        let promise = terminatorOrEndpoint(messageEvent);

                        // :: Finally attach the Resolve and Reject handler
                        promise.then(function (resolveMessage) {
                            fulfilled(MessageType.RESOLVE, resolveMessage);
                        }).catch(function (rejectMessage) {
                            fulfilled(MessageType.REJECT, rejectMessage);
                        });
                    }

                } else if ((envelope.t === MessageType.RESOLVE) || (envelope.t === MessageType.REJECT)) {
                    // -> Reply to REQUEST
                    // ?: Do server want receipt, indicated by the message having 'smid' property?
                    // (NOTE: Reply (RESOLVE/REJECT) directly in IncomingHandler will not set this, as the message has never been in the outbox, so won't need deletion).
                    if (envelope.smid) {
                        // -> Yes, so send ACK to server
                        _sendAckLater(MessageType.ACK, envelope.smid);
                    }
                    // It is physically possible that the Reply comes before the ACK (I've observed it!).
                    // .. Such a situation could potentially be annoying for the using application (Reply before Ack)..
                    // ALSO, for Replies that are produced in the incomingHandler, there will be no separate ACK message - this is a combined ACK+Reply.
                    // Handle this by checking whether the initiation is still in place, and handle it as "ACK Received" if so.
                    let initiation = _outboxInitiations[envelope.cmid];
                    // ?: Was the initiation still present?
                    if (initiation) {
                        // -> Yes, still present - this means that this is effectively a /combined/ ACK+Reply, so must also handle the ACK-part.
                        // Send ACK2 for the "ACK-part" of this Reply (the Client-to-Server REQUEST was stored in Server's inbox - he may now delete it).
                        _sendAck2Later(envelope.cmid);
                        // Complete any Received-callbacks for the "ACK-part" of this Reply.
                        _completeReceived(ReceivedEventType.ACK, initiation, receivedTimestamp);
                    }

                    let request = _outstandingRequests[envelope.cmid];
                    if (!request) {
                        if (that.logging) log("Double delivery: Evidently we've already completed the Request for cmid:[" + envelope.cmid + "], traiceId: [" + envelope.tid + "], ignoring.");
                        continue;
                    }

                    // Ensure that the timeout is killed now. NOTICE: MUST do this here, since we might delay the delivery even more, check crazy stuff below.
                    clearTimeout(request.timeoutId);

                    // Complete the Promise on a REQUEST-with-Promise, or messageCallback/errorCallback on Endpoint for REQUEST-with-ReplyTo
                    let messageEventType = (envelope.t === MessageType.RESOLVE ? MessageEventType.RESOLVE : MessageEventType.REJECT);

                    /*
                     * NOTICE!! HACK-ALERT! The ordering of events wrt. Requests is as such:
                     * 1. ReceivedEvent (receivedCallback for requests, and Received-Promise for requestReplyTo)
                     * 2. InitiationProcessedEvent stored on matsSocket.initiations
                     * 3. InitiationProcessedEvent listeners
                     * 4. MessageEvent (Reply-Promise for requests, Terminator callbacks for requestReplyTo)
                     *
                     * WITH a requestReplyTo, the ReceivedEvent becomes async in nature, since requestReplyTo returns
                     * a Promise<ReceivedEvent>. Also, with a requestReplyTo, the completing of the requestReplyTo is
                     * then done on a Terminator, using its specified callbacks - and this is done using
                     * setTimeout(.., 0) to "emulate" the same async-ness as a Reply-Promise with ordinary requests.
                     * However, the timing between the ReceivedEvent and InitiationProcessedEvent then becomes
                     * rather shaky. Therefore, IF the initiation is still in place (ReceivedEvent not yet issued),
                     * AND this is a requestReplyTo, THEN we delay the completion of the Request (i.e. issue
                     * InitiationProcessedEvent and MessageEvent) to be more certain that the ReceivedEvent is
                     * processed before the rest.
                     */
                    // ?: Did we still have the initiation in place, AND this is a requestReplyTo?
                    if (initiation && request.replyToTerminatorId) {
                        // -> Yes, the initiation was still in place (i.e. ReceivedEvent not issued), and this was
                        // a requestReplyTo:
                        // Therefore we delay the entire completion of the request (InitiationProcessedEvent and
                        // MessageEvent), to be sure that they happen AFTER the ReceivedEvent issued above.
                        setTimeout(function () {
                            _completeRequest(request, messageEventType, envelope, receivedTimestamp);
                        }, 20);
                    } else {
                        // -> No, either the initiation was already gone (ReceivedEvent already issued), OR it was
                        // not a requestReplyTo:
                        // Therefore, we run the completion right away (InitiationProcessedEvent is sync, while
                        // MessageEvent is a Promise settling).
                        _completeRequest(request, messageEventType, envelope, receivedTimestamp);
                    }


                } else if (envelope.t === MessageType.PING) {
                    // -> PING request, respond with a PONG
                    // Add the PONG reply to pipeline
                    _addEnvelopeToPipeline_EvaluatePipelineLater({
                        t: MessageType.PONG,
                        x: envelope.x
                    });
                    // Send it immediately
                    that.flush();

                } else if ((envelope.t === MessageType.SUB_OK) || (envelope.t === MessageType.SUB_LOST) || (envelope.t === MessageType.SUB_NO_AUTH)) {
                    // -> Result of SUB
                    // Notify PingPong listeners, synchronously.
                    let eventType;
                    if (envelope.t === MessageType.SUB_OK) {
                        eventType = SubscriptionEventType.OK;
                    } else if (envelope.t === MessageType.SUB_LOST) {
                        eventType = SubscriptionEventType.LOST_MESSAGES;
                    } else {
                        eventType = SubscriptionEventType.NOT_AUTHORIZED;
                    }
                    let event = new SubscriptionEvent(eventType, envelope.eid);
                    for (let i = 0; i < _subscriptionEventListeners.length; i++) {
                        try {
                            _subscriptionEventListeners[i](event);
                        } catch (err) {
                            error("notify SubscriptionEvent listeners", "Caught error when notifying one of the [" + _subscriptionEventListeners.length + "] SubscriptionEvent listeners.", err);
                        }
                    }

                } else if (envelope.t === MessageType.PUB) {
                    // -> Server publishes a Topic message
                    let event = new MessageEvent(MessageEventType.PUB, envelope.msg, envelope.tid, envelope.smid, receivedTimestamp);

                    let subs = _subscriptions[envelope.eid];
                    // ?: Did we find any listeners?
                    if (!subs) {
                        // -> No. Strange.
                        error("message for unwanted topic", "We got a PUB message for Topic [" + envelope.eid + "], but we have no subscribers for it.");
                        continue;
                    }

                    // Issue message to all listeners for this Topic.
                    for (let i = 0; i < subs.listeners.length; i++) {
                        try {
                            subs.listeners[i](event);
                        } catch (err) {
                            error("dispatch topic message", "Caught error when notifying one of the [" + subs.listeners.length + "] subscription listeners for Topic [" + envelope.eid + "].", err);
                        }
                    }

                    // Make note of the latest message id processed for this Topic
                    subs.lastSmid = envelope.smid;

                } else if (envelope.t === MessageType.PONG) {
                    // -> Response to a PING
                    let pingPongHolder = _outstandingPings[envelope.x];
                    delete _outstandingPings[envelope.x];
                    // Calculate the round-trip time, using performanceNow stored along with the PingPong instance.
                    let pingPong = pingPongHolder[1];
                    let performanceThen = pingPongHolder[0];
                    pingPong.roundTripMillis = _roundTiming(performance.now() - performanceThen);

                    // Notify PingPong listeners, synchronously.
                    for (let i = 0; i < _pingPongListeners.length; i++) {
                        try {
                            _pingPongListeners[i](pingPong);
                        } catch (err) {
                            error("notify pingpongevent listeners", "Caught error when notifying one of the [" + _pingPongListeners.length + "] PingPongEvent listeners.", err);
                        }
                    }
                }
            } catch (err) {
                let stringified = JSON.stringify(envelope);
                error("envelope processing", "Got unexoected error while handling incoming envelope of type '" + envelope.t + "': " + (stringified.length > 1024 ? stringified.substring(0, 1021) + "..." : stringified), err);
            }
        }
    }

    let _laterAcks = [];
    let _laterNacks = [];
    let _laterAckTimeoutId = undefined;

    function _sendAckLater(type, smid, description) {
        // ?: Do we have description?
        if (description) {
            // -> Yes, description - so then we need to send it by itself
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: type,
                smid: smid,
                desc: description
            });
            return;
        }
        // ?: Was it ACK or NACK?
        if (type === MessageType.ACK) {
            _laterAcks.push(smid);
        } else {
            _laterNacks.push(smid);
        }
        // Send them now or later
        clearTimeout(_laterAckTimeoutId);
        if ((_laterAcks.length + _laterNacks.length) > 10) {
            _sendAcksAndNacksNow();
        } else {
            _laterAckTimeoutId = setTimeout(_sendAcksAndNacksNow, 20);
        }
    }

    function _sendAcksAndNacksNow() {
        // ACKs
        if (_laterAcks.length > 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.ACK,
                ids: _laterAcks
            });
            _laterAcks = [];
        } else if (_laterAcks.length === 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.ACK,
                smid: _laterAcks[0]
            });
            _laterAcks.length = 0;
        }
        // NACKs
        if (_laterNacks.length > 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.NACK,
                ids: _laterNacks
            });
            _laterNacks = [];
        } else if (_laterNacks.length === 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.NACK,
                smid: _laterNacks[0]
            });
            _laterNacks.length = 0;
        }
    }

    let _laterAck2s = [];
    let _laterAck2TimeoutId = undefined;

    function _sendAck2Later(ids) {
        _laterAck2s = _laterAck2s.concat(ids);
        // Send them now or later
        clearTimeout(_laterAck2TimeoutId);
        if (_laterAck2s.length > 10) {
            _sendAck2sNow();
        } else {
            _laterAck2TimeoutId = setTimeout(_sendAck2sNow, 50);
        }
    }

    function _sendAck2sNow() {
        // ACK2s
        if (_laterAck2s.length > 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.ACK2,
                ids: _laterAck2s
            });
            _laterAck2s = [];
        } else if (_laterAck2s.length === 1) {
            _addEnvelopeToPipeline_EvaluatePipelineLater({
                t: MessageType.ACK2,
                cmid: _laterAck2s[0]
            });
            _laterAck2s.length = 0;
        }
    }

    function _completeReceived(receivedEventType, initiation, receivedTimestamp, description = undefined) {
        let performanceNow = performance.now();
        initiation.messageAcked_PerformanceNow = performanceNow;

        // NOTICE! We do this SYNCHRONOUSLY, to ensure that we come in front of Request Promise settling (specifically, Promise /rejection/ if NACK).
        delete _outboxInitiations[initiation.envelope.cmid];
        let receivedEvent = new ReceivedEvent(receivedEventType, initiation.envelope.tid, initiation.sentTimestamp, receivedTimestamp, _roundTiming(performanceNow - initiation.messageSent_PerformanceNow), description);
        // ?: Was it a ACK (not NACK)?
        if (receivedEventType === ReceivedEventType.ACK) {
            // -> Yes, it was "ACK" - so Server was happy.
            if (initiation.ack) {
                try {
                    initiation.ack(receivedEvent);
                } catch (err) {
                    error("received ack", "When trying to ACK the initiation with ReceivedEvent [" + receivedEventType + "], we got error.", err);
                }
            }
        } else {
            // -> No, it was !ACK, so message has not been forwarded to Mats
            if (initiation.nack) {
                try {
                    initiation.nack(receivedEvent);
                } catch (err) {
                    error("received nack", "When trying to NACK the initiation with ReceivedEvent [" + receivedEventType + "], we got error.", err);
                }
            }
        }

        // ?: Should we issue InitiationProcessedEvent? (SEND is finished processed at ACK time, while REQUEST waits for REPLY from server before finished processing)
        if (initiation.envelope.t === MessageType.SEND) {
            // -> Yes, we should issue - and to get this in a order where "Received is always invoked before
            // InitiationProcessedEvents", we'll have to delay it, as the Promise settling above is async)
            setTimeout(function () {
                _issueInitiationProcessedEvent(initiation);
            }, 50);
        }
    }

    function _createMessageEventForIncoming(envelope, receivedTimestamp) {
        let messageEvent = new MessageEvent(envelope.t, envelope.msg, envelope.tid, envelope.smid, receivedTimestamp);
        // ?: Do we have a debug object in the envelope?
        if (envelope.debug) {
            // -> Yes, so then created it for MessageEvent too.
            messageEvent.debug = new DebugInformation(undefined, undefined, envelope, receivedTimestamp);
        }
        return messageEvent;
    }

    function _completeRequest(request, messageEventType, incomingEnvelope, receivedTimestamp) {
        // We're finishing it now, so it shall not be timed out.
        clearTimeout(request.timeoutId);

        // Make note of performance.now() at this point in time
        let performanceNow = performance.now();

        delete _outstandingRequests[request.envelope.cmid];

        // Create the event
        let event = new MessageEvent(messageEventType, incomingEnvelope.msg, request.envelope.tid, request.envelope.cmid, receivedTimestamp);
        event.clientRequestTimestamp = request.initiation.sentTimestamp;
        event.roundTripMillis = performanceNow - request.initiation.messageSent_PerformanceNow;
        // .. add CorrelationInformation from request if requestReplyTo
        event.correlationInformation = request.correlationInformation;
        // Add DebugInformation if relevant
        if (request.initiation.debug !== 0) {
            event.debug = new DebugInformation(request.initiation.sentTimestamp, request.initiation.debug, incomingEnvelope, receivedTimestamp);
        }

        // Invoke InitiationProcessedEvent listeners (Both adding to matsSocket.initiations and firing of listeners is done sync, thus done before settling).
        _issueInitiationProcessedEvent(request.initiation, request.replyToTerminatorId, event);

        // ?: Is this a RequestReplyTo, as indicated by the request having a replyToEndpoint?
        if (request.replyToTerminatorId) {
            // -> Yes, this is a REQUEST-with-ReplyTo
            // Find the (client) Terminator which the Reply should go to
            let terminator = _terminators[request.replyToTerminatorId];
            // "Emulate" asyncness as if with Promise settling with setTimeout(.., 0).
            setTimeout(function () {
                if (messageEventType === MessageEventType.RESOLVE) {
                    try {
                        terminator.resolve(event);
                    } catch (err) {
                        error("replytoterminator resolve", "When trying to pass a RESOLVE to Terminator [" + request.replyToTerminatorId + "], an exception was raised.", err);
                    }
                } else {
                    // ?: Do we actually have a Reject-function (not necessarily, app decides whether to register it)
                    if (terminator.reject) {
                        // -> Yes, so reject it.
                        try {
                            terminator.reject(event);
                        } catch (err) {
                            error("replytoterminator reject", "When trying to pass a [" + messageEventType + "] to Terminator [" + request.replyToTerminatorId + "], an exception was raised.", err);
                        }
                    }
                }
            }, 0);
        } else {
            // -> No, this is a REQUEST-with-Promise (missing (client) EndpointId)
            // Delete the outstanding request, as we will complete it now.
            delete _outstandingRequests[request.envelope.cmid];
            // :: Note, resolving/rejecting a Promise is always async (happens "next tick").
            // ?: Was it RESOLVE or REJECT?
            if (messageEventType === MessageEventType.RESOLVE) {
                request.resolve(event);
            } else {
                request.reject(event);
            }
        }
    }

    function _roundTiming(millis) {
        return Math.round(millis * 100) / 100;
    }

    function _issueInitiationProcessedEvent(initiation, replyToTerminatorId = undefined, replyMessageEvent = undefined) {
        // Handle when initationProcessed /before/ session established: Setting to 0. (Can realistically only happen in testing.)
        let sessionEstablishedOffsetMillis = (_initialSessionEstablished_PerformanceNow ? _roundTiming(initiation.messageSent_PerformanceNow - _initialSessionEstablished_PerformanceNow) : 0);
        let acknowledgeRoundTripTime = _roundTiming(initiation.messageAcked_PerformanceNow - initiation.messageSent_PerformanceNow);
        let requestRoundTripTime = (replyMessageEvent ? _roundTiming(performance.now() - initiation.messageSent_PerformanceNow) : undefined);
        let replyMessageEventType = (replyMessageEvent ? replyMessageEvent.type : undefined);
        if (_numberOfInitiationsKept > 0) {
            let initiationProcessedEvent = new InitiationProcessedEvent(initiation.envelope.eid, initiation.envelope.cmid, initiation.sentTimestamp,
                sessionEstablishedOffsetMillis, initiation.envelope.tid, initiation.envelope.msg, acknowledgeRoundTripTime, replyMessageEventType, replyToTerminatorId, requestRoundTripTime, replyMessageEvent);
            _initiationProcessedEvents.push(initiationProcessedEvent);
            while (_initiationProcessedEvents.length > _numberOfInitiationsKept) {
                _initiationProcessedEvents.shift();
            }
        }

        if (initiation.suppressInitiationProcessedEvent) {
            log("InitiationProcessedEvent is suppressed, so NOT notifying listeners.");
            return;
        }

        // Firing to listeners, synchronous.
        for (let i = 0; i < _initiationProcessedEventListeners.length; i++) {
            try {
                let registration = _initiationProcessedEventListeners[i];
                let initiationMessageIncluded = (registration.includeInitiationMessage ? initiation.envelope.msg : undefined);
                let replyMessageEventIncluded = (registration.includeReplyMessageEvent ? replyMessageEvent : undefined);
                let initiationProcessedEvent = new InitiationProcessedEvent(initiation.envelope.eid, initiation.envelope.cmid, initiation.sentTimestamp, sessionEstablishedOffsetMillis,
                    initiation.envelope.tid, initiationMessageIncluded, acknowledgeRoundTripTime, replyMessageEventType, replyToTerminatorId, requestRoundTripTime, replyMessageEventIncluded);
                if (that.logging) log("Sending InitiationProcessedEvent to listener [" + (i + 1) + "/" + _initiationProcessedEventListeners.length + "]", initiationProcessedEvent);
                registration.listener(initiationProcessedEvent);
            } catch (err) {
                error("notify InitiationProcessedEvent listeners", "Caught error when notifying one of the [" + _initiationProcessedEventListeners.length + "] InitiationProcessedEvent listeners.", err);
            }
        }
    }

    function _startPinger() {
        log("Starting PING'er!");
        // Start the pinger with a random 5 +/-2 seconds, in case of mass reconnect.
        // Notice the "magic property" here, used in integration tests
        _pingLater(that.initialPingDelay ? that.initialPingDelay : 3000 + Math.random() * 4000);
    }

    function _stopPinger() {
        log("Cancelling PINGer");
        if (_pinger_TimeoutId) {
            clearTimeout(_pinger_TimeoutId);
            _pinger_TimeoutId = undefined;
        }
    }

    let _pinger_TimeoutId;
    let _pingId = 0;

    function _pingLater(initialPingDelay) {
        _pinger_TimeoutId = setTimeout(function () {
            if (that.logging) log("Ping-'thread': About to send ping. ConnectionState:[" + that.state + "], matsSocketOpen:[" + _matsSocketOpen + "].");
            if ((that.state === ConnectionState.SESSION_ESTABLISHED) && _matsSocketOpen) {
                let pingId = _pingId++;
                let pingPong = new PingPong(pingId, Date.now());
                _pings.push(pingPong);
                if (_pings.length > 100) {
                    _pings.shift();
                }
                _outstandingPings[pingId] = [performance.now(), pingPong];
                _webSocket.send("[{\"t\":\"" + MessageType.PING + "\",\"x\":\"" + pingId + "\"}]");
                // Reschedule
                _pingLater(15000);
            } else {
                log("Ping-'thread': NOT sending Ping and NOT Rescheduling due to state!=SESSION_ESTABLISHED or !connected - exiting 'thread'.");
            }
        }, initialPingDelay);
    }
}