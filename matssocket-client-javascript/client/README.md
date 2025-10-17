# MatsSocket JavaScript client library

MatsSocket is a WebSocket-based client-server solution which bridges the asynchronous message based nature
of [Mats<sup>3</sup>](https://mats3.io/) all the way out to your end user client applications, featuring bidirectional
communication. It consists of a small MatsSocketServer API which is implemented on top of the _Mats<sup>3</sup> API_ and
_JSR 356 Java API for WebSockets_ (which most Servlet Containers implement), as well as client libraries - for which
there currently exists JavaScript and Dart/Flutter implementations.

This is the JavaScript client library for MatsSocket. Compatible with web browsers and Node.js. The client is coded
using EcmaScript Modules (ESM), and bundled into USM (Universal Module Definition) modules, also minified, using Rollup.

* Native EcmaScript Modules (ESM) - use the source files directly - `dist/MatsSocket.js` (or `lib/MatsSocket.js`),
  and siblings.
* Native EcmaScript Modules (ESM) - bundled - `dist/MatsSocket.esm.js`
* Native EcmaScript Modules (ESM) - bundled, minified - `dist/MatsSocket.esm.min.js`
* Universal Module Definition (UMD) - bundled - `dist/MatsSocket.umd.cjs` and `..umd.js`
* Universal Module Definition (UMD) - bundled, minified - `dist/MatsSocket.umd.min.cjs` and `..umd.min.js`
* A ZIP-file containing the source files - `dist/matssocket-<version>-js.zip`

Other deliverables:
* TS type files are created in `dist/` (the source files are also copied from `lib/` to `dist/`, thus available both
  places)
* Map files for produced bundles are also created in `dist/`.
* JSDoc is provided in `jsdoc/index.html`.

## Example

To get a gist of how this works on the client, here is a small JavaScript client code example:

```javascript
// Set up the MatsSocket.
let matsSocket = new MatsSocket("TestApp", "1.2.3",
    ['wss://matssocketserver-one.example.com/matssocket',
        'wss://matssocketserver-two.example.com/matssocket']);

// Using bogus example authorization.
matsSocket.setAuthorizationExpiredCallback(function (event) {
    // Emulate that it takes some time to get new auth.
    setTimeout(function () {
        let expiry = Date.now() + 20000;
        matsSocket.setCurrentAuthorization("DummyAuth:example", expiry, 10000);
    }, 100);
});

// Perform a Request to server, which will forward the Request to a Mats endpoint, whose
// reply comes back here, resolving the returned Promise.
matsSocket.request("MatsSocketEndpoint", "TraceId_" + matsSocket.randomId(6), {
    string: "Request String",
    number: Math.E
}).then(function (messageEvent) {
    console.log("REQUEST-with-Promise resolved, i.e. REPLY from Mats Endpoint. Took "
        + messageEvent.roundTripMillis + " ms: " + JSON.stringify(messageEvent.data));
});
```
More examples are in the [MatsSocket README.md](https://github.com/centiservice/matssocket/blob/main/README.md).
The [JS integration tests](https://github.com/centiservice/matssocket/tree/main/matssocket-client-javascript/tests/src)
shows all features of the MatsSocket client.

*This JS Client doesn't have any dependencies*, except for the WebSocket implementation provided by the environment
(browser or Node.js). When running in Node.js, it expects the module `ws` to be available, require()'ing it dynamically.

MatsSocket code is at [GitHub](https://github.com/centiservice/matssocket), with the JavaScript client library residing
in the [matssocket-client-javascript](https://github.com/centiservice/matssocket/tree/main/matssocket-client-javascript)
subproject.

For Development of the library itself, see [README-development.md](https://github.com/centiservice/matssocket/blob/main/matssocket-client-javascript/client/README-development.md).

## CDN

You can include the MatsSocket JS client library straight from an HTML page using a CDN. This can facilitate "buildless"
web development.

**For production use, you should always use a specific version (not `latest`/default), and you should use the
`integrity` attribute to verify the integrity of the delivered files!**

**Note wrt. integrity constraint with importmaps: you must be very careful to use the exact same URL in the 'imports'
map, as in the 'integrity' constraint map.** Only exact matches are actually checked: If you have a typo in the URL, or
reference a different URL, in the integrity constraint, no integrity check is performed on your import, and it will
simply pass! Make sure that it kicks in by messing with the hash: You should get an error in the Console and fail to
load the module.

There are examples of how to CDN-include with all three modes (UMD, ESM and importmaps) in the
[test server's webapp dir](https://github.com/centiservice/matssocket/tree/main/matssocket-server-impl/src/test/resources/webapp),
the three files `using_cdn_*.html` - and with small examples further down.

### jsDelivr

* HTML view resides at (`latest`): [https://www.jsdelivr.com/package/npm/matssocket](https://www.jsdelivr.com/package/npm/matssocket),
specific version, e.g. [1.0.0-rc1-2025-10-04](https://www.jsdelivr.com/package/npm/matssocket?version=1.0.0-rc1-2025-10-04)
* CDN URL (`latest`): [https://cdn.jsdelivr.net/npm/matssocket/](https://cdn.jsdelivr.net/npm/matssocket/),
specific version, e.g. [1.0.0-rc1-2025-10-04](https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/)

The version property can also be dynamic tags like `latest` or `rc`, but only use this in experimentation and
development, not in production! Using dynamic tags precludes the use of the `integrity` attribute.

* ESM minified module, `latest`: [https://cdn.jsdelivr.net/npm/matssocket@latest/dist/MatsSocket.esm.min.js](https://cdn.jsdelivr.net/npm/matssocket@latest/dist/MatsSocket.esm.min.js)
* UMD minified module, `latest`: [https://cdn.jsdelivr.net/npm/matssocket@latest/dist/MatsSocket.umd.min.js](https://cdn.jsdelivr.net/npm/matssocket@latest/dist/MatsSocket.umd.min.js)

You want to change the `latest` to a specific version, e.g. `1.0.0-rc1-2025-10-04`.

In a development situation, you might want to remove the ".min" part.

### UNPKG

* HTML view resides at (`latest`): [https://app.unpkg.com/matssocket/](https://app.unpkg.com/matssocket/),
  specific version, e.g. [1.0.0-rc1-2025-10-04](https://app.unpkg.com/matssocket@1.0.0-rc1-2025-10-04/)

The version property can also be dynamic tags like `latest` or `rc`, but only use this in experimentation and
development, not in production! Using dynamic tags precludes the use of the `integrity` attribute.
Note that UNPKG's tags-based URLs _redirects_ to the specific tagged version (as opposed to jsDelivr, which just
directly serves the tagged version)

* ESM minified module, `latest`: [https://unpkg.com/matssocket@latest/dist/MatsSocket.esm.min.js](https://unpkg.com/matssocket@latest/dist/MatsSocket.esm.min.js)
* UMD minified module, `latest`: [https://unpkg.com/matssocket@latest/dist/MatsSocket.umd.min.js](https://unpkg.com/matssocket@latest/dist/MatsSocket.umd.min.js)

You want to change the `latest` to a specific version, e.g. `1.0.0-rc1-2025-10-04`.

In a development situation, you might want to remove the ".min" part.

### esm.sh

Esm.sh is only for modern ESM `<script type="module">` projects - no UMD! It is powered by Cloudflare. Esm.sh does not
have an HTML view of the package.

The version property can be dynamic tags like `latest` or `rc`, but only use this in experimentation and development,
not in production!

Esm.sh doesn't yet support Subresource Integrity (SRI): It uses an indirection solution, where the target file is a
shim that again refers to a different import (open the URLs below directly in a browser and see!), and it rewrites the
target resource, thus you cannot calculate the hash independently. Evidently this
<a href="https://github.com/esm-dev/esm.sh/issues/1206">is worked on!</a>

* 'latest': [https://esm.sh/matssocket](https://esm.sh/matssocket)
* 'rc': [https://esm.sh/matssocket@rc](https://esm.sh/matssocket@rc)
* Specific version: [https://esm.sh/matssocket@1.0.0-rc1-2025-10-04](https://esm.sh/matssocket@1.0.0-rc1-2025-10-04)
* Specific file: [https://esm.sh/matssocket@rc/dist/MatsSocket.esm.js](https://esm.sh/matssocket@rc/dist/MatsSocket.esm.js),
  but this doesn't give you the non-minified version as you might have hoped; As mentioned, esm.sh rewrites the targets!


### Inclusion in HTML

Exemplified with the jsDelivr CDN. You must choose the version, and find the hash for the integrity attribute.

To get the integrity hash, a quick way is to first just use a wrong hash, e.g. "sha384-xyz". Both Firefox and Chrome
will in the dev console error log show the hash it calculated and compared with (based on the prefix you used, e.g. 
"sha384-" or "sha256-"). Remember to add the prefix! For a bit of extra paranoia, you should verify that the hashes are
the same for jsDelivr and UNPKG. <i>(As mentioned above, esm.sh doesn't support SRI)</i>

_(If you drop the version, or specify `latest`, you will get the latest stable version, which will change over time -
and you cannot use the `integrity` attribute. Only for experimentation and development! You could also then drop the
".min" part of the filename to directly get the full files, which might aid debugging.)_

Inclusion using UMD:
```html
<script src="https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/dist/MatsSocket.umd.min.js"
        integrity="sha384-ViD2k59N3y1xE1T/TPyjxXS17F/t2RN240XPhODF/S9b3wB/kZ+H1RLptGFjgEKF"
        crossorigin="anonymous"></script>

<script>
    let matsSocket = new matssocket.MatsSocket("TestApp", "1.2.3", ['ws://localhost:8080/matssocket']);
    // ...
</script>
```

Inclusion using ESM - note the use of modulepreload to be able to use the `integrity` attribute:
```html
<link rel="modulepreload"
      href="https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/dist/MatsSocket.esm.min.js"
      integrity="sha384-52V9mwGR+zH7cdyNYFSZ0dHyvpGaYYcwaxkt0Pl3Gfj1WAfA9hlQg3R+LMgb3EX8"
      crossorigin="anonymous">

<script type="module">
    import * as matssocket from "https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/dist/MatsSocket.esm.min.js";
    // .. or use named imports: import { MatsSocket } from "....."

    // Either directly here, or in additional <script type="module"> blocks:
    let matsSocket = new matssocket.MatsSocket("TestApp", "1.2.3", ['ws://localhost:8080/matssocket']);
    // ...
</script>

```

.. or ESM via import maps (highly recommended):
```html
<script type="importmap">
{
  "imports": {
    "matssocket": "https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/dist/MatsSocket.esm.min.js"
  },
  "integrity": {
    "https://cdn.jsdelivr.net/npm/matssocket@1.0.0-rc1-2025-10-04/dist/MatsSocket.esm.min.js":
      "sha384-52V9mwGR+zH7cdyNYFSZ0dHyvpGaYYcwaxkt0Pl3Gfj1WAfA9hlQg3R+LMgb3EX8"
  }
}
</script>

<script type="module">
    import * as matssocket from "matssocket";
    // .. or use named imports: import { MatsSocket } from "matssocket"

    // Either directly here, or in additional <script type="module"> blocks:
    let matsSocket = new matssocket.MatsSocket("TestApp", "1.2.3", ['ws://localhost:8080/matssocket']);
    // ...
</script>
```
