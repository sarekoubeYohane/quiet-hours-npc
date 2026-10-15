# #78／#80–#83 整合驗證（2026-10-16）

正式規格為 GitHub #78 與 #80–#83 的最新本文及留言，沿用已確認的世界 API＋瀏覽器入口，沒有重新 Grill。整合 PR 為 [#84](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/84)。起始 main 為 `5d903cd1a0e7d0c11189138eee628a76a14671c8`；最終 runtime 審查及驗證基準為本次本機 integration 提交 `a4bde3d`。GitHub 發布採相同來源樹；重現請取得 PR 分支，不依賴本機提交識別碼。

## 各票結果

| 工作票 | 已驗證結果 | 詳細紀錄 |
| --- | --- | --- |
| #80 | 固定／自訂／明確 null 無上限、保存讀回、確認與取消、手動／自動／續接共用預算、超過舊門檻、失敗用量及重播 | [預算](player-budgets-80-2026-10-16.md) |
| #81 | 玩家聊天與站主服務預算分離、玩家無上限不能解除站主限制、四類停止原因、站主服務失敗回復回合 | [付費方](player-owner-budgets-81-2026-10-15.md) |
| #82 | 自訂 USD 單價、來源日期、不可變歷史價格、輸入／輸出／快取、零與未知、跨窗口、失敗與 CAS 差額保留 | [已發生費用](player-cost-estimates-82.md) |
| #83 | 最近 10 分鐘、至少兩個完成間隔與 30 秒；正常等待納入、暫停／背景排除、重載及模型／供應商／節奏／價格變更重採樣、重播不重計 | [未來推估](hourly-forecast-83.md) |

## 最終實際檢查

- 整合後預設 `pnpm test`：**257／257 通過**（世界／介面 215、登入／Key／重置 32、Workers／migration 10）。預設 runner 自動載入網路 guard；日誌沒有 `test-network-denied` 事件。
- `pnpm typecheck`：通過。
- `pnpm build:production`：通過；另讀回 `dist/server/wrangler.json`，確認 `name=quiet-hours-npc`、`APP_ENV=production`。
- 變更的 API、lib、新 UI 元件、測試與瀏覽器腳本 ESLint：通過。`WorldApp` 原有 3 errors／1 warning 已用起始 main 的相同檔案透過 ESLint stdin 比對，種類一致；不宣稱全 repo lint 通過。
- `git diff --check`：通過。
- 最終整合來源再次執行 `browser80.mjs`、`browser81.mjs`、`browser82.mjs`、`browser83.mjs`：全部通過，無 pageerror。#83 有 12 組操作驗收，包括真實已定案 POST 重播、已知＋缺失 usage 的部分估算、零價、背景停止、重載、過期樣本與租約故障後手動恢復。

瀏覽器為 Playwright 1.64.1＋Chromium 153，載入真實 WorldApp、HTTP GET／POST、SQLite 與固定模型回覆。外部登入、模型及向量服務皆在 transport 邊界模擬；固定時鐘與測試價格不代表供應商當前報價。截圖由腳本輸出，沒有把靜態畫面或 API 測試冒充操作驗收。

## 重現

```sh
git fetch origin integration/78-player-budgets-costs
git switch --detach origin/integration/78-player-budgets-costs
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:production
```

瀏覽器依 [工具說明](../../tooling/verification/README.md) 設定 Playwright／Chromium 路徑，依序執行：

```sh
node tooling/verification/browser80.mjs
node tooling/verification/browser81.mjs
node tooling/verification/browser82.mjs
node tooling/verification/browser83.mjs
```

每個 runner 都會啟動同程序的 HTTP fixture，使用獨立記憶體 SQLite 並套用 repository migrations。它不連正式資料庫，不需要真實模型 Key。套件測試的網路 guard 自動傳入所有 Node 子程序，Workers 測試另禁止 outbound。

## Standards

首次審查 2 項：1 項明文接縫違反（瀏覽器從 storage snapshot 斷言），1 項判斷性重複邏輯（預算草稿初始化與取消）。已改經世界 GET API 驗證，並共用 `budgetDraft`。獨立複審 **0 項未解決發現**，未發現新增明文違規或值得提出的 smell。

## Spec

首次審查 1 項 P2：推進請求的臨時 limits 可覆寫已保存的有效預算。真實 API Red 為 HTTP 200／四次派送，修正後為 HTTP 429／一次已發生用量、完整回合回復；較高及無上限 payload 均不能繞過，調高設定後重播也不重新派送。只有 `set-budget` 變更設定，推進／續接採保存值或有限預設。獨立複審 **0 項未解決問題**，複審者另重跑預算／回想 37 項通過。

兩軸各 0 項未解決發現；沒有合併兩軸排序。

## 測試外送事件與修正

審查修正後，完整測試的一項舊 reset 情境仍以未套用的 per-request limits 假設模型不會派送，因而進入原生 transport，使用的是假的 fixture Key。輪詢該次執行遭自動 approval review 拒絕，理由涉及外部 api.openai.com 請求；不能宣稱當時沒有外送嘗試，亦沒有使用真實玩家 Key。已改成先透過 API 套用預算，並新增 Node 非 loopback fetch 拒絕及兩個 Miniflare outbound 拒絕邊界。受保護的預設完整測試已實際通過 257 項且無拒絕事件。細節及 Red／Green 見 [審查修正紀錄](player-budgets-review-2026-10-16.md)。

## 尚未驗證與發布邊界

沒有合併、部署、正式資料庫遷移、開通付費服務或真實付費壓測。未做正式 Cloudflare D1／OAuth／模型／向量服務端到端驗收，亦未驗證實際供應商帳單。價格由玩家明確自訂，缺資料仍顯示未知；站主服務成本不混入玩家費用。

本次沒有新增 schema migration。新增設定與成本依據保存在世界 JSON，舊資料使用有限預設及未知歷史費用。#27 完整跨環境每日帳本、#29 排程重寫與 #77 原始線上故障診斷不屬本次成果。進行中的 PR #60 尚有舊每日 144 次政策，後續整合必須對齊 #78，不能直接帶回該硬上限。
