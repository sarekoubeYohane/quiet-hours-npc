# #188 手機與私人備忘錄 fixture 驗證

基準 main 148a75d；本票是 #185 的裝置／備忘錄切片，不宣稱收件匣／通知／行事曆已完成。

預先確認 seam：既有世界 API、實際 SQLite 保存重讀、必要真應用瀏覽器；模型僅 transport fixture，活動／感知／認知／保存走實際應用。不使用付費模型，不操作正式世界。

## TDD 與執行結果

- 最初 `node tests/run-activities.mjs tests/phone-memos-api.test.cjs`，啟用基線測試 RED：成功 advance 後 `phones` 為 undefined。
- 加入回合副本啟用後相同測試 GREEN。後續垂直循環加入 create→list→read→update→delete、第三人有限畫面及原子性負例。
- 負例發現原一般行動錯誤被 activities 當 blocked 吞掉；手機改走既有 MemoryValidationError，非法／容量失敗整輪回復。
- 最終單票 API 5 tests：5 passed，0 failed；連同 owner-control/model-contract 回歸共15 tests全通過。捕捉真正四角色slot模型輸入，備忘錄原文不進旁人、一般事件或物件state；一個完整5步流程20次NPC transport，無額外手機／理解模型鏈。
- 故障矩陣：較後角色無效候選、保存前失敗、保存後回應不明、CAS衝突及原operationId重送；未提交不留下裝置／備忘錄，已提交重送不重派。
- 無效／過期／未知／遠距／容量滿負例保留原資料。GET不啟用，首個成功advance配發一次；已移除裝置不補生。
- `pnpm typecheck` 通過；變更檔ESLint零錯誤，world-app既有useEffect act dependency警告一項。

## 真 Chromium

`tooling/verification/browser-phone-memos.mjs` 啟動真應用 WorldApp 與既有世界route／SQLite，使用既有店主直接控制：手機create→list→read，4次UI推進（含首次啟用），原文與真正owner讀者保存。分析頁開啟手機紀錄後重載，API／SQLite及畫面一致；開面板未增加閱讀。0付費／0NPC transport。證據：[畫面](assets/phone-memos-188/saved-memo.png)、[量測](assets/phone-memos-188/evidence.json)。

執行時原環境 `/tmp/chromium` 是0bytes；從既有套件解出task專用binary及GLES libs後成功。這是執行器修復，不是產品變更。

## 限制與交接

[工程基線](../design/phone-baseline.md) 記錄啟用、容量、私人存取、精確正文及資料回退責任。新JSON不能交舊binary執行或丟棄欄位回退；保留原資料與可理解執行器。不建SQL migration。

本票不單獨宣稱 #185 A1–A30完成。#189需沿共用PhoneData／存取／真正讀者責任串接訊息；#190通知、#192行事曆另接。真實模型是否自主查看、忘記後重新讀取及正式站行為尚未驗證。fixture只證明機制可承接合法選擇。整合後仍需按code-review skill兩軸審查與必要回歸。
