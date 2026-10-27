# #192 手機行事曆與提醒本地驗證

基準整合 `514f34c`（#187–#191已整合）。Root先前五切片完整回歸755/755（713API/UI＋32auth＋10workerd/migration）與對應GitHubCI221成功是本輪前置證據；#192後仍須整合收尾完整回歸。

## 實跑

- CRUD tracer RED：原路由不接受calendar，API502（預期200）；接入同一手機存取／記錄責任後GREEN。
- 刪除後同名重建提醒RED：舊取消通知被當新聲響，1次（預期2次）；共用發聲責任忽略已取消的歷史row，但保留最高版本／generation去重ledger後GREEN。不是重播取消的舊通知。
- `NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tests/phone-calendar-api.test.cjs tests/phone-memos-api.test.cjs tests/phone-inbox-api.test.cjs tests/phone-notifications-api.test.cjs tests/arrangement-cues-api.test.cjs tests/arrangements-api.test.cjs tests/continue-api.test.cjs tests/recall-api.test.cjs tests/sleep-api.test.cjs`：**109/109**，0失敗／跳過，約49秒。#192新增13項；實際SQLite保存重讀、共用路由／感知／認知／活動／效果／提交完整執行。只用明示transport、時鐘／骰子fixture。
- 全案TypeScript、10個變更程式／測試／runner ESLint及git diff --check通過。
- 真Chromium `tooling/verification/browser-phone-calendar.mjs`：同一WorldApp/API/SQLite世界，內在安排→寫入手機並設定提醒→長休息→到期通知但未讀→continue→主動read→延期→取消→跨過舊到期點→重載。8次NPC transport fixture，0裁定／回想／額外手機模型、0頁面錯誤；觀察者開啟／重載不標已讀，不改內在安排。僅fixture wall clock按請求前進以避免相同timestamp的journal保留地板；世界分鐘完全由真正advance推進，未中途重寫時間／歷史／結果。

[通知但未讀](assets/phone-calendar-192/due-unread.png) · [真正閱讀](assets/phone-calendar-192/read.png) · [取消後](assets/phone-calendar-192/cancelled.png) · [精簡保存證據](assets/phone-calendar-192/evidence.json)。畫面已視覺檢查。首次runner硬寫「咖啡店老闆」而真名「店主」、固定wall-clock碰journal保留地板均已查因並修正runner後重跑；未改產品以掩蓋失敗。

## 覆蓋與界線

13個新API案例包含完整CRUD、無提醒行事曆、設定／延期／取消版本、文字改寫不重響、真正閱讀／不自動完成安排、實際可見安排關聯、刪紀錄／取消不放下內在安排、80則合法新經歷淘汰內在原文後提醒不復活全文／實際重讀精確原文、較後角色及保存前後／CAS／同ID故障、32筆容量不淘汰正文、裝置離身／返回主動讀、相關已知位置變化重喚起／遠端主人位置不訂閱、真正人物感知vs隱藏私人事件、真正確認睡眠不被普通提醒喚醒，以及取消歷史不冒充重建紀錄的新聲響。

新增狀態全在同一世界候選與提交；提醒未讀仍在，通知沒有正文／來源索引旁路。安排引用走當次輸入範圍，phone動作仍是單次15分鐘；未新增微操作、多動作排序或付費修復。手機外部紀錄可以獨立存在；閱讀別人的邀請不新增自己的意圖。

獨立兩軸code-review與最終完整A1–A30覆蓋由#193／整合分支收尾；這裡不把切片自檢當終審。Vector Recall特定「原本省略安排→回想才取得」、跨帳號／世界與完整長流程故障矩陣仍按#193補整合證據。真實NPC是否自然規劃、查看或改序及正式站均未驗證，本輪零付費模型、零正式世界操作，未合併main或部署。
