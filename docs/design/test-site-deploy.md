# 測試站自動部署（#28）

main 有新提交時，GitHub Actions 的 `Deploy test site` 工作流程（`.github/workflows/deploy-test.yml`）重跑型別檢查、測試與測試站建置，全部通過才把該提交部署到測試站 Worker `quiet-hours-npc-test` 與測試站 D1 `quiet-hours-npc-test-world`。任何一步失敗都不會動到測試站。流程裡沒有正式站的建置、migration 或部署步驟；正式發布另見 #31。

```text
push main
  job check-head（不綁 GitHub Environment）
    只接受 refs/heads/main，且本提交仍是 main 最新；否則結束、不部署、不留部署紀錄
  job deploy（GitHub Environment：test）
    檢查 secret／variable 是否齊全
    pnpm typecheck → pnpm test → pnpm build:test
    tooling/check-test-build.mjs          # 成品只指向測試站 Worker、vars、D1
    讀取測試站 D1 的資料表清單與 d1_migrations
    tooling/migration-gate.mjs            # 相容守門，見下節
    wrangler d1 migrations apply DB --remote --env test   # 只在有待套用時執行
    部署前再確認 main 沒有更新（有更新則失敗，不部署）
    wrangler deploy --config dist/server/wrangler.json
    curl /api/environment、/api/world → tooling/check-deployed-environment.mjs
```

## 序列化與「舊的不覆蓋新的」

- `concurrency.group = deploy-test-site`、`cancel-in-progress: false`：同一時間只有一個部署在跑；排隊中只保留最新一筆，較舊的 pending 由 GitHub 取消。
- `check-head` 與部署前各比對一次 `git ls-remote origin refs/heads/main`：main 已前進就不部署。開始時發現由 `check-head` 結束，`deploy` job 整個略過，不會在 Deployments 留下舊提交的部署紀錄；部署前才發現則以失敗結束，請等較新的工作。手動重跑舊 run、或從 main 以外的分支手動觸發，也都在 `check-head` 結束。
- GitHub 文件說明 concurrency group 內的執行順序不保證，所以序列化只負責「一次一個」，順序由上述兩次比對把關。
- 部署後核對 `/api/environment` 的 `name=test` 且 `commit` 是本次提交的前綴，並確認未登入讀取 `/api/world` 回 401；最多嘗試 6 次、間隔 10 秒。

## Migration 相容守門

`tooling/migration-gate.mjs` 先看資料庫的資料表清單，再比對 `d1_migrations` 已套用清單（依 `id`）與版本庫 `drizzle/*.sql`（依檔名排序，與 Wrangler 套用順序相同）：

| 情況 | 結果 |
| --- | --- |
| 已套用清單是版本庫清單的前綴（含空資料庫、已最新） | 繼續；只套用剩餘 migration |
| 資料庫含版本庫沒有的 migration（`unknown-applied`） | 停止，不部署、不重置；資料庫可能來自較新的程式或被手動修改 |
| 已套用順序與版本庫不一致或有缺漏（`out-of-order`） | 停止，不部署、不重置；手動核對 `d1_migrations` |
| 沒有 `d1_migrations`，卻已有使用者資料表（`untracked-tables`；D1 內部的 `_cf_*` 不算） | 停止，不部署、不重置；資料庫不是由 migrations 建立的 |
| 沒有 `d1_migrations` 也沒有資料表 | 視為空資料庫，全部套用 |

守門只比對名稱與順序，不檢查 SQL 內容是否「只增不破壞」；那是 #19 的約定，由 PR 審閱維持。在這個前提下先套 migration 再部署程式，migration 之後若部署失敗，舊版程式仍可讀寫資料庫。守門規則由本票定義，#31 的正式站發布與回復沿用；回復時另需「目標程式的 migration 清單涵蓋已套用清單」的判斷，見 #31。

## 需要的設定

| 名稱 | 放置位置 | 用途 |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | GitHub repository secret | Wrangler 部署與 D1 migration 用的 API token |
| `CLOUDFLARE_ACCOUNT_ID` | GitHub repository variable | Cloudflare 帳號 ID（`pnpm exec wrangler whoami` 可看到；不是秘密，但也不必放進版本庫） |

API token 由站主在 Cloudflare dashboard 建立（#21）：Account API Tokens → Create Token → 範本「Edit Cloudflare Workers」，再加上 Account → D1 → Edit；Account Resources 限定自己的帳號；可設定到期日。token 與 account ID 只以 step 層級的 `env` 交給四個需要 Wrangler 的步驟，`pnpm install`、測試與建置讀不到。

Cloudflare 的 Workers 與 D1 權限是帳號層級，無法限定到單一 Worker 或單一資料庫，因此這把 token 技術上也能碰到正式站。#28 原文「沒有任何能觸及正式站的憑證」在單一帳號下做不到字面要求；本流程做到的是「沒有任何正式站的步驟或設定」，靠設計與審閱維持。要不要接受這個縮小後的條件、或為測試站另開 Cloudflare 帳號，由站主決定並記在 #28。之後 #31 的正式發布建議另建一把 token，輪替時先更新 secret 再撤銷舊 token。

測試站 Worker 自己的秘密（`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`SESSION_SECRET`、`MODEL_KEY_ENCRYPTION_SECRET`）不由此流程管理，由站主以 `pnpm exec wrangler secret put <名稱> --env test` 填入，見 [GitHub 登入設定](github-login.md) 與 [帳號模型 Key](account-model-keys.md)。`wrangler deploy` 不會刪除既有 secrets；`vars` 以 `wrangler.jsonc` 為準。預期第一次部署會在帳號建立 `quiet-hours-npc-test` 並啟用 `workers.dev` 網址（尚未實測，見驗證紀錄）。

## 手動重跑與判讀

- 重跑：Actions → Deploy test site → Run workflow，分支選 main（選其他分支會在 `check-head` 結束，不部署），或 `gh workflow run deploy-test.yml -R sarekoubeYohane/quiet-hours-npc --ref main`。重跑舊的 run 會因 main 已前進而不部署。
- 看結果：每次 run 的 Summary 會寫明已部署的提交與線上回報，或未部署的原因；repo 的 Deployments 頁面只記錄實際部署的 run。頁面右上與頁尾顯示「測試站 · 版本 <提交短碼>」，頁尾與登入卡另有建置時間（台北時間），右上標籤的提示文字也有；`/api/environment` 不需登入即可讀到 `name`、`commit`、`builtAt`、`builtAtLabel`。建置時間是 CI 建置當下的時間，部署緊接在建置之後，作為「部署時間」的代理。

| 失敗步驟 | 代表 | 處理 |
| --- | --- | --- |
| 檢查部署設定 | secret 或 variable 缺少 | 依上表補齊後重跑 |
| Typecheck／Tests／Build | 程式本身的問題 | 與 PR 檢查相同，修正後再合併 |
| 確認建置成品只指向測試站 | `wrangler.jsonc` 的 `env.test` 被改動 | 核對 Worker 名稱、`APP_ENV`、`AUTH_ORIGIN`、D1 綁定 |
| 讀取已套用 migrations | token 權限不足或 D1 不存在 | 核對 token 的 D1 Edit 權限與 `database_id` |
| Migration 相容守門 | 見上節兩種停止原因 | 不要重置資料庫；先確認誰改了資料庫 |
| 套用 migrations | 某個 migration 執行失敗 | 依 Wrangler 自己的說明（`wrangler d1 migrations apply --help`），失敗的那筆會回滾、先前成功者保留；本專案尚未實測。修正 SQL 後重跑 |
| 部署測試站 Worker | token 權限或 Worker 設定問題 | 看 Wrangler 錯誤訊息；token 需 Workers Scripts Edit |
| 核對環境、提交與登入保護 | 線上回報的提交不是本次，或未登入讀世界不是 401 | 檢查 Worker 的部署版本與 Worker secrets；可能被其他部署方式覆蓋，或登入設定缺漏 |

## 範圍與限制

- 只部署 main 的合併提交；PR 分支由 `NPC world checks` 驗證，不產生預覽站。
- 未啟用付費方案、未購買網域；固定網址為 `https://quiet-hours-npc-test.houmengkou.workers.dev`。
- 工作流程寫好不等於已部署：第一次實際部署要等 #21 的 token 與 variable 設定完成。狀態見 [驗證紀錄](../verification/test-site-deploy-2026-10-12.md)。

官方參考：[Workers 與 GitHub Actions](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)、[D1 Wrangler 指令](https://developers.cloudflare.com/d1/wrangler-commands/)、[API token 權限](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)、[GitHub Actions concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)。
