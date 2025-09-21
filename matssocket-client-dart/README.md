# MatsSocket Dart/Flutter client library

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature
of [Mats<sup>3</sup>](https://mats3.io/) all the way out to your end user client applications, featuring bidirectional
communication. It consists of a small MatsSocketServer API which is implemented on top of the _Mats<sup>3</sup> API_ and
_JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as client libraries - for which
there currently exists JavaScript and Dart/Flutter implementations.

This is the Dart client library for MatsSocket. It handles both VM, Node and Web platforms (using conditional imports
and dynamic resolving for the few platform specifics, notably the WebSocket implementation), and is compatible with
Flutter. It handles all compiler targets (Kernel, Source, Exe, JS, Wasm).

Dependencies: `logging` for all targets, and `web` and `http` for the JS targets (Node and Web).

MatsSocket code is at [GitHub](https://github.com/centiservice/matssocket), with the Dart client library residing in
the [matssocket-client-dart](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart) subproject.

For Development of the library itself, see 
[README-development.md](https://github.com/centiservice/matssocket/blob/main/matssocket-client-dart/README-development.md).

There are a few examples in the
[example](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart/example) directory, and the
[integration tests](https://github.com/centiservice/matssocket/tree/main/matssocket-client-dart/test)
exercises all features of the MatsSocket client.