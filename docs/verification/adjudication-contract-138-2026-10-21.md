# #138 日常候選與世界綁定分離

基於 #137 `e08d556`。`parseAdjudicationCandidate(raw)` 是集中契約的公開解析入口，回傳一般效果或日常核准候選；不接受 World、角色或 action 引用，不建立規則、具體物件或活動。日常 schema、核准提示、時間與互斥驗證均由集中契約負責；v1 相容與 v2 程序明確分開。

正式 API 呼叫 `resolveRoutineCandidate` 才進入世界綁定／audit；`bindRoutine` 仍依當前場所、權限、物件、材料、指定工具及時間上限確認執行。公開解析合法不代表世界可執行。明確上限不足仍可保存合法核准，但不建立物理成果。

本機明示模型 transport fixture；沒有付費模型／正式世界／合併／部署。

- Red：公開純解析入口缺少，新增測試失敗；Green：新入口對合法v2回傳核准，矛盾耗時、重複／非法timings及混合effects拒絕。
- 公開契約＋日常契約／程序／物件／時間上限 API/SQLite 回歸 30/30。覆蓋首次完整核准→活動完成→免費重綁、v1時間矛盾、未選程序非法、有限原料、工具移走、中斷、保存故障、版本衝突與原ID重送。
- 真實 WorldApp Chromium `browser128.mjs`：首次確認→跨回合完成→新杯免費重綁→接管／交還→喝／洗／還；UI/API/SQLite重載及重送通過，5 NPC＋1裁定＋0骰。[畫面](assets/adjudication-contract/routine-rebound.png)。
- typecheck、變更檔ESLint及diff檢查通過。

結果分支已有既有實作，下一票 #139 完成共同限制及新舊契約相容的全面核對。本報告不取代正式站驗收。
