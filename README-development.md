# MatsSocket Java Server API and Implementation DEVELOPMENT

**NOTICE! There are separate README-development.md files for the
[JavaScript client](matssocket-client-javascript/client/README-development.md) and
[Dart client](matssocket-client-dart/README-development.md)!**

The Java code is divided in two parts, API and standard implementation.

The API, residing in [matssocket-server-api](matssocket-server-api), has three top-level classes: `MatsSocketServer`,
which is the entire "front facing API" where you define MatsSocketEndpoints and -Terminators for the client to do
requests and sends to. You can also perform requests, sends and publishes to the clients, and it has a heap of
instrumentation functionality, e.g. requesting all local og global sessions, there a set of event listeners. There's
also the `AuthenticationPlugin`, which will be implemented by the library user to integrate with their existing
authentication system. And finally, the `ClusterStoreAndForward`, which is a wrapper over some storage layer like a
database, where this storage must be shared between all nodes in a MatsSocketServer cluster.

The standard MatsSocket implementation, residing in [matssocket-server-impl](matssocket-server-impl), is an
implementation of the `MatsSocketServer` and `ClusterStoreAndForward` classes - but there is no implementation of the
`AuthenticationPlugin`, as this is left for the user to implement, based on how they want to integrate with their
existing authentication system.

## Gradle tasks:

* `build`: Build the Java projects, jar files, javadoc, and runs tests.
* `build -x test`: build, skipping tests.
* `buildJava`: Convenient "synonym" for build for both `matssocket-server-api` and `matssocket-server-impl:build`, which
  means that you can run them both (alone) from root with `./gradlew buildJava`
* `matsSocketTestServer`: Runs the MatsSocketTestServer, which is a local HTTP server that serves a GUI and the
  JavaScript tests.
* `versions`: Shows the version of the build tooling, which currently thus also defines which Java version is used for
  build.
* `allDeps`: Runs the `DependencyReportTask` for the Java projects (i.e., get all library/"maven" dependencies for all
  configurations)
* `clean`: Clean the built artifacts.

## Development

Fire up the [MatsSocketTestServer](matssocket-server-impl/src/test/java/io/mats3/matssocket/MatsSocketTestServer.java)
in your IDE. _**Right-click → run or debug**_ shall work after importing the Gradle project. (It can also be fired
up command line by the gradle task `./gradlew matsSocketTestServer`)

This has three local HTTP servers running on port 8080-8082. You can go to http://localhost:8080/ to see the GUI.
The GUI contains a set of "demo tasks", but also links to run all the JavaScript tests in the browser.

The HTML files of this server resides in the [resources/webapp](matssocket-server-impl/src/test/resources/webapp) folder.
They access the JavaScript client files and JavaScript test files directly from their source location. This means that
you can change all the HTML files, JavaScript client JavaScript files, JavaScript test files, and the Java files, and
then do a "Build Project" (Ctrl+F9 in IntelliJ), and the changes will be reflected in the browser (assuming any Java
changes could be hot-swapped, otherwise just restart the server. If you change anything in the startup code of the test
server, these things will not be reflected until restart).

## Testing

There are currently no pure Java tests. Testing is done using integration tests using the JavaScript and Dart clients
tests. Therefore, read the `README-development.md` files in the
[matssocket-client-javascript/client](matssocket-client-javascript/client)
and [matssocket-client-dart](matssocket-client-dart) folders.

## Publishing

**NOTE: First update the version in root `build.gradle` and `DefaultMatsSocketServer.java`, read below for format per
release type!**

**Remember to git commit and tag the version bump before publishing, read below for tag and message format!**

For Java publishing, we use Gradle and the Vannitech plugin, which uploads via the Portal Publisher API.

To see what will be published, we rely on the Central Portal's "review" functionality.


Release types / SemVer tags:
* Experimental (testing a new feature / fix):
    * Prefix `EXP-`, suffix: `-EXPX+<iso date>` to the version, X being a counter from 0.  
    example: `EXP-1.0.0-EXP0+2025-10-16`
* Release Candidate (before a new version, testing that it works, preferably in production!):
    * Prefix `RC-`, suffix `-RCX+<iso date>` to the version, X being a counter from 0  
    example: `RC-1.0.0-RC0+2025-10-16`
* Release
    * Suffix `+<iso date>` to the version.  
    example: `1.0.0+2025-10-16`

### Transcript of a successful RC publish:

#### Change version number and build:

Change version in `build.gradle` and `DefaultMatsSocketServer.java` to relevant (RC) version! Read above on the version
string format.

Build and test the entire project (server and clients)
```bash
./gradlew distclean build
```

#### Commit and tag git:

Commit the version bump (both package.json and MatsSocket.js), message shall read ala:  
`Bumping Java Server version: RC-1.0.0-RC0+2025-10-16  (from 0.19.0+2022-11-11)`

Tag git, and push, and push tags.
```shell
$ git tag -a vJava_server_RC-1.0.0-RC0+2025-10-16 -m "Java Server Release Candidate vRC-1.0.0-RC0+2025-10-16"
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
