# #190 手機通知、感知與共同活動

基準整合6064b69（#187／#188／#189／#191）。預先確認seam：既有世界API、實際SQLite保存重讀、必要真應用瀏覽器。模型只替換transport，骰子／時鐘可控；感知、認知、活動、效果及提交走真應用。

## TDD 與回歸

初始API RED：送達後裝置沒有notifications。加入共同通知責任後GREEN，逐片增加下列真API案例：

1. 送達→實際發聲→每角色感知機會／察覺→一次正常決策handle承接；正文與寄件人未洩漏，察覺／處理不等於已讀。
2. 骰子失敗漏通知，往後推進、GET、同ID重放都不重擲／重播；後來主動list/read仍讀到精確未讀原文。
3. 察覺後continue僅一個正常角色決策，原startedAt／until／action不重設，往後安靜回合不額外派送。
4. 手機離身留在別人近旁，只有裝置當地線索，遠處物主不知；睡眠收訊沒有機會，不喚醒、不知道正文。
5. 真D20大失敗取得「似乎有人喊我」誤認：原主觀文字保留，輸入僅中性noticeOpportunities身份，沒有客觀手機來源、正文／寄件人或objectiveClues。
6. 6則察覺在待命期間保存；交還後同次輸入僅4則，缺口2明示，只有4則handledAt。全部取得一次排程機會，省略2則不反覆開模型；後來既有介入引發正常決策才處理剩餘2則。
7. 已確認可暫停長工作因通知自主pause→list→read→resume→完成。共同生命周期保存15分鐘進度／階段cursor1，復工重驗，不重播第一段成果；最後物件revision3，只發生原來兩段效果，無新裁定。
8. 較後模型無效、保存前故障、保存後回應不明、CAS衝突，通知／觀察／trial／handled共同回復或重放；同ID不重新擲骰或模型派送。
9. 128筆已結算通知細節達滿，以有界回收明示historyDropped；精確未讀正文、fresh通知／處理及來源去重仍保存，重送一致。

`node tests/run-activities.mjs tests/phone-notifications-api.test.cjs tests/phone-inbox-api.test.cjs tests/continue-api.test.cjs tests/sleep-api.test.cjs`：**40/40**，0失敗／跳過。`pnpm typecheck`通過，變更檔ESLint零錯誤。另將既有activities訊息測試明示改成受控成功感知，驗證「真的察覺才重新考慮」，不把未讀訊息本身當正文互動。

## 真 Chromium

`tooling/verification/browser-phone-notifications.mjs`：既有店主傳訊UI→Vera收到提示音→自主continue長休息→安靜回合無新增模型→後來正常介入時list/read。6次既有UI推進，4次NPC transport fixture，0裁定／0額外手機鏈／0付費。原活動時間不變，當通知處理後仍未讀；再實際閱讀才建立Vera經歷。分析面板／SQLite／重載與原ID重送一致。

[察覺後續做且未讀](assets/phone-notifications-190/noticed-continue.png) · [真正讀者](assets/phone-notifications-190/actual-reader.png) · [量測](assets/phone-notifications-190/evidence.json)

## 工程／交接

[phone基線](../design/phone-baseline.md)記錄128通知、4個中性機會、最高來源generation去重、已結算細節回收與明示刪除／取消策略。reevaluationOfferedAt與handledAt分開，沒有以consumeMemories把省略項目一併處理。

#192共用`emitPhoneNotification(w,device,{kind:'reminder',recordId,recordVersion,key:cue.trigger.key,generation:cue.epoch})`，不直接把提醒正文灌入感知。明示刪除／取消／換版本用`cancelPhoneRecordNotifications`，舊版不能重響；來源最高版本／generation沿有界notificationDedup維持。只因語句重寫、無關revision不產生新條件key。

這是fixture與瀏覽器機制驗證，未呼叫付費模型、推進正式世界、合併main或部署。真實NPC的自主查看／忘記／安排自然度與正式站行為尚未驗證，最終#193與兩軸code-review接續。
