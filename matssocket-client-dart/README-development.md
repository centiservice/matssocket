# MatsSocket Dart client library DEVELOPMENT

## Running Dart tests:

### Via Gradle

Gradle handles downloading the Dart SDK, and firing up the backend MatsSocketTestServer, before running the integration
tests.

When standing in the project root directory, the following `test` task runs the default platform/compiler variant of the
integration tests, which is VM/Kernel.
<pre>
./gradlew matssocket-client-dart:test
</pre>

For running the tests on the Web target, you need to have Chrome/Chromium installed. Notice how you may set the path
to your Chrome/Chromium binary, if it is not in the default location. This is done with the `-PchromePath=` parameter.

Standing in the project root directory, the following `testAll` task runs all platform/compiler variants of the
integration tests, setting the Chrome path to `/snap/bin/chromium`.

<pre>
./gradlew -PchromePath=/snap/bin/chromium matssocket-client-dart:testAll
</pre>

There are also separate tasks `testVmKernel`, `testVmSource`, `testVmExe`, `testWebJs`, and `testWebWasm` if you want to
run a specific combination, and `testVm` and `testWeb` for subsets. The default `test` task only runs the `testVmKernel`
task. The VM tasks don't need Chrome.

### From command line using Gradle/downloaded Dart SDK

You may use the Gradle-downloaded Dart SDK to run the tests directly from command line. The Dart SDK will be downloaded
by most tasks in this module's build.gradle, but you may run it specifically by executing the Gradle task
`matssocket-client-dart:updateDartDependencies`. _(Note that it is also possible to let IntelliJ use this
downloaded Dart SDK - but you might have to restart the analyzer each time after the Gradle download task runs, since
the SDK will be overwritten and thus crashes)_

**You need to have the test server running**, as the tests are integration tests that connect to a test-specific
MatsSocketServer with multiple test MatsSocket endpoints, as well as a few HTTP endpoints.
This server is the `io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl'
module. Find it in e.g. IntelliJ, right-click and select 'Run' or 'Debug'. Or run it from command line with Gradle,
from project root: `./gradlew matsSocketTestServer`.

Standing in the `matssocket-client-dart` module directory, here's an example running the tests using the project
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

