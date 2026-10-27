# #173 本地機制驗證

基於 main 271495c，工程參數見 [基線](../design/life-needs-baseline.md)。不是正式站或真實 NPC 行為驗收。

- RED：`node tests/run-activities.mjs tests/life-needs-api.test.cjs`，世界 API 成功推進後讀不到 `needs.values`。
- GREEN：同指令3項通過，真實世界API→回合→JSON→SQLite→GET，驗證四需求不同數值、GET不推進、同ID重送不重算、不透露內部數值、一次升級可自主continue、同級不重派、保存衝突共同回復。
- 回歸：與 `activity-lifecycle-api`、`activities`、`continue-api` 合計35項通過；`tsc --noEmit --incremental false` 通過。
- 自我審查：需求只在候選世界寫入；時間先啟用再推進，GET不回填；預算預估使用獨立副本；變化及已評估記號沿整輪保存。未知／非法非有限需求停止變更，不靜默丟欄位。
- 既有角色畫面已接上當前感受、觀察者數值、啟用時點及有界歷史缺口；真實瀏覽器交互由整合驗證補證。未宣稱真實自主飲食／睡眠或泡茶問題已修復。
