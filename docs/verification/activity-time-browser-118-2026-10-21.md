# #118 應用瀏覽器驗證（2026-10-21）

起點整合 `c09d4d0`，以明示模型傳輸替身、真實 Chromium153／WorldApp／世界API／SQLite保存驗證。沒有正式世界、真實模型或付費呼叫。

## Red → Green

新增 `browser118.mjs`，先以 `FIXTURE_REPO` 指向 #117 `cbf2826`；開放式30分鐘計畫沒有保存 `timeIntent`，runner期待 `open-ended` 而失敗。首次red的直接欄位存取拋TypeError，改為可選存取後再跑仍以undefined不等於open-ended失敗。於 #118 實作的相同runner兩情境皆通過。

- 開放式休息30：第一次選定時段、剩15分鐘的分析畫面可讀。實際操作重送與重載保留計畫，第二單位到期後清除計畫、文字明示時段到期、不產生任何外部成品，也沒有同slot再決策。第三單位才派送下一次NPC，實際輸入 `currentActivity:null` 且知道自己的時段已到期。**2NPC、0裁定**。
- 可承接完成目標餐點：NPC一般估15、世界確認45。計畫保存completion語意及45分鐘，第一、第二單位沒有成品，有限供應仍1；第三單位才具體化既有餐點供應為 `meal:1` 並扣至0。重載／重送保留原起點、沒有重複派送或物件。**1NPC、1裁定**。
- 各情境80替身回報tokens、無pageerror。世界時間、保存結果、分析文字均由GET重讀核對。

沒有新增書籍／章節模擬，餐點使用已存在且可驗證的等價完成目標。已更新109–112、116、117裁定替身，明示新的 `completionMinutes:null`（日常的唯一耗時仍為整組timings）；116的分析selector配合新文字「完成目標安排」。

## 重現

沿 `tooling/verification/README.md` 的 Playwright／Chromium與中文字型設定：

```sh
node tooling/verification/browser118.mjs
node tooling/verification/browser116.mjs
node tooling/verification/browser117.mjs
node tooling/verification/browser109.mjs
node tooling/verification/browser110.mjs
node tooling/verification/browser111.mjs
node tooling/verification/browser112.mjs
```

上述實際應用測試全部通過；變更runner的ESLint及diffcheck通過。截圖已視覺檢查開放式進行中畫面，字體與時間資訊可讀。

畫面：[開放式進行中](assets/activity-time/browser118-open-ended-pending.png)、[開放式到期](assets/activity-time/browser118-open-ended-due.png)、[完成目標45分鐘](assets/activity-time/browser118-completion-pending.png)、[餐點完成](assets/activity-time/browser118-completion-due.png)。

#119中斷／控制矩陣由下游補齊；正式站仍須部署後核對實際版本驗收，不以本機替身通過代替。
