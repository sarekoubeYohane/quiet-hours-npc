# 日常物件 Spec review：2026-10-21

基準 `main` = `583e6cb87cc60c5f1c4a9f7bf2bdf7f161aa6253`；審查 `ae9ba4da639169db3702a4fd6d7566996e11c7e6`，命令 `git diff main...ae9ba4d` 與 `git log main..ae9ba4d --oneline`。來源：#122、#123、沿用 #108／#115，以及已確認 Grill。此為 Spec 軸，Standards 另報。

## Findings

- **P1：空但髒的杯子無法清洗，回合技術失敗。** #123 要求「洗好後的杯子可用同一身份供後續活動重用」並保留一般效果契約。`lib/routine-rules.ts` 的 clean 分支新增接受 `contents='empty', clean='no'`，卻仍一律發出 `contents='empty'` 的 state 效果；`applyEffects` 嚴格禁止不改值的轉換。因此合法洗杯會回傳 502「物件不支援這個狀態轉換。」，回滾而沒有恢復 cleanliness。應只為實際改變的欄位產生效果，並按實際效果數遞增 revision。

驗證：將新增 API／SQLite 洗杯測試的起始 contents 由 dirty 改為 empty，其餘 `clean='no'` 與合法 clean transitions 保留，複製至暫存測試後以既有 `tests/run-activities.mjs` 執行。8 項中 7 通過，該項 wash 階段確認得到 502；沒有修改正式測試或 runtime。證據：本次測試暫存 log `/tmp/spec-review-empty-clean.log`。交付前需納入正式回歸並修正。

未發現其他確定的範圍擴張或產品語意衝突。杯子指定、有限供應、工具狀態／權限、投入上限、階段與取消路徑已有對應 API 測試；整合 UI／全套與正式站狀態由整合報告分別列示。

Spec：1 項，最嚴重為合法洗杯造成整回合回滾。

## 修正複查

已複查修正 `e4ac69b`，整合後 `dfb5155`。clean 分支只在 contents 尚非 empty 時輸出清空效果，clean=no→yes 則使用實際執行步數對應的 revision，沒有放寬 `applyEffects` 對 no-op 的拒絕。

正式維護的 `tests/routine-objects-api.test.cjs` 已同時覆蓋起始 `contents=dirty` 與 `contents=empty`、`clean=no`、宣告合法 clean transitions 的兩種情況；均驗證洗淨後為 empty／clean=yes、版本分別為 4／3，再以同一舊杯 ID 完成新的泡茶，且裁定總數維持 1。

複查實際執行：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/routine-objects-api.test.cjs`，8 項全數通過、0 skipped。原 P1 已關閉；沒有剩餘 Spec 阻擋。此結論仍僅涵蓋受控模型 transport 的 API／SQLite 驗證，真實模型及正式站驗收由整合報告另列。
