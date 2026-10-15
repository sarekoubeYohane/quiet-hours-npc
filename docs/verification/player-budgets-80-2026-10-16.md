# #80 玩家預算驗證

測試環境：Node 22+、模擬模型、真實世界 API 路由、記憶體 SQLite、可控 Date.now。沒有真實 Key、付費模型呼叫、部署或正式遷移。此變更新增世界 JSON 設定，不需要資料庫 migration。

## Red → Green

- 首個 `set-budget` 保存、GET 讀回、同 ID 重播及重置保留用量案例：實作前 HTTP 400（預期 200）失敗；加入完整世界操作流程與明確 null 設定後通過。
- 四種有限／無上限組合案例：自訂 calls=1 原因舊整回合預留而派送 0 次（預期 1）失敗；改逐次派送檢查後通過。中途門檻停止保留真實 tokens、回復整個世界回合。
- `node tests/run-activities.mjs tests/budgets-api.test.cjs`：4 項通過，包含非法／缺失值、重設、保存、冪等、四組合、超過舊 120／144 次與 500,000 tokens 後仍實際派送、降低預算及跨小時計量。
- `node tests/run-activities.mjs`：202 項通過，包含既有操作冪等、儲存衝突、失敗用量、接管及 UI 未完成操作重試。
- `pnpm typecheck`：通過。

## 操作介面

設定沿用世界租約、版本與持久操作日誌。`POST /api/world` 的 `operation: set-budget` 需完整 `limits: {calls, tokens}`；值是安全正整數或明確 null。未傳 limits 的推進採已保存設定；舊呼叫者仍可明確傳入有效 limits。未完成操作存在時，UI 不接受新設定操作，不改寫原 payload／operationId。

瀏覽器驗收由整合驗證紀錄補充；上述 API／DOM 測試不能替代 Chromium 輸入、確認對話框、暫停與恢復驗收。雲端 D1、正式登入及供應商帳單尚未驗證。

## Chromium 實際驗收

`tooling/verification/browser80.mjs` 已在真實 Chromium 153 執行通過。實際輸入空白、0、負數、小數及超出安全整數，確認錯誤顯示且世界 API 版本不變；自訂草稿不影響有效設定，取消後還原，套用後可重新載入讀回。無上限保存時保持暫停；每次開始／恢復可取消或確認；離開前景停止。運行中由有限改成無上限，同時變更另一項門檻：取消不套用整組，接受則整組套用並繼續。測試使用固定時鐘、模擬供應商用量與真實 SQLite，不發送付費呼叫。完整重現環境與命令見 `tooling/verification/README.md`；最終整合版將再次執行。
