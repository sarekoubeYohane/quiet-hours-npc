# NPC Playbook 合併後驗證（2026-10-08）

此紀錄是當次驗證快照。接手時重新查詢 GitHub 主幹、工作票及 Sites 發布版本；後續提交與其他 PR 不在本次結果範圍內。

## 驗證版本

[PR #6](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/6) 已合併，規格與工作票 #1–#5 已關閉。測試提交為 [`447e5265608252c214167d62681bf14d11f2f4f5`](https://github.com/sarekoubeYohane/quiet-hours-npc/commit/447e5265608252c214167d62681bf14d11f2f4f5)，與原整合分支的程式樹相同。

## 自動驗證

| 驗證 | 結果與範圍 |
| --- | --- |
| `node tests/run-activities.mjs` | 48／48 通過；實際世界 API、模擬身分與供應商、記憶體 SQLite 執行實際 SQL |
| `./node_modules/.bin/tsc --noEmit --incremental false` | 通過；不改寫已追蹤的增量快取 |
| `node scripts/run-framework.mjs build` | 通過；產生 Worker 建置輸出 |
| 額外跨日模擬 | 規則及模擬 OpenAI 模式各 96 回合，每回合 15 分鐘，共各 24 世界小時；兩項臨時驗證通過 |

既有測試涵蓋私密意圖、排序／等待／移除、舊世界相容、新消息後續做與切換、單次指定、接管待命、交還知情上下文、錯誤回復、用量及保存衝突。

跨日模擬每 24 回合反覆接管、指定私密思考、交還與介入，每回合重新讀取資料，檢查意圖保留、控制方式、時間、事件／記憶上限及用量。規則模式沒有模型呼叫；模擬 OpenAI 模式有 64 次假供應商回覆，未知用量為零，輸入 1,920／輸出 1,280 個模擬 token。這兩項補充檢查使用臨時測試檔，未加入 repo 的永久測試 runner；48 項才是可直接重跑的既有測試數。

本次沒有付費模型請求。通過表示程式契約及狀態流程在上述情境正常，無法證明真實 GPT 的排序、性格或敘事表現。

完整 lint 曾在合併前記錄 8 個既有錯誤及 4 個警告，涉及介面 render／effect／連結及舊 CommonJS 測試匯入；未宣稱整個 repo lint 通過。合併後本次沒有重跑完整 lint。

## 網站發布與畫面驗證

驗證時 Sites 最新保存版本為 v8，來源提交為 `99260c6dfa3aa87650c2f30bd52b09677a4dfbdd`。讀取對應來源確認尚無共用 Playbook、店主素材及接管／交還 API；GitHub 合併尚未更新正式網站。本次只讀取發布資料與来源，沒有部署或變更正式世界。

店主按鈕的實際瀏覽器點按尚未完成。先前本機檔案 URL 被 CUA 政策拒絕；本次 Sites managed preview 指引要求 `control-browser`，環境沒有該技能，因此沒有完成畫面 QA。這是當次環境限制；後續接手先確認現有工具，不預設限制永遠相同。

## 後續工作入口

[Infra 工作票 #19](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/19) 記錄獨立測試網址、資料庫隔離、登入、PR 自動檢查與驗證／部署流程。使用者指定在新對話先 `grill-with-docs`，再執行；目前是待釐清工作，Cloudflare Workers＋獨立 D1 是候選而非已確認方案。

更新（2026-10-08）：#19 已於同日完成需求釐清與 to-spec，並拆為工作票 #21–#32，見 [Infra 工作拆分](../design/infra-environments-ticket-plan.md)。上段保留為當次快照。

另需補上 UI 實際操作及真實模型決策紀錄的驗證。技術流程、發布狀態與模型表現分別記錄，按當次實際證據更新。
