# #189 私人訊息送達、未讀與主動閱讀

基準整合 a153547（#187／#188）；沿用既有世界 API、實際 SQLite、模型 transport fixture 與真應用瀏覽器，不操作正式世界或付費模型。

## Red → Green 與切片

第一個 API RED：message後收件裝置沒有inbox。GREEN後送達文字只存手機，發訊者自身經歷保存原文，世界事件只有摘要及發訊者audience。recipient輸入／短期記憶／一般物件state及事件摘要均沒有未讀正文。移除message事件的舊attention旁路，真正閱讀結果留待下一次正常slot，無追加理解或回覆模型。

新增收件匣沿共用phones存取、列表分頁、presentation版本及有限畫面；list不讀正文、不清未讀；read只記真正讀者。近旁第三人可以讀有限展示，但持有／所有權／一般借用不能打開全部資料。修正#188接點：別人拿著手機時，即使物主也只可讀當前有限已展示畫面。

測試涵蓋：

- 正常送達→列表→指定閱讀→重讀，觀察真正slot輸入，原文不提前出現；閱讀不產生信念、意圖、同意或自動回覆。
- 收訊人睡眠而送達，未讀保留、不喚醒；既存已知舊記憶保持，舊message audience不變成新已讀或外部紀錄。
- 既有真世界physical裁定place/take移動手機，收件匣身份與內容保持，拿到者仍沒有私人正文。
- 手機不存在、收件裝置損毀、64則容量滿時明示失敗；不補生、不覆蓋未讀、不留下部分安排或其他故事變更。
- 指定閱讀後較後slot錯誤、保存前／後故障、CAS／租約衝突，所有讀者、知情、手機資料共同回復或原ID重放；不重派。
- 真正第三人讀有限展示，不把原收訊人標已讀，也不給旁人整個收件匣。

首次focused回歸：`node tests/run-activities.mjs tests/activities.test.cjs tests/perception-api.test.cjs tests/recall-api.test.cjs tests/phone-inbox-api.test.cjs tests/phone-memos-api.test.cjs` **71/71**通過。後續新增第三人完整閱讀例與將舊recall負例改成真正面對面對話（避免以新未讀訊息冒充接收正文）另重跑42項全通過（含8項收件匣情境與recall）；typecheck與變更檔ESLint零錯誤。

## 真 Chromium

`tooling/verification/browser-phone-inbox.mjs` 用既有店主傳訊UI、正常NPC決策fixture、分析面板及重載：發訊→裝置未讀→Vera自主list→read。4次既有UI推進，3次NPC transport fixture、0裁定、0回想、0額外手機鏈、0付費。未讀前所有實際NPC輸入均沒有正文；重載及原operationId重送不再派送，觀察者看面板不標已讀。

[送達未讀畫面](assets/phone-inbox-189/unread-delivered.png) · [真正讀者畫面](assets/phone-inbox-189/actual-reader.png) · [量測](assets/phone-inbox-189/evidence.json)

## 交接

[工程基線](../design/phone-baseline.md) 記錄64則容量、啟用與歷史未知、有限引用及回退。traceWorldSnapshot含owner私有phones，供輸入／候選／提交查證，不送回NPC。

#190沿deliverPhoneMessage的device/message接入通知／感知，不能以本票的已送達冒稱已通知或已知。#192行事曆與#193跨切片另驗。這些fixture只證明合法選擇的機制，未證明真實NPC必然自主查看、自然安排或正式站行為通過。整合末仍需code-review兩軸審查。
