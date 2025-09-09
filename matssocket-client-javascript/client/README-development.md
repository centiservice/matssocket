# MatsSocket JavaScript client library DEVELOPMENT

## Layout

There are three sub modules: `client`, `tests_esm`, and `tests_umd`. The `client` module contains the actual MatsSocket
client code in the 'lib' directory, coded as EcmaScript Modules (ESM) - and its build step creates EMD and UMD bundles,
both full and minified. The `tests_esm` module contains the unit and integration tests in the 'src' directory. The 
`tests_umd` module bundles up the tests from the 'tests_esm' module as a UMD module, and then runs them using the UMD
bundle of the client. This is to ensure that the bundled UMD client works as expected.

## Build

The Gradle build will create JavaScript bundles in several formats, as well as JSDoc documentation. The resulting set
of distributions are as such:

* Native EcmaScript Modules (ESM) - just use the files directly
* Native EcmaScript Modules (EMS) - bundled - `bundles/MatsSocket.esm.js`
* Native EcmaScript Modules (EMS) - bundled, minified - `bundles/MatsSocket.esm.min.js`
* Universal Module Definition (UMD) - bundled ("by definition") - `bundles/MatsSocket.umd.cjs`
* Universal Module Definition (UMD) - bundled, minified - `bundles/MatsSocket.umd.min.cjs`
* A ZIP-file containing the source files - `build-gradle/dist/matssocket-<version>-js.zip`

JSDoc will be created, `jsdoc\index.html` being the entry point.

*This JS Client doesn't have any dependencies*, except for the WebSocket implementation provided by the
environment (browser or Node.js). When running in Node.js, it expects the module `ws` to be available, require()'ing it
dynamically.

The build is done using Gradle with the `node-gradle` plugin, using npm for package management of the build and test
environment. The build will install a local Node.js and npm, and then use that to install packages and run scripts.

## Development / Building

Running the `MatsSocketTestServer` makes it simple to both test and develop on the JS Client. It is the class
`io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl' - you may find it in e.g. IntelliJ,
right-click and select 'Run' or 'Debug'. Or run it from command line with Gradle, from project root:
`./gradlew matsSocketTestServer`.

Run [MatsSocketTestServer.java](../../matssocket-server-impl/src/test/java/io/mats3/matssocket/MatsSocketTestServer.java)
directly from e.g. IntelliJ, and access it on http://localhost:8080/. Here you can run the unit and integration tests in
the browser, and it maps directly to the source files. Also available is a test-run using the UMD-files of both the
client and the tests, but then you first need to build the project so that the UMD modules exist.

You may access the ESM JavaScript files directly - both the client and the unit/integration tests - using the
MatsSocketTestServer inside the matssocket-server-impl subproject.
