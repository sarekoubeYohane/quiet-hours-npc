# PR #143 後續：活動程序與結果分支的操作證據

日期：2026-10-21（台北）。開發基準：`5e172d5`。關聯 #104、#106、#125、#128、#129、#133、#134、PR #131、#140、#143。本紀錄全部是本機模型 transport fixture 與受控骰子；世界 API、效果、操作 journal 及 SQLite 保存／重讀使用實際流程。沒有呼叫正式付費模型、修改正式世界、合併或部署；不關閉 #104、#106。

## 原始結果與根因

PR #143 已證明正式站 `3b352cb` 的餐點取得／食用、店主首次 v2 泡茶、原杯及飲品、UI/API 重讀和同 ID 重送；本輪不重新列為未實作。完整讀取報告、`assets/pr131-live-acceptance/evidence.json` 及成果圖後確認：舊證據的 `routine.timings` 存在，但 `routine.programs` 和頂層 `branches` 不在當時的投影白名單，已如實標記 `truncated`。保存的六項程序不是原始候選，不能用它們追補舊證據。

先在世界 API／SQLite seam 加入 v2 首次核准回歸，再跑：

```sh
node tests/run-activities.mjs tests/operation-evidence-api.test.cjs
```

第一個 Red：14 pass／1 fail。操作成功保存，但原 receipt 比 fixture 原始候選少 `branches:null` 和六項 `routine.programs`。測試用原始 tea timing=20、合法階段=15/30，確認未對齊原值和保存的30分鐘可分辨。初次測試曾用非法20分鐘階段，得到契約502；已改為合法階段後才將缺失投影記為正式 Red。

排序假設及結果：

1. **白名單落後於 #131 契約**：只補明確欄位後，普通 v2 首次核准回歸變 Green（15/15）。
2. **巢狀分支超出原深度8**：新增 uncertain v2 的切片再次 Red；`programs[].branches[].stages[].effects[]` 變成 null。補符合新結構的固定深度後變 Green。
3. **journal／UTF-8 大小淘汰**：上述小候選遠低於32 KiB；無須調高64 KiB單筆證據上限或journal預算。既有淘汰、安全及多角色測試保持通過。

## 變更及理由

| 新證據欄位 | 可判定的事實 |
| --- | --- |
| `dispatches[].candidate.value.branches` | 自由活動原始結果級別、共用分支、效果與階段前提 |
| `dispatches[].candidate.value.routine.programs` | 首次 v2 核准的符號角色、效果、階段、判定需求與結果分支；保留 null／缺省區別 |
| `result.rules[].programs` | 保存的規則，可與同一操作的原始候選比較；不倒推舊候選 |
| `result.actors[].plan.selectedResult` | 保存中的實際 outcome、分支索引與 D20 resolution；不重新擲骰 |
| `result.actors[].plan.stages`／`phaseCursor` | 當前綁定效果、物件前提與已推進階段；保存的 state map 用 key/value項目投影 |
| `result.resolutions` | 本操作新增的 attempt/work 機械結果，僅 eventId、actorId、resolution；完成後 plan已移除仍可核對結果級別 |

新 receipt 使用 `schemaVersion:2`。原 `schemaVersion:1` 的 journal 由 GET／重送原樣回傳，沒有升版、補欄位或由現有世界重建的讀取遷移。結果分支索引在活動仍在進行時從已保存 plan取得；活動完成後以實際 resolution.outcome 對照原候選的 outcomes，不能假裝完成後仍有 plan。

白名單仍由有限 Shape 定義，不接受任意 metadata。為涵蓋保存結果的最深合法路徑 `result.rules[].programs[].branches[].stages[].effects[].value`，投影深度固定為11；原本8層不能表達新契約。這是新結構所需的有限上界，其餘限制保持：原始候選32 KiB、單字串2048 UTF-8 bytes、每陣列16、派送明細32、單receipt64 KiB；既有journal數量／大小及水位淘汰不變。超界仍明示 truncated／omitted；敏感文字先遮蔽再截短。未保存事件正文、audience、attemptKey、角色私人上下文、認證或原世界備份；證據仍在journal，不回流NPC。

## 驗證

操作證據API回歸 **20/20**：既有14項加本次6項。新增案例涵蓋：

- 首次普通 v2 原始20分鐘／保存30分鐘、六程序完整、SQLite重讀及同ID重送。
- 日常分支的原始候選、保存程序、mixed分支索引1、fixture骰6、階段游標及water中間效果。
- 自由分支及其物件前提、跨回合完成、原receipt重讀不被後續世界改寫。
- 完成後plan=null，仍有本次已提交resolution；純續做0 NPC／0裁定，不捏造新決策。
- 深層敏感key/value遮蔽、未知私人欄位省略、非scalar與陣列超界截短、64KiB上界及拒絕操作重送。
- 舊格式缺程序且truncated的journal fixture，現有世界即使已有完整v2規則，GET與同ID重送仍不追補。

本輪保留既有保存前／保存後故障、契約／transport失敗、帳號隔離、NPC隔離、未知usage、已淘汰ID及多角色上界測試。完整整合UI驗證、回歸及雙軸review由整合報告記錄；上述fixture結果不等於正式站驗收。正式站仍須取得新操作的v2證據；若truncated或遮蔽阻礙判斷，應停止並明列缺口。
