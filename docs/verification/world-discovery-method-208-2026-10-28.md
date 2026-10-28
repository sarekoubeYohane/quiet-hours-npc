# #208 已確認查找方法補修驗證（2026-10-28）

起點整合 `c56a0e4`，不改 #209 bindings。原反例：主持確認方法 A 查未知供應失敗後，同 A 重問應沿用；主持另確認方法 B，原程式仍不擲骰、供應 knownTo=[]，形成永久鎖死。新 API 案先 red，再 green。

`tests/discovery-method-api.test.cjs` **4/4**：

- 主持 activityIdentity A 查兩個未知資源只擲一次並失敗；NPC 改字但同 A 不重擲；真正主持確認不同 B 才獲一次新群組機會，兩資源可察覺、沒有 materialize／拿取。保存重讀後下一真正 NPC request 可用。
- A／B 的30分鐘查找跨 SQLite 保存 phase.discoveryMethod(version1)，未完成前0新增骰／知情，同A完成仍沿用、B真正完成才新感知。server-only context／receipt key 不進下一 NPC 輸入。
- 舊無方法群組 receipt 讀取不修改 SQLite；首次確認 A 仍0骰、保持舊失敗，只在實際寫操作建立有界 v2 alias；同 A 不重擲，之後不同 B 可再查探。不回填／猜測舊歷史。
- routine operation A 與已確認同義別名共用方法及既有感知結果，別名不增裁定；不同已確認 operation B 才有新機會。仍走既有一次裁定，未新增反思、分類或修復服務。

八檔 API／感知／長活動／活動語義／習慣／日常世界回歸 **101/101**，0失敗或略過；typecheck及變更產品／測試 ESLint通過。既有人物／聲音舊 tuple、有界觀察 ID、候選改組不洗骰、receipt2048／1MiB容量、故障回復與正常活動回歸沿同一套件。新測試已加入預設 runner。

只有 perception、world-effects 必要接線與測試／文件變更；新 context 只寫到需要 discover 的階段，無 SQL migration、無 NPC 新心理欄位或職業腳本。無方法的舊計畫保持舊語義，不因讀取而建立新機會；回退仍須保留理解 v2 receipt／version1 phase context 的完整讀寫器，不丟欄位或重置世界。

以上為明示 NPC／裁定 transport fixture，世界 API、活動、感知、SQLite 與實際 request/messages 走正式程式，0 真實付費呼叫，未操作正式世界或部署。此補修證明新方法能力可用，不宣稱真模型自主需求處理已改善。
