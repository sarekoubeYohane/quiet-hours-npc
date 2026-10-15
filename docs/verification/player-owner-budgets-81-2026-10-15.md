# 玩家與站主預算分離驗證（#81）

## 範圍

依 #78／#81 最新正式規格與留言，沿用已確認的世界 API＋瀏覽器入口；未重新設計每日帳本、排程或 #77 恢復。玩家聊天依實際使用者憑證明確指定 player payer，不因 OpenAI／OpenRouter 名稱判定付費方。站主 Embedding／索引／搜尋保留獨立原子預留。

## 可重現命令與結果

- `node tests/run-activities.mjs`：Red 階段新增「玩家聊天及續接跨站主 chat=0」與「並行站主 Embedding=0」兩例均失敗；Green 修正付費方與分類後通過。
- `npm test`：202 世界／介面測試、32 Auth／Key 測試、10 Workers／migration 測試，總計 244 通過，0 失敗。
- `npm run typecheck`：通過（實際等同執行 `tsc --noEmit --incremental false`）。
- `npm run build`：通過，沒有部署。
- 修改檔案 ESLint：既有 `world-app.tsx` 的 render-ref 與站內 `<a>` 規則仍報錯；沒有把此檢查列為通過，整合階段處理／核對基線。

使用 Node SQLite 暫存資料庫、模擬 chat／Embedding／Vectorize、固定測試時間；沒有真實 API Key 或付費呼叫。測試使用真實世界 API，GET 讀回世界與共享派送統計。

## 已驗證情境

- 舊站主 chat=0 不阻擋玩家聊天或回想後續接；相同 operationId 重播不增加呼叫、用量或派送。
- 玩家 token 已到門檻只阻擋玩家後續聊天，不把站主回想服務計入玩家預算；未完成回合回復，但已付聊天與站主用量保留。
- 站主 Embedding=0 停止派送；並行帳號對同一有限站主 allowance 只有一個 Embedding 可以派送，不會超賣。
- 站主服務缺少設定、供應商 429、玩家預算與技術故障分別回傳 `stopReason` 範圍，GET 操作結果讀回保留原因。
- 原有租約期限、讀回、CAS 衝突、未知提交、失敗用量及重播回歸均通過。

瀏覽器實測使用真正 Chromium（Playwright）載入 `WorldApp`、SQLite 世界 API、固定時鐘與模擬外部供應商邊界；已實際操作模型設定選單及「下一回合」。未啟用站主服務提示、供應商 429 範圍、站主 Embedding=0 停止與回合回復、站主服務缺設定、技術連線故障，以及正常玩家聊天提交皆通過，沒有 pageerror。合併 #80 後 `node tests/run-activities.mjs` 為 206 通過，0 失敗，並已涵蓋兩項玩家無上限仍不能解除站主 Embedding=0；可重現 harness 由整合瀏覽器驗證紀錄交付。實際雲端 OAuth／正式 D1／真實服務未驗證、未遷移；完整每日跨環境帳本仍屬 #27。
