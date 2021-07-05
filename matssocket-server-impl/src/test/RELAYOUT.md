# Going for publishing on npm

## Need to lay this out as a proper module that must be built

* AMD
* CommonJS
* UMD
* ESM

Links:

* https://www.sensedeep.com/blog/posts/2021/how-to-create-single-source-npm-module.html
    * Argues that you need to do file mangling

* https://dev.to/remshams/rolling-up-a-multi-module-system-esm-cjs-compatible-npm-library-with-typescript-and-babel-3gjg
    * Good stuff!
    * Goes from TypeScript source to several "rolled up", including minification

* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
    * MDN about import / export

* https://zellwk.com/blog/publishing-npm-packages-that-can-be-used-in-browsers-and-node/
    * The differences between Node require and Browser direct include

* https://betterprogramming.pub/what-are-cjs-amd-umd-esm-system-and-iife-3633a112db62
    * Good explanations of the different types, explaining Rollup

* https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
    * MDN Guide about JavaScript modules

* https://hacks.mozilla.org/2015/08/es6-in-depth-modules/
    * import and export at depth - before standardization

* https://javascript.info/modules-intro
    * Good about modules

* https://javascript.plainenglish.io/javascript-modules-for-beginners-56939088f7d9
    * Quick explanation about import/export as a CommonJS analogy.

* https://www.freecodecamp.org/news/javascript-modules-a-beginner-s-guide-783f7d7a5fcc/
    * Also going through the different CommonJS, AMD and UMD - and then native JavaScript modules, going into an argument about "live read-only views of the exports".

Random about "multi builds", Node and browser:

* Messy: https://dev.to/riversun/recipes-on-how-to-create-a-library-that-supports-both-browser-and-node-js-201m

* Not so relevant: https://zellwk.com/blog/publish-to-npm/
    * Some blurbs about publishing packages, introduces 'np' to do this faster..

### Notes:

Evidently, new browsers support the ESM format directly

### AMD

from https://javascript.info/modules-intro:
AMD – one of the most ancient module systems, initially implemented by the library require.js.

### CommonJS:

from https://javascript.info/modules-intro:
CommonJS – the module system created for Node.js server.

From https://zellwk.com/blog/publishing-npm-packages-that-can-be-used-in-browsers-and-node/

Explaining using `module.exports` and require('./library.js)

> This format of passing variables around in Node with require and module.exports is called CommonJS

So, how to make a library that works both in browser and Node? Answer: UMD

Several tools to do such wrapping:

* Gulp-umd
* Webpack
* Parcel
* Rollup

### UMD

Universal Module Definition

from https://javascript.info/modules-intro:
UMD – one more module system, suggested as a universal one, compatible with AMD and CommonJS.

### ESM

EcmaScript Modules