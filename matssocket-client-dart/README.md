# MatsSocket Dart client library, compatible with Flutter

This is the Dart client library for MatsSocket. It handles both VM and Web platforms (using conditional imports for
the few platform specifics, notably the WebSocket implementation), and is compatible with Flutter. It handles all
compiler targets (Kernel, Source, Exe, JS, Wasm).

## Running Dart tests:

### Via Gradle

Gradle handles downloading the Dart SDK, and firing up the MatsSocketTestServer for you.

When standing in the project root directory, the following 'test' task runs the default platform/compiler variant of the
integration tests, which is VM/Kernel.
<pre>
./gradlew matssocket-client-dart:test
</pre>

For running the Web tests, you need to have Chrome/Chromium installed. Notice how you may set the path to your
Chrome/Chromium binary, if it is not in the default location. This is done with the `-PchromePath=` parameter.

Standing in the project root directory, the following 'testAll' task runs all platform/compiler variants of the
integration tests, setting the Chrome path to `/snap/bin/chromium`.

<pre>
./gradlew -PchromePath=/snap/bin/chromium matssocket-client-dart:testAll
</pre>

There are also separate tasks 'testVmKernel', 'testVmSource', 'testVmExe', 'testWebJs', and 'testWebWasm' if you want to
run a specific combination. The default 'test' task only runs the 'testVmKernel' tests. The VM tasks don't need Chrome.

### From command line using Gradle/downloaded Dart SDK

You may use the Gradle-downloaded Dart SDK to run the tests directly from command line. The Dart SDK will be downloaded
by most tasks in this module's build.gradle, but you may run it specifically by executing the Gradle task
<code>matssocket-client-dart:updateDartDependencies</code>.

**You need to have the test server running**, as the tests are integration tests that connect to a test-specific
MatsSocketServer with multiple test MatsSocket endpoints, as well as a few HTTP endpoints.
This server is the <code>io.mats3.matssocket.MatsSocketTestServer</code>, residing in the 'matssocket-server-impl'
module. Find it in e.g. IntelliJ, right-click and select 'Run' or 'Debug'.

Standing in the 'matssocket-client-dart' module directory, here's an example running the tests using the project
downloaded Dart SDK (using default platform/compiler - VM/Kernel):
<pre>
dartsdk_download/dart-sdk/bin/dart test -j 1 test/*</pre>

Here is an example running the tests on Web target compiled to JS - notice how you set the path to your Chrome/Chromium
binary with the `CHROME_EXECUTABLE` environment variable if it is not in the default location:

<pre>
CHROME_EXECUTABLE=/snap/bin/chromium
export CHROME_EXECUTABLE
dartsdk_download/dart-sdk/bin/dart test -p chrome -c dart2js -j 1 test/*</pre>

The platform/compiler combinations are (The Dart default is '-p vm -c kernel'):

* `-p vm -c kernel` (VM, compiled to kernel - default)
* `-p vm -c source` (VM, run from source)
* `-p vm -c exe` (VM, compiled to native executable)
* `-p chrome -c dart2js` (Web, compiled to JS)
* `-p chrome -c dart2wasm` (Web, compiled to Wasm)

