# MatsSocket JavaScript client library DEVELOPMENT

## Layout

There are two sub modules: `client` and `tests`. The `client` module contains the actual MatsSocket client code in the 
'lib' directory, coded as EcmaScript Modules (ESM) - and its build step creates ESM and UMD bundles, both full and
minified. The `tests` module contains the unit and integration tests in the 'src' directory. The tests are both run
"raw", only depending on the actual JS files, and also bundled up in ESM and UMD bundles and run. This is to ensure that
the bundled ESM and UMD modules works as expected.

## Gradle tasks

_Note: When run without subproject qualifier (i.e. `matssocket-client-javascript:[client|tests]:...`),
the `build`, `archiveLib`,`test`, `nodeBinDir`, `download`, `downloadAll`, `versions` and `distclean` tasks will execute
the corresponding tasks both in Dart and JavaScript clients. `matsSocketTestServer` is a root project task that all
testing relies on. The other tasks are unique to the JavaScript client, and it thus doesn't matter with qualifier._

* `build`: (for 'client') Builds the modules, including `tsc` to make TypeScript defs + tasks `archiveLib` and `jsDoc`.
* `build`: (for 'tests') Builds the modules for tests + task `testJs`.
* `buildJs`: Convenient "synonym" for both building `matssocket-client-javascript:client` and build and run tests in
  `matssocket-client-javascript:client`.
  `matssocket-client-javascript:tests`, which means that you can run them both from root with `./gradlew buildJs`
* `archiveLib`: zips up the `lib/` directory, and puts the zip it in the `build-gradle/dist/` directory.
* `jsDoc`: runs `npm run jsdoc` to generate JSDoc documentation, and shows the path to the result.
* `test`: synonym for `testJs`.
* `testJs`: tasks `testRaw`, `testEms`, and `testUmd` - see later.
* `nodeBinDir` - Downloads Node, then prints out the path to the Node bin dir, and PATH variables for Unix and Windows.
* `download`: synonym for `nodeBinDir`.
* `downloadAll`: .. download + `npm install` to fetch dependencies.
* `matsSocketTestServer`: Runs the MatsSocketTestServer, which is used for integration tests.
* `versions`: tasks `nodeVersion` + `npmVersion`.
* `distclean`: In addition to `clean` which deletes build artifacts, also deletes Node.js, node_modules etc.
  Shall be as clean as newly cloned repo.

### Node/NPM tasks
* `nodeVersion`: prints out the Node version.
* `npmVersion`: prints out the NPM version.
* `npmInstall`: runs `npm install` to install all JS deps in package.json.
* `npmCleanUpdate`: deletes 'node_modules' and 'package-lock.json', and then runs `npm update` to update deps to latest
  specified in 'package.json'.
* `npmAudit`: runs `npm audit` to check for vulnerabilities.
* `npmCheckUpdates`: runs `npx npm-check-updates@latest` to check all JS deps in package.json for newer versions.
* `npmCheckUpdatesUpdate`: runs `npx npm-check-updates@latest -u` to force update of all deps, ignoring specified
  versions in 'package.json'

## Development

Running the `MatsSocketTestServer` makes it simple to both test and develop on the JS Client. It is the class
`io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl' - you may find it in e.g. IntelliJ,
right-click and select 'Run' or 'Debug'. Or run it from command line with Gradle, from project root:
`./gradlew matsSocketTestServer`.

Access the test server on http://localhost:8080/. Here you can run the unit and integration tests in
the browser. It maps directly to the source files. Also available are test-runs using the bundled ESM and UMD modules of
both the client and the tests, but then you first need to build the project so that these bundles exists.

## Build

The Gradle client build will create JavaScript bundles in several formats, as well as JSDoc documentation. The resulting
set of distributions are as such:

* Native EcmaScript Modules (ESM) - "raw", use the files directly - `lib/MatsSocket.js` and siblings.
* Native EcmaScript Modules (ESM) - bundled - `dist/MatsSocket.esm.js`
* Native EcmaScript Modules (ESM) - bundled, minified - `dist/MatsSocket.esm.min.js`
* Universal Module Definition (UMD) - bundled - `dist/MatsSocket.umd.cjs` and `..umd.js`
* Universal Module Definition (UMD) - bundled, minified - `dist/MatsSocket.umd.min.cjs` and `..umd.min.js`
* A ZIP-file containing the source files - `dist/matssocket-<version>-js.zip`

Other deliverables:
* TS type files are created in `dist/`.
* Map files of all are also created in `dist/`.
* JSDoc is provided in `jsdoc/index.html`.

Run `./gradlew jsPublishDryRun` to see what will be published.

*This JS Client doesn't have any dependencies*, except for the WebSocket implementation provided by the
environment (browser or Node.js). When running in Node.js, it expects the module `ws` to be available, require()'ing it
dynamically.

The build is done using Gradle with the `node-gradle` plugin, using npm for package management of the build and test
environment. The build will install a local Node.js and npm, and then use that to install packages and run scripts.

## Running JavaScript tests

### Via Gradle

The gradle task `testJs` runs all tests in the three modes `test:raw` (straight from files), `test:esm`
(using ESM module of client and test files) and `test:umd` (using UMD module of client and test files).

```shell
./gradlew testJs
```

There are also separate Gradle tasks for each mode: `testRaw`, `testEms` and `testUmd`.` All Gradle test tasks handle
their respective dependencies; Downloading dart and deps, building the modules, and firing up the test server.

### From command line using Gradle-downloaded Node.js

You may use the Gradle-downloaded Node.js to run the tests directly from command line.
Run `./gradlew matssocket-client-javascript:downloadAll` to download Node.js and dependencies, which also prints out
the path to the Node bin folder, and Node's PATH variables.

**You need to have the test server running**, as the tests are integration tests that connect to a test-specific
MatsSocketServer with multiple test MatsSocket endpoints, as well as a few HTTP endpoints. This server is the
`io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl' module. Find it in e.g. IntelliJ,
right-click and select 'Run' or 'Debug'. **Or run it from command line with Gradle, from project root:
`./gradlew matsSocketTestServer`.**

#### Using the scripts in `package.json`:
Stand in the `matssocket-client-javascript/tests` directory. Have the Node bin dir on your PATH (see above).
```shell
npm run test:raw
npm run test:esm  // requires building first
npm run test:umd  // requires building first
npm run test      // All of the above, requires building first
```

#### Using npx and mocha directly:
Stand in the `matssocket-client-javascript/tests` directory. Have the Node bin dir on your PATH (see above).
```shell
npx mocha src/*test.js
npx mocha bundle/all_tests.esm.js   // requires building first
npx mocha bundle/all_tests.umd.cjs  // requires building first
```

### From browser

When you run start the test server, it will start three servers taking ports from first available from 8080 (you find
the result in the log). Open a browser and navigate to http://localhost:8080/, where you will find links to small
HTML files that run the tests in the browser. To run the bundled variants, you must first build them, both client and
tests - `./gradlew matssocket-client-javascript:build` will do that.

### Watching tests and lib for changes

Gradle: `./gradlew jsTestWatch`

Command line, standing in `matssocket-client-javascript/tests/` directory - giving a nice colorization:  
_(Prerequisite: Set PATH, read above)_
```shell
npm run test:raw -- --node-option=watch --watch-files=../client/lib
```
or - this one makes it possible to specify the test file to run:
```shell
npx mocha src/*test.js --node-option=watch --watch-files=../client/lib
```


## Publishing

**NOTE: First update the version in `package.json` and `MatsSocket.js`, read below for format per tag/release type!**

**Remember to git commit and tag the version bump before publishing, read below for tag and message format!**

Convenient Gradle tasks to check what will be released - these depends on `build`.
* `jsPackDryRun`: Runs `npm pack --dry-run` - Quick way to get the contents of published tarball.
* `jsPublishDryRun`: Runs `npm publish --dry-run --tag --experimental` to get a preview of what will be published,
  with scoring/warnings.

Since the other aspects wrt. publishing requires command line interaction, they can't anymore be expressed as neat
Gradle tasks - you need to interact directly with `npm`. You must get node/npm on PATH, simple instructions are
provided by the `./gradlew nodeBinDir` task.

There are three relevant NPM tags: 'experimental', 'rc' and 'latest' - the latter is the default.
We use different version strings for each tag.

To actually interact with NPMjs.com, you need BOTH to be logged in to NPMjs.com with `npm adduser`, and to supply
One Time Password (OTP) with the `--otp` argument on the `npm publish` command.

Release types / NPM tags:
* Experimental (testing a new feature / fix):
    * Add `-experimental-<iso datetiome>` to the version. **(Do NOT use plus before datetime**, npm cleans this as
      an error!)
    * `npm publish --tag experimental --otp XXXXXX`, publishing the package and moving the 'experimental' tag to this
      version.
* Release Candidate (before a new version, testing that it works, preferably in production!):
    * Add `-rcX-<iso date>` to the version, X being a counter from 0 **(Do NOT use plus before date**, npm
      cleans this as an error!)
    * `npm publish --tag rc --otp XXXXXX`, publishing the package and moving the 'rc' tag to this version.
* Release/Latest:
    * Add `-<iso date>` to the version. **(Do NOT use plus before date**, npm cleans this as an error!).
    * `npm publish --otp XXXXXX`, publishing the package and moving the 'rc' tag to this version.

Standard for new versions would be to first publish a 'rc' version, and then publish a 'latest' release version.

Before publish, do a:
`./gradlew clean jsPublishDryRun`

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

#### First add node to path, using `./gradlew nodeBinDir`:
```shell
$ ./gradlew nodeBinDir   # to get the command.

> Task :matssocket-client-javascript:client:nodeBinDir
=== Node.js bin dir: /home/user/git/matssocket/matssocket-client-javascript/client/node_download/nodejs/node-v24.7.0-linux-x64/bin
    Unix:     export PATH=/home/user/git/matssocket/matssocket-client-javascript/client/node_download/nodejs/node-v24.7.0-linux-x64/bin:$PATH
    Windows:  set PATH=/home/user/git/matssocket/matssocket-client-javascript/client/node_download/nodejs/node-v24.7.0-linux-x64/bin;%PATH%

$ # Use the relevant PATH command for your shell.

$ node --version
v24.7.0
$ npm --version
11.5.1
```

#### Then `npm adduser` to log in to NPMjs.com (requires 2FA):
```shell
$ npm adduser
npm notice Log in on https://registry.npmjs.org/
Create your account at:
https://www.npmjs.com/login?next=/login/cli/06c5b41b-3eb8-4897-84d4-cee35aec0f03
Press ENTER to open in the browser...

Logged in on https://registry.npmjs.org/.

$ npm whoami
stolsvik
```

#### Change version number and build:

Change version in `package.json` and `MatsSocket.js` to relevant (RC) version! Read above on the version string
format.

Build and test the client. **Note: You should also want to run the tests in the browser.** 
```shell
$ ./gradlew clean matssocket-client-javascript:build
```

#### Check over what will be published:

```shell
$ ./gradlew jsPublishDryRun
```

#### Commit and tag git:

Commit the version bump (both package.json and MatsSocket.js), message shall read ala:  
`Bumping JavaScript Client version, RC: 1.0.0-rc0-2025-10-04  (from 0.19.0-2022-11-11)`

Tag git, and push, and push tags.
```shell
$ git tag -a JavaScript_client_v1.0.0-rc0-2025-10-04 -m "JavaScript Client Release Candidate v1.0.0-rc0-2025-10-04"
$ git push && git push --tags
```

#### Publish to NPMjs.com:

**Notice! Standing in the JavaScript Client directory!**

```shell
~/git/matssocket/matssocket-client-javascript/client$ npm publish --tag rc -otp=543491
```
