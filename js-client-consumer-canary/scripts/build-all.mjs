import {execSync as x} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const our_path = dirname(fileURLToPath(import.meta.url));
const root = resolve(our_path, '..');

const runs = [
    'npm --prefix apps/vanilla-js-vite run build',
    'npm --prefix apps/react-ts-vite run typecheck',
    'npm --prefix apps/react-ts-vite run build',
    'npm --prefix apps/next-ts run build'
];

for (const r of runs) {
    console.log('>', r);
    x(r, {stdio: 'inherit', cwd: root});
}
console.log('All builds OK.');
