# 最小驗收缺口：本機真實應用瀏覽器驗證

本輪為 **model transport fixture／真實 WorldApp／世界 API／Node SQLite** 驗證，不是正式站或真實模型驗收。認證、Worker bindings、模型回覆、時鐘與資料庫故障注入是 fixture；世界執行、效果驗證、操作日誌與 UI 使用應用程式本身。沒有付費模型呼叫、正式世界操作、合併或部署。

完整腳本通過，共16個 advance（含1個預期的提交前 HTTP 502），**62次 NPC／6次裁定 fixture 派送**，重送沒有新增派送。所有已匯出的單筆操作證據為2,277–8,777 bytes，低於64 KiB；沒有瀏覽器 pageerror。兩張截圖已實際檢視，文字及杯子狀態可讀；腳本 ESLint 與 `git diff --check` 通過。

`browser-live-gaps.mjs` 從一般種子世界開始，經設定頁「進入最小驗收場景」建立場景。腳本沒有替驗收杯加入 dirty 或改寫保存世界。v2 候選使用既有 `routine-program-fixture.mjs`（茶30分鐘、兩階段）；這是明示的測試候選，**不能當作 #143 被截短的正式原始候選還原**。

## Red → green

- main `5e172d5`：同一 UI 腳本完成原長句／茶具 target 首次核准、15分鐘水與30分鐘茶；下一個「喝茶」回合 HTTP 502「物件不支援這個狀態轉換」。測試正確卡在 drink→dirty，世界保留原茶與飲品。
- 只納入新場景能力修正後：喝→洗→同杯再泡及 UI 重載、原 ID 重送完成；接著在 `new evidence must retain raw v2 programs` 斷言失敗，因 `routine.programs` 為 undefined。
- 納入有界 v2 證據投影後，用相同最高 seam 驗證程序原值、UI JSON 與 GET 證據欄位一致，以及完整生命週期與保存故障。

撰寫腳本時另修正兩項 fixture／斷言錯誤：成果面板顯示物件名稱而非 ID（ID 改由 API 斷言）；普通自由清洗候選不應把本來已是 yes 的 clean 再寫成 yes。後者遭全域驗證器拒絕屬正確行為，移除多餘的 fixture no-op；未更動驗證器。

## 覆蓋範圍

| 流程 | 可觀察證據 |
| --- | --- |
| 首次 v2 核准／跨回合推進 | 原長句、acceptance-tea-kit target、raw programs／branches；第一回合水與活動游標，重載及原 ID 重送不重做，第二回合茶及獨立飲品 |
| 喝→洗→同杯再泡 | 第一飲品 consumed、原杯 dirty→empty→water→tea；只有一個杯 ID、一個 active 茶飲，第二次泡茶無新增裁定，NPC 決策另計 |
| 店主授權／借還 | 模型 fixture 讓店主自主提出 grant，世界保存 allowedTo；Vera 借用、攜帶至別處、清洗、攜回、歸還，owner 始終店主、holder 最後 null |
| 餐點 | Cass 取得並消耗 acceptance-meal:1，供應1→0；重讀／重送後不復生 |
| 提交前故障 | SQLite final-save 前拋錯；HTTP 502、物件／turn回復、evidence not-committed 且沒有 result；同 ID UI 重送不再派送 |
| 提交後故障 | SQLite 寫入後拋錯，既有確認流程查得已保存；HTTP 200、活動及水已提交；重載／同 ID UI 重送不重複 |
| 證據與隱私 | 分析頁實際展開 JSON，與指定 operationId GET 一致；候選及結果在本機fixture內保存，不匯出 scope、金鑰、世界備份或完整私人上下文 |

有判定的五段結果、失敗消耗／部分成果、明示 continue 與中斷另由既有 `browser127.mjs`、`browser129.mjs` 及 API 維護測試驗證；此腳本的 ordinary tea 不擲骰，不能用其成功冒稱所有結果分支皆完成。

## 產物與重跑

- [篩選操作證據及必要物件](assets/live-gaps/browser-evidence.json)
- [同杯再次泡茶、免費裁定重用與兩個飲品生命週期](assets/live-gaps/same-cup-reused.png)
- [借用、攜帶、洗淨、歸還後的原杯](assets/live-gaps/borrowed-washed-returned.png)

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
BROWSER_FONT_DIR=/absolute/path/to/@fontsource/noto-sans-tc \
node tooling/verification/browser-live-gaps.mjs
```

若使用 Sparticuz Chromium，另設 `CHROMIUM_MODULE`，見 [runner 說明](../../tooling/verification/README.md)。本機 Chromium 153.0.8010.0；初次執行環境中的 `/tmp/chromium` 為空檔，改用已解壓的有效執行檔後正常啟動，該啟動失敗不是應用紅測。

正式部署後仍須依 [有界 runbook](operation-evidence-live-runbook.md) 取得真實模型證據。#143 已證明的餐點與首次泡茶結論保持；兩回合不構成無限循環證明，舊證據缺失不能追補。#104、#106 保持開啟。
