# #24 驗證紀錄（2026-10-12）

測試介面沿用 #19/#24 已確認的世界 API、SQLite 保存邊界與瀏覽器。模型全部模擬，不發送付費模型請求。

## Red → green

1. 模組重載後重送 advance：先失敗（第二次 version 2、turn 2），加入同列 pending/結果保存後通過（完整回應相同，turn 1）。
2. 同 ID 重疊/租約過期：先失敗（409 沒有 retryable），補齊等待及到期終止後通過；舊請求恢復時不能多送模型或覆寫已定案結果。
3. 缺 ID 與保留水位：先失敗（無 ID 仍 200），加入必填識別與有界淘汰後通過；已淘汰 ID 回 410，世界版本不變。
4. 帳號切換：先失敗（異帳號 scope 仍 200），加入伺服器 scope 比對後通過（409，世界版本 0）。
5. 額外 API 回歸覆蓋所有五種操作重放、模型失敗清 Key 後重放、付費成功、CAS 衝突、保存前/後拋錯；重送不再呼叫模型或增加保存用量。

## 瀏覽器驗收

由整合代理執行臨時 Vite fixture：真實 WorldApp、GET/POST 與記憶體 SQLite，僅登入和外部服務使用 fixture。Chromium 實際操作，已通過：

- 兩頁交錯操作，回到前景取得其他頁變更。
- 人為持有租約 1.8 秒後釋放，頁面自動等待並以同一 ID 成功。
- 世界已保存但回應遺失：重送同 ID，沒有額外回合。
- 回應遺失後重整：sessionStorage 的 pending 留存，明確按重試後取得原結果。
- 另一頁先推進到較新版本：舊結果重放不使畫面倒退，隨後 GET 最新世界。
- 持有租約 25 秒：15 秒等待逾時提示、重整仍有 pending；釋放後明確重試成功且 ID 不變。
- 390px 手機寬度沒有水平溢出，無頁面 JavaScript 錯誤。

fixture 不部署到正式站，不代表 Cloudflare 正式環境或真實 GPT 已試玩。測試工具、截圖是可重建的暫存驗證資料，不納入應用程式。

## Review 修正

- API red → green：已提交但回應遺失後，D1 日誌讀取暫時回 502；新測試先因缺少 settlement 訊號失敗，現在只對確定保存的結果提供 `operationSettled:true`，恢復服務後同 ID 回傳原结果且 turn 仍為 1。
- 瀏覽器 red：真實 POST 已提交但回應遺失、第二個 POST 回 503，原 UI 刪掉 pending（assert actual null）。瀏覽器 green 已通過：503 後 pending 留存，按明確重試沿用同 ID，世界仍為 turn 1。只有明確定案或受理前拒絕才清除。
- API red → green：卡住的模型請求過期後，9 個新操作完成並淘汰舊 ID；舊 Worker 回復時不復活舊結果，重送仍回 410。
- 實際 Workers/D1 的 model-key 測試 helper 更新為附唯一 operationId；重新執行通過。

最終自動檢查：`pnpm test` 138/138 通過（112 世界 API/行為、24 登入/Key、2 實際 Workers/D1）；`pnpm typecheck`、本次 runtime/tests ESLint 及 `git diff --check` 通過。
