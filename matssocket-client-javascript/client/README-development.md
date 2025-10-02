# MatsSocket JavaScript client library DEVELOPMENT

## Layout

There are two sub modules: `client` and `tests`. The `client` module contains the actual MatsSocket client code in the 
'lib' directory, coded as EcmaScript Modules (ESM) - and its build step creates ESM and UMD bundles, both full and
minified. The `tests` module contains the unit and integration tests in the 'src' directory. The tests are both run
"raw", only depending on the actual JS files, and also bundled up in ESM and UMD bundles and run. This is to ensure that
the bundled ESM and UMD modules works as expected.

## Gradle tasks

_Note: When run without subproject qualifier (i.e. `matssocket-client-javascript:[client|tests]:...`), the `build`,
`archiveLib`,`test`, `nodeBinDir`, `download`, `downloadAll` and `distclean` tasks will execute the corresponding tasks
both in Dart and JavaScript clients. `matsSocketTestServer` is a root project task that all testing relies on. The other
tasks are unique to the JavaScript client, and it thus doesn't matter with qualifier._

* `build`: (for 'client') Builds the modules, including `tsc` to make TypeScript defs + tasks `archiveLib` and `jsDoc`.
* `build`: (for 'tests') Builds the modules for tests + task `testJs`.
* `archiveLib`: zips up the `lib/` directory, and puts the zip it in the `build-gradle/dist/` directory.
* `jsDoc`: runs `npm run jsdoc` to generate JSDoc documentation, and shows the path to the result.
* `test`: synonym for `testJs`.
* `testJs`: tasks `testRaw`, `testEms`, and `testUmd` - see later.
* `nodeBinDir` - Downloads Node, then prints out the path to the Node bin dir, and PATH variables for Unix and Windows.
* `download`: synonym for `nodeBinDir`.
* `downloadAll`: .. download + `npm install` to fetch dependencies.
* `matsSocketTestServer`: Runs the MatsSocketTestServer, which is used for integration tests.
* `distclean`: In addition to `clean` which deletes build artifacts, also deletes all downloaded infrastructure.

### Node/NPM tasks
* `npmInstall`: runs `npm install` to install all JS deps in package.json.
* `npmCleanUpdate`: deletes 'node_modules' and 'package-lock.json', and then runs `npm update` to update deps to latest
  specified in 'package.json'.
* `npmAudit`: runs `npm audit` to check for vulnerabilities.
* `npmCheckUpdates`: runs `npx npm-check-updates@latest` to check all JS deps in package.json for newer versions.
* `npmCheckUpdatesUpdate`: runs `npx npm-check-updates@latest -u` to force update of all deps, ignoring specified
  versions in 'package.json'

### Publishing
* `jsPublishDryRun`: Runs `npm publish --dry-run --tag --experimental` to get a preview of what will be published,
  with scoring/warnings. Depends on `jsDoc` and `testRaw` for fast iteration. **Make sure `testJs` passes before
  publishing!**
* `jsPublishExperimental`: Runs `npm publish --tag experimental` XXXXXXXXX
* `jsPublishStable`: Runs `npm publish --tag stable` to publish the lib to NPM. **Make sure `testJs` passes before`
* `jsPackDryRun`: Runs `npm pack --dry-run` - What publish would do. XXXXXXXX
* `jsPublish`: Runs `npm publish` to publish the lib to NPM. **Make sure `testJs` passes before publishing!**

## Build

The Gradle client build will create JavaScript bundles in several formats, as well as JSDoc documentation. The resulting
set of distributions are as such:

* Native EcmaScript Modules (ESM) - "raw", use the files directly - `lib/MatsSocket.js` and siblings.
* Native EcmaScript Modules (ESM) - bundled - `dist/MatsSocket.esm.js`
* Native EcmaScript Modules (ESM) - bundled, minified - `dist/MatsSocket.esm.min.js`
* Universal Module Definition (UMD) - bundled - `dist/MatsSocket.umd.cjs`
* Universal Module Definition (UMD) - bundled, minified - `dist/MatsSocket.umd.min.cjs`
* A ZIP-file containing the source files - `build-gradle/dist/matssocket-<version>-js.zip`

Other deliverables:
* JSDoc is provided in `jsdoc/index.html`.
* TS type files are created in `dist/`.
* Map files of all are also created in `dist/`.

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
npx mocha src/all_tests.js
npx mocha bundle/all_tests.esm.js   // requires building first
npx mocha bundle/all_tests.umd.cjs  // requires building first
```

### From browser

When you run start the test server, it will start three servers taking ports from first available from 8080 (you find
the result in the log). Open a browser and navigate to http://localhost:8080/, where you will find links to small
HTML files that run the tests in the browser. To run the bundled variants, you must first build them, both client and
tests - `./gradlew matssocket-client-javascript:build` will do that.

## Development / Building

Running the `MatsSocketTestServer` makes it simple to both test and develop on the JS Client. It is the class
`io.mats3.matssocket.MatsSocketTestServer`, residing in the 'matssocket-server-impl' - you may find it in e.g. IntelliJ,
right-click and select 'Run' or 'Debug'. Or run it from command line with Gradle, from project root:
`./gradlew matsSocketTestServer`.

Access the test server on http://localhost:8080/. Here you can run the unit and integration tests in
the browser. It maps directly to the source files. Also available is a test-run using the UMD-files of both the
client and the tests, but then you first need to build the project so that the UMD modules exist.
