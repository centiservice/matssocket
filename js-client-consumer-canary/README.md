# consumer-canary (npm workspaces)

(Made with ChatGPT 5 Thinking, from this: https://chatgpt.com/share/68ebb3b5-5688-8009-acfc-3ef0b627633a)

## 0) Pre-req
- Node 18+ recommended.
- From repo root, **build your library** first (so `dist/` exist) if you want `--local` mode.

## 1) Install deps against your LOCAL lib build
```bash
cd consumer-canary
npm run install:local
```

## 2) IntelliJ: Turn off "TypeScript -> Recompile on changes"

.. otherwise you'll get .js files from .tsx files. None of the apps expects this.

## npm tasks

* `npm run install:local`: Runs `npm install` on all apps, using your local library build.
* `npm run install:rc`: Runs `npm install` on all apps, using 'rc' tag.
* `npm run install:latest`: Runs `npm install` on all apps, using 'latest' tag.
* `npm run update:all`: Runs `npx npm-check-updates@latest -u` for root project and all apps. Do `npm run install:<xxx>` afterwards.

## "Dev" - run each of these, and go to the web page to see the results
```bash
npm --workspace apps/vanilla-js-vite run dev
npm --workspace apps/react-ts-vite run dev
npm --workspace apps/next-ts run dev
npm run serve:nobundler
```

Working!
* react-ts-vite
* next-ts

Working fine, but IntelliJ's IntelliSense only from NPM:
* vanilla-js-vite: IntelliSense fine imported from registry (npm), but not when imported from local build. Good enough!

Working fine, but IntelliJ's IntelliSense spotty:
* no-bundler: Partial IntelliSense when imported from registry (npm), but not when imported from local build.