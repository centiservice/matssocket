import terser from "@rollup/plugin-terser";

export default {
    input: 'lib/index.js',
    // Suppress warning about dynamic loading of 'ws' module inside MatsSocket.js.
    // The 'ws' module is only for Node.js, and it shall not be bundled.
    // https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency
    external: [ 'ws' ],
    output: [
        {
            file: 'dist/MatsSocket.esm.js',
            format: 'esm',
            sourcemap: true
        },
        {
            file: 'dist/MatsSocket.esm.min.js',
            format: 'esm',
            plugins: [terser()],
            sourcemap: true
        },

        {
            file: 'dist/MatsSocket.umd.js',
            format: 'umd',
            name: 'matssocket',
            sourcemap: true
        },
        {
            file: 'dist/MatsSocket.umd.min.js',
            format: 'umd',
            plugins: [terser()],
            name: 'matssocket',
            sourcemap: true
        },

        {
            file: 'dist/MatsSocket.umd.cjs',
            format: 'umd',
            name: 'matssocket',
            sourcemap: true
        },
        {
            file: 'dist/MatsSocket.umd.min.cjs',
            format: 'umd',
            plugins: [terser()],
            name: 'matssocket',
            sourcemap: true
        }
    ]
};