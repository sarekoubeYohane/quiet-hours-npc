# Standards 初審（2026-10-18）

範圍：`cab08092ac5204d997742ae7210225d59dad8018...9edcd27`，15 個整合／實作／證據提交。已讀 AGENTS、Matt Pocock／domain 指南、GLOSSARY、ADR 0001、TDD 及 tests／mocking、free-action-effects 契約；搜尋未發現 CODING_STANDARDS 或 CONTRIBUTING 文件。排除既有及 tooling 已管事項。本審查沒有執行測試，也不審 Spec。

**硬性標準違反：0。** 新測試透過 GET／POST 觀察結果；fetch 屬外部模型邊界替身，SQLite 保存具真實序列化；權威 fixture 變更有明示，未將其冒稱產品修理／教學介面。NPC projection 未直接加入 routineAudit／rule ID，與 ADR 的資訊邊界一致。依需求驗證付費 transport 次數屬已批准邊界，不列為內部 collaborator call-count 違反。

**判斷性發現：1。**

- Possible **Duplicated Code**：`lib/routine-rules.ts:66–78` 的 `const ingredient=op==='tea'?/(茶葉|茶包|tea)/i:op==='coffee'?/(咖啡|coffee)/i:/(食物|簡餐|food|meal)/i` 在 `localRight`／`localComplete` 重複；同概念又見 `lib/routine-obstacles.ts:16` 的 `const ingredient=operation==='tea'?...` 及 `lib/routine-rules.ts:163` 的 material selector。器具可用條件亦重複於 rules:126、160、211 與 obstacles:25。這些規則同時決定方法投影、權限、障礙與執行；新增材料別名或條件需改數處，現有 coffee 詞形已不同。建議抽取一個不依賴 World 的日常材料分類／物件可用 predicate 模組，由各路徑傳入當前對象；保留各自刻意不同的知情、權限及 pending 篩選。這是維護性判斷，非已證明的功能故障或硬性標準違反。

總計：硬性違反 0；heuristic 1（重複的日常材料／器具資格邏輯）。
