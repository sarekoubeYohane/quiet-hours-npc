# #28 驗證紀錄（2026-10-12）

本票的交付是 GitHub Actions 工作流程、相容守門腳本與文件。能在本機驗證的部分如下；**第一次實際部署尚未發生**，要等 #21 的 CI token 與 account variable 設定後，由 main 的下一次合併觸發。

## Red → green（守門腳本，`node --test tests/migration-gate.test.mjs`）

1. 先失敗：`tooling/migration-gate.mjs` 不存在（`ERR_MODULE_NOT_FOUND`）。
2. 加入腳本後通過，審查後補到 8／8：空資料庫全套用、已最新不套用、前綴增量、不認識的 migration 停止（列出名稱、不重置）、順序不符／缺漏停止、`wrangler --json` 輸出解析（容忍前置提示行、空結果、非 JSON 與 `success:false` 皆拒絕）、資料表清單判斷（只有 `_cf_KV` 視為空庫；有 `d1_migrations` 才讀已套用清單；有使用者資料表卻沒有紀錄則停止）、目錄只取 `.sql` 並排序、CLI 以自建的暫存 migrations 目錄驗證 exit code 與 `GITHUB_OUTPUT` 的 `pending=`，包含缺表、未追蹤資料表與輸出不可解析不會被當成空清單。

## 本機可驗證的工作流程片段

- `pnpm build:test` 後 `node tooling/check-test-build.mjs dist/server/wrangler.json` 通過（Worker `quiet-hours-npc-test`、`APP_ENV=test`、測試站 origin、唯一 D1 綁定 `quiet-hours-npc-test-world`）；對本機設定的建置成品正確拒絕（四項錯誤）。
- `tooling/check-deployed-environment.mjs` 以 fixture 驗證：提交前綴相符且 `/api/world` 為 401 回 0，不符回 1。
- `.github/workflows/deploy-test.yml` 以 js-yaml 解析：`check-head`（不綁 Environment）與 `deploy`（`needs` + `if`）兩個 job、部署 job 15 步驟、`concurrency.group=deploy-test-site`、`cancel-in-progress=false`；token 與 account ID 只出現在四個 Wrangler 步驟的 step 層級 `env`。
- `/api/environment` 新增 `builtAt` 與伺服器端格式化的 `builtAtLabel`（固定 UTC+8，不用 Intl，避免 SSR 與瀏覽器字串不同造成 hydration 不一致），測試 4／4 通過；頁尾與登入卡顯示建置時間，右上標籤的提示文字也有。
- `pnpm test` 147／147（113 世界 API／行為、24 登入／Key、10 守門與實際 Workers／D1）；`pnpm typecheck`、受影響檔案 ESLint、`git diff --check` 通過。
- 兩路審查（文件標準／規格）後修正：token 由 workflow 層 `env` 改為 step 層；`git ls-remote` 改用完整 ref `refs/heads/main`，避免 `*/main` 分支造成多行比對；`d1_migrations` 缺表的判斷從 shell 的 `node -e` 搬進守門腳本並加測試；job 拆開避免被超越的 run 在 Deployments 留下成功紀錄，並擋下非 main 的手動觸發；部署後加 `/api/world` 401 核對；步驟名稱統一繁體中文；文件把 Wrangler 回滾、首次部署行為改為「依 Wrangler 說明」與「預期」。

## 尚未驗證（需要 #21 的設定與真實執行）

- 工作流程在 GitHub 上實際執行：secrets 檢查、`git ls-remote` 守門、`wrangler d1 execute --remote` 的 JSON 輸出形狀與 shell 裡以 `grep` 判斷是否查詢 `d1_migrations` 的包裝、`wrangler d1 migrations apply` 在非互動環境自動確認、`wrangler deploy` 建立 `quiet-hours-npc-test` 與 workers.dev 網址。
- 部署後從手機與電腦打開固定網址、頁面顯示測試站與提交短碼、`/api/environment` 核對步驟。
- 測試站接上 GitHub 登入（Worker secrets 由站主以 `wrangler secret put --env test` 填入；#23 的測試站真人驗收）。
- 序列化與「舊的不覆蓋新的」在真實連續合併下的行為；本票以 GitHub 文件的 concurrency 語意與兩次 `git ls-remote` 比對為依據。

## 站主待辦（對應 #21 未勾選項）

1. 建立 CI 部署 API token（範本「Edit Cloudflare Workers」＋ Account → D1 → Edit，限定自己的帳號），存為 repository secret `CLOUDFLARE_API_TOKEN`。
2. 把帳號 ID 存為 repository variable `CLOUDFLARE_ACCOUNT_ID`。
3. 為測試站 Worker 填入四個 Worker secrets（見 github-login.md、account-model-keys.md）。首次部署前 Worker 尚不存在，可在第一次部署後再填，再推一次 main 或手動重跑。
4. 合併本 PR 後，下一次 main 合併會觸發部署；確認 Summary 與 `/api/environment`。
