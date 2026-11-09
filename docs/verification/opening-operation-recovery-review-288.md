# #288 開局 UI 非同步審查修正

以 T7 UI 固定 `cff3707` 為基準，由同一審查修復實作者處理兩項已重現 P2；沒有修改 backend 或另造建立旁路。

- 原帳號 A 的保存未受理而網路回覆失敗，切到 B 且 B 有同 UUID／同 body 草稿時，原 save.catch 只比 body，錯把 B 的 GET 當 A 已同步。現在每次保存捕獲原 requestScope，POST 成功與恢復 GET 均核對回應 scope；恢復也再次檢查 alive／generation。失敗保留原輸入及未同步狀態。
- 開局已 commit 但回覆慢，使用者離開 wizard 並續玩另一世界後，原 create 閉包曾把 URL 拉回剛建的新世界。現在從開始確認前捕獲 generation／原 scope，flush 後與回覆後均檢查組件仍有效；catch/finally 不再更新已卸載頁面。原新世界仍由產品 API commit 保存，沒有取消已完成故事或自動重做。

Spec 的原真 App Router／Chromium反例 `/tmp/quiet-hours-opening-watchpoints.mjs` 已逐項重現兩問題。修復樹另先跑原帳號恢復反例 red（UI錯誤顯示已保存，預期未同步逾時），再跑同一完整產品 API／真頁旅程 green：A 原文不改、B 仍為其合法草稿、畫面保留 A 原未受理輸入且未同步；第二案切到另一實際世界，釋放已 commit 的慢回覆後 URL 保持選定世界，原新世界可由產品 API 讀回。

驗證工具 `tooling/verification/browser-opening-operation-recovery-288.mjs` 使用共用 `opening-journey.mjs` 真形成卡／開局確認 API driver；模型與骰只在外部接點受控，1 次模型形成真入帳，不直接安裝世界。固定來源的畫面、typecheck、lint 與 build 結果待下段補入；不以本文件宣告整份 #281 完成。

固定 `28b9edd` 真頁覆驗通過，origin `http://127.0.0.1:40571`，受控模型 1 次／實付 0；兩張畫面與機器紀錄位於 [證據](assets/opening-operation-recovery-288/evidence.json)。typecheck、lint（0 errors／4 既有 warnings）、build、diff check 通過。Spec 在該固定版本獨立重驗兩原反例，remaining 0。後續另外發現的 T9 copy/delete 帳號 P1 不含在此結論，仍未結案。

確認頁可讀性另沿用既有 `CityAccessPreview`：實際場所／房間名稱與繁中權限標籤共用原映射，卡來源顯示已保存快照姓名及版本。固定 `09f30d0` 的正常五步真頁再次通過，包含精神容量 70／手動目前值 56、權限可理解名稱及原始開局另建世界；沒有改動初值或規則。

另補一項產品 API 身分一致性反例：非 v4 的 opening ID 原回 200 且留草稿；合法 v4 草稿用非 v4 save ID 原回 201，但觀察路由只接受 v4。將既有 v4 pattern 移到輕量 `lib/save-identities.ts`，由新草稿／確認／世界路由與 UI 共用，既有 `legacy` 選檔別名保留。真 API red→green 覆蓋 v1、v5 草稿及確認拒絕，資料庫無新 draft／world／save 殘留、合法草稿未被標成已建立；API 組 **15/15**。此項固定來源後尚待最後 type／lint／build 及正常真頁覆驗，原正常 v4 旅程沒有換成 fixture。
