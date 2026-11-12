# 測試與驗證

怎麼跑、怎麼加、CI 跑什麼。程式結構見 [架構地圖](../ARCHITECTURE.md)。

## 指令

需要 Node 22.13 以上（CI 用 Node 24；測試依賴 `node:sqlite`）與 pnpm 11。

```sh
corepack pnpm install --frozen-lockfile
pnpm typecheck          # 只涵蓋 .ts、.tsx、.mts
pnpm test               # 全部測試，不連外網
pnpm lint               # 整包 eslint；CI 只跑一份寫死的檔案清單
pnpm build              # 本機設定；build:test、build:production 對應另外兩個環境
```

跑單一測試檔時要自己帶上禁止連外的 preload：

```sh
# 經世界 API 的 .cjs 測試
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/<name>.test.cjs

# 登入與 Key 的四個 .cjs 測試
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-auth.mjs tests/auth-api.test.cjs

# .mjs 測試
node --import ./tooling/verification/no-network.mjs --test tests/<name>.test.mjs
```

## 測試沒有自動探索

**新增的測試檔要手動登記，沒登記的檔案 `pnpm test` 與 CI 都不會執行。**

| 測試種類 | 登記位置 |
| --- | --- |
| `tests/*-api.test.cjs`、`tests/*-ui.test.cjs` | `tests/run-activities.mjs` 的 `allTests` |
| 登入與 Key 的 `.cjs` | `tests/run-auth.mjs` 的預設清單 |
| `tests/*.test.mjs` | `tests/run-tests.mjs` 的 `node --test` 清單 |

`pnpm test` 執行 `tests/run-tests.mjs`，依序跑五段，任一段失敗就停：

1. `tests/run-activities.mjs`：約 120 個經世界 API 的整合測試。
2. `tests/run-auth.mjs`：登入、模型 Key、重置。
3. `node --test`：人物、場景、開局、存檔、模型設定等較新的 route（`.mjs`）。
4. `node --test`：真 workerd 的登入與 Key 測試、migration 守門，以及一個實驗檢查。
5. `tooling/experiments/pursuit-runner-228.test.mjs`：獨立一段，因為它會暫時改動再還原本機原始碼。不要與其他測試並行。

## 新增 migration 或 route 時也要手動登記

`tests/run-activities.mjs` 的替身資料庫是**手列 migration**，不會自動讀 `drizzle/`：

- 新增 migration：把 SQL 加進 `store.cjs` 替身的建表段，也加進 `install()` 的 DELETE 清單。
- 新增要被測的 API route：加進 `sources` 清單。

其他 harness（`run-auth.mjs`、`tests/support/character-api-fixture.mjs`、`tooling/verification/real-route-runtime.mjs`）會自動讀全部 `drizzle/*.sql`。

## harness 怎麼運作

**`run-activities.mjs`**：在暫存目錄用 `ts.transpileModule` 把 `lib/` 頂層的 `.ts` 與清單中的 route 轉成扁平的 `.cjs`，再覆寫三個替身：

| 替身 | 取代 | 行為 |
| --- | --- | --- |
| `cloudflare-workers.cjs` | `cloudflare:workers` | 固定的 env |
| `auth.cjs` | `lib/auth.ts` | 固定使用者 `test-owner`，可用 `setUserId` 切換 |
| `store.cjs` | `lib/store.ts` | 記憶體 SQLite 加上 D1 相容介面，可注入保存衝突與故障 |

測試以 `load('route')`、`load('store')`、`load('world')` 取得模組。因此：

- `transpileModule` 不做型別檢查，型別錯誤只有 `pnpm typecheck` 抓得到。
- 真正的 `lib/store.ts` 與 `lib/auth.ts` 在這個 runner 內沒有被執行，只在 `run-auth.mjs`、workerd 測試與 `.mjs` harness 被測到。

**`.mjs` 測試**各自起 harness：`tests/support/character-api-fixture.mjs`（esbuild 打包真 route）、`tooling/verification/real-route-runtime.mjs`（真 vite 與 vinext server 加 SQLite 檔）、`*-workerd.test.mjs`（Miniflare）。介面測試用 happy-dom 載入 `components/world-app.tsx`。

**模型與亂數**：測試把 `global.fetch` 換成固定回應，`Math.random` 也會被換掉以控制骰值。`tooling/verification/no-network.mjs` 會讓任何非 loopback 的請求直接失敗並印出 `[test-network-denied]`。測試不會發出付費請求。

## 檔名慣例

| 檔名 | 內容 |
| --- | --- |
| `<feature>-api.test.cjs` | 經世界 route 的整合測試，多半對應 `lib/<feature>.ts` 或某個 issue 切片 |
| `<feature>-ui.test.cjs` | happy-dom 的介面測試 |
| `<feature>.test.mjs` | 帳號、開局、人物卡、存檔等 route |
| `*-workerd.test.mjs` | 在真 workerd 內執行 |
| `*-fixture.cjs`、`tests/fixtures/` | 場景與決策的 builder、共用世界 |
| `tests/create-world-via-opening.cjs` | 走真正的開局 API 建立世界 |

檔名不一定等於模組名，例如 `d100-api.test.cjs` 測的是 `lib/action-checks.ts`。

`tests/` 會 import `tooling/verification/` 內的數個模組，搬動 tooling 會影響測試。`.cjs` 與 `.mjs` 都不在 typecheck 範圍內。

## CI

| Workflow | 觸發 | 內容 |
| --- | --- | --- |
| `.github/workflows/npc-world-checks.yml` | 對 `main` 的 PR | typecheck、test、對寫死清單跑 eslint、`build:production` 並檢查產出、`pnpm test:built-navigation` |
| `.github/workflows/deploy-test.yml` | push 到 `main` 或手動 | typecheck、test、`build:test`、`tooling/check-test-build.mjs`、`tooling/migration-gate.mjs`、套用 migration、部署測試站、`tooling/check-deployed-environment.mjs` |

- CI 的 eslint 是一份寫死的檔案清單，新模組不會自動被 lint。清單寫在 workflow 內。
- 測試站部署需要 secret `CLOUDFLARE_API_TOKEN` 與 variable `CLOUDFLARE_ACCOUNT_ID`。流程見 [測試站自動部署](design/test-site-deploy.md)。
- 沒有正式站的自動部署 workflow。

## 瀏覽器驗證

`tooling/verification/` 有約 105 個 `browser*.mjs` Playwright runner，用真的 `WorldApp`、API handler 與 SQLite，模型以 fixture 取代。除了 `browser-built-navigation.mjs`（即 `pnpm test:built-navigation`，需先 `pnpm build:production`）之外都是手動執行，不在 CI 內。

活動觀察（#310）：`pnpm test:observed-activities` 使用既有 Chromium fixture。可用 `CHROMIUM_EXECUTABLE` 指定瀏覽器，並設定 `BROWSER_ARTIFACT_DIR` 將畫面寫到已存在的本機目錄。世界 API、SQLite 保存及重讀皆走原路徑；模型使用固定回覆，沒有付費呼叫。

環境變數與個別 runner 的說明見 [tooling/verification/README.md](../tooling/verification/README.md)。截圖與 JSON 預設寫到 `docs/verification/assets/<主題>/`。

## 資料庫

```sh
pnpm db:generate         # 改 db/schema.ts 後產生 migration
pnpm db:migrate:local    # 套用到本機 D1（資料在 .wrangler/state）
```

`drizzle/meta/` 只追蹤到 0003，之後的 migration 是手寫 SQL，編號也跳過 0009–0012。`pnpm db:generate` 在這個狀態下會產出什麼尚未確認，執行後請檢查產生的檔案。

## 其他要注意的

- `tsconfig.tsbuildinfo` 有被 git 追蹤。`pnpm typecheck` 不會更新它，但其他 `tsc` 呼叫可能弄髒工作區。
- `tooling/diagnostics/` 與 `tooling/experiments/` 是特定 issue 的一次性腳本；其中兩個 `.test.mjs` 在 `pnpm test` 內。
