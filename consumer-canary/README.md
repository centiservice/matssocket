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

## npm tasks

* `npm run install:local`: Runs `npm install` on all apps, using your local library build.
* `npm run update:all`: Runs `npx npm-check-updates@latest -u` for root project and all apps. Do `npm run install:local` afterwards.


## "Dev" - run each of these, and go to the web page to see the results
```bash
npm --workspace apps/vanilla-js-vite run dev
npm --workspace apps/react-ts-vite run dev
npm --workspace apps/next-ts run dev
npm run serve:nobundler
```

Currently working:
* react-ts-vite

Missing IntelliSense:
* vanilla-js-vite
* no-bundler

Not working due to MatsSocket..
* next-ts: import("ws"): Module not found. So it thinks it's inside Node..!