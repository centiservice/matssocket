import 'dart:async';
import 'dart:math' as math;
import 'dart:convert';
import 'package:logging/logging.dart';
import 'package:matssocket/matssocket.dart';

final Logger _logger = Logger('mats.MatsSocket');

const String CLIENT_LIB_VERSION = '1.0.0-rc.1+2025-10-14';
const String CLIENT_LIB_NAME_AND_VERSION = 'MatsSocket.dart,$CLIENT_LIB_VERSION';

typedef SessionClosedEventListener = Function(MatsSocketCloseEvent);
typedef PingPongListener = Function(PingPong);
typedef EndpointMessageHandler = Future Function(MessageEvent);
typedef SubscriptionEventListener = Function(SubscriptionEvent);
typedef MessageEventHandler = Function(MessageEvent);
typedef ErrorEventListener = Function(ErrorEvent);

/// Function that performs a pre-connection operation (typically an HTTP GET) before opening the WebSocket, if the
/// feature is enabled using [MatsSocket.preConnectOperation], read doc there.
///
/// - [webSocketUri]: The WebSocket Uri that will be attempted after the pre-connection has gone well.
/// - [authorization]: The Authorization value that will be used in the WebSocket connection.
///
/// Shall return a [ConnectResult] providing:
/// - an `abortFunction` to cancel the in-flight pre-connection request, and
/// - a `responseStatusCode` future that completes with the HTTP status code.
typedef PreConnectOperation = ConnectResult Function(Uri webSocketUri, String authorization);

/// Result from the [PreConnectOperation], containing an `Function abortFunction` to abort the operation,
/// and a `Future&lt;int&gt; responseStatusCode`.
class ConnectResult {
  final Function abortFunction;
  final Future<int> responseStatusCode;

  ConnectResult(this.abortFunction, this.responseStatusCode);

  ConnectResult.noop() : this(() {}, Future.value(0));
}

/// Function that will be invoked upon closing the session, as an extra way to say to the server that the session is
/// closing. This is beneficial if the WebSocket for some reason has gone down, as the server then can clean up the
/// otherwise lingering session.
typedef OutOfBandClose = Function(Uri webSocketUri, String sessionId);

class MatsSocket {

  // ==============================================================================================
  // PUBLIC fields
  // ==============================================================================================

  /// Application name the MatsSocket was created with.
  final String appName;
  /// Application version the MatsSocket was created with.
  final String appVersion;
  /// The MatsSocketPlatform in use, either IO (for VM) or JS (for Node and Browser).
  final MatsSocketPlatform platform;

  /// The current session id.  Will be null until a session is established.
  String? sessionId;

  /// Default is 3-7 seconds for the initial ping delay, and then 15 seconds for subsequent pings. Can be overridden
  /// for tests.
  late int initialPingDelay = 3000 + _rnd.nextInt(4000);
  /// The time between pings, 15 seconds.
  int pingInterval = 15000;

  /// "Pre Connection Operation" refers to a hack whereby the MatsSocket performs a specified operation before
  /// initiating the WebSocket connection. The goal of this solution is to overcome a deficiency with the
  /// WebSocket Web API where it is impossible to add headers, in particular "Authorization": The XHR adds
  /// the Authorization header as normal, and the server side can transfer this header value over to a
  /// Cookie (e.g. named "MatsSocketAuthCookie").
  ///
  /// When the subsequent WebSocket connect is performed, the cookies will be transferred along with the initial
  /// "handshake" HTTP Request (a browser's "cookie jar" is shared between the HTTP requests and WebSockets) - and the
  /// AuthenticationPlugin on the server side can then validate the authorization String - now present in a cookie.
  /// <i>Note: One could of course have supplied it in the URL of the WebSocket HTTP Handshake, but this is very far
  /// from ideal, as a live authentication then could be stored in several ACCESS LOG style logging systems along the
  /// path of the WebSocket HTTP Handshake Request call.</i>
  ///
  /// **This is really only relevant for browser clients - although the preConnectOperation can probably be used for
  /// other hacky purposes.** For Dart VM clients, we can actually add Authorization headers directly to the WebSocket
  /// connection, which this client does (although the preConnectOperation works too - a shared cookie jar is
  /// implemented between the default PreConnectOperation (true or String) and the WebSocket). For Node, we're out of
  /// luck, because we neither have the ability to set headers, nor a shared cookie jar.
  ///
  /// This can be set to true, false, a String, or a [PreConnectOperation] object:
  /// * `false`: **(default)**: Disables this functionality.
  /// * `String`: Performs a HTTP GET with the URL set to the specified string, with the
  ///    HTTP Header `"Authorization"` set to the current Authorization value. Expects 200, 202 or 204
  ///    as returned status code to go on.
  /// * `true`: Same as String above, but where the URL is set to the same URL as
  ///    the WebSocket URL, with "ws" replaced with "http", similar to {@link MatsSocket#outofbandclose}.
  /// * [PreConnectOperation] instance: Invokes the function the Uri set to the current WebSocket URL that we will
  ///    connect to when this PreConnectionOperation has gone through, and the String set to the current Authorization
  ///    value. The return value is a [ConnectResult], where the abortFunction is invoked when
  ///    the connection-retry system deems the current attempt to have taken too long time. The Future must
  ///    be resolved by your code when the request has been successfully performed, or rejected if it didn't go through.
  ///    In the latter case, a new invocation of the 'preconnectoperation' will be performed after a countdown,
  ///    possibly with a different 'webSocketUrl' value if the MatsSocket is configured with multiple URLs.
  ///
  /// The default is `false`.
  set preConnectOperation(Object value) {
      if ((value is bool) || (value is String) || (value is PreConnectOperation)) {
        if (value is String) {
          // Check that it parses as a HTTP URL
          final uri = Uri.tryParse(value);
          if (uri == null || !uri.hasAbsolutePath || !(uri.isScheme('http') || uri.isScheme('https'))) {
            throw ArgumentError.value(value, 'preConnectOperation', 'Must be a valid absolute http(s) URL');
          }
        }
        _preConnectOperation = value;
      }
      else {
        throw ArgumentError.value(value, 'preConnectOperation', 'Must be bool, String (URL) or PreConnectOperation');
      }
  }

  /// "Out-of-band Close" refers to a small hack to notify the server about a MatsSocketSession being Closed even
  /// if the WebSocket is not live anymore: When [MatsSocket.close] is invoked, an attempt is done to close
  /// the WebSocket with CloseCode [MatsSocketCloseCodes.CLOSE_SESSION] - but whether the WebSocket is open
  /// or not, this "Out-of-band Close" will also be invoked if enabled and MatsSocket SessionId is present.
  ///
  /// Values:
  /// * `false`: Disables this functionality
  /// * `String`: The sessionId is concatenated to the String representing an URI, and a POST request is performed to
  ///     this URL. If you want it as a URL parameter, then the supplied string should end with e.g. `"?sessionId="`.
  /// * `true`: **(default)**: The following pseudo code is executed:
  ///     `webSocketUri.replace('ws', 'http')+"/close_session?sessionId={sessionId}")`, and this URL is used to perform
  ///     a POST to</li>
  /// * [OutOfBandClose] The function is with the current webSocketUri, i.e. the URI that the WebSocket was
  ///     connected to, e.g. "wss://example.com/matssocket", and the current MatsSocket sessionId we're trying to close.
  ///
  /// The default is `false`.
  ///
  /// Note: A 'beforeunload' listener invoking `MatsSocket.close(..)` is attached when running in a web browser,
  /// so that if the user navigates away, the current MatsSocketSession is closed.
  set outOfBandClose(Object value) {
    if ((value is bool) || (value is String) || (value is OutOfBandClose)) {
      if (value is String) {
        // Check that it parses as a HTTP URL
        final uri = Uri.tryParse(value);
        if (uri == null || !uri.hasAbsolutePath || !(uri.isScheme('http') || uri.isScheme('https'))) {
          throw ArgumentError.value(value, 'outOfBandClose', 'Must be a valid absolute http(s) URL');
        }
      }
      _outOfBandClose = value;
    } else {
      throw ArgumentError.value(value, 'outOfBandClose', 'Must be bool, String');
    }
  }

  /// A bit field requesting different types of debug information, the bits defined in [DebugOption]. It is
  /// read each time an information bearing message is added to the pipeline, and if not 'undefined' or 0, the
  /// debug options flags is added to the message. The server may then add [DebugDto] to outgoing
  /// messages depending on whether the authorized user is allowed to ask for it, most obviously on Replies to
  /// Client Requests, but also Server initiated SENDs and REQUESTs.
  ///
  /// The debug options on the outgoing Client-to-Server requests are tied to that particular request flow -
  /// but to facilitate debug information also on Server initiated messages, the *last set* debug options is
  /// also stored on the server and used when messages originate there (i.e. Server-to-Client SENDs and REQUESTs).
  ///
  /// If you only want debug information on a particular Client-to-Server request, you'll need to first set the
  /// debug flags, then do the request (adding the message to the pipeline), and then reset the debug flags back,
  /// and send some new message to reset the value for Server-initiated messages (Just to be precise: Any message
  /// from Server-to-Client which happens to be performed in the timespan between the request and the subsequent
  /// message which resets the debug flags will therefore also have debug information attached).
  ///
  /// The value is a bit field (values in [DebugOption], so you bitwise-or (or simply add) together the
  /// different things you want. Difference between `null` and `0` is that undefined
  /// turns debug totally off (the [DebugDto] instance won't be present in the [MessageEvent],
  /// while 0 means that the server is not requested to add debug info - but the Client will still create the
  /// [DebugDto] instance and populate it with what any local debug information.
  ///
  /// The value from the client is bitwise-and'ed together with the debug capabilities the authenticated user has
  /// gotten by the AuthenticationPlugin on the Server side.
  int? debug = 0;

  /// When performing a [request] and [requestReplyTo], you may not always get a (timely) answer: Either you can loose
  /// the connection, thus lagging potentially forever - or, depending on the Mats message handling on the server
  /// (i.e. using "non-persistent messaging" for blazing fast performance for non-state changing operations),
  /// there is a minuscule chance that the message may be lost - or, if there is a massive backlog of messages
  /// for the particular Mats endpoint that is interfaced, you might not get an answer for 20 minutes. This setting
  /// controls the default timeout as a [Duration] for Requests, and is default 45 seconds. You may override this
  /// per Request by specifying a different timeout in the config object for the request.
  ///
  /// When the timeout is hit, the Future of a [request] - or the specified ReplyTo Terminator for a
  /// [requestReplyTo] - will be rejected with a [MessageEvent] of type [MessageEventType.TIMEOUT].
  ///
  /// In addition, if the Received acknowledgement has not gotten in either, this will also be NACK'ed with
  /// [ReceivedEventType.TIMEOUT] - this happens *before* the Future rejects)
  Duration requestTimeout = Duration(seconds: 45);

  /// A random three-char id, useful for uniquely identifying this MatsSocket among others in one app instance, or in
  /// one test run. Not a globally unique id.
  late final matsSocketInstanceId = randomId(3);

  // ==============================================================================================
  // PRIVATE fields
  // ==============================================================================================

  // alphabet length: 10 + 26 x 2 = 62 chars.
  static final String _randomAlphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // JSON-non-quoted and visible Alphabet: 92 chars.
  static final String _randomJsonAlphabet = '!#\$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~';

  // Random used throughout, for ids, and shuffle, and random delays.
  final _rnd = math.Random();

  Object _preConnectOperation = false;
  Object _outOfBandClose = true;

  // :: Message handling
  final Map<String, StreamController<MessageEvent>> _terminators = {};
  final Map<String, EndpointMessageHandler> _endpoints = {};

  final List<Uri> _useUrls;

  DateTime _lastMessageEnqueuedTimestamp = DateTime.now(); // Start by assuming that it was just used.
  double? _initialSessionEstablished_PerformanceNow;

  // If true, we're currently already trying to get a WebSocket
  bool _webSocketConnecting = false;
  // If NOT null, we have an open WebSocket available.
  WebSocket? _webSocket; // NOTE: It is set upon "onopen", and unset upon "onclose".
  // If false, we should not accidentally try to reconnect or similar
  bool _matsSocketOpen = false; // NOTE: Set to true upon enqueuing of information-bearing message.

  final List<MatsSocketEnvelopeDto?> _prePipeline = [];
  final List<MatsSocketEnvelopeDto?> _pipeline = [];

  // :: Event listeners.

  final List<SessionClosedEventListener> _sessionClosedEventListeners = [];
  final List<ConnectionEventListener> _connectionEventListener = [];
  final List<PingPongListener> _pingPongListeners = [];
  final List<_InitiationProcessedEventListenerRegistration> _initiationProcessedEventListeners = [];
  final List<SubscriptionEventListener> _subscriptionEventListeners = [];
  final List<ErrorEventListener> _errorEventListeners = [];


  ConnectionState _state = ConnectionState.NO_SESSION;

  bool _helloSent = false;

  // :: Authorization fields
  String? _authorization;
  String? _lastAuthorizationSentToServer;
  int _lastDebugOptionsSentToServer = 0;
  bool _forcePipelineProcessing = false;

  DateTime? _expirationTimestamp;
  late Duration _roomForLatencyDuration;
  AuthorizationExpiredCallback? _authorizationExpiredCallback;

  int _messageSequenceId = 0; // Increases for each SEND, REQUEST and REPLY

  // When we've informed the app that we need auth, we do not need to do it again until it has set it.
  AuthorizationRequiredEventType? _authExpiredCallbackInvoked_EventType;

  // Outstanding Pings
  final Map<String, _OutstandingPing> _outstandingPings = {};
  // Outstanding Request "futures", i.e. the resolve() and reject() functions of the returned Future.
  final Map<String, _Request> _outstandingRequests = {};
  // Outbox for SEND and REQUEST messages waiting for Received ACK/NACK
  final Map<String?, _Initiation> _outboxInitiations = {};
  // .. "guard object" to avoid having to retransmit messages sent /before/ the WELCOME is received for the HELLO handshake
  late String _outboxInitiations_RetransmitGuard = randomCId(5);
  // Outbox for REPLYs
  final Map<String?, _OutboxReply> _outboxReplies = {};
  // The Inbox - to be able to catch double deliveries from Server
  final _inbox = {};

  // :: STATS
  // Last 100 PingPong instances
  final List<PingPong> _pings = [];
  // Last X InitationProcessedEvent instances.
  int _numberOfInitiationsKept = 10;
  final List<InitiationProcessedEvent> _initiationProcessedEvents = [];

  /// Creates a MatsSocket, requiring the Application's name and version, and which URLs to connect to.
  ///
  /// - [appName] the name of the application using this MatsSocket.dart client library
  /// - [appVersion] the version of the application using this MatsSocket.dart client library
  /// - [urls] a List of WebSocket URLs speaking 'matssocket' protocol - one, or multiple for high availability.
  /// - [MatsSocketPlatform] the platform implementation to use, if not specified, it will be
  ///     [MatsSocketPlatform.create()]d based on conditional import between JS and IO, and further runtime checks
  ///     of whether the JS version runs in a browser or e.g. NodeJS.
  MatsSocket(this.appName, this.appVersion, List<Uri> urls, [MatsSocketPlatform? matsSocketPlatform])
      : _useUrls = List.of(urls),
        platform = matsSocketPlatform ?? MatsSocketPlatform.create(),
        _connectionTimeoutMin = (urls.length > 1
            ? _connectionTimeoutBase
            : _connectionTimeoutMinIfSingleUrl) {
    if (urls.isEmpty) {
      throw ArgumentError.value(urls, 'urls', 'Must provide at least 1 url');
    }

    _shuffleList(_useUrls);

    // .. Invoke resetConnectStateVars() right away to get URL set.
    _resetReconnectStateVars();

    _logger.info('MatsSocket created for app: $appName, version: $appVersion, using urls: $_useUrls, platform: $platform');

    // Make an endpoint for the server to ask for new auth, read more at: AuthorizationRequiredEventType.REAUTHENTICATE
    _endpoints['MatsSocket.renewAuth'] = (messageEvent) {
          // Immediately ask for new Authorization
          _requestNewAuthorizationFromApp('MatsSocket.renewAuth was invoked', AuthorizationRequiredEvent(AuthorizationRequiredEventType.REAUTHENTICATE));

          // .. then immediately resolve the server side request.
          // This will add a message to the pipeline, but the pipeline will not be sent until new auth present.
          // When the new auth comes in, the message will be sent, and resolve on the server side - and new auth
          // is then "magically" present on the incoming-context.
          return Future.value({});
    };
  }

  /// <b>Note: You *should* register a SessionClosedEvent listener, as any invocation of this listener by this
  /// client library means that you've either not managed to do initial authentication, or lost sync with the
  /// server, and you should crash or "reboot" the application employing the library to regain sync.</b>
  ///
  /// The registered event listener functions are called when the Server kicks us off the socket and the session is
  /// closed due to a multitude of reasons, where most should never happen if you use the library correctly, in
  /// particular wrt. authentication. <b>It is NOT invoked when you explicitly invoke matsSocket.close() from
  /// the client yourself!</b>
  ///
  /// If there's a native close event (differing between VM (dart.io) and JS (js interop) environments), you can get it
  /// at [MatsSocketCloseEvent.nativeEvent]
  ///
  /// Again, note: In normal operation of the MatsSocket, these events should not be fired. The listeners are not
  /// invoked by `matsSocket.close()` from the client.
  ///
  /// Note that when this event listener is invoked, the MatsSocketSession is just as closed as if you invoked
  /// [MatsSocket.close()] on it: All outstanding send/requests are NACK'ed (with
  /// [ReceivedEventType.SESSION_CLOSED]), all request Futures are rejected
  /// (with [MessageEventType.SESSION_CLOSED]), and the MatsSocket object is as if just constructed and
  /// configured. You may "boot it up again" by sending a new message where you then will get a new MatsSocket
  /// SessionId. However, you should consider restarting the application if this happens, or otherwise "reboot"
  /// it as if it just started up (gather all required state and null out any other that uses lazy fetching).
  /// Realize that any outstanding e.g. "addOrder" request's Future will now have been rejected - and you don't really
  /// know whether the order was placed or not, so you should get the entire order list. On the received event,
  /// the property 'outstandingInitiations' details the number of outstanding send/requests and Futures that was
  /// rejected: If this is zero, you *might* actually be in sync (barring failed/missing Server-to-Client
  /// SENDs or REQUESTs), and could *consider* to just "act as if nothing happened" - by sending a new message
  /// and thus get a new MatsSocket Session going.
  ///
  /// - [sessionClosedEventListener] a function taking [MatsSocketCloseEvent] that is invoked when the library gets the current
  ///      MatsSocketSession closed from the server.
  void addSessionClosedEventListener(SessionClosedEventListener sessionClosedEventListener) {
    _sessionClosedEventListeners.add(sessionClosedEventListener);
  }

  /// <b>Note: You *could* register a ConnectionEvent listener, as these are only informational messages
  /// about the state of the Connection.</b> It is nice if the user gets a small notification about <i>"Connection
  /// Lost, trying to reconnect in 2 seconds"</i> to keep him in the loop of why the application's data fetching
  /// seems to be lagging. There are suggestions of how to approach this with each of the enum values of
  /// [ConnectionEventType].
  ///
  /// The registered event listener functions are called when this client library performs WebSocket connection
  /// operations, including connection closed events that are not "Session Close" style. This includes the simple
  /// situation of "lost connection, reconnecting" because you passed through an area with limited or no
  /// connectivity.
  ///
  /// Read more at [ConnectionEvent] and [ConnectionEventType].
  ///
  /// - [connectionEventListener] a function taking [ConnectionEvent] that is invoked when the library progresses
  ///     through the different connection states.
  void addConnectionEventListener(ConnectionEventListener connectionEventListener) {
    _connectionEventListener.add(connectionEventListener);
  }

  /// <b>Note: If you use [subscribe()], you *should* register a
  /// [SubscriptionEvent] listener, as you should be concerned about [SubscriptionEventType.NOT_AUTHORIZED]
  /// and [SubscriptionEventType.LOST_MESSAGES].</b>
  ///
  /// Read more at [SubscriptionEvent] and [SubscriptionEventType].
  ///
  /// - [subscriptionEventListener] a function taking [SubscriptionEvent] that is invoked when the library
  ///     gets information from the Server wrt. subscriptions.
  void addSubscriptionEventListener(SubscriptionEventListener subscriptionEventListener) {
    _subscriptionEventListeners.add(subscriptionEventListener);
  }

  /// Some 25 places within the MatsSocket client catches errors of different kinds, typically where listeners
  /// cough up errors, or if the library catches mistakes with the protocol, or if the WebSocket emits an error.
  /// Add a ErrorEvent listener to get hold of these, and send them back to your server for
  /// inspection - it is best to do this via out-of-band means, e.g. via HTTP. For browsers, consider
  /// window.sendBeacon(..).
  ///
  /// - [errorEventListener] a function taking [ErrorEvent] that is invoked when the library catches
  ///     errors of different kinds.
  void addErrorEventListener(ErrorEventListener errorEventListener) {
    _errorEventListeners.add(errorEventListener);
  }

  /// If this MatsSockets client realizes that the expiration time (minus the room for latency) of the authorization
  /// has passed when about to send a message, it will invoke this callback function. A new authorization must then
  /// be provided by invoking the [setCurrentAuthorization] method - only when this is invoked, the MatsSocket
  /// will send messages. The MatsSocket will queue up any messages that are initiated while waiting for new
  /// authorization, and send them all at once in a single pipeline when the new authorization is in.
  ///
  /// **If you do not set this callback, but still set Authorization using [setCurrentAuthorization] with an expiration
  /// time, and the authorization expires, the MatsSocket will error out and close the session!**
  ///
  /// - [authorizationExpiredCallback] function taking [AuthorizationRequiredEvent] which will be invoked when about to
  ///     send a new message *if* '<code>Date.now() > (expirationTimeMillisSinceEpoch - roomForLatencyMillis)</code>' from
  ///     the paramaters of the last invocation of [setCurrentAuthorization].
  void setAuthorizationExpiredCallback(AuthorizationExpiredCallback authorizationExpiredCallback) {
    _authorizationExpiredCallback = authorizationExpiredCallback;

    // Evaluate whether there are stuff in the pipeline that should be sent now.
    // (Not-yet-sent HELLO does not count..)
    flush();
  }


  /// Sets an authorization String, which must correspond to what the server side authorization plugin expects. It
  /// is up to the server side AuthorizationPlugin to resolve the String to a UserId and Principal. This String may
  /// represent a cookie-style value that on the server resolves to an already authenticated user (e.g. where the
  /// app has done the authentication with the server, and the server stores a cookie that the server side
  /// AuthorizationPlugin then can resolve to the user when presented by the MatsSocket).
  /// The String may also be an actual authentication token, e.g. a JWT or OAuth2 access token, which the app has
  /// fetched from an Authorization server. The MatsSocket client library will not interpret the String in
  /// any way, it is just a String to it: It is up to the server side AuthorizationPlugin to interpret the
  /// String.
  ///
  /// For several types of authorization this method must be invoked on a regular basis with fresh authorization -
  /// for example for a OAuth/JWT/OIDC-type system where an access token will expire within a short time frame
  /// (e.g. expires within minutes). For an Oauth2-style authorization scheme, this String could be "Bearer: ...",
  /// which the server side AuthorizationPlugin then can parse as a Bearer token.
  ///
  /// **Note: If you set Authorization with an expiration time, but do not set the [authorizationExpiredCallback],
  /// and the authorization expires, the MatsSocket will error out and close the session!** So either set
  /// Authorization without expiration time, or also set the callback. You may also yourself keep the
  /// authorization fresh by invoking this method on a regular basis. You may even do a combination, whereby you
  /// preemptively keep the authorization fresh as long as the user is active in the application to avoid
  /// the extra latency of waiting for the callback to provide new authorization - but if the user goes idle
  /// for a longer period, you let the authorization expire and rely on the callback to provide fresh authorization.
  ///
  /// **Note: This SHALL NOT be used to CHANGE the user!** It should only refresh an existing authorization for the
  /// initially authenticated user. One MatsSocket with its corresponding MatsSocketSession shall only be used by a
  /// single user: If changing user, you should ditch the existing MatsSocket after invoking [close] to properly clean
  /// up the current MatsSocketSession on the server side too, and then make a new MatsSocket thus getting a new
  /// Session.
  ///
  /// Note: If there are no messages yet in the pipeline, invoking this method will not actually start the WebSocket
  /// connection and HELLO/WELCOME handshake. Only when there both is an authorization and a message to send, the
  /// connection will be made. Realize that this logic allows for the app to start sending messages as soon as it has
  /// created the MatsSocket, even if the authorization takes some time to get hold of (e.g. by doing an async
  /// fetch() to an OAuth2/OIDC token endpoint).
  ///
  /// - [authorizationValue] the string Value which will be transferred to the Server and there resolved
  ///     to a Principal and UserId on the server side by the AuthorizationPlugin. Note that this value potentially
  ///     also will be forwarded to other resources that requires authorization.
  /// - [expirationTimestamp] the DateTime at which this authorization expires (in case of OAuth-style tokens), or
  ///     not set / `null` if it never expires or otherwise has no defined expiration mechanism.
  /// - [roomForLatencyDuration] the Duration which is subtracted from the 'expirationTimestamp' to
  ///     find the point in time where the MatsSocket will refuse to use the authorization and instead invoke the
  ///     [setAuthorizationExpiredCallback] and wait for a new authorization
  ///     being set by invocation of the present method. Depending on what the usage of the Authorization string
  ///     is on server side is, this should probably **at least** be 10 seconds - but if the MatsSocket
  ///     endpoint (or downstream Mats endpoints) uses the Authorization string to do further accesses, both latency and
  ///     queue time must be taken into account (e.g. for calling into another API that also needs a valid token). If
  ///     [expirationTimestamp] is null, then this parameter is not used. *Default value is 30 seconds.*
  void setCurrentAuthorization(String authorizationValue, [DateTime? expirationTimestamp,
      Duration roomForLatencyDuration = const Duration(seconds: 30)]) {
    _logger.fine(() => 'Got Authorization which ${expirationTimestamp != null
        ? 'Expires in [${expirationTimestamp.difference(DateTime.now())}]'
        : '[Never expires]'}, roomForLatencyMillis: $roomForLatencyDuration');

    for (var i=0; i < authorizationValue.length; i++) {
      if (authorizationValue.codeUnitAt(i) > 160) {
        var close = authorizationValue.substring(math.max(0, (i - 3)), math.min(i + 3, authorizationValue.length));
        throw ArgumentError.value(authorizationValue[i], 'authorizationValue', 'Authorization value character at $i is not valid ASCII, this is around [$close]');
      }
    }

    _authorization = authorizationValue;
    _expirationTimestamp = expirationTimestamp;
    _roomForLatencyDuration = roomForLatencyDuration;
    // ?: Should we send it now?
    if (_authExpiredCallbackInvoked_EventType == AuthorizationRequiredEventType.REAUTHENTICATE) {
      _logger.fine('Immediate send of new authentication due to REAUTHENTICATE');
      _forcePipelineProcessing = true;
    }
    // We're now back to "normal", i.e. not outstanding authorization request.
    _authExpiredCallbackInvoked_EventType = null;

    // Evaluate whether there are stuff in the pipeline that should be sent now.
    // (Not-yet-sent HELLO does not count..)
    flush();
  }


  /// This can be used by the mechanism invoking 'setCurrentAuthorization(..)' to decide whether it should keep the
  /// authorization fresh (i.e. no latency waiting for new authorization is introduced when a new message is
  /// enqueued), or fall back to relying on the 'authorizationExpiredCallback' being invoked when a new message needs
  /// it (thus introducing latency while waiting for authorization). One could envision keeping fresh auth for 5
  /// minutes, but if the user has not done anything requiring authentication (i.e. sending information bearing
  /// messages SEND, REQUEST or Replies) in that timespan, you stop doing continuous authentication refresh, falling
  /// back to the "on demand" based logic, where when the user does something, the 'authorizationExpiredCallback'
  /// is invoked if the authentication is expired.
  DateTime get lastMessageEnqueuedTimestamp {
    return _lastMessageEnqueuedTimestamp;
  }

  /// Returns whether this MatsSocket *currently* have a WebSocket connection open. It can both go down
  /// by lost connection (driving through a tunnel), where it will start to do reconnection attempts, or because
  /// you (the Client) have closed this MatsSocketSession, or because the *Server* has closed the
  /// MatsSocketSession. In these latter cases, where the MatsSocketSession is closed, the WebSocket connection will
  /// stay down - until you open a new MatsSocketSession.
  ///
  /// Pretty much the same as <code>([state] === [ConnectionState.CONNECTED])
  /// || ([state] === [ConnectionState.SESSION_ESTABLISHED])</code> - however, in the face of
  /// [MatsSocketCloseCodes.DISCONNECT], the state will not change, but the connection is dead ('connected' returns
  /// false).
  bool get connected {
    return _webSocket != null;
  }

  /// Returns which one of the [ConnectionState] state enums the MatsSocket is in.
  ///
  ///  * [ConnectionState.NO_SESSION] - initial state, and after Session Close (both from client and server side)
  ///  * [ConnectionState.CONNECTING] - when we're actively trying to connect, i.e. "new WebSocket(..)" has been invoked, but not yet either opened or closed.
  ///  * [ConnectionState.WAITING] - if the "new WebSocket(..)" invocation ended in the socket closing, i.e. connection failed, but we're still counting down to next (re)connection attempt.
  ///  * [ConnectionState.CONNECTED] - if the "new WebSocket(..)" resulted in the socket opening. We still have not established the MatsSocketSession with the server, though.
  ///  * [ConnectionState.SESSION_ESTABLISHED] - when we're open for business: Connected, authenticated, and established MatsSocketSession with the server.
  ConnectionState get state {
    return _state;
  }

  /// Metrics/Introspection: Returns an array of the 100 latest [PingPong]s. Note that a PingPong entry
  /// is added to this array *before* it gets the Pong, thus the latest may not have its
  /// [PingPong.roundTripMillis] set yet. Also, if a ping is performed right before the connection goes down,
  /// it will never get the Pong, thus there might be entries in the middle of the list too that does not have
  /// roundTripMillis set. This is opposed to the [addPingPongListener], which only gets invoked when
  /// the pong has arrived.
  ///
  /// See also [addPingPongListener]
  List<PingPong> get pings {
    return _pings;
  }


  /// A [PingPong] listener is invoked each time a [MessageType.PONG] message comes in, giving you
  /// information about the experienced [PingPong.roundTripMillis]. The PINGs and PONGs are
  /// handled slightly special in that they always are handled ASAP with short-path code routes, and should thus
  /// give a good indication about experienced latency from the network. That said, they are sent on the same
  /// connection as all data, so if there is a gigabyte document "in the pipe", the PING will come behind that
  /// and thus get a big hit. Thus, you should consider this when interpreting the results - a high outlier should
  /// be seen in conjunction with a message that was sent at the same time.
  ///
  /// - [pingPongListener] a function taking [PingPong] that is invoked when the library receives a PONG from the
  ///     server.
  void addPingPongListener(PingPongListener pingPongListener) {
    _pingPongListeners.add(pingPongListener);
  }

  /// Metrics/Introspection: Returns an array of the [numberOfInitiationsKept] latest
  /// [InitiationProcessedEvent]s.
  ///
  /// Note: These objects will always have the [InitiationProcessedEvent.initiationMessage] and (if Request)
  /// [InitiationProcessedEvent.replyMessageEvent] set, as opposed to the events issued to
  /// [addInitiationProcessedEventListener], which can decide whether to include them.
  ///
  /// See also [addInitiationProcessedEventListener]
  List<InitiationProcessedEvent> get initiations {
    return _initiationProcessedEvents;
  }

  /// Metrics/Introspection: How many [InitiationProcessedEvent]s to keep in [initiations].
  /// If the current number of initiations is more than what you set it to, it will be culled.
  /// You can use this to "reset" the [initiations] by setting it to 0, then right
  /// back up to whatever you fancy.
  ///
  /// Default is 10.
  int get numberOfInitiationsKept {
    return _numberOfInitiationsKept;
  }

  set numberOfInitiationsKept(int numberOfInitiationsKept) {
    if (numberOfInitiationsKept < 0) {
      throw ArgumentError.value(numberOfInitiationsKept, 'numberOfInitiationsKept', 'must be >= 0');
    }
    _numberOfInitiationsKept = numberOfInitiationsKept;
    if (_initiationProcessedEvents.length > numberOfInitiationsKept) {
      _initiationProcessedEvents.length = numberOfInitiationsKept;
    }
  }

  /// Registering a [InitiationProcessedEvent] listener will give you meta information about each Send
  /// and Request that is performed through the library when it is fully processed, thus also containing
  /// information about experienced round-trip times. The idea is that you thus can gather metrics of
  /// performance as experienced out on the client, by e.g. periodically sending this gathering to the Server.
  /// <b>Make sure that you understand that if you send to the server each time this listener is invoked, using
  /// the MatsSocket itself, you WILL end up in a tight loop!</b> This is because the sending of the statistics
  /// message itself will again trigger a new invocation of this listener. This can be avoided in two ways: Either
  /// instead send periodically - in which case you can include the statistics message itself, OR specify that
  /// you do NOT want a listener-invocation of these messages by use of the config object on the send, request
  /// and requestReplyTo methods.
  ///
  /// Note: Each listener gets its own instance of [InitiationProcessedEvent], which also is different from
  /// the ones in the [initiations] array.
  ///
  /// - [initiationProcessedEventListener] a function taking [InitiationProcessedEvent] that is invoked when
  ///     the library has fully processed an initiation (i.e. a Send or Request).
  /// - [includeInitiationMessage] whether to include the [InitiationProcessedEvent.initiationMessage]
  /// - [includeReplyMessageEvent] whether to include the [InitiationProcessedEvent.replyMessageEvent]
  ///     Reply [MessageEvent]s.
  void addInitiationProcessedEventListener(InitiationProcessedEventListener initiationProcessedEventListener,
      [bool includeInitiationMessage = false, bool includeReplyMessageEvent = false]) {
    _initiationProcessedEventListeners.add(_InitiationProcessedEventListenerRegistration(
        initiationProcessedEventListener,
        includeInitiationMessage,
        includeReplyMessageEvent
    ));
  }

  // ========== Terminator and Endpoint registration ==========

  /// Registers a Terminator, on the specified terminatorId, and with the specified callbacks. A Terminator is
  /// the target for Server-to-Client SENDs, and the Server's REPLYs from invocations of
  /// [requestReplyTo] where the terminatorId points to this Terminator.
  ///
  /// Note: You cannot register any Terminators, Endpoints or Subscriptions starting with "MatsSocket".
  ///
  /// - [terminatorId] the id of this client side Terminator.
  ///
  /// **returns** a Stream that will receive [MessageEvent]s as they arrive for the terminator. Reject messages will be
  /// also added as MessageEvent, but must be captured from the [Stream.listen] onError.
  Stream<MessageEvent> terminator(String terminatorId) {
    // :: Assert for double-registrations
    if (_terminators.containsKey(terminatorId)) {
      throw ArgumentError.value(terminatorId, 'endpointId',
          'Cannot register more than one Terminator to same endpointId [$terminatorId], existing: ${_terminators[terminatorId]}');
    }
    if (_endpoints.containsKey(terminatorId)) {
      throw ArgumentError.value(terminatorId, 'endpointId',
          'Cannot register a Terminator to same endpointId [$terminatorId] as an Endpoint, existing: ${_terminators[terminatorId]}');
    }
    // :: Assert that the namespace "MatsSocket" is not used
    if (terminatorId.startsWith('MatsSocket')) {
      throw ArgumentError.value(terminatorId, 'endpointId',
          'The namespace "MatsSocket" is reserved, TerminatorId [$terminatorId] is illegal.');
    }
    _logger.info('Registering Terminator on id [$terminatorId]');
    _terminators[terminatorId] = StreamController<MessageEvent>();
    return _terminators[terminatorId]!.stream;
  }

  /// Registers an Endpoint, on the specified endpointId, with the specified "promiseProducer". An Endpoint is
  /// the target for Server-to-Client REQUESTs. The promiseProducer is a function that takes a message event
  /// (the incoming REQUEST) and produces a Future, whose return (resolve or reject) is the return value of the
  /// endpoint.
  ///
  /// Note: You cannot register any Terminators or Endpoints starting with "MatsSocket".
  ///
  /// - [endpointId] the id of this client side Endpoint.
  /// - [endpointMessageHandler] a function that takes a [MessageEvent] and returns a Future which when
  ///     later either Resolve or Reject will be the return value of the endpoint call.
  void endpoint(String endpointId, EndpointMessageHandler endpointMessageHandler) {
    // :: Assert for double-registrations
    if (_terminators.containsKey(endpointId)) {
      throw ArgumentError.value(endpointId, 'endpointId',
          'Cannot register more than one Endpoint to same endpointId [$endpointId], existing: ${_terminators[endpointId]}');
    }
    if (_endpoints.containsKey(endpointId)) {
      throw ArgumentError.value(endpointId, 'endpointId',
          'Cannot register a Endpoint to same endpointId [$endpointId] as an Terminator, existing: ${_terminators[endpointId]}');
    }
    // :: Assert that the namespace "MatsSocket" is not used
    if (endpointId.startsWith('MatsSocket')) {
      throw ArgumentError.value(endpointId, 'endpointId',
          'The namespace "MatsSocket" is reserved, EndpointId [$endpointId] is illegal.');
    }
    _logger.info('Registering Endpoint on id [$endpointId]:\n #endpointMessageHandler: $endpointMessageHandler');
    _endpoints[endpointId] = endpointMessageHandler;
  }

  final Map<String, _Subscription> _subscriptions = {};

  /// Subscribes to a Topic. The Server may do an authorization check for the subscription. If you are not allowed,
  /// a [SubscriptionEvent] of type [SubscriptionEventType.NOT_AUTHORIZED] is issued, and the callback
  /// will not get any messages. Otherwise, the event type is [SubscriptionEventType.OK].
  ///
  /// Note: If the 'messageCallback' was already registered, an error is emitted, but the method otherwise returns
  /// silently.
  ///
  /// Note: You will not get messages that was issued before the subscription initially is registered with the
  /// server, which means that you by definition cannot get any messages issued earlier than the initial
  /// [ConnectionEventType.SESSION_ESTABLISHED]. Code accordingly. <i>Tip for a "ticker stream" or "cache
  /// update stream" or similar: Make sure you have some concept of event sequence number on updates. Do the MatsSocket
  /// connect with the Subscription in place, but for now just queue up any updates. Do the request for "full initial load", whose reply
  /// contains the last applied sequence number. Now process the queued events that arrived while getting the
  /// initial load (i.e. in front, or immediately after), taking into account which event sequence numbers that
  /// already was applied in the initial load: Discard the earlier and same, apply the later. Finally, go over to
  /// immediate processing of the events. If you get a reconnect telling you that messages was lost (next "Note"!),
  /// you could start this process over.</i>
  ///
  /// Note: Reconnects are somewhat catered for, in that a "re-subscription" after re-establishing the session will
  /// contain the latest messageId the client has received, and the server will then send along all the messages
  /// *after* this that was lost - up to some limit specified on the server. If the messageId is not known by the server,
  /// implying that the client has been gone for too long time, a [SubscriptionEvent] of type
  /// [SubscriptionEventType.LOST_MESSAGES] is issued. Otherwise, the event type is
  /// [SubscriptionEventType.OK].
  ///
  /// Note: You should preferably add all "static" subscriptions in the "configuration phase" while setting up
  /// your MatsSocket, before starting it (i.e. sending first message). However, dynamic adding and
  /// [deleteSubscription] is also supported.
  ///
  /// Note: Pub/sub is not designed to be as reliable as send/request - but it should be pretty ok anyway!
  ///
  /// Wrt. to how many topics a client can subscribe to: Mainly bandwidth constrained wrt. to the total number of
  /// messages, although there is a slight memory and CPU usage to consider too (several hundred should not really
  /// be a problem). In addition, the client needs to send over the actual subscriptions, and if these number in
  /// the thousands, the connect and any reconnects could end up with tens or hundreds of kilobytes of "system
  /// information" passed over the WebSocket.
  ///
  /// Wrt. to how many topics that can exist: Mainly memory constrained on the server based on the number of topics
  /// multiplied by the number of subscriptions per topic, in addition to the number of messages passed in total
  /// as each node in the cluster will have to listen to either the full total of messages, or at least a
  /// substantial subset of the messages - and it will also retain these messages for hours to allow for client
  /// reconnects.
  ///
  /// Note: You cannot register any Terminators, Endpoints or Subscriptions starting with "MatsSocket".
  ///
  /// - [topicId] what topic Id to subscribe to.
  /// - [messageCallback] callback function taking [MessageEvent] to be called when a message arrives on the topic
  void subscribe(String topicId, MessageEventHandler messageCallback) {
    // :: Assert that the namespace "MatsSocket" is not used
    if (topicId.startsWith('MatsSocket')) {
      throw ArgumentError.value(topicId, 'The namespace "MatsSocket" is reserved, Topic [$topicId] is illegal.');
    }
    if (topicId.startsWith('!')) {
      throw ArgumentError.value(topicId, 'Topic cannot start with "!" (and why would you use chars like that anyway?!),'
          ' Topic [$topicId] is illegal.');
    }
    _logger.fine('Registering Subscription on Topic [$topicId]:\n #messageCallback: $messageCallback');
    // ?: Check if we have an active subscription holder here already
    var subs = _subscriptions.putIfAbsent(topicId, () => _Subscription(topicId));

    // :: Assert that the messageCallback is not already there
    if (subs.listeners
        .where((current) => current == messageCallback)
        .isNotEmpty) {
      error('subscription_already_exists', 'The specified messageCallback [$messageCallback]'
          ' was already subscribed to Topic [$topicId].');
      return;
    }
    // Add the present messageCallback to the subscription holder
    subs.listeners.add(messageCallback);

    // :: Handle dynamic subscription

    // // ?: Have we NOT already subscribed with Server?
    if (!subs.subscriptionSentToServer) {
      // ?: Has HELLO already been sent?
      // (If socket is NOT hello'ed, subs will be done when doing HELLO.)
      if (_helloSent) {
        // -> Yes, HELLO sent, so handle "dynamic subscription", i.e. subscribing while the socket is open.
        // Send message to subscribe this TopicId with the server
        // - using PRE-pipeline to get it done in front of any e.g send or request that potentially could
        // trigger a publish (on the server side) which we should now get.
        _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
            type: MessageType.SUB,
            endpointId: topicId
        ), true);
        // The subscription must now be assumed sent to the server (ref unsubscription)
        subs.subscriptionSentToServer = true;
      }
      else {
        // -> No, HELLO not yet sent. Make it happen Real Soon Now.
        // HELLO handling will do the subscription
        // We must however force pipeline processing since there might be nothing in the pipelines.
        _forcePipelineProcessing = true;
        // We must also "force open" the MatsSocket, i.e. "emulate" that an information bearing message is enqueued.
        _matsSocketOpen = true;
        // Run the pipeline (use "later", there might be more subs or messages to come from client)
        _evaluatePipelineLater();
      }
    }
  }

  /// Removes a previously added [subscribe]. If there are no more listeners for this topic,
  /// it is de-subscribed from the server. If the 'messageCallback' was not already registered, an error is
  /// emitted, but the method otherwise returns silently.
  ///
  /// - [topicId] the topic id to unsubscribe from.
  /// - [messageCallback] the messageCallback to remove - must be the same as added with [subscribe].
  void deleteSubscription(String topicId, MessageEventHandler messageCallback) {
    var subs = _subscriptions[topicId];
    if (subs == null) {
      throw ArgumentError.value(topicId, 'The topicId [$topicId] had no subscriptions!'
          ' (thus definitely not this [$messageCallback].');
    }
    var idx = subs.listeners.indexOf(messageCallback);
    if (idx == -1) {
      error('subscription_not_found', 'The specified messageCallback [$messageCallback]'
          ' was not subscribed with Topic [$topicId].');
      return;
    }
    subs.listeners.removeAt(idx);

    // :: Only need to send unsubscription if we already are subscribed

    // ?: Are we empty of listeners, AND we are already subscribed with Server?
    if ((subs.listeners.isEmpty) && subs.subscriptionSentToServer) {
      // -> Yes, we are empty of listeners, and the subscription is already sent
      // Send message to unsubscribe this TopicId with the server
      // - using PRE-pipeline since subscriptions are using that, and we need subs and de-subs in sequential correct order
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.UNSUB,
          endpointId: topicId
      ), true);
      // Remove locally
      _subscriptions.remove(topicId);
    }
  }

  /// "Fire-and-forget"-style send-a-message. The returned promise is Resolved when the Server receives and accepts
  /// the message for processing, while it is Rejected if the Server denies it.
  ///
  /// Single named parameter for config:
  ///
  ///  * suppressInitiationProcessedEvent: If <code>true</code>, no event will be sent to listeners added
  ///         using [addInitiationProcessedEventListener()].
  ///
  /// - [endpointId] the Server MatsSocket Endpoint/Terminator that this message should go to.
  /// - [traceId] the TraceId for this message - will go through all parts of the call, including the Mats flow.
  /// - [message] the actual message for the Server MatsSocket Endpoint.
  /// - [suppressInitiationProcessedEvent] If [:true:], no event will be sent to listeners added
  ///     using [addInitiationProcessedEventListener()]
  Future<ReceivedEvent> send(String endpointId, String traceId, dynamic message,
      {bool suppressInitiationProcessedEvent = false}) {
    final handler = Completer<ReceivedEvent>();
    final initiation = _Initiation(suppressInitiationProcessedEvent, debug ?? 0, handler.complete, handler.completeError);
    final envelope = MatsSocketEnvelopeDto(
        type: MessageType.SEND,
        endpointId: endpointId,
        traceId: traceId,
        message: message
    );

    _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, null);

    return handler.future;
  }


  /// Perform a Request, and have the reply come back via the returned Future. As opposed to Send, where the
  /// returned Future is resolved when the server accepts the message, the Future is now resolved by the Reply.
  /// To get information of whether the server accepted or did not accept the message, you can provide either
  /// a receivedCallback function (set the 'config' parameter to this function) or set the two config properties
  /// 'ackCallback' and 'nackCallback' to functions. If you supply the single function variant, this is equivalent
  /// to setting both ack- and nackCallback to the same function. The [ReceivedEvent]'s type will distinguish
  /// between [ReceivedEventType.ACK] or [ReceivedEventType.NACK].
  ///
  /// The request can be configured using the named parameters as follows:
  ///
  /// * **<code>receivedCallback</code>**: {function} invoked when the Server receives the event and either ACK or NACKs it
  ///    - or when [MessageEventType.TIMEOUT] or [MessageEventType.SESSION_CLOSED] happens.
  ///    This overrides the ack- and nackCallbacks.
  /// * **<code>ackCallback</code>**: {function} invoked when the Server receives the event and ACKs it.
  /// * **<code>nackCallback</code>**: {function} invoked when the Server receives the event and NACKs it
  ///    - or when [MessageEventType.TIMEOUT] or [MessageEventType.SESSION_CLOSED] happens.
  /// * **<code>timeout</code>**: number of milliseconds before the Client times out the Server reply. When this happens,
  ///    the 'nackCallback' (or receivedCallback if this is used) is invoked with a [ReceivedEvent] of
  ///    type [ReceivedEventType.TIMEOUT], and the Request's Future will be *rejected* with a
  ///    [MessageEvent] of type [MessageEventType.TIMEOUT].
  /// * **<code>suppressInitiationProcessedEvent</code>**: if <code>true</code>, no event will be sent to listeners
  ///    added using [addInitiationProcessedEventListener].
  /// * **<code>debug</code>**: If set, this specific call flow overrides the global [MatsSocket.debug] setting, read
  ///    more about debug and [DebugOption]s there.
  ///
  /// **Note on event ordering:** [ReceivedEvent]s shall always be delivered *before* [MessageEvent]s.
  /// This means that for a *request*, if receivedCallback (or ack- or nackCallback) is provided, it shall be
  /// invoked *before* the return Reply-Future will be settled. For more on event ordering wrt. message
  /// processing, read [InitiationProcessedEvent].
  ///
  /// - [endpointId] the Server MatsSocket Endpoint that this message should go to.
  /// - [traceId] the TraceId for this message - will go through all parts of the call, including the Mats flow.
  /// - [message] the actual message for the Server MatsSocket Endpoint.
  Future<MessageEvent> request(String endpointId, String traceId, dynamic message, {
    Function(ReceivedEvent)? receivedCallback,
    Function(ReceivedEvent)? ackCallback,
    Function(ReceivedEvent)? nackCallback,
    bool suppressInitiationProcessedEvent = false,
    Duration? timeout,
    int? debug
  }) {
    // :: Handle the different configOrCallback situations
    assert(receivedCallback == null ||
        ackCallback == null, 'Don\'t provide both receivedCallback and ackCallback');
    assert(receivedCallback == null ||
        nackCallback == null, 'Don\'t provide both receivedCallback and nackCallback');

    final initiation = _Initiation(
        suppressInitiationProcessedEvent,
        // Use provided debug flags, or fall back to defaults. If they are also null, use 0.
        debug ?? this.debug ?? 0,
        ackCallback ?? receivedCallback,
        nackCallback ?? receivedCallback
    );

    final request = _Request.request(timeout ?? requestTimeout);

    final envelope = MatsSocketEnvelopeDto(
        type: MessageType.REQUEST,
        endpointId: endpointId,
        message: message,
        timeout: timeout
    );

    _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, request);

    return request.future;
  }

  /// Perform a Request, but send the reply to a specific client terminator registered on this MatsSocket instance.
  /// The returned Future functions as for Send, since the reply will not go to the Future, but to the
  /// terminator. Notice that you can set any CorrelationInformation object which will be available for the Client
  /// terminator when it receives the reply - this is kept on the client (not serialized and sent along with
  /// request and reply), so it can be any object: An identifier, some object to apply the result on, or even a
  /// function.
  ///
  /// The request can be configured using the named parameters as follows:
  ///
  ///  * **<code>timeout</code>**: number of milliseconds before the Client times out the Server reply. When this happens,
  ///         the returned Future is <i>rejected</> with a [ReceivedEvent] of
  ///         type [ReceivedEventType.TIMEOUT], and the specified Client Terminator will have its
  ///         rejectCallback invoked with a [MessageEvent] of type [MessageEventType.TIMEOUT].
  ///  * **<code>suppressInitiationProcessedEvent</code>**: if <code>true</code>, no event will be sent to listeners added
  ///         using [addInitiationProcessedEventListener()].
  ///  * **<code>debug</code>**: If set, this specific call flow overrides the global [MatsSocket.debug] setting, read
  ///         more about debug and [DebugOption]s there.
  ///
  /// **Note on event ordering:** [ReceivedEvent]s shall always be delivered before [MessageEvent]s. This means
  /// that for a *requestReplyTo*, the returned Received-Future shall be settled *before* the
  /// Terminator gets its resolve- or rejectCallback invoked. For more on event ordering wrt. message
  /// processing, read [InitiationProcessedEvent].
  ///
  /// - [endpointId] the Server MatsSocket Endpoint that this message should go to.
  /// - [traceId] the TraceId for this message - will go through all parts of the call, including the Mats flow.
  /// - [message] the actual message for the Server MatsSocket Endpoint.
  /// - [replyToTerminatorId] which Client Terminator the reply should go to
  /// - [correlationInformation] information that will be available to the Client Terminator
  ///     (in [MessageEvent.correlationInformation]) when the reply comes back.
  /// - [timeout] optional timeout to wait for before sending a reject error to the [replyToTerminatorId].
  Future<ReceivedEvent> requestReplyTo(String endpointId, String traceId, dynamic message, replyToTerminatorId, {
    dynamic correlationInformation,
    bool suppressInitiationProcessedEvent = false,
    Duration? timeout,
    int? debug
  }) {
    // ?: Do we have the Terminator the client requests reply should go to?
    if (!_terminators.containsKey(replyToTerminatorId)) {
      // -> No, we do not have this. Programming error from app.
      throw ArgumentError.value(replyToTerminatorId, 'replyToTerminatorId', 'The Client Terminator [$replyToTerminatorId] is not present!');
    }
    final receiveHandler = Completer<ReceivedEvent>.sync();

    final initiation = _Initiation(
        suppressInitiationProcessedEvent,
        // Use provided debug flags, or fall back to defaults. If they are also null, use 0.
        debug ?? this.debug ?? 0,
        receiveHandler.complete,
        receiveHandler.completeError
    );

    final request = _Request.requestReply(timeout ?? requestTimeout, replyToTerminatorId, correlationInformation);

    final envelope = MatsSocketEnvelopeDto(
        type: MessageType.REQUEST,
        endpointId: endpointId,
        message: message,
        timeout: timeout
    );

    _addInformationBearingEnvelopeToPipeline(envelope, traceId, initiation, request);

    return receiveHandler.future;
  }

  /// Synchronously flush any pipelined messages, i.e. when the method exits, webSocket.send(..) has been invoked
  /// with the serialized pipelined messages, *unless* the authorization had expired (read more at
  /// [setCurrentAuthorization] and [setAuthorizationExpiredCallback]).
  void flush() {
    // Clear the "auto-pipelining" timer
    _evaluatePipelineLater_timer?.cancel();
    // Do flush
    _evaluatePipelineSend();
  }

  /// Closes any currently open WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION (4000).
  /// The session will also be closed out of band via [MatsSocketPlatform.outOfBandCloseSession]
  /// Upon receiving the WebSocket close, the server terminates the MatsSocketSession.
  /// The MatsSocket instance's SessionId is made undefined. If there currently is a pipeline,
  /// this will be dropped (i.e. messages deleted), any outstanding receiveCallbacks
  /// (from Requests) are invoked, and received Futures (from sends) are rejected, with type
  /// [ReceivedEventType.SESSION_CLOSED], outstanding Reply Futures (from Requests)
  /// are rejected with [MessageEventType.SESSION_CLOSED]. The effect is to cleanly shut down the
  /// MatsSocketSession (all session data removed from server), and also clean the MatsSocket instance.
  ///
  /// Afterwards, the MatsSocket can be started up again by sending a message - keeping its configuration wrt.
  /// terminators, endpoints and listeners. As The SessionId on this client MatsSocket was cleared (and the
  /// previous Session on the server is deleted), this will result in a new server side Session. If you want a
  /// totally clean MatsSocket instance, then just ditch the current instance and make a new one (which then will
  /// have to be configured with terminators etc).
  ///
  /// <b>Note: A 'beforeunload' event handler is registered on 'window' (if present), which invokes this
  /// method</b>, so that if the user navigates away, the session will be closed.
  ///
  /// - [reason] reason short descriptive string. Will be supplied with the webSocket close reason string,
  ///     and must therefore be quite short (max 123 chars).
  Future close(String reason) async {
    // Fetch properties we need before clearing state
    final Uri existingWebSocketUri = _currentWebSocketUri;
    final String? existingSessionId = sessionId;
    _logger.info(() => 'close(): Closing MatsSocketSession, id:[$existingSessionId] due to [$reason], currently connected: [${_webSocket?.url ?? "not connected"}]');

    // :: In-band Session Close: Close the WebSocket itself with CLOSE_SESSION Close Code.
    // ?: Do we have _webSocket?
    if (_webSocket != null) {
      // -> Yes, so close WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION 4000.
      _logger.info(' \\-> WebSocket is open, so we perform in-band Session Close by closing the WebSocket with MatsSocketCloseCode.CLOSE_SESSION (4000), and reason: \'From client: $reason\'');
      // Perform the close
      _webSocket!.close(MatsSocketCloseCodes.CLOSE_SESSION.code, 'From client: $reason');
    }

    // Close Session and clear all state of this MatsSocket.
    _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();

    // :: Out-of-band Session Close
    // ?: Do we have a sessionId?
    if (existingSessionId != null) {
      if (_outOfBandClose is bool) {
        // ?: False?
        if (!(_outOfBandClose as bool)) {
          // -> Nothing to do
          return;
        }
        // E-> No, it's true - do default.
        final httpUri = existingWebSocketUri.scheme == 'wss'
            ? existingWebSocketUri.replace(scheme: 'https')
            : existingWebSocketUri.replace(scheme: 'http');

        final closeUri = httpUri.replace(
            path: '${existingWebSocketUri.path}/close_session',
            queryParameters: {'session_id': existingSessionId }
        );
        await platform.outOfBandCloseSession(closeUri);
      }
      else if (_outOfBandClose is String) {
        // -> String shall be an URI, to which we concatenate the sessionId
        String appended = (_outOfBandClose as String) + existingSessionId;
        final closeUri = Uri.parse(appended);
        await platform.outOfBandCloseSession(closeUri);
      }
      else {
        // -> Must be a OutOfBandClose
        final specifiedOutOfBandClose = _outOfBandClose as OutOfBandClose;
        _logger.info(() => ' \\-> Out-of-band close, invoking specified OutOfBandClose instance,'
            ' with URI: $existingWebSocketUri, sessionId: $existingSessionId');
        specifiedOutOfBandClose(existingWebSocketUri, existingSessionId);
      }
    }
  }

  /// Effectively emulates "lost connection" - **Used in testing**.
  ///
  /// If the "disconnect" parameter is true, it will disconnect with [MatsSocketCloseCodes.DISCONNECT]
  /// instead of [MatsSocketCloseCodes.RECONNECT], which will result in the MatsSocket not immediately
  /// starting the reconnection procedure until a new message is added.
  ///
  /// - [reason] {String} a string saying why.
  /// - [disconnect] {Boolean} whether to close with [MatsSocketCloseCodes.DISCONNECT] instead of
  ///     [MatsSocketCloseCodes.RECONNECT] - default `false`. AFAIK, only useful in testing..!
  void reconnect(String reason, [bool disconnect = false]) {
    var closeCode = disconnect ? MatsSocketCloseCodes.DISCONNECT : MatsSocketCloseCodes.RECONNECT;
    _logger.info(() => 'reconnect(): Closing WebSocket with CloseCode \'${closeCode.name} (${closeCode.code})\','
        ' MatsSocketSessionId:[$sessionId] due to [$reason], currently connected: [${((_webSocket == null) ? _webSocket!.url : "not connected")}]');
    if (_webSocket == null) {
      throw StateError('There is no live WebSocket to close with ${closeCode.name} closeCode!');
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
    _webSocket!.onMessage = null;
    // Now closing the WebSocket (thus getting the 'onclose' handler invoked - just as if we'd lost connection, or got this RECONNECT close from Server).
    _webSocket!.close(closeCode.code, reason);
  }

  /// Convenience method for making random strings meant for user reading, e.g. as a part of a good TraceIds, since this
  /// alphabet only consists of lower and upper case letters, and digits. To make a traceId "unique enough" for
  /// finding it in a log system, a length of 6 should be plenty. The alphabet is 62 chars.
  ///
  /// - [length] length how long the string should be, default is 6.
  String randomId([int length = 6]) {
    var result = '';
    for (var i = 0; i < length; i++) {
      result += _randomAlphabet[_rnd.nextInt(_randomAlphabet.length)];
    }
    return result;
  }

  /// Convenience method for making random strings for correlationIds, not meant for human reading as the alphabet
  /// consist of all visible ACSII chars that won't be quoted in a JSON string. Should you want to make actual Session
  /// cookies or similar, that is, ids being very unique and hard to brute force, you would want to have a longer length,
  /// use e.g. length=16. The alphabet is 92 chars.
  ///
  /// - [length] how long the string should be, default is 10.
  String randomCId([int length = 10]) {
    var result = '';
    for (var i = 0; i < length; i++) {
      result += _randomJsonAlphabet[_rnd.nextInt(_randomJsonAlphabet.length)];
    }
    return result;
  }

  // https://stackoverflow.com/a/12646864/39334
  void _shuffleList(List items) {
    for (var i = items.length - 1; i > 0; i--) {
      var j = _rnd.nextInt(i + 1);
      var temp = items[i];
      items[i] = items[j];
      items[j] = temp;
    }
  }

  void _beforeunloadHandler(dynamic event) {
    close('$CLIENT_LIB_NAME_AND_VERSION unload');
  }

  void error(String type, String msg, [Object? error]) {
    final event = ErrorEvent(type, msg, error);
    // Notify ErrorEvent listeners, synchronously.

    for (var listener in _errorEventListeners) {
      try {
        listener(event);
      } catch (err, stack) {
        _logger.severe('Caught error when notifying ErrorEvent listeners [$listener] - NOT notifying using ErrorEvent in fear of creating infinite recursion.', err, stack);
      }
    }

    if (error is Error) {
      _logger.severe('$type: $msg', error, error.stackTrace);
    }
    else {
      _logger.severe('$type: $msg', error);
    }
  }

  void _clearWebSocketStateAndInfrastructure() {
    _logger.fine(() => 'clearWebSocketStateAndInfrastructure(). Current WebSocket: [$_webSocket] - nulling.');
    // Stop pinger
    _stopPinger();
    // Remove beforeunload eventlistener
    platform.deregisterBeforeunload(_beforeunloadHandler);
    // Reset Reconnect state vars
    _resetReconnectStateVars();
    // Make new RetransmitGuard - so that any previously "guarded" messages now will be retransmitted.
    _outboxInitiations_RetransmitGuard = randomCId(5);
    // :: Clear out _webSocket;
    if (_webSocket != null) {
      // We don't want the onclose callback invoked from this event that we initiated ourselves.
      _webSocket!.onClose = null;
      // We don't want any messages either
      _webSocket!.onMessage = null;
      // Also drop onerror for good measure.
      _webSocket!.onError = null;
    }
    _webSocket = null;
  }

  void _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages() {
    _logger.fine(() => 'closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages(). Current WebSocket: [$_webSocket].');
    // Clear state
    sessionId = null;
    _state = ConnectionState.NO_SESSION;

    _clearWebSocketStateAndInfrastructure();

    // :: Clear pipeline
    _pipeline.clear();

    // Were now also NOT open, until a new message is enqueued.
    _matsSocketOpen = false;

    // :: NACK all outstanding messages
    for (var cmid in _outboxInitiations.keys.toList()) {
      var initiation = _outboxInitiations.remove(cmid)!;

      _logger.fine('Close Session: Clearing outstanding Initiation [${initiation.envelope!.type}] to [${initiation.envelope!.endpointId}], cmid:[${initiation.envelope!.clientMessageId}], TraceId:[${initiation.envelope!.traceId}].');
      _completeReceived(ReceivedEventType.SESSION_CLOSED, initiation, DateTime.now());
    }

    // :: Reject all Requests
    for (var cmid in _outstandingRequests.keys.toList()) {
      var request = _outstandingRequests.remove(cmid)!;

      _logger.fine('Close Session: Clearing outstanding REQUEST to ${request.envelope.endpointId}, cmid:${request.envelope.clientMessageId}, TraceId:${request.envelope.traceId}. ($request)');
      _completeRequest(request, MessageEventType.SESSION_CLOSED, MatsSocketEnvelopeDto.empty(), DateTime.now());
    }
  }

  void _addInformationBearingEnvelopeToPipeline(MatsSocketEnvelopeDto envelope, String traceId,
      _Initiation initiation, _Request? request) {

    // This is an information-bearing message, so now this MatsSocket instance is open.
    _matsSocketOpen = true;
    var now = DateTime.now();
    var performanceNow = platform.performanceTime();

    // Add the traceId to the message
    envelope.traceId = traceId;
    // Add next message Sequence Id
    var thisMessageSequenceId = _messageSequenceId++;
    envelope.clientMessageId = thisMessageSequenceId.toString();

    // :: Debug
    // ?: Is the debut not 0?
    if (initiation.debug != 0) {
      // -> Yes, not 0 - so send it in request.
      envelope.requesterDebug = initiation.debug;
    }
    // ?: If the last transferred was /something/, while now it is 0, then we must sent it over to reset
    if ((initiation.debug == 0) && (_lastDebugOptionsSentToServer != 0)) {
      // -> Yes, was reset to 0 - so must send to server.
      envelope.requesterDebug = 0;
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
    initiation.messageAcked_PerformanceNow = null;

    // Initiation state created - store the outstanding Send or Request
    _outboxInitiations[envelope.clientMessageId] = initiation;

    // ?: Do we have a request?
    if (request != null) {
      // -> Yes, this is a REQUEST!
      // Store the initiation
      request.initiation = initiation;
      // Store the outgoing envelope (could have gotten it through request.initiation, but too much hassle too many places)
      request.envelope = envelope;

      // Make timeouter
      request.timer = Timer(request.timeout, () {
        // :: The Request timeout was hit.
        var performanceNow = platform.performanceTime();
        _logger.fine('TIMEOUT! Request with TraceId:${request.envelope.traceId}, '
            'cmid:${request.envelope.clientMessageId} '
            'overshot timeout [${(performanceNow - request.initiation.messageSent_PerformanceNow)} '
            'ms of ${request.timeout}]');
        // Check if we've gotten the ACK/NACK
        var initiation = _outboxInitiations.remove(thisMessageSequenceId.toString());
        // ?: Was the initiation still present?
        if (initiation != null) {
          // -> Yes, still present, so we have not gotten the ACK/NACK from Server yet, thus NACK it with ReceivedEventType.TIMEOUT
          _completeReceived(ReceivedEventType.TIMEOUT, initiation, DateTime.now());
        }
        // :: Complete the Request with MessageEventType.TIMEOUT

        /*
         * NOTICE!! HACK-ALERT! The ordering of events wrt. Requests is as such:
         * 1. ReceivedEvent (receivedCallback for requests, and Received-Future for requestReplyTo)
         * 2. InitiationProcessedEvent stored on matsSocket.initiations
         * 3. InitiationProcessedEvent listeners
         * 4. MessageEvent (Reply-Future for requests, Terminator callbacks for requestReplyTo)
         *
         * WITH a requestReplyTo, the ReceivedEvent becomes async in nature, since requestReplyTo returns
         * a Future<ReceivedEvent>. Also, with a requestReplyTo, the completing of the requestReplyTo is
         * then done on a Terminator, using its specified callbacks - and this is done using
         * setTimeout(.., 0) to "emulate" the same async-ness as a Reply-Future with ordinary requests.
         * However, the timing between the ReceivedEvent and InitiationProcessedEvent then becomes
         * rather shaky. Therefore, IF the initiation is still in place (ReceivedEvent not yet issued),
         * AND this is a requestReplyTo, THEN we delay the completion of the Request (i.e. issue
         * InitiationProcessedEvent and MessageEvent) to be more certain that the ReceivedEvent is
         * processed before the rest.
         */
        // ?: Did we still have the initiation in place, AND this is a requestReplyTo?
        if (initiation != null && request.replyToTerminatorId != null) {
          // -> Yes, the initiation was still in place (i.e. ReceivedEvent not issued), and this was
          // a requestReplyTo:
          // Therefore we delay the entire completion of the request (InitiationProcessedEvent and
          // MessageEvent), to be sure that they happen AFTER the ReceivedEvent issued above.
          Timer(Duration(milliseconds: 50), () {
            _completeRequest(request, MessageEventType.TIMEOUT, MatsSocketEnvelopeDto.empty(), DateTime.now());
          });
        } else {
          // -> No, either the initiation was already gone (ReceivedEvent already issued), OR it was
          // not a requestReplyTo:
          // Therefore, we run the completion right away (InitiationProcessedEvent is sync, while
          // MessageEvent is a Future settling).
          _completeRequest(request, MessageEventType.TIMEOUT, MatsSocketEnvelopeDto.empty(), DateTime.now());
        }
      });

      // Request state created - store this outstanding Request.
      _outstandingRequests[thisMessageSequenceId.toString()] = request;
    }

    _addEnvelopeToPipeline_EvaluatePipelineLater(envelope);
  }

  /// Unconditionally adds the supplied envelope to the pipeline, and then evaluates the pipeline,
  /// invokeLater-style so as to get "auth-pipelining". Use flush() to get sync send.
  void _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto? envelope, [bool prePipeline = false]) {
      // ?: Should we add it to the pre-pipeline, or the ordinary?
      if (prePipeline) {
          // -> To pre-pipeline
          _logger.fine(() => 'ENQUEUE: Envelope of type ${envelope!.type} enqueued to PRE-pipeline: ${jsonEncode(envelope)}');
          _prePipeline.add(envelope);
      } else {
          // -> To ordinary pipeline.
          _logger.fine(() => 'ENQUEUE: Envelope of type ${envelope!.type} enqueued to pipeline: ${jsonEncode(envelope)}');
          _pipeline.add(envelope);
      }
      // Perform "auto-pipelining", by waiting a minimal amount of time before actually sending.
      _evaluatePipelineLater();
  }

  Timer? _evaluatePipelineLater_timer;

  void _evaluatePipelineLater() {
    _evaluatePipelineLater_timer?.cancel();
    _evaluatePipelineLater_timer = Timer(Duration(milliseconds: 10), () {
      _evaluatePipelineLater_timer = null;
      _evaluatePipelineSend();
    });
  }

  /// Sends pipelined messages
  void _evaluatePipelineSend() {
    // ?: Are there any messages in pipeline or PRE-pipeline,
    // or should we force pipeline processing (either to get HELLO, SUB or AUTH over)
    if ((_pipeline.isEmpty) && !_forcePipelineProcessing) {
      // -> No, no message in pipeline, and we should not force processing to get HELLO or AUTH over
      // Nothing to do, drop out.
      return;
    }
    // ?: Is the MatsSocket open yet? (I.e. an information-bearing message has been enqueued)
    if (!_matsSocketOpen) {
      // -> No, so ignore this invocation - come back when there is something to send!
      _logger.fine('evaluatePipelineSend(), but MatsSocket is not open - ignoring.');
      return;
    }
    // ?: Do we have authorization?!
    if (_authorization == null) {
      // -> No, authorization not present.
      _requestNewAuthorizationFromApp('Authorization not present',
          AuthorizationRequiredEvent(AuthorizationRequiredEventType.NOT_PRESENT));
      return;
    }

    // ----- After this point, _authorization is set (Can't get past above if without returning otherwise)

    // ?: Check whether we have expired authorization
    if ((_expirationTimestamp != null)
        && (_expirationTimestamp!.subtract(_roomForLatencyDuration).isBefore(DateTime.now()))) {
      // -> Yes, authorization is expired.
      _requestNewAuthorizationFromApp('Authorization is expired',
          AuthorizationRequiredEvent(AuthorizationRequiredEventType.EXPIRED, _expirationTimestamp));
      return;
    }
    // ?: Check that we are not already waiting for new auth
    // (This is needed here since we might actually have valid authentication, but server has still asked us, via "REAUTH", to get new)
    if (_authExpiredCallbackInvoked_EventType != null) {
      _logger.fine('We have asked app for new authorization, and still waiting for it.');
      return;
    }

    // ----- After this point, we have *valid* authentication, and should send pipeline.

    // ?: Are we trying to open websocket?
    if (_webSocketConnecting) {
      _logger.fine('evaluatePipelineSend(): WebSocket is currently connecting. Cannot send yet.');
      // -> Yes, so then the socket is not open yet, but we are in the process.
      // Return now, as opening is async. When the socket opens, it will re-run 'evaluatePipelineSend()'.
      return;
    }

    // ?: Is the WebSocket present?
    if (_webSocket == null) {
      _logger.fine('evaluatePipelineSend(): WebSocket is not present, so initiate creation. Cannot send yet.');
      // -> No, so go get it.
      _initiateWebSocketCreation();
      // Returning now, as opening is async. When the socket opens, it will re-run 'evaluatePipelineSend()'.
      return;
    }

    // ----- WebSocket is open, so send any outstanding messages!!

    // ?: Have we sent HELLO?
    if (!_helloSent) {
      // -> No, HELLO not sent, so we create it now (auth is present, check above)
      var helloMessage = MatsSocketEnvelopeDto(
          type: MessageType.HELLO,
          appName: appName,
          appVersion: appVersion,
          clientLibAndVersion: '$CLIENT_LIB_NAME_AND_VERSION; ${platform.runningOnVersions}',
          authorization: _authorization
          // This is guaranteed to be in place and valid, see above
      );
      // ?: Have we requested a reconnect?
      if (sessionId != null) {
        _logger.info('HELLO not send, adding to pre-pipeline. HELLO ("Reconnect") to MatsSocketSessionId: $sessionId');
        // -> Evidently yes, so add the requested reconnect-to-sessionId.
        helloMessage.sessionId = sessionId;
      } else {
        // -> We want a new session (which is default anyway)
        _logger.info('HELLO not sent, adding to pre-pipeline. HELLO ("New"), we will get assigned a MatsSocketSessionId upon WELCOME.');
      }
      // Add the HELLO to the prePipeline
      _prePipeline.insert(0, helloMessage);
      // We will now have sent the HELLO, so do not send it again.
      _helloSent = true;
      // We've sent the current auth
      _lastAuthorizationSentToServer = _authorization;

      // :: Handle subscriptions
      for (var topicId in _subscriptions.keys) {
        var subs = _subscriptions[topicId]!;
        // ?: Do we have subscribers, but not sent to server?
        if ((subs.listeners.isNotEmpty) && (!subs.subscriptionSentToServer)) {
          // -> Yes, so we need to subscribe
          _prePipeline.add(MatsSocketEnvelopeDto(
            type: MessageType.SUB,
            endpointId: topicId,
            serverMessageId: subs.lastSmid
          ));
        }
        // ?: Do we NOT have subscribers, but sub is sent to Server?
        if ((subs.listeners.isEmpty) && (subs.subscriptionSentToServer)) {
          // -> Yes, so we need to unsubscribe - and delete the subscription
          _prePipeline.add(MatsSocketEnvelopeDto(
            type: MessageType.UNSUB,
            endpointId: topicId
          ));
          // Delete this local subscription.
          _subscriptions.remove(topicId);
        }
      }
    }

    // ?: Have we sent HELLO, i.e. session is "active", but the authorization has changed since last we sent over authorization?
    if (_helloSent && (_lastAuthorizationSentToServer != _authorization)) {
      // -> Yes, it has changed, so add it to some envelope - either last in pipeline, or if empty pipe, then make an AUTH message.
      if (_pipeline.isNotEmpty) {
        var lastEnvelope = _pipeline[_pipeline.length - 1]!;
        _logger.fine("Authorization has changed, and there is a message in pipeline of type ${lastEnvelope.type}, so so we add 'auth' to it.");
        lastEnvelope.authorization = _authorization;
      } else {
        _logger.fine('Authorization has changed, but there is no message in pipeline, so we add an AUTH message now.');
        _pipeline.add(MatsSocketEnvelopeDto(type: MessageType.AUTH, authorization: _authorization));
      }
      // The current authorization is now sent
      _lastAuthorizationSentToServer = _authorization;
    }

    // We're now doing a round of pipeline processing, so turn of forcing.
    _forcePipelineProcessing = false;

    // :: Send PRE-pipeline messages, if there are any
    // (Before the HELLO is sent and sessionId is established, the max size of message is low on the server)
    if (_prePipeline.isNotEmpty) {
      if (_logger.isLoggable(Level.FINEST)) {
        _logger.finest('Flushing prePipeline of ${_prePipeline.length} messages: ${jsonEncode(_prePipeline)}');
      }
      else {
        _logger.info(() => 'Flushing prePipeline of ${_prePipeline.length} messages: ${_prePipeline
            .where((m) => m!.type != null)
            .map((m) => m!.type.name)
            .join(', ')}');
      }
      _webSocket!.send(jsonEncode(_prePipeline));
      // Clear prePipeline
      _prePipeline.length = 0;
    }
    // :: Send any pipelined messages.
    if (_pipeline.isNotEmpty) {
      if (_logger.isLoggable(Level.FINEST)) {
        _logger.finest('Flushing pipeline of ${_pipeline.length} messages: ${jsonEncode(_pipeline)}');
      }
      else {
        _logger.info(() => 'Flushing pipeline of ${_pipeline.length} messages: ${_pipeline
            .where((m) => m!.type != null)
            .map((m) => m!.type.name)
            .join(', ')}');
      }
      _webSocket!.send(jsonEncode(_pipeline));
      // Clear pipeline
      _pipeline.length = 0;
    }
  }

  void _requestNewAuthorizationFromApp(String what, AuthorizationRequiredEvent event) {
    // ?: Have we already asked app for new auth?
    if (_authExpiredCallbackInvoked_EventType != null) {
      // -> Yes, so just return.
      _logger.fine('$what, but we\'ve already asked app for it due to: [$_authExpiredCallbackInvoked_EventType].');
      return;
    }
    // E-> No, not asked for auth - so do it.
    _logger.fine("$what. Will not send pipeline until gotten. Invoking 'authorizationExpiredCallback', type:[${event.type}].");
    // We will have asked for auth after this.
    _authExpiredCallbackInvoked_EventType = event.type;

    // Assert that we have callback
    if (_authorizationExpiredCallback == null) {
      // -> We do not have callback! This is actually disaster.
      var reason = 'From Client: Need new authorization, but missing \'authorizationExpiredCallback\'. This is fatal, cannot continue.';
      error('missingauthcallback', reason);
      // !! We need to close down
      if (_webSocket != null) {
        // -> Yes, so close WebSocket with MatsSocket-specific CloseCode CLOSE_SESSION 4000.
        _logger.info(' \\-> WebSocket is open, so we perform in-band Session Close by closing the WebSocket with MatsSocketCloseCode.CLOSE_SESSION (4000).');
        // Perform the close
        _webSocket!.close(MatsSocketCloseCodes.CLOSE_SESSION.code, reason);
      }
      // Close Session and clear all state of this MatsSocket.
      _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();
      // Notify SessionClosedEventListeners - with a fake CloseEvent
      _notifySessionClosedEventListeners(MatsSocketCloseEvent(
          MatsSocketCloseCodes.VIOLATED_POLICY.code,
          reason,
          _outboxInitiations.length
      ));

      return;
    }
    // E-> We do have 'authorizationExpiredCallback', so ask app for new auth
    _authorizationExpiredCallback!(event);
  }
  int _connectionAttempt = 0; // A counter of how many times a connection attempt has been performed, starts at 0th attempt.

  int _urlIndexCurrentlyConnecting = 0; // Cycles through the URLs
  int _connectionAttemptRound = 0; // When cycled one time through URLs, this increases.
  late Uri _currentWebSocketUri; // Will be set before any use.

  static const int _connectionTimeoutBase = 500; // Base timout, milliseconds. Doubles, up to max defined below.
  static const int _connectionTimeoutMinIfSingleUrl = 5000; // Min timeout if single-URL configured, milliseconds.
  // Based on whether there is multiple URLs, or just a single one, we choose the short "timeout base", or a longer one, as minimum.
  final int _connectionTimeoutMin; // Set in constructor.
  static const int _connectionTimeoutMax = 15000; // Milliseconds max between connection attempts.

  // Way to let integration tests checking failed connections take a bit less time..!
  int? maxConnectionAttempts;

  int _maxConnectionAttempts() {
    // ?: Have maxConnectionAttempts been set?
    if (maxConnectionAttempts != null) {
      // -> Yes, so use this -
      return maxConnectionAttempts!;
    }

    return sessionId != null
        ? 5760 // The default should be about a day..! 15 sec per attempt: 5760*15 sec = 60*60*24 sec
        : 60; // Way fewer attempts if no session ID is present.
  }

  void _increaseReconnectStateVars() {
    _connectionAttempt++;
    _urlIndexCurrentlyConnecting++;
    if (_urlIndexCurrentlyConnecting >= _useUrls.length) {
      _urlIndexCurrentlyConnecting = 0;
      _connectionAttemptRound++;
    }
    _currentWebSocketUri = _useUrls[_urlIndexCurrentlyConnecting];
    _logger.fine('_increaseReconnectStateVars(): round:[$_connectionAttemptRound], urlIndex:[$_urlIndexCurrentlyConnecting] = $_currentWebSocketUri');
  }

  void _resetReconnectStateVars() {
    _connectionAttempt = 0;
    _urlIndexCurrentlyConnecting = 0;
    _connectionAttemptRound = 0;
    _currentWebSocketUri = _useUrls[_urlIndexCurrentlyConnecting];
    _logger.fine('_resetReconnectStateVars(): round:[$_connectionAttemptRound], urlIndex:[$_urlIndexCurrentlyConnecting] =  $_currentWebSocketUri');
  }

  void _updateStateAndNotifyConnectionEventListeners(ConnectionEvent connectionEvent) {
    // ?: Should we log? Logging is on, AND (either NOT CountDown, OR CountDown == initialSeconds, OR Countdown == whole second).
    if (_logger.isLoggable(Level.FINE) && ((connectionEvent.type != ConnectionEventType.COUNTDOWN)
        || (connectionEvent.elapsed!.inMilliseconds == 0)
        || (connectionEvent.countdownSeconds.endsWith('.0')))) {
      _logger.fine('Sending ConnectionEvent to listeners [$connectionEvent]');
    }
    // ?: Is this a state?
    ConnectionState? currentConnectionState = connectionEvent.type.connectionState;
    if (currentConnectionState != null) {
      // -> Yes, this is a state - so update the state..!
      _state = currentConnectionState;
      _logger.fine('The ConnectionEventType [${connectionEvent.type}] is also a ConnectionState - setting MatsSocket state [$_state].');
    }

    // :: Notify all ConnectionEvent listeners.
    for (var listener in _connectionEventListener) {
      try {
        listener(connectionEvent);
      } catch (err) {
        error('notify ConnectionEvent listeners',
            'Caught error when notifying ConnectionEvent listeners [$listener] about [${connectionEvent.type}].', err);
      }
    }
  }

  void _notifySessionClosedEventListeners(MatsSocketCloseEvent closeEvent) {
    _logger.fine(() => 'Sending SessionClosedEvent to listeners: [$closeEvent]');
    for (var listener in _sessionClosedEventListeners) {
      try {
        listener(closeEvent);
      } catch (err) {
        error('notify SessionClosedEvent listeners', 'Caught error when notifying SessionClosedEvent listeners [$listener] about [$closeEvent].', err);
      }
    }
  }


  void _initiateWebSocketCreation() {
    // ?: Assert that we do not have the WebSocket already
    if (_webSocket != null) {
        // -> Damn, we did have a WebSocket. Why are we here?!
        throw StateError('Should not be here, as WebSocket is already in place!');
    }
    // ?: Verify that we are actually open - we should not be trying to connect otherwise.
    if (!_matsSocketOpen) {
        // -> We've been asynchronously closed - bail out from opening WebSocket
        throw StateError('The MatsSocket instance is closed, so we should not open WebSocket');
    }

    // ----- We do not already have a WebSocket and the MatsSocket instance is Open!

    // :: First need to check whether we have OK Authorization - if not, we must terminate entire connection procedure, ask for new, and start over.
    // Note: The start-over will happen when new auth comes in, _evaluatePipelineSend(..) is invoked, and there is no WebSocket there.
    // ?: Check whether we have expired authorization
    if ((_expirationTimestamp != null)
        && ((_expirationTimestamp!.subtract(_roomForLatencyDuration)).isBefore(DateTime.now()))) {
      // -> Yes, authorization is expired.
      _logger.fine(() => 'InitiateWebSocketCreation: Authorization is expired, we need new to continue.');
      // We are not connecting anymore
      _webSocketConnecting = false;
      // Request new auth
      _requestNewAuthorizationFromApp('expired', AuthorizationRequiredEvent(AuthorizationRequiredEventType.EXPIRED, _expirationTimestamp));
      return;
    }

    // ------ We have a valid, unexpired authorization token ready to use for connection

    // :: We are currently trying to connect! (This will be set to true repeatedly while in the process of opening)
    _webSocketConnecting = true;

    // Timeout: LESSER of "max" and "timeoutBase * (2^round)", which should lead to timeoutBase x1, x2, x4, x8 - but capped at max.
    // .. but at least '_connectionTimeoutMin', which also handles the special case of longer minimum if just 1 URL.
    // Shortcut exponential if we guaranteed would be at max, to avoid pow-overflow
    var timeoutMs = _connectionAttemptRound > 10
        ? _connectionTimeoutMax
        : math.max(_connectionTimeoutMin, math.min(_connectionTimeoutMax, _connectionTimeoutBase * math.pow(2, _connectionAttemptRound)));
    var timeout = Duration(milliseconds: timeoutMs as int);
    var attemptStart = DateTime.now();
    var currentCountdownTargetTimestamp = attemptStart;
    var targetTimeoutTimestamp = currentCountdownTargetTimestamp.add(timeout);
    Duration elapsed() {
      return DateTime.now().difference(attemptStart);
    }

    // About to create WebSocket, so notify our listeners about this.
    _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(ConnectionEventType.CONNECTING, _currentWebSocketUri, null, timeout, elapsed(), _connectionAttempt));

    Function()? preConnectOperationAbortFunction;
    WebSocket? websocketAttempt;
    late Timer countdownId;

    // :: Internal lambdas to manage the connection state machine.
    late Function() w_countDownTimer;
    late Function() w_abortAttempt;
    late Function() w_attemptPreConnectionOperation;
    late Function() w_connectTimeout_AbortAttemptAndReschedule;
    late Function() w_attemptWebSocket;
    late Function() w_connectFailed_RetryOrWaitForTimeout;

    /*
     * Make a "connection timeout" countdown,
     * This will re-invoke itself every 100 ms to create the COUNTDOWN events - until either cancelled by connect going through,
     *  or it reaches targetTimeoutTimestamp (timeout), where it aborts the attempt, bumps the state vars,
     *  and then re-runs the '_initiateWebSocketCreation' method.
     */
    w_countDownTimer = () {
      // ?: Assert that we're still open
      if (!_matsSocketOpen) {
        _logger.fine('When doing countdown rounds, we realize that this MatsSocket instance is closed! - stopping right here.');
        w_abortAttempt();
        return;
      }
      // :: Find next target
      while (currentCountdownTargetTimestamp.isBefore(DateTime.now())) {
        currentCountdownTargetTimestamp = currentCountdownTargetTimestamp.add(Duration(milliseconds: 100));
      }
      // ?: Have we now hit or overshot the target?
      if (currentCountdownTargetTimestamp.isAfter(targetTimeoutTimestamp)) {
        // -> Yes, we've hit target, so this did not work out - abort attempt, bump state vars, and reschedule the entire show.
        w_connectTimeout_AbortAttemptAndReschedule();
      } else {
        // -> No, we've NOT hit timeout-target, so sleep till next countdown-target, where we re-invoke ourselves (this w_countDownTimer())
        // Notify ConnectionEvent listeners about this COUNTDOWN event.
        _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(ConnectionEventType.COUNTDOWN, _currentWebSocketUri, null, timeout, elapsed(), _connectionAttempt));
        final sleep = math.max(5, currentCountdownTargetTimestamp.difference(DateTime.now()).inMilliseconds);
        countdownId = Timer(Duration(milliseconds: sleep), () {
          w_countDownTimer();
        });
      }
    };

    w_abortAttempt = () {
      // ?: Are we in progress with the PreConnectionOperation?
      if (preConnectOperationAbortFunction != null) {
        // -> Evidently still doing PreConnectionRequest - kill it.
        _logger.fine('  \\- Within PreConnectionOperation phase - invoking preConnectOperationFunction\'s abort() function.');
        // null out the 'preConnectOperationAbortFunction', as this is used for indication for whether the preConnectRequestFuture's resolve&reject should act.
        var abortFunctionTemp = preConnectOperationAbortFunction!;
        // Clear out
        preConnectOperationAbortFunction = null;
        // Invoke the abort.
        abortFunctionTemp();
      }

      // ?: Are we in progress with opening WebSocket?
      if (websocketAttempt != null) {
        // -> Evidently still trying to connect WebSocket - kill it.
        _logger.fine('  \\- Within WebSocket connect phase - clearing handlers and invoking webSocket.close().');
        websocketAttempt!.onOpen = null;
        websocketAttempt!.onError = (target, errorEvent) {
          _logger.fine(() => '!! websocketAttempt.onerror: Forced close by timeout, instanceId:[${target.webSocketInstanceId}], event:[$errorEvent]');
        };
        websocketAttempt!.onClose = (target, code, reason, closeEvent) {
          _logger.fine(() => '!! websocketAttempt.onclose: Forced close by timeout, instanceId:[${target.webSocketInstanceId}], event:[$closeEvent]');
        };
        // Close the current WebSocket connection attempt (i.e. abort connect if still trying).
        websocketAttempt!.close(MatsSocketCloseCodes.CLOSE_SESSION.code, 'WebSocket connect aborted');
        // Clear out the attempt
        websocketAttempt = null;
      }
    };

    w_attemptPreConnectionOperation = () {
      // :: Decide based on type of 'preconnectoperation' how to do the .. PreConnectOperation..!

      final preAuthHttpUri = _currentWebSocketUri.scheme == 'wss'
          ? _currentWebSocketUri.replace(scheme: 'https')
          : _currentWebSocketUri.replace(scheme: 'http');

      ConnectResult abortAndFuture;
      if (_preConnectOperation is bool) {
        // -> Use default impl
        if (!(_preConnectOperation as bool)) {
          throw AssertionError("Should not be here if _preConnectOperation is false");
        }
        abortAndFuture = platform.sendPreConnectAuthorizationHeader(preAuthHttpUri, _authorization!);
      }
      else if (_preConnectOperation is String) {
        // -> String shall be an URI
        final parsedUri = Uri.parse(_preConnectOperation as String);
        abortAndFuture = platform.sendPreConnectAuthorizationHeader(parsedUri, _authorization!);
      }
      else {
        // -> Must be a PreConnectOperation
        final specifiedPreConnectOperation = _preConnectOperation as PreConnectOperation;
        abortAndFuture = specifiedPreConnectOperation(_currentWebSocketUri, _authorization!);
      }

      // Deconstruct the return
      preConnectOperationAbortFunction = abortAndFuture.abortFunction as dynamic Function()?;
      var preConnectRequestFuture = abortAndFuture.responseStatusCode;

      // Handle the resolve or reject from the preConnectionOperation
      preConnectRequestFuture
          .then((statusMessage) {
        // -> Yes, good return - so go onto next phase, which is creating the WebSocket
        // ?: Are we still trying to perform the preConnectOperation? (not timed out)
        if (preConnectOperationAbortFunction != null) {
          // -> Yes, not timed out, so then we're good to go with the next phase
          _logger.info(() => 'PreConnectionOperation went OK [$statusMessage], going on to create WebSocket.');
          // Create the WebSocket
          w_attemptWebSocket();
        }
      }).catchError((statusMessage) {
        // -> No, bad return - so go for next
        // ?: Are we still trying to perform the preConnectOperation? (not timed out)
        if (preConnectOperationAbortFunction != null) {
          // -> Yes, not timed out, so then we'll notify about our failed attempt
          _logger.info(() => 'PreConnectionOperation failed [$statusMessage] - retrying.');
          // Go for next retry
          w_connectFailed_RetryOrWaitForTimeout();
        }
      });
    };

    w_attemptWebSocket = () {
      // We're not trying to perform the preConnectOperation anymore, so clear it.
      preConnectOperationAbortFunction = null;
      // :? Assert that we're not already trying to make a WebSocket
      if (websocketAttempt != null) {
        throw StateError('When going for attempt on creating WebSocket, there was already an attempt in place.');
      }

      // ?: Assert that we're still open
      if (!_matsSocketOpen) {
        _logger.info('Upon WebSocket.open, we realize that this MatsSocket instance is closed! - stopping right here.');
        w_abortAttempt();
        return;
      }

      // :: Actually create the WebSocket instance

      // If we have a PreConnectOperation, then we add add a query parameter to the URL to point this out.
      var url = (_preConnectOperation != false ? _currentWebSocketUri.replace(
          queryParameters: { 'preconnect': 'true'}) : _currentWebSocketUri);

      final webSocketInstanceId = randomId(6);
      _logger.fine(() => 'INSTANTIATING new WebSocket("$url", "matssocket") - InstanceId:[$webSocketInstanceId]');
      websocketAttempt = platform.createAndConnectWebSocket(url, 'matssocket', _authorization!);
      websocketAttempt!.webSocketInstanceId = webSocketInstanceId;

      // :: Add the handlers for this "trying to acquire" procedure.

      // Note: On failure, some environments will call error, then close, and some just error. We set up so that we
      // handle any order, and both, by removing handlers after getting the first.

      // Error: Log, updateState/notifyListeners, and start retry/wait.
      websocketAttempt!.onError = (target, errorEvent) {
        _logger.fine(() => 'Create WebSocket: error. InstanceId:[${target.webSocketInstanceId}], event:[$errorEvent]');
        // Some environments will call onClose afterward, and some not. We'll remove all handlers to be sure.
        websocketAttempt!.onError = null;
        websocketAttempt!.onClose = null;
        websocketAttempt!.onOpen = null;
        _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(
            ConnectionEventType.WAITING, _currentWebSocketUri, errorEvent, timeout, elapsed(), _connectionAttempt));
        w_connectFailed_RetryOrWaitForTimeout();
      };

      // Close: .. same as Error
      websocketAttempt!.onClose = (target, code, reason, closeEvent) {
        _logger.fine(() => 'Create WebSocket: close. InstanceId:[${target.webSocketInstanceId}], Code:$code, Reason:$reason, event: $closeEvent');
        // We'll remove all handlers now, since any other event would be bad at this time.
        websocketAttempt!.onError = null;
        websocketAttempt!.onClose = null;
        websocketAttempt!.onOpen = null;
        _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(
            ConnectionEventType.WAITING, _currentWebSocketUri, closeEvent, timeout, elapsed(), _connectionAttempt));
        w_connectFailed_RetryOrWaitForTimeout();
      };

      // Open: Success! Cancel countdown timer, and set WebSocket in MatsSocket, clear flags, set proper WebSocket event handlers including onMessage.
      websocketAttempt!.onOpen = (target, openEvent) {
        // First and foremost: Cancel the "connection timeout" thingy - we're done!
        countdownId.cancel();

        // ?: Assert that we're still open
        if (!_matsSocketOpen) {
          _logger.info('Upon WebSocket.open, we realize that this MatsSocket instance is closed! - stopping right here.');
          w_abortAttempt();
          return;
        }

        _logger.info('Create WebSocket: opened! InstanceId:[${target.webSocketInstanceId}].');

        // Store our brand new, soon-ready-for-business WebSocket.
        _webSocket = websocketAttempt;
        // We're not /trying/ to connect anymore.. (Because, *hell yeah!*, we /have/ connected!!)
        _webSocketConnecting = false;
        // Since we've just established this WebSocket, we have obviously not sent HELLO yet.
        _helloSent = false;

        // Set our proper handlers
        _webSocket!.onOpen =
        null; // No need for 'onopen', it is already open. Also, node.js evidently immediately fires it again, even though it was already fired.
        _webSocket!.onError = _onerror;
        _webSocket!.onClose = _onclose;
        _webSocket!.onMessage = _onmessage;

        platform.registerBeforeunload(_beforeunloadHandler);

        _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(
            ConnectionEventType.CONNECTED, _currentWebSocketUri, openEvent, timeout, elapsed(), _connectionAttempt));

        // Fire off any waiting messages, next tick
        Future(() {
          _logger.info('WebSocket is open! Running evaluatePipelineSend() to start HELLO/WELCOME handshake.');
          _evaluatePipelineSend();
        });
      };
    };

    w_connectFailed_RetryOrWaitForTimeout = () {
      // :: Attempt failed, either immediate retry or wait for timeout
      _logger.fine("Create WebSocket: Attempt failed, URL [$_currentWebSocketUri] didn't work out.");
      // ?: Assert that we're still open
      if (!_matsSocketOpen) {
        _logger.fine('After failed attempt, we realize that this MatsSocket instance is closed! - stopping right here.');
        // Abort connecting
        w_abortAttempt();
        // Cancel the "reconnect scheduler" thingy.
        countdownId.cancel();
        return;
      }
      // ?: Have we had WAY too many connection attempts?
      if (_connectionAttempt >= _maxConnectionAttempts()) {
        // -> Yes, too much fails or errors - stop nagging server.
        var reason = 'Trying to create WebSocket: Too many consecutive connection attempts [$_connectionAttempt]';
        error('too many connection attempts', reason);
        // Hold on to how many outstanding initiations there are now
        var outstandingInitiations = _outboxInitiations.length;
        // Abort connecting
        w_abortAttempt();
        // Cancel the "reconnect scheduler" thingy.
        countdownId.cancel();
        // Close Session
        _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();
        // Notify SessionClosedEventListeners - with a fake CloseEvent
        _notifySessionClosedEventListeners(MatsSocketCloseEvent(
            MatsSocketCloseCodes.VIOLATED_POLICY.code,
            reason,
            outstandingInitiations
        ));
        return;
      }
      // Clear out the attempt instances
      preConnectOperationAbortFunction = null;
      websocketAttempt = null;
      // ?: If we are on the FIRST (0th) round of trying out the different URLs, then immediately try the next
      // .. But only if there are multiple URLs configured.
      if ((_connectionAttemptRound == 0) && (_useUrls.length > 1)) {
        // -> YES, we are on the 0th round of connection attempts, and there are multiple URLs, so immediately try the next.
        // Cancel the "reconnect scheduler" thingy.
        countdownId.cancel();

        // Invoke on next tick: Bump state vars, re-run _initiateWebSocketCreation
        Timer.run(() {
          _increaseReconnectStateVars();
          _initiateWebSocketCreation();
        });
      }
      // E-> NO, we are either not on the 0th round of attempts, OR there is just a single URL.
      // Therefore, let the countdown timer do its stuff.
    };

    w_connectTimeout_AbortAttemptAndReschedule = () {
      // :: Attempt timed out, clear this WebSocket out
      _logger.fine("Create WebSocket: Attempt timeout exceeded [$timeout ms], URL [$_currentWebSocketUri] didn't work out.");
      // Abort the attempt.
      w_abortAttempt();
      // ?: Assert that we're still open
      if (!_matsSocketOpen) {
        _logger.fine('After timed out attempt, we realize that this MatsSocket instance is closed! - stopping right here.');
        return;
      }
      // Invoke after a small random number of millis: Bump reconnect state vars, re-run _initiateWebSocketCreation
      Timer(Duration(milliseconds: _rnd.nextInt(200)), () {
        _increaseReconnectStateVars();
        _initiateWebSocketCreation();
      });
    };

    // Start the countdown-timer.
    // NOTICE! Order here is important - as the 'w_attemptPreConnectionOperation' right below may cancel it!
    w_countDownTimer();

    // :: Start the actual connection attempt!
    // ?: Should we do a PreConnectionOperation?
    if (_preConnectOperation != false) {
      // -> function, string URL or 'true': Attempt tp perform the PreConnectionOperation - which upon success goes on to invoke 'w_attemptWebSocket()'.
      w_attemptPreConnectionOperation();
    } else {
      // -> false: No PreConnectionOperation, attempt to create the WebSocket directly.
      w_attemptWebSocket();
    }
  }


  void _onerror(WebSocket target, dynamic event) {
      error('websocket.onerror', 'Got \'onerror\' event from WebSocket, instanceId:[${target.webSocketInstanceId}].', event);
      // :: Synchronously notify our ConnectionEvent listeners.
      _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(ConnectionEventType.CONNECTION_ERROR, _currentWebSocketUri, event, null, null, _connectionAttempt));
  }

  void _onclose(WebSocket target, int? code, String? reason, dynamic closeEvent) {
    _logger.info('websocket.onclose, instanceId:[${target.webSocketInstanceId}]');

    // Note: Here (as opposed to matsSocket.close()) the WebSocket is already closed, so we don't have to close it..!

    // If code or reason is null, set it to 'unknown' (Should hopefully never happen - but we don't control the
    // WebSocket implementation)
    code = code ?? MatsSocketCloseCodes.UNKNOWN.code; // -1
    reason = reason ?? 'unknown';

    // ?: Special codes, that signifies that we should close (terminate) the MatsSocketSession.
    if ((code == MatsSocketCloseCodes.UNEXPECTED_CONDITION.code)
        || (code == MatsSocketCloseCodes.MATS_SOCKET_PROTOCOL_ERROR.code)
        || (code == MatsSocketCloseCodes.VIOLATED_POLICY.code)
        || (code == MatsSocketCloseCodes.CLOSE_SESSION.code)
        || (code == MatsSocketCloseCodes.SESSION_LOST.code)) {
      // -> One of the specific "Session is closed" CloseCodes -> Reject all outstanding, this MatsSocket is trashed.
      error('session closed from server',
          'The WebSocket was closed with a CloseCode [${MatsSocketCloseCodesExtension.nameFor(code)}]'
              ' signifying that our MatsSocketSession is closed, reason:[$reason].', closeEvent);

      // Hold on to how many outstanding initiations there are now
      var outstandingInitiations = _outboxInitiations.length;

      // Close Session, Clear all state.
      _closeSessionAndClearStateAndPipelineAndFuturesAndOutstandingMessages();

      // :: Synchronously notify our SessionClosedEvent listeners
      // NOTE: This shall only happen if Close Session is from ServerSide (that is, here), otherwise, if the app invoked matsSocket.close(), one would think the app knew about the close itself..!
      _notifySessionClosedEventListeners(MatsSocketCloseEvent(code, reason, outstandingInitiations, closeEvent));
    } else {
      // -> NOT one of the specific "Session is closed" CloseCodes -> Reconnect and Reissue all outstanding..
      if (code != MatsSocketCloseCodes.DISCONNECT.code) {
        _logger.info('We were closed with a CloseCode [${MatsSocketCloseCodesExtension.nameFor(
            code)}] that does NOT denote that we should close the session. Initiate reconnect and reissue all outstanding.');
      } else {
        _logger.info('We were closed with the special DISCONNECT close code - act as we lost connection, but do NOT start to reconnect.');
      }

      // Clear out WebSocket "infrastructure", i.e. state and "pinger thread".
      _clearWebSocketStateAndInfrastructure();

      // :: This is a reconnect - so we should do pipeline processing right away, to get the HELLO over.
      _forcePipelineProcessing = true;

      // :: Synchronously notify our ConnectionEvent listeners.
      _updateStateAndNotifyConnectionEventListeners(ConnectionEvent(
          ConnectionEventType.LOST_CONNECTION, _currentWebSocketUri, closeEvent, null, null, _connectionAttempt));

      // ?: Is this the special DISCONNECT that asks us to NOT start reconnecting?
      if (code != MatsSocketCloseCodes.DISCONNECT.code) {
        // -> No, not special DISCONNECT - so start reconnecting.
        // :: Start reconnecting, but give the server a little time to settle, and a tad randomness to handle any reconnect floods.
        Timer(Duration(milliseconds: 250 + _rnd.nextInt(750)), () {
          // ?: Have we already gotten a new WebSocket, or started the process of creating one (due to a new
          // message having been sent in the meantime, having started the WebSocket creation process)?
          if ((_webSocket != null) || _webSocketConnecting) {
            // -> Yes, so we should not start again (the _initiateWebSocketCreation asserts these states)
            _logger.info('Start reconnect after LOST_CONNECTION: Already gotten WebSocket, or started creation process. Bail out.');
            return;
          }
          // ?: Has the MatsSocket been closed in the meantime?
          if (!_matsSocketOpen) {
            // -> We've been asynchronously closed - bail out from creating WebSocket  (the _initiateWebSocketCreation asserts this state)
            _logger.info('Start reconnect after LOST_CONNECTION: MatsSocket is closed. Bail out.');
            return;
          }
          // E-> We should start creation process.
          _initiateWebSocketCreation();
        });
      }
    }
  }

  void _onmessage(WebSocket target, String? data, dynamic nativeEvent) {
    var receivedTimestamp = DateTime.now();
    var envelopes = (jsonDecode(data!) as List<dynamic>)
        .map((envelope) => MatsSocketEnvelopeDto.fromEncoded(envelope as Map<String, dynamic>))
        .toList();

    var numEnvelopes = envelopes.length;
    _logger.fine(() => 'websocket.onmessage, instanceId:[${target.webSocketInstanceId}]: Got $numEnvelopes messages.');

    for (var i = 0; i < numEnvelopes; i++) {
      var envelope = envelopes[i];
      try {
        _logger.fine(() => ' \\- onmessage: handling message $i: ${envelope.type}, envelope:${jsonEncode(envelope)}');

        if (envelope.type == MessageType.WELCOME) {
          // Fetch our assigned MatsSocketSessionId
          sessionId = envelope.sessionId;
          _logger.info(() => 'We\'re WELCOME! SessionId:$sessionId, there are'
              ' [${_outboxInitiations.length}] outstanding sends-or-requests, and'
              ' [${_outboxReplies.length}] outstanding replies.');
          // If this is the very first time we get SESSION_ESTABLISHED, then record time (can happen again due to reconnects)
          _initialSessionEstablished_PerformanceNow ??= platform.performanceTime();
          // :: Synchronously notify our ConnectionEvent listeners.
          _updateStateAndNotifyConnectionEventListeners(
              ConnectionEvent(ConnectionEventType.SESSION_ESTABLISHED, _currentWebSocketUri, null, null, null, _connectionAttempt));
          // Start pinger (AFTER having set ConnectionState to SESSION_ESTABLISHED, otherwise it'll exit!)
          _startPinger();

          // TODO: Test this outstanding-stuff! Both that they are actually sent again, and that server handles the (quite possible) double-delivery.

          // ::: RETRANSMIT: If we have stuff in our outboxes, we might have to send them again (we send unless "RetransmitGuard" tells otherwise).

          // :: Outstanding SENDs and REQUESTs
          for (var key in _outboxInitiations.keys) {
            var initiation = _outboxInitiations[key]!;
            var initiationEnvelope = initiation.envelope;
            // ?: Is the RetransmitGuard the same as we currently have?
            if (initiation.retransmitGuard == _outboxInitiations_RetransmitGuard) {
              // -> Yes, so it makes little sense in sending these messages again just yet.
              _logger.fine(() => 'RetransmitGuard: The outstanding Initiation [${initiationEnvelope!.type}] with'
                  ' cmid:[${initiationEnvelope.clientMessageId}] and TraceId:[${initiationEnvelope.traceId}] was'
                  ' created with the same RetransmitGuard as we currently have [$_outboxInitiations_RetransmitGuard]'
                  ' - they were sent directly trailing HELLO, before WELCOME came back in. No use in sending again.');
              continue;
            }
            initiation.attempt++;
            if (initiation.attempt > 10) {
              error('toomanyretries', 'Upon reconnect: Too many attempts at sending Initiation'
                  ' [${initiationEnvelope!.type}] with cmid:[${initiationEnvelope.clientMessageId}],'
                  ' TraceId[${initiationEnvelope.traceId}], size:[${jsonEncode(initiationEnvelope).length}].',
                  initiationEnvelope);
              continue;
            }
            // NOTICE: Won't delete it here - that is done when we process the ACK from server
            _addEnvelopeToPipeline_EvaluatePipelineLater(initiationEnvelope);
            // Flush for each message, in case the size of the message was of issue why we closed (maybe pipeline was too big).
            flush();
          }

          // :: Outstanding Replies
          // NOTICE: Since we cannot possibly have replied to a Server Request BEFORE we get the WELCOME, we do not need RetransmitGuard for Replies
          // (Point is that the RetransmitGuard guards against sending again messages that we sent "along with" the HELLO, before we got the WELCOME.
          // A Request from the Server cannot possibly come in before WELCOME (as that is by protcol definition the first message we get from the Server),
          // so there will "axiomatically" not be any outstanding Replies with the same RetransmitGuard as we currently have: Therefore, /all should be retransmitted/).
          for (var key in _outboxReplies.keys) {
            var reply = _outboxReplies[key]!;
            var replyEnvelope = reply.envelope;
            reply.attempt++;
            if (reply.attempt > 10) {
              error('toomanyretries', 'Upon reconnect: Too many attempts at sending Reply [${replyEnvelope!.type}] '
                      'with smid:[${replyEnvelope.serverMessageId}], TraceId[${replyEnvelope.traceId}], '
                      'size:[${jsonEncode(replyEnvelope).length}].', replyEnvelope);
              continue;
            }
            // NOTICE: Won't delete it here - that is done when we process the ACK from server
            _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
            // Flush for each message, in case the size of the message was of issue why we closed (maybe pipeline was too big).
            flush();
          }
        } else if (envelope.type == MessageType.REAUTH) {
          // -> Server asks us to get new Authentication, as the one he has "on hand" is too old to send us outgoing messages
          _requestNewAuthorizationFromApp('Server demands new Authorization',
              AuthorizationRequiredEvent(AuthorizationRequiredEventType.REAUTHENTICATE));
        } else if (envelope.type == MessageType.RETRY) {
          // -> Server asks us to RETRY the information-bearing-message

          // TODO: Test RETRY!

          // ?: Is it an outstanding Send or Request
          var initiation = _outboxInitiations[envelope.clientMessageId];
          if (initiation != null) {
            var initiationEnvelope = initiation.envelope;
            initiation.attempt++;
            if (initiation.attempt > 10) {
              error('toomanyretries', 'Upon RETRY-request: Too many attempts at sending [${initiationEnvelope!.type}]'
                  ' with cmid:[${initiationEnvelope.clientMessageId}], TraceId[${initiationEnvelope.traceId}],'
                  ' size:[${jsonEncode(initiationEnvelope).length}].',
                  initiationEnvelope);
              continue;
            }
            // Note: the retry-cycles will start at attempt=2, since we initialize it with 1, and have already increased it by now.
            var retryDelay = math.pow(2, (initiation.attempt - 2)) * 500 + _rnd.nextInt(1000);
            Timer(Duration(milliseconds: retryDelay as int), () {
              _addEnvelopeToPipeline_EvaluatePipelineLater(initiationEnvelope);
            });
            continue;
          }
          // E-> Was not outstanding Send or Request

          // ?: Is it an outstanding Reply, i.e. Resolve or Reject?
          var reply = _outboxReplies[envelope.clientMessageId];
          if (reply != null) {
            var replyEnvelope = reply.envelope;
            reply.attempt++;
            if (reply.attempt > 10) {
              error('toomanyretries', 'Upon RETRY-request: Too many attempts at sending [${replyEnvelope!.type}]'
                  ' with smid:[${replyEnvelope.serverMessageId}], TraceId[${replyEnvelope.traceId}],'
                  ' size:[${jsonEncode(replyEnvelope).length}].', replyEnvelope);
              continue;
            }
            // Note: the retry-cycles will start at attempt=2, since we initialize it with 1, and have already increased it by now.
            var retryDelay = math.pow(2, (initiation!.attempt - 2)) * 500 + _rnd.nextInt(1000);
            Timer(Duration(milliseconds: retryDelay as int), () {
              _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
            });
          }
        } else if ((envelope.type == MessageType.ACK) || (envelope.type == MessageType.NACK)) {
          // -> Server Acknowledges information-bearing message from Client.

          if ((envelope.clientMessageId == null) && (envelope.ids == null)) {
            // -> No, we do not have this. Programming error from Server.
            error('ack missing ids', 'The ACK/NACK envelope is missing \'cmid\' or \'ids\'.', envelope);
            continue;
          }

          var ids = <String?>[];
          if (envelope.clientMessageId != null) ids.add(envelope.clientMessageId);
          if (envelope.ids != null) ids.addAll(envelope.ids!);

          _sendAck2Later(ids);

          // :: Handling if this was an ACK for outstanding SEND or REQUEST
          for (var i = 0; i < ids.length; i++) {
            var cmid = ids[i];
            var initiation = _outboxInitiations.remove(cmid);
            // ?: Check that we found it.
            if (initiation == null) {
              // -> No, NOT initiation. Assume it was a for a Reply (RESOLVE or REJECT), delete the outbox entry.
              continue;
            }
            // E-> ----- Yes, we had an outstanding Initiation (SEND or REQUEST).

            initiation.messageAcked_PerformanceNow = platform.performanceTime();

            // Fetch Request, if any.

            var receivedEventType = (envelope.type == MessageType.ACK ? ReceivedEventType.ACK : ReceivedEventType.NACK);
            _completeReceived(receivedEventType, initiation, receivedTimestamp, envelope.description);

            var request = _outstandingRequests[cmid!];
            // ?: If this was a REQUEST, and it is a !ACK - it will never get a Reply..
            if (request != null && (envelope.type != MessageType.ACK)) {
              // -> Yes, this was a REQUEST that got an !ACK
              // We have to reject the REQUEST too - it was never processed, and will thus never get a Reply
              // (Note: This is either a reject for a Future, or errorCallback on Endpoint).
              _completeRequest(request, MessageEventType.REJECT, MatsSocketEnvelopeDto(), receivedTimestamp);
            }
          }
        } else if (envelope.type == MessageType.ACK2) {
          // -> ACKNOWLEDGE of the RECEIVED: We can delete from our inbox
          if ((envelope.serverMessageId == null) && (envelope.ids == null)) {
            // -> No, we do not have this. Programming error from Server.
            error('ack2 missing ids', 'The ACK2 envelope is missing \'smid\' or \'ids\'', envelope);
            continue;
          }
          // Delete it from inbox - that is what ACK2 means: Other side has now deleted it from outbox,
          // and can thus not ever deliver it again (so we can delete the guard against double delivery).
          if (envelope.serverMessageId != null) {
            _inbox.remove(envelope.serverMessageId);
          }
          (envelope.ids ?? []).forEach(_inbox.remove);
        } else if ((envelope.type == MessageType.SEND) || (envelope.type == MessageType.REQUEST)) {
          // -> SEND: Sever-to-Client Send a message to client terminatorOrEndpoint

          var termOrEndp = envelope.type == MessageType.SEND ? 'Terminator' : 'Endpoint';

          if (envelope.serverMessageId == null) {
            // -> No, we do not have this. Programming error from Server.
            error('${envelope.type.name.toLowerCase()} missing smid',
                'The ${envelope.type} envelope is missing \'smid\'', envelope);
            continue;
          }

          // Find the (client) Terminator/Endpoint which the Send should go to
          Function(MessageEvent)? terminatorOrEndpoint = (envelope.type == MessageType.SEND
              ? _terminators[envelope.endpointId!]!.add
              : _endpoints[envelope.endpointId!]);

          // :: Send receipt unconditionally
          _sendAckLater(
              (terminatorOrEndpoint != null ? MessageType.ACK : MessageType.NACK), envelope.serverMessageId,
              terminatorOrEndpoint != null ? null : 'The Client $termOrEndp [${envelope.endpointId}] does not exist!');


          // ?: Do we have the desired Terminator?
          if (terminatorOrEndpoint == null) {
            // -> No, we do not have this. Programming error from app.
            error('client ${termOrEndp.toLowerCase()} does not exist',
                'The Client $termOrEndp [${envelope.endpointId}] does not exist!!', envelope);
            continue;
          }
          // E-> We found the Terminator to tell

          // ?: Have we already gotten this message? (Double delivery)
          if (_inbox[envelope.serverMessageId] != null) {
            // -> Yes, so this was a double delivery. Drop processing, we've already done it.
            _logger.fine(() => 'Caught double delivery of ${envelope.type} with smid:[${envelope.serverMessageId}],'
                ' sending ACK, but won\'t process again. envelope:[$envelope]');
            continue;
          }

          // Add the message to inbox
          _inbox[envelope.serverMessageId] = envelope;

          // :: Handle the SEND or REQUEST

          // ?: Is this a SEND?
          if (envelope.type == MessageType.SEND) {
            // Yes, SEND, so invoke the Terminator
            var messageEvent = _createMessageEventForIncoming(envelope, receivedTimestamp);
            terminatorOrEndpoint(messageEvent);
          } else {
            // No, this is REQUEST - so invoke the Endpoint to get a Future, and send its settling using RESOLVE or REJECT.
            // :: Create a Resolve and Reject handler
            void fulfilled(resolveReject, msg) {
              // Update timestamp of last "information bearing message" sent.
              _lastMessageEnqueuedTimestamp = DateTime.now();
              // Create the Reply message
              var replyEnvelope = MatsSocketEnvelopeDto(
                  type: resolveReject,
                  serverMessageId: envelope.serverMessageId,
                  traceId: envelope.traceId,
                  message: msg
              );
              // Add the message Sequence Id
              replyEnvelope.clientMessageId = '${_messageSequenceId++}';
              // Add it to outbox
              _outboxReplies[replyEnvelope.clientMessageId] = _OutboxReply(
                attempt: 1,
                envelope: replyEnvelope
              );
              // Send it down the wire
              _addEnvelopeToPipeline_EvaluatePipelineLater(replyEnvelope);
            }

            // :: Invoke the Endpoint, getting a Future back.
            var messageEvent = _createMessageEventForIncoming(envelope, receivedTimestamp);
            var promise = terminatorOrEndpoint(messageEvent);

            // :: Finally attach the Resolve and Reject handler
            promise.then((resolveMessage) {
              fulfilled(MessageType.RESOLVE, resolveMessage);
            }).catchError((rejectMessage) {
              fulfilled(MessageType.REJECT, rejectMessage);
            });
          }
        } else if ((envelope.type == MessageType.RESOLVE) || (envelope.type == MessageType.REJECT)) {
          // -> Reply to REQUEST
          // ?: Do server want receipt, indicated by the message having 'serverMessageId' property
          // (NOTE: Reply (RESOLVE/REJECT) directly in IncomingHandler will not set this, as the message has never been in the outbox, so won't need deletion).?
          if (envelope.serverMessageId != null) {
            // -> Yes, so send ACK to server
            _sendAckLater(MessageType.ACK, envelope.serverMessageId);
          }
          // It is physically possible that the Reply comes before the ACK (I've observed it!).
          // .. Such a situation could potentially be annoying for the using application (Reply before Ack)..
          // ALSO, for Replies that are produced in the incomingHandler, there will be no separate ACK message - this is a combined ACK+Reply.
          // Handle this by checking whether the initiation is still in place, and handle it as "ACK Received" if so.
          var initiation = _outboxInitiations[envelope.clientMessageId];
          // ?: Was the initiation still present?
          if (initiation != null) {
            // -> Yes, still present - this means that this is effectively a /combined/ ACK+Reply, so must also handle the ACK-part.
            // Send ACK2 for the "ACK-part" of this Reply (the Client-to-Server REQUEST was stored in Server's inbox - he may now delete it).
            _sendAck2Later([envelope.clientMessageId]);
            // Complete any Received-callbacks for the "ACK-part" of this Reply.
            _completeReceived(ReceivedEventType.ACK, initiation, receivedTimestamp);
          }

          var request = _outstandingRequests[envelope.clientMessageId!];
          if (request == null) {
            _logger.fine(() => 'Double delivery: Evidently we\'ve already completed the Request for cmid:[${envelope.clientMessageId}], traiceId: [${envelope.traceId}], ignoring.');
            continue;
          }

          // Ensure that the timeout is killed now. NOTICE: MUST do this here, since we might delay the delivery even more, check crazy stuff below.
          request.timer!.cancel();

          // Complete the Future on a REQUEST-with-Future, or messageCallback/errorCallback on Endpoint for REQUEST-with-ReplyTo
          var messageEventType = (envelope.type == MessageType.RESOLVE ? MessageEventType.RESOLVE : MessageEventType.REJECT);

          /*
           * NOTICE!! HACK-ALERT! The ordering of events wrt. Requests is as such:
           * 1. ReceivedEvent (receivedCallback for requests, and Received-Future for requestReplyTo)
           * 2. InitiationProcessedEvent stored on matsSocket.initiations
           * 3. InitiationProcessedEvent listeners
           * 4. MessageEvent (Reply-Future for requests, Terminator callbacks for requestReplyTo)
           *
           * WITH a requestReplyTo, the ReceivedEvent becomes async in nature, since requestReplyTo returns
           * a Future<ReceivedEvent>. Also, with a requestReplyTo, the completing of the requestReplyTo is
           * then done on a Terminator, using its specified callbacks - and this is done using
           * setTimeout(.., 0) to "emulate" the same async-ness as a Reply-Future with ordinary requests.
           * However, the timing between the ReceivedEvent and InitiationProcessedEvent then becomes
           * rather shaky. Therefore, IF the initiation is still in place (ReceivedEvent not yet issued),
           * AND this is a requestReplyTo, THEN we delay the completion of the Request (i.e. issue
           * InitiationProcessedEvent and MessageEvent) to be more certain that the ReceivedEvent is
           * processed before the rest.
           */
          // ?: Did we still have the initiation in place, AND this is a requestReplyTo?
          if (initiation != null && request.replyToTerminatorId != null) {
            // -> Yes, the initiation was still in place (i.e. ReceivedEvent not issued), and this was
            // a requestReplyTo:
            // Therefore we delay the entire completion of the request (InitiationProcessedEvent and
            // MessageEvent), to be sure that they happen AFTER the ReceivedEvent issued above.
            Timer(Duration(milliseconds: 20), () {
              _completeRequest(request, messageEventType, envelope, receivedTimestamp);
            });
          } else {
            // -> No, either the initiation was already gone (ReceivedEvent already issued), OR it was
            // not a requestReplyTo:
            // Therefore, we run the completion right away (InitiationProcessedEvent is sync, while
            // MessageEvent is a Future settling).
            _completeRequest(request, messageEventType, envelope, receivedTimestamp);
          }
        } else if (envelope.type == MessageType.PING) {
          // -> PING request, respond with a PONG
          // Add the PONG reply to pipeline
          _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
              type: MessageType.PING,
              pingId: envelope.pingId
          ));
          // Send it immediately
          flush();
        } else if ((envelope.type == MessageType.SUB_OK) || (envelope.type == MessageType.SUB_LOST) ||
            (envelope.type == MessageType.SUB_NO_AUTH)) {
          // -> Result of SUB
          // Notify PingPong listeners, synchronously.
          SubscriptionEventType eventType;
          if (envelope.type == MessageType.SUB_OK) {
            eventType = SubscriptionEventType.OK;
          } else if (envelope.type == MessageType.SUB_LOST) {
            eventType = SubscriptionEventType.LOST_MESSAGES;
          } else {
            eventType = SubscriptionEventType.NOT_AUTHORIZED;
          }
          var event = SubscriptionEvent(eventType, envelope.endpointId);
          for (var i = 0; i < _subscriptionEventListeners.length; i++) {
            try {
              _subscriptionEventListeners[i](event);
            } catch (err) {
              error('notify SubscriptionEvent listeners',
                  'Caught error when notifying one of the [${_subscriptionEventListeners
                      .length}] SubscriptionEvent listeners.', err);
            }
          }
        } else if (envelope.type == MessageType.PUB) {
          // -> Server publishes a Topic message
          var event = MessageEvent(
              MessageEventType.PUB, envelope.message, envelope.traceId!, envelope.serverMessageId!, receivedTimestamp);

          var subs = _subscriptions[envelope.endpointId!];
          // ?: Did we find any listeners?
          if (subs == null) {
            // -> No. Strange.
            error('message for unwanted topic', 'We got a PUB message for Topic [${envelope.endpointId}], but we have no subscribers for it.');
            continue;
          }

          // Issue message to all listeners for this Topic.
          for (var i = 0; i < subs.listeners.length; i++) {
            try {
              subs.listeners[i](event);
            } catch (err) {
              error('dispatch topic message',
                  'Caught error when notifying one of the [${subs.listeners
                      .length}] subscription listeners for Topic [${envelope.endpointId}].', err);
            }
          }

          // Make note of the latest message id processed for this Topic
          subs.lastSmid = envelope.serverMessageId;
        } else if (envelope.type == MessageType.PONG) {
          // -> Response to a PING
          var pingPongHolder = _outstandingPings.remove(envelope.pingId)!;
          // Calculate the round-trip time, using performanceNow stored along with the PingPong instance.
          var pingPong = pingPongHolder.pingPong;
          var performanceThen = pingPongHolder.createTime;
          pingPong.roundTripMillis =
              _roundTiming(platform.performanceTime() - performanceThen);

          // Notify PingPong listeners, synchronously.
          for (var i = 0; i < _pingPongListeners.length; i++) {
            try {
              _pingPongListeners[i](pingPong);
            } catch (err) {
              error('notify pingpongevent listeners',
                  'Caught error when notifying one of the [${_pingPongListeners
                      .length}] PingPongEvent listeners.', err);
            }
          }
        }
      } catch (err) {
        var stringified = jsonEncode(envelope);
        error('envelope processing', 'Got unexpected error while handling incoming envelope of type'' \'${envelope.type}\':'
            ' ''${(stringified.length > 1024 ? '${stringified.substring(0, 1021)}...' : stringified)}', err);
      }
    }
  }

  List<String?> _laterAcks = [];
  List<String?> _laterNacks = [];
  Timer? _laterAckTimeoutId;

  void _sendAckLater(MessageType type, String? smid, [String? description]) {
    // ?: Do we have description?
    if (description != null) {
      // -> Yes, description - so then we need to send it by itself
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: type,
          serverMessageId: smid,
          description: description
      ));
      return;
    }
    // ?: Was it ACK or NACK?
    if (type == MessageType.ACK) {
      _laterAcks.add(smid);
    } else {
      _laterNacks.add(smid);
    }
    // Send them now or later
    _laterAckTimeoutId?.cancel();
    if ((_laterAcks.length + _laterNacks.length) > 10) {
      _sendAcksAndNacksNow();
    } else {
      _laterAckTimeoutId = Timer(Duration(milliseconds: 20), _sendAcksAndNacksNow);
    }
  }

  void _sendAcksAndNacksNow() {
    // ACKs
    if (_laterAcks.length > 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.ACK,
          ids: _laterAcks
      ));
      _laterAcks = [];
    } else if (_laterAcks.length == 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.ACK,
          serverMessageId: _laterAcks[0]
      ));
      _laterAcks.clear();
    }
    // NACKs
    if (_laterNacks.length > 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.NACK,
          ids: _laterNacks
      ));
      _laterNacks = [];
    } else if (_laterNacks.length == 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.NACK,
          serverMessageId: _laterNacks[0]
      ));
      _laterNacks.clear();
    }
  }

  List<String?> _laterAck2s = [];
  Timer? _laterAck2TimeoutId;

  void _sendAck2Later(List<String?> ids) {
    _laterAck2s.addAll(ids);
    // Send them now or later
    _laterAck2TimeoutId?.cancel();
    if (_laterAck2s.length > 10) {
      _sendAck2sNow();
    } else {
      _laterAck2TimeoutId = Timer(Duration(milliseconds: 50), _sendAck2sNow);
    }
  }

  void _sendAck2sNow() {
    // ACK2s
    if (_laterAck2s.length > 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.ACK2,
          ids: _laterAck2s
      ));
      _laterAck2s = [];
    } else if (_laterAck2s.length == 1) {
      _addEnvelopeToPipeline_EvaluatePipelineLater(MatsSocketEnvelopeDto(
          type: MessageType.ACK2,
          clientMessageId: _laterAck2s[0]
      ));
      _laterAck2s.clear();
    }
  }


  void _completeReceived(ReceivedEventType receivedEventType, _Initiation initiation, DateTime receivedTimestamp, [String? description]) {
    var performanceNow = platform.performanceTime();
    initiation.messageAcked_PerformanceNow = performanceNow;

    // NOTICE! We do this SYNCHRONOUSLY, to ensure that we come in front of Request Future settling (specifically, Future /rejection/ if NACK).
    _outboxInitiations.remove(initiation.envelope!.clientMessageId);
    var receivedEvent = ReceivedEvent(receivedEventType, initiation.envelope!.traceId!, initiation.sentTimestamp!, receivedTimestamp, _roundTiming(performanceNow - initiation.messageSent_PerformanceNow), description);
    // ?: Was it a ACK (not NACK)?
    if (receivedEventType == ReceivedEventType.ACK) {
      // -> Yes, it was "ACK" - so Server was happy.
      if (initiation.ack != null) {
        try {
          initiation.ack!(receivedEvent);
        } catch (err) {
          error('received ack', 'When trying to ACK the initiation with ReceivedEvent [$receivedEventType], we got error.', err);
        }
      }
    } else {
      // -> No, it was !ACK, so message has not been forwarded to Mats
      if (initiation.nack != null) {
        try {
          initiation.nack!(receivedEvent);
        } catch (err) {
          error('received nack', 'When trying to NACK the initiation with ReceivedEvent [$receivedEventType], we got error.', err);
        }
      }
    }

    // ?: Should we issue InitiationProcessedEvent? (SEND is finished processed at ACK time, while REQUEST waits for REPLY from server before finished processing)
    if (initiation.envelope!.type == MessageType.SEND) {
        // -> Yes, we should issue - and to get this in a order where "Received is always invoked before
        // InitiationProcessedEvents", we'll have to delay it, as the Future settling above is async)
        Timer(Duration(milliseconds: 50), () {
            _issueInitiationProcessedEvent(initiation);
        });
    }
  }

  MessageEvent _createMessageEventForIncoming(MatsSocketEnvelopeDto envelope, DateTime receivedTimestamp) {
    var messageEvent = MessageEvent(
        envelope.type.messageEventType, envelope.message, envelope.traceId!, envelope.serverMessageId!,
        receivedTimestamp);
    // Set the debug details from the envelope, if present
    if (envelope.receivedDebug) {
      messageEvent.debug = envelope.debug(null, null, receivedTimestamp);
    }
    return messageEvent;
  }

  void _completeRequest(_Request request, MessageEventType messageEventType, MatsSocketEnvelopeDto incomingEnvelope,
      DateTime receivedTimestamp) {
    // We're finishing it now, so it shall not be timed out.
    request.timer?.cancel();

    // Make note of performance.now() at this point in time
    var performanceNow = platform.performanceTime();

    _outstandingRequests.remove(request.envelope.clientMessageId);

    // Create the event
    var event = MessageEvent(messageEventType, incomingEnvelope.message,
        request.envelope.traceId!, request.envelope.clientMessageId!, receivedTimestamp);
    event.clientRequestTimestamp = request.initiation.sentTimestamp;
    event.roundTripMillis = performanceNow - request.initiation.messageSent_PerformanceNow;
    // .. add CorrelationInformation from request if requestReplyTo
    event.correlationInformation = request.correlationInformation;
    // Add DebugInformation if relevant
    if (request.initiation.debug != 0) {
      event.debug =
          incomingEnvelope.debug(request.initiation.sentTimestamp, request.initiation.debug, receivedTimestamp);
    }

    // Invoke InitiationProcessedEvent listeners (Both adding to matsSocket.initiations and firing of listeners is done sync, thus done before settling).
    _issueInitiationProcessedEvent(request.initiation, request.replyToTerminatorId, event);

    // ?: Is this a RequestReplyTo, as indicated by the request having a replyToEndpoint?
    if (request.replyToTerminatorId != null) {
      // -> Yes, this is a REQUEST-with-ReplyTo
      // Find the (client) Terminator which the Reply should go to
      var terminator = _terminators[request.replyToTerminatorId!];
      // "Emulate" asyncness as if with Future settling with setTimeout(.., 0).
      Timer.run(() {
        if (messageEventType == MessageEventType.RESOLVE) {
          try {
            terminator!.add(event);
          } catch (err) {
            error('replytoterminator resolve', 'When trying to pass a RESOLVE to Terminator [${request
                .replyToTerminatorId}], an exception was raised.', err);
          }
        } else {
          try {
            terminator!.addError(event);
          } catch (err) {
            error('replytoterminator reject', 'When trying to pass a [$messageEventType] to Terminator [${request
                .replyToTerminatorId}], an exception was raised.', err);
          }
        }
      });
    } else {
      // -> No, this is a REQUEST-with-Future (missing (client) EndpointId)
      // Delete the outstanding request, as we will complete it now.
      _outstandingRequests.remove(request.envelope.clientMessageId);
      // :: Note, resolving/rejecting a Future is always async (happens "next tick").
      // ?: Was it RESOLVE or REJECT?
      if (messageEventType == MessageEventType.RESOLVE) {
        request.resolve(event);
      } else {
        request.reject(event);
      }
    }
  }

  double _roundTiming(double millis) {
    return (millis * 100).round() / 100;
  }

  void _issueInitiationProcessedEvent(_Initiation initiation,
      [String? replyToTerminatorId, MessageEvent? replyMessageEvent]) {
    // Handle when initationProcessed /before/ session established: Setting to 0. (Can realistically only happen in testing.)
    var sessionEstablishedOffsetMillis = _initialSessionEstablished_PerformanceNow != null
        ? _roundTiming(initiation.messageSent_PerformanceNow - _initialSessionEstablished_PerformanceNow!)
        : 0.0;
    var acknowledgeRoundTripTime = _roundTiming((initiation.messageAcked_PerformanceNow ?? 0) - initiation.messageSent_PerformanceNow);
    var requestRoundTripTime = replyMessageEvent != null
        ? _roundTiming(platform.performanceTime() - initiation.messageSent_PerformanceNow)
        : null;
    var replyMessageEventType = replyMessageEvent?.type;
    if (_numberOfInitiationsKept > 0) {
      var initiationProcessedEvent = InitiationProcessedEvent(
          initiation.envelope!.endpointId!,
          initiation.envelope!.clientMessageId!,
          initiation.sentTimestamp!,
          sessionEstablishedOffsetMillis,
          initiation.envelope!.traceId!,
          initiation.envelope!.message,
          acknowledgeRoundTripTime,
          replyMessageEventType,
          replyToTerminatorId,
          requestRoundTripTime,
          replyMessageEvent);
      _initiationProcessedEvents.add(initiationProcessedEvent);
      while (_initiationProcessedEvents.length > _numberOfInitiationsKept) {
        _initiationProcessedEvents.removeAt(0);
      }
    }

    if (initiation.suppressInitiationProcessedEvent) {
      _logger.fine('InitiationProcessedEvent is suppressed, so NOT notifying listeners.');
      return;
    }

    // Firing to listeners, synchronous.
    for (var i = 0; i < _initiationProcessedEventListeners.length; i++) {
      try {
        var registration = _initiationProcessedEventListeners[i];
        var initiationMessageIncluded = (registration.includeInitiationMessage ? initiation.envelope!.message : null);
        var replyMessageEventIncluded = (registration.includeReplyMessageEvent ? replyMessageEvent : null);
        var initiationProcessedEvent = InitiationProcessedEvent(
            initiation.envelope!.endpointId!,
            initiation.envelope!.clientMessageId!,
            initiation.sentTimestamp!,
            sessionEstablishedOffsetMillis,
            initiation.envelope!.traceId!,
            initiationMessageIncluded,
            acknowledgeRoundTripTime,
            replyMessageEventType,
            replyToTerminatorId,
            requestRoundTripTime,
            replyMessageEventIncluded);
        _logger.fine(() => 'Sending InitiationProcessedEvent to listener [${(i + 1)}/${_initiationProcessedEventListeners.length}]');
        registration.listener(initiationProcessedEvent);
      } catch (err) {
        error('notify InitiationProcessedEvent listeners',
            'Caught error when notifying one of the [${_initiationProcessedEventListeners
                .length}] InitiationProcessedEvent listeners.', err);
      }
    }
  }

  Timer? _pinger_TimeoutId;
  var _pingId = 0;

  void _startPinger() {
    _logger.fine('Starting PING\'er!');
    _pingLater(initialPingDelay);
  }

  void _stopPinger() {
    _logger.fine('Cancelling PINGer');
    _pinger_TimeoutId?.cancel();
  }

  void _pingLater(int initialPingDelay) {
    _pinger_TimeoutId = Timer(Duration(milliseconds: initialPingDelay), () {
      _logger.fine(() => "Ping-'thread': About to send ping. ConnectionState:[$state], matsSocketOpen:[$_matsSocketOpen].");
      if ((state == ConnectionState.SESSION_ESTABLISHED) && _matsSocketOpen) {
        var pingId = _pingId++;
        var pingPong = PingPong('$pingId', DateTime.now());
        _pings.add(pingPong);
        if (_pings.length > 100) {
          _pings.removeAt(0);
        }
        _outstandingPings[pingPong.pingId] = _OutstandingPing(platform.performanceTime(), pingPong);
        _webSocket!.send('[{"t":"${MessageType.PING.name}","x":"$pingId"}]');
        // Reschedule
        _pingLater(15000);
      } else {
        _logger.fine("Ping-'thread': NOT sending Ping and NOT Rescheduling due to state!=SESSION_ESTABLISHED or !connected - exiting 'thread'.");
      }
    });
  }
}

class _InitiationProcessedEventListenerRegistration {
  final InitiationProcessedEventListener listener;
  final bool includeInitiationMessage;
  final bool includeReplyMessageEvent;

  _InitiationProcessedEventListenerRegistration(this.listener,
      this.includeInitiationMessage, this.includeReplyMessageEvent);
}

class _Initiation {
  final bool suppressInitiationProcessedEvent;
  final int debug;
  final Function(ReceivedEvent)? ack;
  final Function(ReceivedEvent)? nack;

  MatsSocketEnvelopeDto? envelope;

  String? retransmitGuard;

  int attempt = 0;

  DateTime? sentTimestamp;

  late double messageSent_PerformanceNow;

  double? messageAcked_PerformanceNow;

  final createTrace = StackTrace.current;

  _Initiation(this.suppressInitiationProcessedEvent, this.debug, this.ack, this.nack);
}

class _Request {
  final Duration timeout;
  final Completer<MessageEvent> _completer = Completer();
  final String? replyToTerminatorId;
  final dynamic correlationInformation;

  late _Initiation initiation;

  late MatsSocketEnvelopeDto envelope;

  Timer? timer;

  _Request.request(Duration timeout) : this.requestReply(timeout, null, null);
  _Request.requestReply(this.timeout, this.replyToTerminatorId, this.correlationInformation);

  Future<MessageEvent> get future => _completer.future;

  void resolve(MessageEvent event) => _completer.complete(event);
  void reject(MessageEvent event) => _completer.completeError(event);
}

class _Subscription {
  final String topic;
  final List<MessageEventHandler> listeners = [];
  bool subscriptionSentToServer = false;
  String? lastSmid;

  _Subscription(this.topic);
}

class _OutstandingPing {
  final double createTime;
  final PingPong pingPong;

  _OutstandingPing(this.createTime, this.pingPong);
}

class _OutboxReply {
  MatsSocketEnvelopeDto? envelope;
  int attempt;

  _OutboxReply({required this.envelope, required this.attempt});
}
