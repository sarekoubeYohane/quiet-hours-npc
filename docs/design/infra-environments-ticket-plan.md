# Infra 環境、登入與發布流程：工作拆分（已發布）

來源：[正式規格 Issue #19](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/19)。

狀態：使用者已於 2026-10-08 確認拆分；12 項工作票已發布為 #19 的 GitHub sub-issue，阻擋關係以 GitHub 原生 blocked-by 記錄，正文另列 Blocked by 供 CLI 閱讀。全部尚未實作。本文件只記錄拆分、相依與共通規則；驗收條件以各 Issue 正文為準，不在此複製，避免兩處漂移。

| 工作 | GitHub Issue | 阻擋項目 |
| --- | --- | --- |
| T0 帳號、OAuth App 與秘密前置作業（使用者本人建立） | [#21](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/21) | 無 |
| T1 脫離 Sites 執行環境，本機以 Workers 工具鏈啟動並顯示環境與版本 | [#22](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/22) | 無 |
| T2 GitHub 登入取代 ChatGPT 登入，僅允許站主帳號 | [#23](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/23) | #21、#22 |
| T3 多頁面操作不互蓋：操作冪等與依序處理 | [#24](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/24) | 無 |
| T4 每人每環境獨立世界與手動重置 | [#25](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/25) | #23 |
| T5 模型 Key 綁定登入工作階段，最長 24 小時 | [#26](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/26) | #23 |
| T6 每人每日 GPT 上限的跨環境用量帳本 | [#27](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/27) | #23 |
| T7 CI 通過後自動部署測試站：固定網址、序列化、失敗不部署 | [#28](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/28) | #21、#23 |
| T8 伺服器端共用自動推進排程與前景頁面偵測 | [#29](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/29) | #24、#26 |
| T9 測試站真實試玩、免費方案用量實測與正式站啟用判定 | [#30](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/30) | #25、#27、#28、#29 |
| T10 正式站手動發布指定提交、回復與資料相容守門 | [#31](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/31) | #28、#30 |
| T11 交接文件與驗證紀錄整合 | [#32](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/32) | #31 |

## 相依順序

- 可立即開始：#21（使用者本人）、#22、#24。
- #23 需要 #21 與 #22。#25、#26、#27 在 #23 之後可平行進行。
- #28 需要 #21 與 #23：Sites 的身分 header 在自家 Worker 上任何人都能偽造，未接上 GitHub 登入前不得部署到對外網址。
- #29 需要 #24 的冪等機制與 #26 的工作階段 Key。
- #30 需要 #25、#27、#28、#29 全部完成，因為免費方案用量實測必須包含帳本寫入與自動推進心跳的請求量。
- #31 需要 #28 的部署管線與 #30 的啟用判定；#32 最後整合文件。
- #24 與 #23 改動同一支世界 API，建議 #23 先合併；這是合併順序建議，不是阻擋關係。

這裡是工作相依關係，不代表自動啟動平行代理。每票包含自己的驗證，所有工作完成後再跑整體回歸，確認規格全部驗收項目覆蓋。

## 共通規則

- 資料結構變更只增不破壞：新欄位與新資料表可與舊版程式並存，更新失敗後舊版仍能讀寫；不相容時停止更新，不自動重置。
- 自動測試沿用既有世界 API 測試介面、模擬模型與記憶體 SQLite 執行實際 SQL，不發出付費模型請求。真實 GPT、瀏覽器操作與模擬測試分開記錄。
- 不升級付費方案、不購買網域、不自動啟用正式站；正式站首次啟用以 #30 的判定為前提。
- 秘密只存在 Workers Secrets、GitHub repository secrets 或本機未納入版本庫的設定檔；不寫入世界資料、日誌、錯誤回應、版本庫或 Issue。

## 各票交付摘要

- **T0 #21**：站主本人建立 Cloudflare 帳號與 API token、三個 D1（測試站世界、正式站世界、共用用量帳本）、三個 GitHub OAuth App，並記下站主的 GitHub 使用者 id。agent 不能代為建立或貼入秘密，因此不標 ready-for-agent。
- **T1 #22**：安裝、建置、啟動不再依賴 Sites 的 hosting 設定、受控安裝腳本與 connector 預覽；自家 Wrangler 設定含三組環境與 D1 binding；本機 D1 持久化；頁面顯示環境名稱與提交短碼。登入暫時沿用現狀，由 T2 替換，在此之前不得對外部署。
- **T2 #23**：三環境以 GitHub OAuth 登入，伺服器端工作階段，身分鍵為 GitHub 穩定使用者 id，白名單只放站主；移除 Sites header 信任與模擬登入。
- **T3 #24**：操作帶識別碼，重送不重複提交也不重複呼叫模型；租約競爭時等待重試；回到前景重新讀取。
- **T4 #25**：每人每環境獨立世界跨部署保留；手動重置只影響自己的世界，不清除用量。
- **T5 #26**：模型 Key 加密綁定工作階段，最長 24 小時，登出或到期即失效；同工作階段多分頁共用，換裝置各自輸入；Key 不進世界資料、日誌、錯誤回應。
- **T6 #27**：每人每日 144 次硬上限，Asia/Taipei 午夜重置，測試站與正式站共用帳本 D1，本機獨立；原子預留不超賣；與小時限制分開顯示；用完暫停不自動切換。
- **T7 #28**：main 合併後檢查通過才部署測試站，序列化，migration 相容守門，固定 workers.dev 網址，頁面顯示環境與提交。
- **T8 #29**：每個世界一個伺服器端自動推進排程，多頁不加速，用啟動者工作階段的 Key，心跳偵測前景，離線即停且不補跑；決策模式改為世界層級設定。
- **T9 #30**：手機與電腦在測試站真實試玩並記錄；量測 Workers 請求數、CPU、D1 讀寫對照免費限制；真實 GPT 與模擬分開記錄；給出正式站 go 或 no-go。需使用者配合試玩與負擔模型費用。
- **T10 #31**：手動發布指定提交，只接受檢查通過且上過測試站的提交；正式世界從初始狀態開始；回復只在資料相容時直接回退，不相容則停止並提示備份還原。
- **T11 #32**：整合交接文件並更新 README、agents 文件與驗證紀錄。

## 範圍外

沿用規格：每個 PR 獨立預覽站、公開註冊、長期保存或跨裝置共用模型 Key、背景生活與離線補跑、世界匯入匯出與舊 Sites 記憶搬移、新 NPC 行動／感知／記憶／D20 設計、自動正式發布、付費方案、購買網域。

## 已評估的替代方案

### Firebase，2026-10-08 評估，不採用

使用者於 2026-10-08 詢問是否改用 Firebase。結論：功能上可達成，Firebase Auth 的 GitHub provider 與 Firestore 即時 listener 對 T2、T3、T8 更省事；但任何伺服器端程式（Cloud Functions、App Hosting）都需要 Blaze 方案綁定付款方式，與規格「以免費方案為目標、不自動升級付費」衝突；Spark 超額會停用該產品至當月底；測試站與正式站跨專案共用每日用量帳本不自然；Firestore 每日 20,000 次寫入額度對心跳與輪詢設計偏緊；現有 vinext 工具鏈為 Cloudflare 原生。使用者決定維持 Cloudflare，#19 與 #21–#32 不變。

來源：[Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)、[Cloud Functions quotas](https://firebase.google.com/docs/functions/quotas)、[Cloud Firestore quotas](https://firebase.google.com/docs/firestore/quotas)、[App Hosting costs](https://firebase.google.com/docs/app-hosting/costs)、[Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)、[Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)。

## 發布方式

每票以 GitHub 原生 sub-issue 掛在 #19 之下，阻擋關係以原生 blocked-by 建立，正文另列 Blocked by。#21 由使用者本人執行，不標 ready-for-agent；其餘標 ready-for-agent。母規格 Issue #19 正文與狀態未修改。
