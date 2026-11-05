# #239 世界配置驗證

舊存檔省略 `World.configuration`。執行器、主觀投影和介面共用 `lib/world-configuration.ts` 的舊情境來源，原有事件、記憶、用量和場景狀態沿同一帳號資料列保存。明示配置使用自身的地點、房間、門與住處對應。第一個所屬房間沿現有規則作為地點入口。角色當前位置仍由世界的角色資料保存，場景門的即時狀態仍由 `World.scene.doors` 保存。兩者與場景美術座標分開。

舊情境的開場腳本、像素地圖、咖啡館日常和店主直接控制仍以原資料為準。明示配置的觀察頁使用實際地點與人物房間文字，角色檔案和知情投影也使用相同房間資料。跨地點保存路線、通用場景美術及選擇場景的完整畫面由後續工作票承接。

## 重現

```powershell
node tests/run-activities.mjs tests/world-configuration-api.test.cjs tests/world-configuration-ui.test.cjs
node tests/run-activities.mjs tests/recovery-ui.test.cjs tests/acceptance-scene-api.test.cjs tests/perception-api.test.cjs tests/owner-control-api.test.cjs tests/npc-input-equivalence.test.cjs
node tests/run-auth.mjs tests/reset-api.test.cjs
npm run typecheck
```

- 既有 `aed7547` 基線先執行驗收場景、感知和實際畫面復原測試，共 23 項通過。重置使用 `run-auth.mjs`，基線與改動後各 8 項通過。
- 新增世界 API 測試在改動前因固定房間查找而回傳 503。既有情境、直接控制及 NPC 請求等價回歸於改動後共 31 項通過。改動後，以正式 GET／POST、SQLite 和受控模型執行回合，重讀原兩名自訂角色、記憶、房間、門與用量。另一帳號仍保有原開場。閉門擋住視線，陌生別館及其他人的私有記憶不在 NPC 請求，已配置的門可經正常行動開啟並通過。
- 新增畫面測試掛載正式應用、讀取同一世界 API、點選角色及開啟人物檔案。畫面顯示配置中的場所及房間，觀看與切換人物不推進世界時間。

本切片以明示保存的配置驗證共同讀取路徑，正式建立、初始化與開始由後續切片驗收。資料格式沿用世界 JSON，無需 SQL migration。已寫入自訂配置的世界須以能辨識配置的版本讀取和運行。舊版本會套用固定名單和房間查找，回退須保留新版讀取與執行能力以及原世界資料。
