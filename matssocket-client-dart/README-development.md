# MatsSocket Dart client library DEVELOPMENT

Note that we don't get full 'pub.dev' score from Pana (per 2025-09-22: 150 of 160), likely due to source not completely
formatted according to rules, or that three lints are disabled, specifically `file_names`, `constant_identifier_names`
and `non_constant_identifier_names`. This is because the JavaScript variant is the "primary" source, while the Dart is
a manually "cross-compiled" variant, and there is a desire to keep the Dart variant as close to the JavaScript variant
as possible wrt. "look and feel" and wrt. keeping them 100% in sync functionally and semantically.

## Gradle targets

### General

_Note: When run without subproject qualifier (i.e. `matssocket-client-dart:...`), the `build`, `archiveLib`, `test`,
`nodeBinDir`, `download`, `downloadAll`, `versions` and `distclean` tasks will execute the corresponding tasks both in
Dart and JavaScript clients. `matsSocketTestServer` is a root project task that all testing relies on. The other tasks
are unique to the Dart client, and it thus doesn't matter with qualifier._

* `build`: runs `archiveLib`, `dartDoc` and `test` (target from DI server; GitHub Actions).
* `buildDart`: Convenient "synonym" for build for this Dart module, so that you can run `./gradlew buildDart` from the
  root directory and only run the Dart build.
* `archiveLib`: zips up the `lib/` directory, and puts the zip it in the `dist/` directory.
* `dartDoc`: generates Dart documentation, open `doc/api/index.html`
* `test`: runs all VM and Node tests on all compilers _(but not Web targets, due to dependency on Chrome/Chromium)_
* `testDart`: runs all tests in all platform/compiler combinations, including the Web targets. _(Path to Chrome/Chromium
  can be set using `-PchromePath=...`)._
* `testVmKernel`: Quickest test config. For other test tasks, see _'Running Dart tests'_ chapter below.
* `dartBinPath`: Downloads Dart, then prints out the path to the Dart binary, and PATH variables for Unix and Windows.
* `nodeBinDir`: Downloads Node, then prints out the path to the Node bin dir, and PATH variables for Unix and Windows.
* `download`: depends on both `dartBinPath` and `nodeBinDir` - i.e. downloads Dart and Node, and prints out the paths. 
* `downloadAll`: Download + dependencies ('dart pub get')
* `matsSocketTestServer`: Runs the MatsSocketTestServer, which is used for integration tests.
* `versions`: tasks `dartVersion` + `nodeVersion`.
* `distclean`: In addition to `clean` which deletes build artifacts, also deletes Node.js and node_modules; and
  Dart SDK and deps. Shall be as clean as newly cloned repo.

### Dart tasks
* `dartVersion`: Runs `dart --version` to print out the Dart version. (`versions` depends on this)
* `dartOutdated`: Runs `dart pub outdated` to check for outdated dependencies.
* `dartUpgradeUpdate`: Runs `dart pub upgrade --major-versions` to upgrade dependencies.
* `dartPana`: Runs `dart pub global run pana` to get the pub.dev score the lib will get.

# Build

"Building" on Dart only refers to testing and generating documentation, as there is no compile or bundling step. Dart
libraries are delivered as raw source code, the target compilation is done by the actual application. Dart uses tree
shaking to minimize the final application before compile. Compared to JavaScript, minimized source files thus don't make
sense.

The deliverables are thus the `/lib` folder (with its child `/lib/src/`), and the generated `/doc/api` folder, the
zipped archive in `/dist`, as well as most of the rest in `matssocket-client-dart/`.

Run `./gradlew dartPublishDryRun` to see what will be published.

Dependencies: `logging` for all targets, and `web` and `http` for the JS targets (Node and Web).

## Running Dart tests

### Via Gradle

Gradle handles downloading the Dart SDK (and if relevant for chosen tests, Node.js), and handles firing up the backend
MatsSocketTestServer, before running the integration tests.

When standing in the project root directory, the following standard `test` task runs all test on all platform/compiler
targets, except those depending on Chrome ('testWeb').
```shell
./gradlew matssocket-client-dart:test
```

**For running the tests on the Web targets, you need to have Chrome/Chromium installed.** You may set the path to your
Chrome/Chromium binary, if it is not in the default location. This is done with the `-PchromePath=` parameter.

Standing in the project root directory, the following `testDart` task runs all platform/compiler variants of the
integration tests, including Web, setting the Chrome path to `/snap/bin/chromium`.

```shell
./gradlew -PchromePath=/snap/bin/chromium testDart   # replace path with your Chrome path
```

There are also separate tasks `testVmKernel`, `testVmSource`, `testVmExe`, `testNodeJs` and `testNodeWasm`, `testWebJs`,
and `testWebWasm` if you want to run a specific combination, and `testVm`, `testWeb` and `testNode` for subsets.
`testDart` runs all tests. The default `test` task runs the `testVm` and `testNode` tasks, thus not depending on Chrome
on DI server. The VM tasks don't need Chrome, while the Node tasks need Node which Gradle installs.

### From command line using Gradle-downloaded Dart SDK and Node.js

You may use the Gradle-downloaded Dart SDK to run the tests directly from command line. The Dart SDK will be downloaded
by the Gradle task `./gradlew dartBinPath` (or `download`) run from project root, where it also will print out the path
to the dart executable. _(Note that it is also possible to let e.g. IntelliJ use this downloaded Dart SDK, read below on
IDE)_

**You need to have the test server running**, as the tests are integration tests that connect to a test-specific
MatsSocketServer with multiple test MatsSocket endpoints, as well as a few HTTP endpoints. This server is the
`io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl' module. Find it in e.g. IntelliJ,
right-click and select 'Run' or 'Debug'. **Or run it from command line with Gradle, from project root:
`./gradlew matsSocketTestServer`.**

For some strange reason, it is quite a bit faster to run the tests on command line than via Gradle.

#### VM targets - no dependencies except Dart SDK

Standing in the `matssocket-client-dart` module directory, here's an example running the tests using the project
downloaded Dart SDK (using default platform/compiler - VM/Kernel):

```shell
dartsdk_download/dart-sdk/bin/dart test -j 1 test/*
```

#### Node targets - Node required, supplied by Gradle

To run the tests on the Node target, you need to have Node on `PATH`. To use the Node supplied by Gradle, run the
following command in project root: `./gradlew nodeBinDir` (or `download`). This will download Node and print the path
to the directory containing the Node executable, along with convenient path-setting commands for Unix and Windows.

Standing in the `matssocket-client-dart` module directory, here's an example running the tests on Node target compiled
to JavaScript:

```shell
export PATH=<nodeBinPath>:$PATH   # replace <nodeBinPath> with the path printed by Gradle
dartsdk_download/dart-sdk/bin/dart test -p node -c dart2js -j 1 test/*
```

#### Web targets - Chrome/Chromium required

For Web targets, you need to have Chrome or Chromium installed, where it will run it headless. The `dart test` command
will look for Chrome in a specific place, and if it is not found (e.g. if installed using snap, or you have Chromium
installed instead), it will fail. You can then set the path to your Chrome/Chromium binary with the `CHROME_EXECUTABLE`
environment variable. Find it with `which chromium` or `which chrome` (`where` on Windows).

Standing in the `matssocket-client-dart` module directory, here's an example running the tests on Web target compiled
to JavaScript:

```shell
export CHROME_EXECUTABLE=/snap/bin/chromium    # replace with your Chrome/Chromium path
dartsdk_download/dart-sdk/bin/dart test -p chrome -c dart2js -j 1 test/*
```

#### All platform/compiler combinations

The platform/compiler combinations are (The Dart default is '-p vm -c kernel'):

* `-p vm -c kernel` (VM, compiled to kernel - default)
* `-p vm -c source` (VM, run from source)
* `-p vm -c exe` (VM, compiled to native executable)
* `-p node -c dart2js` (Node, compiled to JS - Node required, downloaded by Gradle)
* `-p node -c dart2wasm` (Node, compiled to Wasm - Node required, downloaded by Gradle)
* `-p chrome -c dart2js` (Web, compiled to JS - Chrome/Chromium required, you must supply.)
* `-p chrome -c dart2wasm` (Web, compiled to Wasm - Chrome/Chromium required, you must supply.)

### Within IDE/IntelliJ

You can run the tests from within your IDE, e.g. IntelliJ. Just right-click on the `test`-directory and choose 'Run
Tests' This by default runs on the VM/Kernel target, and is very fast.

You need a Dart SDK that IntelliJ can use, and the one downloaded by Gradle works fine, and you'll get the correct
version. Find the installation path as described above (run `download` task). Just note that you might have to restart
the Dart analyzer after the Gradle download task runs, since the SDK will be overwritten and the analyzer thus crashes!


## Publishing

**NOTE: First update the version in `pubspec.yaml` and `MatsSocket.dart`, read below for format per release type!**

**Remember to git commit and tag the version bump before publishing, read below for tag and message format!**

Gradle publish tasks:
* `dartPublishDryRun`: Runs `pub publish --dry-run` to get a preview of what will be published, with scoring/warnings.
  Depends on `dartDoc` and only `testVmKernel` for test, for fast iteration. **Make sure `testDart` passes before
  publishing!**
* `dartPublish`: Runs `pub publish` to publish the lib to pub.dev. **Make sure `testDart` passes before publishing!**

To run testDart (set `chromePath` to your Chrome path):  
`./gradlew -PchromePath=/snap/bin/chromium testDart` 

Might want to run `dartPana` before publishing.

Release types / SemVer tags:
* Experimental (testing a new feature / fix):
    * Add `-experimental.X+<iso date>` to the version, X being a counter from 0.
* Release Candidate (before a new version, testing that it works, preferably in production!):
    * Add `-rc.X+<iso date>` to the version, X being a counter from 0.
* Release
    * Add `+<iso date>` to the version.

Standard for new versions would be to first publish a 'rc' version, and then publish a 'latest' release version.

### Versioning between the different parts of this project:

There are effectively three projects in MatsSocket: Backend, and the two clients. However, versions do not necessarily
need to be bumped for all three: The clients only depend on the _wire protocol_ of the server. If there are no logical
changes to the wire protocol, then the client versions and server versions can be bumped independently. Also, a bugfix
or minor improvement to one of the clients does not necessarily require a bump in the other client. A wire-protocol
change must be very carefully handled, since clients might be extremely sticky: Installed phone apps might not be
updated timely by the users. _(This is technically not as important for the JS client on a web page, since it will
typically be downloaded each time the user opens the web page.)_

The project version in root's build.gradle is only referring to the version of the server API and implementation.

### Transcript of a successful RC publish:

#### First add Dart to path, using `./gradlew dartBinPath`:
```shell
$ ./gradlew distclean dartBinPath   # to get the command.

> Task :matssocket-client-dart:dartBinPath
=== Dart executable: /home/user/git/matssocket/matssocket-client-dart/dartsdk_download/dart-sdk/bin/dart
=== Dart bin dir   : /home/user/git/matssocket/matssocket-client-dart/dartsdk_download/dart-sdk/bin/
    Unix:     export PATH=/home/user/git/matssocket/matssocket-client-dart/dartsdk_download/dart-sdk/bin/:$PATH
    Windows:  set PATH=/home/user/git/matssocket/matssocket-client-dart/dartsdk_download/dart-sdk/bin/;%PATH%

$ # Use the relevant PATH command for your shell.

$ dart --version
Dart SDK version: 3.9.4 (stable) (Tue Sep 30 12:08:50 2025 -0700) on "linux_x64"
```

#### Change version number and build:

* Change version in `pubspec.yaml` and `MatsSocket.dart` to relevant (RC) version! Read above on the version string
  format.

* See over [CHANGELOG.md](CHANGELOG.md): Update with version and notable changes.  
  "Coalesce" any non-release versions into the final release.

Build and test the client.
```shell
$ ./gradlew -PchromePath=/snap/bin/chromium clean buildDart testDart
```

#### Check over what will be published:


```shell
$ ./gradlew dartPublishDryRun
```
NOTICE: This will give an error wrt. git not being clean.

#### Commit and tag git:

Commit the version bump (both package.json and MatsSocket.js), message shall read ala:  
`Dart Client Release Candidate: 1.0.0-rc.1+2025-10-14  (from 0.19.0+2022-11-11)`

Tag git, and push, and push tags.
```shell
$ git tag -a Dart_client_v1.0.0-rc.1+2025-10-14 -m "Dart Client Release Candidate v1.0.0-rc.1+2025-10-14"
$ git push && git push --tags
```

#### Publish to pub.dev:

**Notice! Standing in the JavaScript Client directory!**

git must be clean for this to work.

The command will first ask you yes/no to publish ("publish is forever"). It will then ask you to go to a link and log in
using your Google account. It will wait for you to authorize the application, and then it will publish.

```shell
~/git/matssocket/matssocket-client-dart$ dart pub publish
```

#### Verify publication

It ends up here, immediately: [https://pub.dev/packages/matssocket](https://pub.dev/packages/matssocket)
