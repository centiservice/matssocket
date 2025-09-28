# MatsSocket JavaScript client library

**The main [README.md](client/README.md) and [README-development.md](client/README-development.md) is in
the [client](client/) submodule!**

_(The README.md and README-development.md resides in the client submodule so that they will be part of the npm
package.)_

This is the JavaScript client library for MatsSocket. Compatible with web browsers and Node.js. The client is coded
using EcmaScript Modules (ESM), and bundled both into ESM and USM (Universal Module Definition) modules, both full and
minified, using Rollup.

## Layout

There are two sub modules: `client` and `tests`. The `client` module contains the actual MatsSocket client code in the '
lib' directory, coded as EcmaScript Modules (ESM) - and its build step creates EMD and UMD bundles, both full and
minified. The `tests` module contains the unit and integration tests in the 'src' directory. The tests are run "raw",
only depending on the actual JS files, but also bundled up in EMD and UMD bundles and run. This is to ensure that the
bundled UMD client works as expected.
