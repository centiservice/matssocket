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

**Remember to git commit and tag the version bump before publishing, read below for git tag and message format!**

For Java publishing, we use Gradle and the
[Vanniktech maven.publish plugin](https://vanniktech.github.io/gradle-maven-publish-plugin/central/), which uploads via
the Portal Publisher API.  
Credentials and GPG key are stored in the `~/.gradle/gradle.properties` file.

To see what will be published, we rely on the Central Portal's "review" functionality.

Release types / SemVer tags:
* Experimental (testing a new feature / fix):
    * Prefix `EXP-`, suffix: `.EXPX+<iso date>` to the version, X being a counter from 0.  
    example: `EXP-1.0.0.EXP0+2025-10-16`
* Release Candidate (before a new version, testing that it works, preferably in production!):
    * Prefix `RC-`, suffix `.RCX+<iso date>` to the version, X being a counter from 0  
    example: `RC-1.0.0.RC0+2025-10-16`
* Release
    * Suffix `+<iso date>` to the version.  
    example: `1.0.0+2025-10-16`

### Versioning between the different parts of this project:

There are effectively three projects in MatsSocket: Backend, and the two clients. However, versions do not necessarily
need to be bumped for all three: The clients only depend on the _wire protocol_ of the server. If there are no logical
changes to the wire protocol, then the client versions and server versions can be bumped independently. Also, a bugfix
or minor improvement to one of the clients does not necessarily require a bump in the other client. A wire-protocol
change must be very carefully handled, since clients might be extremely sticky: Installed phone apps might not be
updated timely by the users. _(This is technically not as important for the JS client on a web page, since it will
typically be downloaded each time the user opens the web page.)_

The project version in root's build.gradle is only referring to the version of the server API and implementation.

### Transcript of a successful publish:

#### Change version number and build:

* Change version in `build.gradle` and `DefaultMatsSocketServer.java` to relevant (RC) version! Read above on the
  version string format.

* See over [CHANGELOG.md](CHANGELOG.md): Update with version and notable changes.  
  "Coalesce" any non-release versions into the final release.

Build and test the entire project (server and clients)
```bash
$ ./gradlew distclean build
```

#### Commit and tag git:

Commit the version bump, message shall read ala: _(Note "Candidate" in the message: Remove it if not!)_  
`Java Server Release Candidate: RC-1.0.0.RC0+2025-10-16  (from 0.19.0+2022-11-11)`

Tag git, and push, and push tags. _(Note the "Candidate" in the message: Remove it if not!)_
```shell
$ git tag -a Java_server_vRC-1.0.0.RC0+2025-10-16 -m "Java Server Release Candidate vRC-1.0.0.RC0+2025-10-16"
$ git push && git push --tags
```

#### Publish to Maven Central Repository:

```shell
$ ./gradlew publishToMavenCentral
```

Afterwards, log in to [Maven Central Repository Portal](https://central.sonatype.com/publishing/deployments), find the
newly published version.

Check over it, and if everything looks good, ship it!

#### Verify publication

It says "Publishing" for quite a while in the Portal. Afterwards, it should say "Published". It might still take some
time to appear in all places.

Eventually, the new version should be available in:
* [Maven Central Repository](https://central.sonatype.com/namespace/io.mats3.matssocket) - First place it appears,
  directly after "Published" on Portal. Same style GUI as Portal.
* [repo.maven.apache.org/maven2](https://repo.maven.apache.org/maven2/io/mats3/matssocket/) - HTML File browser. This is
  where Maven/Gradle actually downloads artifacts from, so when they're available here, you can update your projects.
* [MVN Repository](https://mvnrepository.com/artifact/io.mats3.matssocket) - good old MVN Repository. Often VERY slow to
  display the new version.
