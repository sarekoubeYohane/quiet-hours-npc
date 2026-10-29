# Local browser verification

`browser-operation-evidence.mjs` 使用真正 WorldApp → GET/POST → SQLite，驗證原長句與茶具 target 的原杯／未記錄杯成功、矛盾裁定、服務失敗，及原候選、六項未對齊時間、派送／usage、UI/API 重載與同 ID 重送。四組篩選證據 JSON／截圖寫入 `docs/verification/assets/operation-evidence/`；所有模型輸出仍是本機 transport fixture。沿下方 Chromium 環境執行，詳見 [整合報告](../../docs/verification/operation-evidence-integration-2026-10-21.md)；正式站另依 [部署後流程](../../docs/verification/operation-evidence-live-runbook.md)。

`browser-acceptance-scene.mjs` 使用真正的場景進入／返回 API，驗證取消、原世界保存、餐點取得／食用、店主自主授權與借杯／攜帶／洗淨／歸還、泡茶中斷、跨分頁舊操作、重載及共用用量。桌機與 390px 截圖寫入 `docs/verification/assets/acceptance-scene/`（可由 `BROWSER_ARTIFACT_DIR` 改變）。沿下方相同 Playwright／Chromium 環境執行，不使用真實 Key 或玩家世界。

Character assets (#88): `browser88.mjs` verifies the four approved master/profile/avatar/pixel files, dimensions, alpha, baseline, real map/profile rendering and unchanged world state. Set `BROWSER_FONT_DIR` for readable CJK evidence. `prepare-character-assets.py <generated_images-directory>` exports the approved source IDs with ImageMagick; see `docs/design/character-visual-assets.md`.

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

`browser-acceptance-scene.mjs` 的原世界 fixture 包含超過 1 MiB 的 UTF-8 故事，驗證完整進入／重載／返回；此為可拋棄 SQLite 與模型替身，正式站容量複測另見驗證紀錄。

`TEA_ACTION=legacy node tooling/verification/browser100.mjs` 使用舊 `work/tea` 決策驗證同一階段契約（完成／明示續做／重送、中斷、保存失敗與他人移動物件）；未設定時維持 `propose` fixture。`browser-acceptance-scene.mjs` 亦覆蓋未授權舊茶動作不假成功及其合法階段，沿相同 Chromium 環境執行。

`browser128.mjs` 驗證 v2 日常模型程序：首次核准、階段完成、不同杯子免費重綁、接管／交還、喝茶／清洗／歸還、重載與重送。沿相同 Chromium 環境執行，只有模型 transport 使用 fixture，沒有付費或正式世界操作。

`browser-live-gaps.mjs` 從實際 UI 新建最小驗收場景，驗證 v2 首次核准／原始程序證據、跨回合泡茶、喝洗同杯重用、店主自主 grant fixture 與借用攜帶洗還、餐點消耗、UI 原 ID 重送及保存前後故障。篩選 JSON／截圖預設輸出 `docs/verification/assets/live-gaps/`；全部為本機 fixture，不還原 #143 缺失的原始候選，也不呼叫正式模型。

`browser146.mjs` 驗證同一原杯的新茶漬／濕潤狀態、一般分析呈現、SQLite 重載與 UI 原 ID 重送；候選理由留在有界證據。結果在 `docs/verification/assets/world-object-146/`，全部為 fixture，零正式付費呼叫。

`browser148.mjs` 以真實 WorldApp／API／SQLite 驗證同一活動的杯子、環境及身體外在影響，NPC可知線索、人物檔案、重載及原ID UI 重送；模型 transport 是 fixture，沒有正式付費模型。外在權威狀態與NPC public／subject／hidden隔離由同票API回歸補足。
#147：`browser147.mjs` 以真 WorldApp／API／SQLite 驗證已借用杯子的失敗損毀、從另一在場持有人未經許可拿取、同杯新狀態、事前許可歷史、重載及 UI 原 ID 重送。模型回覆／D20 為明示 fixture，3 NPC＋3 裁定＋1 骰，不是正式站驗收；結果輸出 `docs/verification/assets/world-physical-147/`。

`browser149.mjs` 使用真實 WorldApp／世界 API／SQLite 驗證 aggregate 分拆、按需細分／食用、多來源與共同權利，以及未經許可的物理碎片與來源 history；僅初始世界與模型 transport 為 fixture。六個新回合、重載與 UI 原 ID 重送，輸出 `docs/verification/assets/world-formation-149/`；沒有正式付費模型或正式世界操作。


`browser-natural-changes.mjs` 以真WorldApp／API／SQLite驗證冷卻、環境乾燥、條件破壞後恢復仍失效、重載及原ID UI重送。8次推進，8 NPC決策＋5裁定，零付費模型；截圖與篩選證據輸出 `docs/verification/assets/natural-changes/`，並非正式站驗收。

## 自主生活循環（#172–#181）

沿上方同一 Playwright／Chromium 環境，從 repository 根目錄執行：

```sh
node tooling/verification/browser-life-needs.mjs
node tooling/verification/browser175-176.mjs
node tooling/verification/browser-sleep.mjs
node tooling/verification/browser-preferences.mjs
node tooling/verification/browser-life-habits.mjs
node tooling/verification/browser-life-forecast.mjs
node tooling/verification/browser-life-integration.mjs
```

各 runner 使用真實 WorldApp／世界 API／JSON／SQLite，只有 auth、Worker bindings、模型 transport、時鐘及骰子是可控邊界。`BROWSER_ARTIFACT_DIR` 須為可寫目錄；個別 runner 可採其預設 repository 證據目錄。沒有真實 Key，不連正式世界，不以替身證明真實 NPC 會形成相同行為。本輪使用 Chromium 143、Playwright 及 Noto Sans TC；支援一般已安裝 Chromium，或設定 `CHROMIUM_MODULE` 為 `@sparticuz/chromium`。

需求、長活動、睡眠、喜好、習慣及私有追溯各有獨立 API／SQLite 案例，預設 `pnpm test` 收錄於 `tests/run-activities.mjs`。各基線、參數／容量、相容及回退政策見[自主生活工程契約](../../docs/design/autonomous-life.md)；正式付費驗收另依[有限交接流程](../../docs/verification/autonomous-life-live-runbook.md)取得授權。

#186／#201：`browser-method-reassessment.mjs` 以同一真實 WorldApp／API／SQLite 世界完成15次既有UI推進，串接耗盡餐點的來源評估／免費重試、另一NPC自主回覆、替代食物真正攝取、舊茶→新茶→部分份量及別名免費續用、已知咖啡館有限飲水來源。桌機與390px分析、重載／原ID重送零派送、容量量測輸出 `docs/verification/assets/method-reassessment/`。模型、時鐘為明示fixture，原小時額度／HTTP期限不變；不能用它宣稱正式loop已解。詳見[跨回合報告](../../docs/verification/method-reassessment-201-2026-10-27.md)及[整合契約](../../docs/design/method-reassessment-integration.md)。
