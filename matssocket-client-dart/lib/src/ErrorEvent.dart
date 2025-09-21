import 'dart:convert';

/// The Event object supplied to listeners added via {@link MatsSocket#addErrorEventListener()}.
class ErrorEvent {
  /// Type of error - describes the situation where the error occurred. Currently has no event-type enum.
  final String type;

  /// The error message
  final String message;

  /// Some errors supply a relevant object: Event for WebSocket errors, The attempted processed MatsSocket Envelope
  /// when envelope processing fails, or the caught Error in a try-catch (typically when invoking event listeners).
  /// <b>For submitting errors back to the home server, check out [referenceAsString].</b>
  ///
  /// [reference] is of type [Object]?.
  final Object? reference;


  ErrorEvent(this.type, this.message, [this.reference]);

  /// Makes a string (<b>chopped the specified max number of characters, default 1024 chars</b>) out of the
  /// [reference] Object, which might be useful if you want to send this back over HTTP - consider
  /// `encodeURIComponent(referenceAsString)` if you want to send it over the URL. First tries to use
  /// `jsonEncode(reference)`, failing that, it uses `reference?.toString()`. Then chops to [maxLength], default
  /// 1024, using "..." to denote the chop.
  ///
  /// [maxLength] the max number of characters that will be returned, with any chop denoted by "...".
  String? referenceAsString([int maxLength = 1024]) {
    String? result;
    try {
      result = jsonEncode(reference);
    } catch (err) {
      result = reference?.toString();
    }
    // If result is non-null and longer than maxLength, return a substring of the result
    return (result != null && result.length > maxLength) ? '${result.substring(0, maxLength - 3)}...' : result;
  }

  Map<String, dynamic> toJson() {
    return {
      'type': type,
      'message': message,
      'reference': referenceAsString()
    };
  }
}