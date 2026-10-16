# Local browser verification

Observation integration (#89/#95/#90/#56): run `browser89.mjs`, `browser95.mjs`, `browser90.mjs`, `browser56.mjs`, and `browser-action-analysis.mjs` for shared navigation, authoritative map state, profiles/interactions, read-only cognition, and saved action/perception judgements. Existing `browser80–83.mjs` now navigate through Settings/Analysis explicitly. See `docs/verification/observation-interface-integration-2026-10-16.md` for results and screenshots.

These scripts render the real `WorldApp` in Chromium and route its HTTP requests through the real world GET/POST handlers. A D1-compatible adapter executes SQL against Node's in-memory SQLite. Auth, Worker bindings and model transports are fixture boundaries; external model calls return fixed usage (1,000 input / 200 output tokens). No real API key or paid service is used.

Run from the repository root, with repository dependencies installed and Node >=22.13:

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
BROWSER_ARTIFACT_DIR=/tmp \
node tooling/verification/browser80.mjs
```

Run `browser-smoke.mjs` for a basic UI → API → SQLite round; `browser80.mjs` for budget editing, validation, confirmations, persistence, pause/resume and foreground checks; `browser81.mjs` for payer separation and stop reasons; `browser82.mjs` for custom USD prices, history, cache/usage uncertainty, paid failure and mixed models; `browser83.mjs` for hourly forecasts, active sampling, pause/resume/background, actual result replay, unknown/partial/free costs, settings invalidation and stale samples.

`PLAYWRIGHT_MODULE` defaults to `playwright` resolvable from this script. If `CHROMIUM_EXECUTABLE` is omitted, Playwright uses its installed Chromium. Optionally set `CHROMIUM_MODULE` to an absolute `@sparticuz/chromium/build/index.js` path to use its Chromium arguments (and its executable if no explicit executable was given). `FIXTURE_REPO` changes the source checkout; default is the current directory. `BROWSER_FONT_DIR` may point to an installed `@fontsource/noto-sans-tc` directory for readable Chinese screenshots on hosts without CJK fonts.

The fixture compiles repository CSS through PostCSS/Tailwind, serves public assets, discovers all top-level `lib/*.ts` modules and applies all SQL migrations to the disposable database. Browser and server must run within the same process/network namespace: each acceptance runner imports the fixture and closes it when finished.

Server and browser `Date.now()` start at `2026-10-15T16:00:00Z`. The local-only `/__fixture` control endpoint accepts `advanceMs`, `modelFault` or replacement `world`; scripts may also use the exported store and mutable Worker bindings to create deterministic scenarios. This fixture is never deployed.

The default `npm test` / `pnpm test` command runs `tests/run-tests.mjs`, which activates the no-network preload automatically and propagates it through `NODE_OPTIONS` to all child Node processes while preserving existing caller options. This keeps restored native Node fetch restricted to loopback and rejects redirects. Model and OAuth mocks still return deterministic fixtures; accidental public fallback throws and logs `[test-network-denied]`. The two real Workers tests additionally reject every outbound request via Miniflare `outboundService`.

When running an individual temporary-build runner directly, retain the boundary explicitly:

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs
```

`browser95.mjs` verifies authoritative day/night, region and door state through world API operations, generic activity text, interrupted movement/reload/background recovery, old worlds, reduced motion and 375px image-failure fallbacks. It uses existing assets; no image generation or paid model calls.
