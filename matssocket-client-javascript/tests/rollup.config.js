export default {
    input: 'src/all_tests.js',
    // Suppress warning about dynamic loading of dependent modules used in the tests, which will be supplied by env.
    // https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency
    external: [ 'matssocket', 'chai' ],
    output: [
        {
            file: 'bundle/all_tests.esm.js',
            format: 'esm',
            sourcemap: true
        },
        {
            file: 'bundle/all_tests.umd.cjs',
            format: 'umd',
            name: 'mats',
            sourcemap: true,
            globals: {
                "matssocket": "matssocket",
                "chai": "chai",
            }
        }
    ]
};