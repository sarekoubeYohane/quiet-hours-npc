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

- 新中斷恢復矩陣 **13/13 PASS**：驗證前／後退出；多派送；NPC／裁定歷史價格；快取拆分；舊窗口；部分 usage 缺失；同 ID 三方競爭；較新故事；trace 讀取失敗；入帳寫入失敗及恢復；trace 缺失；舊無 marker 的可核對／不可核對資料；原 worker 晚到；未定案回條淘汰後仍保留未知範圍。
- 既有成本、操作、CAS 衝突、追溯故障及當時新增矩陣合跑 **72/72 PASS**；其後補上的混合價格／快取案例另於上述 13/13 中通過。完整 suite 與 review 結果由整合分支最終報告記錄。
- 新舊分析／費用入口的渲染測試由 `tests/usage-recovery-ui.test.cjs` 驗證：重載後依真實 API 未確認範圍顯示警示；不能把完整未知顯示成免費。
- TypeScript 與 ESLint 驗證依整合分支最終執行結果記錄；本輪不依賴真實供應商報價或模型回覆。

## 契約與邊界

用量與 journal accounting marker 共用 owner row CAS；原 uncertain receipt body 不改。正常提交同時標記完整入帳，恢復只合併差額；原 worker 收尾／競爭恢復不能重複計數。派送價格、原窗口及 lateUsage 分開；沒有歷史價格就顯示未知，不套目前價格。資料缺失／儲存故障留待核對；未捕獲後續派送仍有未知範圍，不將已保存部分當成完整帳單。

本切片核對 #91 前提：現有私有 trace 保存／重讀、owner 權限、遮蔽、單筆1MiB／owner64筆及16MiB、與 NPC／回想隔離可沿用；不重做 #91，不解除原票 blocked-by 關係。新增 marker 只在既有八筆／byte journal 中有界保留，淘汰未定案項只留安全計數／未知警示；不引入無界帳本或新 migration。

本地 Request／Response＋SQLite／受控時間不是 Cloudflare runtime、遠端 D1 效能或正式網路故障重現；渲染測試不等於正式瀏覽器一小時可靠性驗收。不能據此宣稱正式最初中斷已解決或 NPC loop 改善。
