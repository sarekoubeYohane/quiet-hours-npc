# #78 整合審查修正驗證

## 修正與公共邊界

- Spec：僅 `set-budget` 套用／保存玩家預算。其他操作即使帶有效的舊版 `limits` payload，推進及聊天續接仍使用已保存預算；舊世界回退到有限預設。保留舊 payload 以便既有 operationId 結果重播，不更改歷史日誌契約。
- Standards：browser81／browser82 的世界回合、失敗已發生用量斷言改從真實 `GET /api/world` 讀回；SQLite store 只作測試輸入準備。
- Standards：預算設定初始值與取消操作共用 `budgetDraft` 轉換，保留 UI 草稿／取消／確認行為。

## Red → Green

新增 `tests/budgets-api.test.cjs` 的 API 回歸：先套用 1 次／1 token，再送無上限或較大過期 limits 的推進。修正前回應 200（預期 429），實際 Red；修正後回應 429、世界 turn 保持 0、已付的第一個模型呼叫 30 input／20 output tokens 保留，GET 仍讀回 1／1。再套用無上限並重播舊 operationId，仍重播原 429 且不增加派送。既有聊天續接跨小時計量回歸同樣傳入無上限覆寫，仍受已保存的 1,000 token 門檻約束。

舊版 API 情境原用每個 advance 的 limits 設定預算，受影響情境改由明確 set-budget 準備預算；保留原行為斷言，包括故障注入、世界原子提交及已付用量。

## 實際結果

- `node tests/run-activities.mjs`：215／215 通過。
- 最後微調設定回應計算、加強續接情境後，`node tests/run-activities.mjs tests/budgets-api.test.cjs tests/recall-api.test.cjs tests/takeover-api.test.cjs`：43／43 通過。
- `npm run typecheck` 通過；`npm run build:production` 通過。
- Chromium `browser80.mjs`、`browser81.mjs`、`browser82.mjs`、`browser83.mjs` 全部通過，無 pageerror；固定價格、可控時鐘、實際世界 HTTP API、SQLite 及模擬模型。執行方法見 `tooling/verification/README.md`。
- `git diff --check` 通過。

整合完整測試的第一次 `npm test` 執行在輪詢時被 automatic approval review 拒絕，理由為可能呼叫外部 api.openai.com；未重送該動作。檢查發現舊 `reset-api` 情境原依賴 advance 的 per-request limits 在模型派送前停止，已改為先顯式套用 3-call 預算，保留原 429／limitReached 斷言。該舊情境使用假的 fixture Key；未套用預算時會進入原生模型 transport，不能聲稱當時沒有外部嘗試，也沒有使用真實玩家 Key。

為完成更安全的替代驗證，新增 `tooling/verification/no-network.mjs`：Node 原生 fetch 僅允許 loopback，其他 URL 記錄 `[test-network-denied]` 並丟錯，禁止 loopback redirect，mock 可以替換 fetch、恢復後仍回到受限 transport。透過 NODE_OPTIONS preload 繼承至所有子測試程序；兩個 Miniflare 測試再設定 `outboundService` 全部拒絕，避免 Worker mock 意外失效時傳出請求。

實際安全替代命令：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" npm test
```

完整測試 **257／257 通過**（activities 215、auth／model-keys／reset 32、Workers／migration 10），沒有出現 network-denied。新 preload 與兩個 Workers 測試 `node --check` 通過；新增／修改安全檔及 reset 測試 ESLint 通過。此結果來自新增硬性網路拒絕邊界後的命令，不把被拒動作的部分輸出當成成功。現有 browser fixture 全域 fetch 無原生 fallthrough，模型 URL 只用來辨識固定回應。未部署或執行正式資料庫遷移。


預設測試命令現已改為 `node tests/run-tests.mjs`。此 runner 自動載入拒絕外部網路的 preload，將同一 preload 附加到原有 NODE_OPTIONS 後傳給所有測試子程序；CI／`npm test`／`pnpm test` 不需額外手動環境變數即可維持此邊界。

自動啟用 guard 後再以預設 `npm test` 實際驗證：257／257 通過（215＋32＋10），無 network-denied；runner syntax check、ESLint 及 diff check 通過。
