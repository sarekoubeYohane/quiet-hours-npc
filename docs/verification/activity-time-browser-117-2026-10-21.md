# #117 應用瀏覽器驗證（2026-10-21）

起點 `cbf2826`。真實 Chromium 153＋WorldApp＋世界API＋SQLite，只有身份／Worker bindings及模型傳輸使用明示替身，沒有正式世界或付費呼叫。

## TDD 與結果

先將 `browser117.mjs` 的 `FIXTURE_REPO` 指向已完成 #116、尚未實作 #117 的 `d51d524`，第一個NPC明示 `timeIntent:{kind:'completion',maxMinutes:15}` 得到 HTTP502、NPC決策格式錯誤、turn0；測試預期正常200而失敗。

同一runner於 #117 實作通過：

- 首次確認茶30、角色明確上限15，API正常200並提交turn1、完整六項規則。沒有物件、供應實例、加水、成品或活動計畫。
- 真實分析畫面顯示「安排30分鐘／明確上限15分鐘／尚未啟動」。視覺檢查截圖確認文字可讀，沒有宣稱部分完成。
- 操作重送不重派送。重新載入後，第二次NPC實際輸入的自己的活動取得30／15／未啟動回饋；替身自主改成上限30，一般估時仍15。
- 沿保存規則開始30分鐘活動，沒有再裁定。重送不增加物件／規則／呼叫；第一單位只有水，第二單位才產生一份茶。整組規則資料不變，沒有 pageerror。
- 合計 **2 NPC＋1裁定**、120替身回報tokens。查看與重載沒有模型呼叫。

首次green執行的文字selector漏掉「上限 15」的空格而逾時；更正selector後完整重跑通過，未修改runtime。

## 重現

沿 `tooling/verification/README.md` 設定Chromium及中文字型後：

```sh
node tooling/verification/browser117.mjs
pnpm exec eslint tooling/verification/browser117.mjs
git diff --check
```

三項皆通過。畫面：[不足但核准已存](assets/activity-time/browser117-shortage-saved.png)、[自主重排後重用完成](assets/activity-time/browser117-rearranged-completed.png)。本機替身通過不代表正式站；新版正式站驗收仍待部署。開放式活動及跨控制／中斷組合由 #118／#119 補齊。
