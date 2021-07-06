import { terser } from "rollup-plugin-terser";

export default {
    input: 'lib/MatsSocket.js',
    // Suppress warning about dynamic loading of 'ws' module inside MatsSocket.js.
    // The 'ws' module is only for Node.js, and it shall not be bundled.
    // https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency
    external: [ 'ws' ],
    output: [
        {
            file: 'bundles/MatsSocket.esm.js',
            format: 'esm',
            sourcemap: true
        },
        {
            file: 'bundles/MatsSocket.esm.min.js',
            format: 'esm',
            plugins: [terser()],
            sourcemap: true
        },
        {
            file: 'bundles/MatsSocket.umd.cjs',
            format: 'umd',
            name: 'mats',
            sourcemap: true
        },
        {
            file: 'bundles/MatsSocket.umd.min.cjs',
            format: 'umd',
            plugins: [terser()],
            name: 'mats',
            sourcemap: true
        }
    ]
};