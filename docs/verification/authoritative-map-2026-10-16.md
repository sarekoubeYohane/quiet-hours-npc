# 像素地圖 #95 本機驗證

使用 `tooling/verification/browser95.mjs`，真實 Chromium → 世界 GET/POST handlers → 暫存 SQLite 測試資料庫。模型 transport 為替身，沒有外部付費呼叫或正式世界操作。

## Red → Green

- 第一個瀏覽器案例在舊版找不到「世界像素地圖」與世界日夜／區域／門展示而失敗；加入世界時間、區域與門的權威狀態後通過。
- 第二個案例透過世界 API 指定合法 `work:tidy` 並推進，舊行動泡泡只顯示泛用「整理眼前的小東西」，無法呈現提交的「收拾桌面」；改為直接顯示已提交事件短文後通過。

## 實際通過範圍

- 世界 09:00 白天、17:45 → 18:00 真實回合切換夜晚；瀏覽器時區刻意設為 Honolulu，不影響世界日夜。
- 儲藏室與前台站位不同；真實世界 API 開門及區域移動，畫面門狀態、角色區域和最終座標與 GET 讀回一致。
- 沒有專屬動畫的合法活動仍執行，泡泡與常駐文字展示實際提交內容。
- 移動播放途中重新載入，直接顯示已提交目的區域，解除播放鎖且不重送操作。
- 背景切換取消播放並回到已提交站位，前景重讀不重送操作。
- 375px、減少動態、全部圖像失敗時，角色文字入口及帶識別字母的像素 fallback 仍可操作。
- 舊世界缺少區域與門狀態可讀，既有回合與經歷不重置。
- Typecheck 通過；此次修改檔案 ESLint 0 errors，保留兩個直接載入像素圖像的 `no-img-element` warnings。
- `npm test`：215 + 32 + 10 = 257 個測試通過。

執行方式沿 `tooling/verification/README.md` 的 browser runtime 環境變數，命令為 `node tooling/verification/browser95.mjs`。

## 呈現範圍與素材接續

既有像素場景使用日間光照濾鏡；儲藏室邊界是清楚標示的分區示意，沒有擅自設計新住宅。世界區域、門、時間和活動為權威資料；播放座標只是提交事件的短暫回放。

人物仍使用現有角色 ID 對應 `/pixel/` 素材，載入失敗可回退識別字母。#88 新美術品質與新街區格局未包含於本票；#90 的共用素材 registry 將在整合後套用。

截圖：

- [白天與已提交區域](assets/95/browser95-day.png)
- [夜晚](assets/95/browser95-night.png)
- [375px 缺圖 fallback](assets/95/browser95-mobile-fallback.png)
