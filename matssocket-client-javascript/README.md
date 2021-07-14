# MatsSocket client for JavaScript

Compatible with web browsers and Node.js.

For info about the NPM package, read the [NPM README.md](./client/README.md) inside the 'client' folder.

The build is done using Gradle with the node plugin, using Yarn for package management. The client is coded using EcmaScript Modules (ESM), and bundled into USM modules, also minified, using Rollup.

You may access the ESM JavaScript files directly - both the client and the unit/integration tests - using the MatsSocketTestServer inside the matssocket-server-impl subproject. Run [MatsSocketTestServer.java](../matssocket-server-impl/src/test/java/io/mats3/matssocket/MatsSocketTestServer.java) directly from e.g. IntelliJ, and access it on http://localhost:8080/. Here you can run the unit and integration tests in the browser, and it maps directly to the source files. Also available is a test-run using the UMD-files of both the client and the tests, but then you first need to build the project so that they exist.