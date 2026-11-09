# #288 開局 UI 非同步審查修正

以 T7 UI 固定 `cff3707` 為基準，由同一審查修復實作者處理兩項已重現 P2；沒有修改 backend 或另造建立旁路。

- 原帳號 A 的保存未受理而網路回覆失敗，切到 B 且 B 有同 UUID／同 body 草稿時，原 save.catch 只比 body，錯把 B 的 GET 當 A 已同步。現在每次保存捕獲原 requestScope，POST 成功與恢復 GET 均核對回應 scope；恢復也再次檢查 alive／generation。失敗保留原輸入及未同步狀態。
- 開局已 commit 但回覆慢，使用者離開 wizard 並續玩另一世界後，原 create 閉包曾把 URL 拉回剛建的新世界。現在從開始確認前捕獲 generation／原 scope，flush 後與回覆後均檢查組件仍有效；catch/finally 不再更新已卸載頁面。原新世界仍由產品 API commit 保存，沒有取消已完成故事或自動重做。

Spec 的原真 App Router／Chromium反例 `/tmp/quiet-hours-opening-watchpoints.mjs` 已逐項重現兩問題。修復樹另先跑原帳號恢復反例 red（UI錯誤顯示已保存，預期未同步逾時），再跑同一完整產品 API／真頁旅程 green：A 原文不改、B 仍為其合法草稿、畫面保留 A 原未受理輸入且未同步；第二案切到另一實際世界，釋放已 commit 的慢回覆後 URL 保持選定世界，原新世界可由產品 API 讀回。

驗證工具 `tooling/verification/browser-opening-operation-recovery-288.mjs` 使用共用 `opening-journey.mjs` 真形成卡／開局確認 API driver；模型與骰只在外部接點受控，1 次模型形成真入帳，不直接安裝世界。固定來源的畫面、typecheck、lint 與 build 結果待下段補入；不以本文件宣告整份 #281 完成。
