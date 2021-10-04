# MatsSocket client library

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature of [Mats<sup>3</sup>](https://github.com/centiservice/mats3) all the way out to your end user client applications, featuring bidirectional communication. It consists of a small MatsSocketServer API which is implemented on top of the _Mats<sup>3</sup> API_ and _JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as client libraries - for which there currently exists JavaScript and Dart/Flutter implementations.

This JavaScript library runs both in browsers and Node.js.

*Note that when running in Node.js, it expects the module 'ws' to be available, require()'ing it dynamically.*

For more information, head to the [MatsSocket Github page](https://github.com/centiservice/matssocket).  
*(Dart client library available at [pub.dev](https://pub.dev/packages/matssocket))*