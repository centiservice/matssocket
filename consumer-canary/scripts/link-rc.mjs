import {execSync as x} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const apps = [
    'apps/vanilla-js-vite',
    'apps/react-ts-vite',
    'apps/next-ts',
    'apps/no-bundler'
];

// Published RC tag/version:
const version = 'matssocket@rc';

console.log('Linking apps to  REGISTRY package (tag "rc"):', version);
for (const a of apps) {
    const cmd = `npm --prefix ${resolve(root, a)} i ${version}`;
    console.log('>', cmd);
    x(cmd, {stdio: 'inherit'});
}
console.log('Done. (registry, tag "rc")');
