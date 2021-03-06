export default {
    input: '../tests_esm/src/all_tests.js',
    // Suppress warning about dynamic loading of dependent modules used in the tests, which will be supplied by env.
    // https://rollupjs.org/guide/en/#warning-treating-module-as-external-dependency
    external: [ 'matssocket', 'chai', 'sinon' ],
    output: [
        {
            file: 'bundles/all_tests.esm.js',
            format: 'esm',
            sourcemap: true
        },
        {
            file: 'bundles/all_tests.umd.js',
            format: 'umd',
            name: 'mats',
            sourcemap: true,
            globals: {
                "matssocket": "matssocket",
                "chai": "chai",
                "sinon": "sinon"
            }
        }
    ]
};