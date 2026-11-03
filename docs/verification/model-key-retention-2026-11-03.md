# 模型 Key 固定保存 14 天：本機驗證

日期：2026-11-03（Asia/Taipei）。本次規格來源為使用者已確認需求；依 implement → TDD → code-review 執行，未重新 grilling 或開票。

## 變更

- OpenAI／OpenRouter 共用保存邏輯：保存或替換成功後固定 14 天，NPC 決策與天上意志裁定沿用同一服務的 Key。
- 讀取、使用、重新整理及重新登入不延長期限。網站登入仍為 24 小時，登入到期後須重新登入才能使用未到期 Key。
- 未修改資料庫結構或既有資料；舊 Key 保留原到期時間，需重新保存才適用 14 天。
- 保留 AES-GCM、帳號／環境／origin／服務隔離、手動清除與派送前檢查，已送出的請求沿用原處理。
- 保存／替換按鈕、成功訊息、兩處設定說明、README、現行設計與三支受影響的瀏覽器腳本已更新。歷史 24 小時決定保留。
- 此為本站保存期限，不包含供應商端 Key 換發或撤銷；重新保存同一把 Key 不稱為金鑰輪替。

## TDD 與世界 API

`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-auth.mjs tests/model-keys-api.test.cjs`

先新增 14 天測試，確認舊實作回傳 24 小時期限而失敗，再修改共用保存常數。最終 17 項測試通過，包括：

- 兩服務新存與替換後到期時間為保存時間加 1,209,600,000 ms。
- 原登入在 24 小時邊界不能呼叫模型；同帳號重新登入可繼續使用，模型成功派送不更動期限。
- 在第 14 天到期前重新登入，登入仍有效時，Key 到期即禁止新呼叫；規則模式仍可使用。
- 舊版 24 小時的合法加密資料作為 fixture，透過世界 API 確認讀取、使用、重新登入不延長，原期限到期後拒絕；重新保存同一把 Key 後適用 14 天。
- NPC 呼叫之間到期，以及 NPC 決策後、裁定前到期，只計已送出的 1 次用量，不送後續請求；世界回合不推進。涵蓋共用 OpenAI Key 與獨立 OpenRouter 裁定 Key。
- 登出、清除、帳號／服務／環境／origin 隔離、同源驗證與 Key 遮蔽回歸通過。

## 完整檢查（原實作基底 1878ff3）

- `pnpm test`：activities 558/558、auth/world API 37/37、migration gate 8/8 通過。兩項 workerd 測試首次因沙箱禁止 `listen 127.0.0.1`（EPERM）而未能啟動。
- 放寬本機監聽限制後重跑：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node --test tests/auth-workerd.test.mjs tests/model-keys-workerd.test.mjs`，2/2 通過；保留 no-network preload 與 Miniflare outboundService 封鎖。合計 605 項通過。
- `pnpm typecheck`：通過。
- `pnpm lint`：通過，0 errors；保留原有 4 warnings（3 處 img、1 處 useEffect dependency），本次未新增 warning。
- 受影響的三支 browser 腳本與 API 測試 `node --check`：通過。腳本按鈕名稱已同步，本次未執行 Chromium UI 驗收。
- `git diff --check`：通過。

## Standards

以 `1878ff3cddfcedaa834cb4d00a75ca6371d7445e` 至本次實作提交的三點 diff（本驗證紀錄之外的 9 個檔案） 作獨立子代理審查。依 AGENTS、專案流程、domain 文件、GLOSSARY、相關 ADR 與技能 smell baseline，文件化標準違規 0 項、可行動 smell 0 項。

## Spec

另一獨立子代理對照使用者本次已確認需求審查相同 diff；缺漏、錯誤實作與範圍擴張均 0 項。

兩軸合計：Standards 0、Spec 0，無待修事項。

本次沒有真實模型付費呼叫、正式站操作或部署；既有未追蹤的 `artifacts/` 保留，不納入提交。舊 Key 需重新保存才適用 14 天。

## PR 前同步最新 main

發 PR 前 fetch 發現遠端 main 已前進至 `b5d5489`，本次提交已 rebase 到此基底。保留上游 `round-v1` 請求 header、`fixtureDecision` 與新版 `modelReply(init)`，只調整新增測試以符合新版決策契約。

- 重跑 `NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-auth.mjs`：37/37 通過（含本次 17 項 Key 測試）。
- 重跑 `pnpm typecheck`：通過。
- `pnpm exec eslint lib/model-keys.ts tests/model-keys-api.test.cjs` 與 `git diff origin/main...HEAD --check`：通過。
- Standards／Spec 對最新 main 的差異另行複審；完整新版基底套件交由 PR CI 執行，上述 605 項結果屬原實作基底。
