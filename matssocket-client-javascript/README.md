# MatsSocket JavaScript client library

**The main [README.md](client/README.md) and [README-development.md](client/README-development.md) is in
the [client](client/) submodule!**

_(The README.md and README-development.md resides in the client submodule so that they will be part of the npm
package.)_

This is the JavaScript client library for MatsSocket. Compatible with web browsers and Node.js. The client is coded
using EcmaScript Modules (ESM), and bundled into USM (Universal Module Definition) modules, also minified, using Rollup.

## Layout

There are three sub modules: `client`, `tests_esm`, and `tests_umd`. The `client` module contains the actual MatsSocket
client code in the 'lib' directory, coded as EcmaScript Modules (ESM) - and its build step creates EMD and UMD bundles,
both full and minified. The `tests_esm` module contains the unit and integration tests in the 'src' directory. The
`tests_umd` module bundles up the tests from the 'tests_esm' module as a UMD module, and then runs them using the UMD
bundle of the client. This is to ensure that the bundled UMD client works as expected.




