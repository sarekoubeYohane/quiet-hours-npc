# #92：已知用量中斷恢復的工程驗收

本輪只承接 #92 頂端 2026-10-29 補充；#77 的正式中斷原因分開見[診斷後續](interruption-followup-77-2026-10-29.md)。沒有關閉 #91／#92／#77，沒有部署、付費呼叫或正式世界變更。

## RED → GREEN

以 main `da6b0c2`／已合併 PR #218 的公開合成診斷為起點，親自執行：

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tooling/diagnostics/interrupted-round-2026-10-29.cjs
```

修正前 exit 1：程序在 candidate durable 之後退出，原 ID 恢復後 trace 40 tokens、世界 totalCalls 0／input 0（預期 1／30）；turn 0、version 0、uncertain／502／evidence null、零重新派送。修正後同命令 exit 0：calls 1／input 30／output 10，其餘故事、version、原 receipt 與零派送條件相同。

永久 regression 位於 `tests/interrupted-usage-api.test.cjs`，沿世界 API → 共用 transport → 真實隔離 SQLite → 子程序退出／恢復／GET／原 receipt 重讀。子程序只把真正 durable SQL rows 交給新程序，不攜帶 RAM usage。此 SQL 重載是測試儲存 restart fixture，驗收斷言仍沿 API，不以私有 helper 或原始碼字串代替。

## 已執行的驗收

驗證程式碼基準為整合 `f8baee0`（產品等同實作 `2af5258`）；最後只追加本報告。Node 24.22.1、TypeScript 5.9.3，依 repo lockfile 安裝依賴。公開資料均為合成 fixture，模型外連由 no-network preload 禁止。

| 檢查 | 結果與範圍 |
| --- | --- |
| 永久中斷 API 矩陣 | **15/15 PASS**：驗證前／後程序退出、多派送、NPC／裁定價格、快取、舊窗口、部分未知、競爭、較新故事、trace／入帳儲存故障與恢復、trace 缺失、legacy 可核對／拒絕猜算、原 worker 晚到、未定案回條淘汰、兩項 review RED→GREEN |
| 整合後相關回歸 | **103/103 PASS**：上述矩陣、費用、操作、CAS 衝突、預算、完整期限、追溯故障、恢復及新舊 UI |
| 最後容量補正後 | **22/22 PASS**：實際世界 API 中斷／衝突；其後沒有產品變更 |
| 原 PR #218 腳本 | **7/7 PASS**：兩種中斷位置及五組對照；trace 40 tokens、calls 1、input 30、output 10、version／turn 0、uncertain／502／null、零 redispatch |
| 完整 npm test 嘗試 | Review 前產品快照的 API／活動／UI **880/880**、認證 **32/32**；最後一組 **13/14**，唯一失敗是 #211 素材正向測試假設目前產品仍等於舊 pinned commit |
| 固定版本素材測試修正後 | 保留正式 checker／註冊不變；正向測試用真實 pinned 暫存 checkout，負向確認修改產品仍被拒絕。材料 **5/5**；最終 Workers／migration／材料整組 **15/15 PASS** |
| 最終型別／lint／build | typecheck PASS；ESLint **0 errors／4 個既有影像與 Hook warnings**；vinext build PASS |
| 公開資料／文件 | 原私人 operation／request IDs、完整 request／response 排除檢查 PASS；相對連結、腳本語法與 diff whitespace PASS |

沒有在最後測試前提維護後再次重跑整條 `npm test`；上述按版本與分組列出實際結果，不宣稱最終單次完整 suite 全綠。產品 review 修正已有獨立相關回歸；最後容量補正另外沿 API 重驗。這不是正式 Cloudflare 效能或半小時行為驗收。

主要永久回歸命令：

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/interrupted-usage-api.test.cjs tests/usage-recovery-ui.test.cjs tests/round-deadline-api.test.cjs tests/decision-trace-faults-api.test.cjs tests/costs-api.test.cjs tests/operations-api.test.cjs tests/conflict-api.test.cjs tests/budgets-api.test.cjs tests/recovery-ui.test.cjs
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node --test tests/auth-workerd.test.mjs tests/model-keys-workerd.test.mjs tests/migration-gate.test.mjs tooling/experiments/check-autonomous-demand-211.test.mjs
```

UI 渲染測試使用真實 API 的世界資料及合成核對狀態，確認費用、分析與重載的未知警示；API 矩陣另外核對真實恢復資料。兩者不冒充正式瀏覽器驗收。私有保存／重讀、owner 權限、遮蔽、容量及 NPC／回想隔離沿現有 #91 基礎與追溯故障回歸核對，沒有解除其原 blocked-by 關係。

## 契約與邊界

用量與 journal accounting marker 共用 owner row CAS；原 uncertain receipt body 不改。正常提交同時標記完整入帳，恢復只合併差額；原 worker 收尾／競爭恢復不能重複計數。派送價格、原窗口及 lateUsage 分開；沒有歷史價格就顯示未知，不套目前價格。資料缺失／儲存故障留待核對；未捕獲後續派送仍有未知範圍，不將已保存部分當成完整帳單。

本切片核對 #91 前提：現有私有 trace 保存／重讀、owner 權限、遮蔽、單筆1MiB／owner64筆及16MiB、與 NPC／回想隔離可沿用；不重做 #91，不解除原票 blocked-by 關係。新增 marker 只在既有八筆／byte journal 中有界保留，淘汰未定案項只留安全計數／未知警示；不引入無界帳本或新 migration。

本地 Request／Response＋SQLite／受控時間不是 Cloudflare runtime、遠端 D1 效能或正式網路故障重現；渲染測試不等於正式瀏覽器一小時可靠性驗收。不能據此宣稱正式最初中斷已解決或 NPC loop 改善。

## Review 修正

- Standards：集中 cohort key／派送時間責任到 `beginCost`，核對狀態改具名分支；無新增 lint 警告。
- Spec：已恢復的暫時 unknown-price cohort 在原 worker 完整收尾時，必須扣除原操作先前貢獻，不能同時保留 unknown 與 priced 兩份。永久 API 測試先 RED（cohorts 2，預期 1），修正以 prior／desired cohort 聯集補差額；另驗證共享 cohort 其他三筆歷史不被扣掉。
- 額外自查：別的操作若在恢復入帳前載入 world、之後才讀新 journal，單靠 story version 會接受舊用量快照。API 競爭測試先 RED（回 200，預期 409），修正受理快照核對及 lease CAS 的 state 前提，防止覆蓋已恢復帳務。
- 新矩陣15/15、型別檢查通過；ESLint 0 errors／4項既有影像與 Hook warnings。
