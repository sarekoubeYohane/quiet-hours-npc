# #185 最終獨立審查修正

審查基準 main `148a75d`、原整合 head `bd96494`。Standards：0 硬性違反、2 項非阻擋 Duplicated Code 判斷；Spec：3 個真 API／SQLite 反例。依 implement-spec 交由同一 implementer 在隔離 worktree 修正；沒有付費模型、正式世界、main 合併或部署。

## Red → Green 與修正責任

1. **A9 已知事件往返**：原 matcher 只取最後一個線索，四輪真 move 的 cue 為 `[0,1,0,0]`，漏掉第二個已知往返。改沿當次真正展示的本人觀察與短期 handle，以穩定觀察 ID／時間游標依序承接轉換；共同 matcher 同時供內在安排及手機提醒使用。未知／未展示不重設，舊觀察不重播。
2. **語義條件與 JSON 順序**：同義 `{kind:'time',minute:9999}`／`{minute:9999,kind:'time'}` 的 drop 原回502；改以共同語義身份比較。永久案例亦驗 complete／archive，真正改成不同分鐘仍共同回復，不接受暗改。
3. **來訊精確原文**：原 `world.resolve` 的通用 trim 改變前後空白／換行；message 改保留原字串並另檢查空白／500字界線，裝置與發訊人經歷保持同一正文。其他敘事行動原有文字處理不變。
4. **派生投影收斂**：正常及回想後共用 `finalizeDecisionInput` 維護手機 handle、cue、notice、gap 與共同 byte 預留；兩者原本各自的記憶選取／回想服務責任保持。
5. **手機純解析收斂**：共用 JSON／shape 解析；仍分開驗證當次派送快照與真正執行前權限／版本／物理條件，沒有以快取解析繞過重驗。

永久公開介面案例：[flexible-life-review-api.test.cjs](../../tests/flexible-life-review-api.test.cjs)。三個獨立審查原反例在本 worktree 重現 **3／3 RED**；修正後原反例連同 cue／calendar 共 **25／25 GREEN**。新增永久五案含兩次事件往返後安靜回合、手機事件提醒的原 ID 重送與零重擲，以及事件游標在保存失敗後共同回復；最終 **5／5 GREEN**。收斂兩個重複責任後，第一輪聯合 API 回歸 **96／96** 通過。另擴充安排／活動／控制／契約等回歸 **127／127** 通過；進一步將事件證據收緊為「可見線索 tuple＋真正展示的短期 handle」後，再跑相關 **69／69** 通過，最後新增的事件游標故障／重送案含在上述5／5中。`pnpm typecheck`、9個變更程式／runner的ESLint與diffcheck通過。

舊 cue 缺穩定游標時只建立最後已知基線，不推算歷史新機會；新增游標與原世界一起保存及回復，仍在既有有界容量內。沒有 SQL migration、獨立條件引擎、手機 AI 或新增派送政策。

最終程式再執行既有 `browser-flexible-life-integration.mjs`：真正 Chromium／WorldApp／API／SQLite 的同一旅程 **22次 advance、510世界分鐘**，其中10次既有UI按鈕、12次睡眠期間安靜API；**9次NPC＋1次裁定 fixture、0頁面錯誤**，重載／原ID重送與外部原文保持一致。沒有新增手機模型或付費呼叫。原正式A1–A30覆蓋及真實模型／正式站未驗證界線不變；修正後完整整合回歸與兩軸複審由整合分支收尾記錄。

## Spec 複審：忘記游標來源後的同分鐘去重

原三項複審 GREEN 後，審查追加真 API 反例：Cass／Vera 同分鐘返回，owner 處理後合法選留再 forget Vera，移除游標對應的長期與同源短期。ID 消失後舊時間 fallback 重新播放較早 Cass，cue 為 `[0,1,0,1]`（應 `[0,1,0,0]`）。原檔在本 fixer 重現 **1／1 RED**。

同一 implementer 改用既有感知／短期記憶的內部單調序號與 cue 高水位，不再用時間猜同分鐘排序。高水位不隨 forget／FIFO 回退，只消費當次真正展示的感知與短期 handle；舊 cue 在新感知前建立保守基線。共同 matcher 同時保護手機提醒，unknown／改字不重設。序號不保存正文、不進 NPC 輸入或 Embedding，仍計入既有容量並原子回復。

永久 review API 現 **7／7 GREEN**：新增合法 forget 後安靜回合、82 次真 intervene 造成 FIFO 後不重播及新往返可喚起、同分鐘較後新觀察仍可喚起。原反例加原有五案 **6／6 GREEN**。相關 15 檔 API／SQLite 回歸 **183／183 GREEN**，涵蓋四類感知來源、active／false perception、內外記憶、回想、睡眠、手機共同 matcher、故障回復與重送。回想服務 fixture 另驗內部高水位不進 Embedding。

最新序號修正後：追加回想 API **34／34 GREEN**；`pnpm typecheck`、8 個變更程式／測試的 ESLint、`git diff --check` 通過。既有真 Chromium 旅程再次 **PASS**（22 次 advance／510 分鐘、9 NPC＋1 裁定 fixture、0頁面錯誤）；fixture 結果不宣稱真實 NPC 或正式站驗收。

最後將序號啟用納入原短期 FIFO／總 bytes 收斂後，重跑安排、共同手機 matcher、review、memory／maintenance／recall 六檔 **95／95 GREEN**；最終 typecheck／ESLint／diffcheck 與 Chromium 旅程再次通過。
