import { terser } from "rollup-plugin-terser";

export default {
    input: 'lib/MatsSocket.js',
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