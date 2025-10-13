import {execSync as x} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const apps = [
    'apps/vanilla-js-vite',
    'apps/react-ts-vite',
    'apps/next-ts',
    'apps/buildless-js'
];

console.log('Running npx "npm-check-updates@latest -u" for all');
const cmd = `npx npm-check-updates@latest -u`;
console.log('>', cmd);
x(cmd, {stdio: 'inherit', shell: true});
for (const a of apps) {
    const appPath = resolve(root, a);
    const cmd = `cd "${appPath}" && npx npm-check-updates@latest -u`;
    console.log('>', cmd);
    x(cmd, {stdio: 'inherit', shell: true});
}
console.log('Done.');
