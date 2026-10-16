## Spec

基準 `47229d8fffcee57e4d0b62a3330f4d1a443c3e29` → `7fc9ae7e5a960979983fc28020f6b0fd79e9718f`。追讀受限效果、活動時間、模型路由、費用與保存；發現 2 項需修正，未發現額外範圍擴張。

- **P1：保存拋例外會遺失已知付費用量。** `app/api/world/route.ts:389–409` 只在 `.run()` 成功回傳但 `changes=0` 時 `retainPaidUsage`；D1 在提交前拋例外直接進外層 catch，僅保存失敗 journal。規格 #93：「當前回合一致回復、已知付費用量保留」；#100：「預算／服務／保存故障仍一致回復並保留已知用量」。以既有 `store.throwBeforeNextSave()` + 成功 NPC／裁定替身實際驗證：兩次模型均回報 30 input / 10 output，API 502、世界 turn=0 正確，但重讀 `totalCalls=0`、tokens=0，應為 2／60／20。應在確認未提交時補存用量；未知是否已提交時須避免重計。

- **P2：合法首階段與當回合到期階段永遠遭拒。** `lib/activities.ts:167–170` 對 `afterMinutes <= minutes` 一律拋技術錯誤，而階段 schema 明確允許 15 分鐘、世界推進最小亦為 15 分鐘，所以 afterMinutes=15 永不可用；30 分鐘推進也拒絕首階段 30。規格 #100：「少數有意義的活動階段沿既有世界時間與活動計畫推進」、「已執行物件位置、狀態與資源變化可重讀」。替身回傳 duration=60、首階段 afterMinutes=15 的合法有限具體化；15 分鐘 advance 實際回 502「活動階段時點超出本次計畫」，並已花費兩次模型。應對齊活動開始時點並處理本回合已到期階段，不將契約允許的正常時間點當技術失敗。

重現：`node tests/run-activities.mjs /workspace/scratch/9a5e0189c990/spec-probes.cjs`，2 個針對預期行為的探針實跑均失敗。探針與完整輸出在 repo 外的 `spec-probes.cjs`／`spec-probes.log`；未修改 repository。
