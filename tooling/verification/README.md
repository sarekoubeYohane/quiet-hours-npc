# Local browser verification

These scripts render the real `WorldApp` in Chromium and route its HTTP requests through the real world GET/POST handlers. A D1-compatible adapter executes SQL against Node's in-memory SQLite. Auth, Worker bindings and model transports are fixture boundaries; external model calls return fixed usage (1,000 input / 200 output tokens). No real API key or paid service is used.

Run from the repository root, with repository dependencies installed and Node >=22.13:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
BROWSER_ARTIFACT_DIR=/tmp \
node tooling/verification/browser80.mjs
```

Run `browser-smoke.mjs` for a basic UI → API → SQLite round; `browser80.mjs` for budget editing, validation, confirmations, persistence, pause/resume and foreground checks; `browser81.mjs` for payer separation and stop reasons; `browser82.mjs` for custom USD prices, history, cache/usage uncertainty, paid failure and mixed models.

`PLAYWRIGHT_MODULE` defaults to `playwright` resolvable from this script. If `CHROMIUM_EXECUTABLE` is omitted, Playwright uses its installed Chromium. Optionally set `CHROMIUM_MODULE` to an absolute `@sparticuz/chromium/build/index.js` path to use its Chromium arguments (and its executable if no explicit executable was given). `FIXTURE_REPO` changes the source checkout; default is the current directory. `BROWSER_FONT_DIR` may point to an installed `@fontsource/noto-sans-tc` directory for readable Chinese screenshots on hosts without CJK fonts.

The fixture compiles repository CSS through PostCSS/Tailwind, serves public assets, discovers all top-level `lib/*.ts` modules and applies all SQL migrations to the disposable database. Browser and server must run within the same process/network namespace: each acceptance runner imports the fixture and closes it when finished.

Server and browser `Date.now()` start at `2026-10-15T16:00:00Z`. The local-only `/__fixture` control endpoint accepts `advanceMs`, `modelFault` or replacement `world`; scripts may also use the exported store and mutable Worker bindings to create deterministic scenarios. This fixture is never deployed.
