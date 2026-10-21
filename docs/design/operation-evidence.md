# 操作驗收證據

規格 [#133](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/133)，單一垂直工作票 [#134](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/134)。基準 main `d2f3ec3`；本輪承接 #122／#123 決策，不重新 Grill。

## 修正前盤點與最小範圍

| 既有來源 | 已能證明 | 缺口／處理 |
| --- | --- | --- |
| #132 API JSON 與兩張截圖 | 原杯 tea、飲品 ID、完整對齊規則、活動完成及重載一致 | 沒有原 proposal、target、candidate 或 operationId；不能回推 |
| GET 世界與 `?operationId=` | 帳號隔離、最新世界、settled／pending／uncertain／expired／unknown、失敗診斷 | 補成功與失敗的有界證據及可發現的 operation ID |
| 操作 journal | 原子提交、原 HTTP 結果、同 ID 精確回放、最多八筆與水位淘汰 | 沿用；證據附原結果，不另建交易或重播引擎 |
| Worker `world_api` logs | API requestId、operationId、階段、版本、結果 | 刻意不記 payload，無法補回已丟棄的成功候選 |
| NPC／裁定 transport | 原 requestId、回覆、已知 usage 在當次請求中存在 | 在既有邊界被動捕獲必要欄位；不加模型呼叫 |
| 瀏覽器 pending | 網路中斷時以原 payload 重試 | settled 後移除；沿 journal 提供安全的已完成 advance 重送資料 |

最小 API／SQLite red：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/operation-evidence-api.test.cjs`。基準上成功回合 HTTP 200、操作 settled，但 `operation.evidence` 不存在；一項測試失敗，訊息 `settled success must expose original proposal and raw adjudication evidence`。這個測試檢驗證據缺口，不把泡茶成功改寫為 runtime 失敗。

診斷假設依次為：journal 已存但 GET 未暴露、成功路徑解析後丟棄、僅 UI 遺失操作資料。逐一核對後，成功候選確實只存在於當次執行記憶中，journal 從未保存；UI 也移除 settled payload。既有同 ID 重放機制沒有故障，故不新增重送 endpoint。

## 資料與權責

證據只供觀察者使用，跟隨 journal 的存活期限，不寫入 World、事件、NPC 記憶或下一次模型上下文。NPC 只投影行動種類、原文、target、purpose、一般估時及投入上限；不保存整份含記憶／認知的回覆或輸入 transcript。裁定候選在驗證及時間對齊前投影必要契約欄位，與實際保存後的規則時間、活動及物件身份對照。

原執行部署和 API requestId 保存在證據內；重送有自己的 HTTP requestId，但不改寫原證據。實際 transport 派送與原費用帳的「付費嘗試」分開記錄；未知 usage 保持未知。診斷 callback 不影響原模型回覆、驗證、預算或世界效果。

同一原子 UPDATE 保存世界與證據。技術回滾的證據可保留已收到候選，但結果只能描述實際保存的回滾世界；提交未確認時不可宣稱候選成果已保存。原子失敗恢復沿用既有 journal 與已知用量補記流程。

此契約涵蓋已受理且定案的操作。驗證／認證拒絕發生在受理之前，不新增 journal；Worker 硬中斷或資料庫持續不可寫時，尚未持久化的候選與供應商用量仍可能不可得。沿用 pending／uncertain、禁止同 ID 再執行的保障，不宣稱跨模型服務與資料庫有分散式交易，也不把未知用量補成零。

一般 GET 可發現有界近期操作；指定 ID 使用原 `GET /api/world?operationId=...`。分析頁顯示證據，安全重送使用原 `POST /api/world` 與原 ID。對已淘汰、舊版缺證據、不明結果明示缺口，不製造候選或新 ID。重送資料不保留 advance UI 夾帶的無關文字、對象或認證；API Key 不在任何證據內。

### 讀取欄位與上限

- POST 的 `operationEvidence` 是該次原執行證據；一般 GET 的同名欄位是當前場景最近證據，`recentOperations` 提供保留操作摘要。指定 ID 後以 `operation.evidence` 為準；舊記錄沒有證據時為 null。
- `deployment`、`operationId`、`requestId`、`baseVersion`／`resultVersion` 關聯執行；`dispatches` 逐筆記錄 task／actorId／requestId／provider／model／usage 與 `candidate.value`。這是原值的必要欄位投影，不是整份模型 transcript 或原始 HTTP 本文。
- `outcome` 分 committed／rolled-back／not-committed。`result` 只投影保存的世界時間、活動、對齊規則及變更物件；未確認世界提交時不附候選世界成果。
- 單筆證據 JSON 的 UTF-8 硬上限為 64 KiB；超過 32 KiB 的原回覆不展開保存，候選明示 omitted。最多保留 32 筆派送明細，總 counts 仍反映實際派送。陣列、巢狀深度及字串另有界限，遮蔽或截短皆有標記。
- 仍沿用 journal 最多八筆及 500,000 bytes 的淘汰目標；「最新完整原回應本身超過門檻仍保留」是既有精確重放契約，不表示新證據可無界增加。淘汰後同 ID 不會重新執行。

## 原杯能力與驗收界線

`daily-life-v1` 原杯只有 contents 的 empty／water／tea 及 clean 的 yes／no。現行日常 drink 會消耗飲品並將杯 contents 設為 dirty，嚴格效果驗證要求物件事前宣告此轉換，因此原杯不具備這條 drink→wash 驗收鏈。背景具體化普通杯原本已有 dirty 能力；兩者不可混報。

本輪不修改驗收場景或杯子能力。正式站先唯讀核對能力，不足時記錄「場景準備不足」並停止該分支；不能直接補欄位，也不能把未測當失敗。獨立具備完整能力的本機 fixture 僅證明該 fixture 的行為。

本機通過不代表已部署；正式執行見 [合併部署後流程](../verification/operation-evidence-live-runbook.md)。
