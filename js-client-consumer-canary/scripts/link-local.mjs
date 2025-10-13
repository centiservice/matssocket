import {execSync as x} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const our_path = dirname(fileURLToPath(import.meta.url));
const root = resolve(our_path, '..');
const apps = [
    'apps/vanilla-js-vite',
    'apps/react-ts-vite',
    'apps/next-ts',
    'apps/buildless-js'
];

// Path to your JS client package root:
const localPkgPath = resolve(root, '../matssocket-client-javascript/client');

console.log('Linking apps to LOCAL package:', localPkgPath);
for (const a of apps) {
    const cmd = `npm --prefix ${resolve(root, a)} i "${localPkgPath}"`;
    console.log('>', cmd);
    x(cmd, {stdio: 'inherit'});
}
console.log('Done. (Local)');
