# #119 應用瀏覽器矩陣（2026-10-21）

起點 `6652c52`。真實 Chromium153／WorldApp／世界GET與POST／SQLite保存，外部模型傳輸明示替身。沒有正式世界、真實模型或付費呼叫。

## TDD

新增 `browser119.mjs` 的switch情境，先以 `FIXTURE_REPO` 指向尚未實作 #119 的 #118：角色自主改休息後仍留下1筆未來pending飲品，預期0而失敗。#119同情境通過，已加水保留，未來候選刪除，後續不生成成品。

## 實際矩陣

| 情境 | API重讀與實際畫面核對 | 派送 |
| --- | --- | --- |
| 完成目標60與90 | 重載、介入後NPC明示continue；原起點、到期、時間語意與cursor保持，重送不重播物件，最後各只完成一份茶 | 各2NPC＋1裁定 |
| 開放式45 | 介入後continue保留時段；到期時又收到介入且continue，原時段仍正常結束，沒有重設或假完成外部目標 | 3NPC＋0裁定 |
| 完成目標60改休息45 | 已加水物件保留、pending飲品取消，重載／重送後不生茶；截圖顯示原杯準備狀態 | 2NPC＋1裁定 |
| 控制入口30 | 首次自主茶完成；直接單次指定重用30、完成第二杯；UI接管後指定茶、進行中UI交還取消未來飲品保留水；規則試玩沿已知30再完成第三杯 | 整串1NPC＋1裁定 |
| 移走90分鐘目標 | 另一NPC經實際世界API拿杯並攜離；舊階段不完成、不復原物件，原角色下一次實際模型輸入沒有杯子、隱藏去向或持有人診斷 | 9NPC＋2裁定 |

直接茶是既有API支援入口，目前UI工作選單沒有茶選項，所以runner使用真實 `POST direct` 指定；接管／交還、介入、下一回合與模式切換都實際點按UI。沒有注入不存在的UI選項。所有結果由GET重讀，沒有把store快照當結果驗收。

runner首次找不存在的UI茶選項逾時後改用上述API seam。另控制串在凍結同一毫秒下執行超過journal保留數量得到410；沿既有browser110模式，每次操作將fixture clock推進1000ms並同步browser後通過。這些是測試環境／入口修正，沒有修改產品runtime。

## 回歸與畫面

`browser116`、`browser117`、`browser118`全部在 #119 版本再跑通過。`browser100.mjs` 標準propose與 `TEA_ACTION=legacy` 舊work/tea兩模式，各自complete／interrupt／save／other-npc四情境全部通過；包含後一回合保存故障不丟先前水、重試不新增付費派送。

browser100的模型替身加入明示completionMinutes與timeIntent；每情境獨立啟動browser以支援single-process Chromium。變更runner的ESLint與diffcheck通過。

重現沿 `tooling/verification/README.md` 設定環境：

```sh
node tooling/verification/browser119.mjs
node tooling/verification/browser116.mjs
node tooling/verification/browser117.mjs
node tooling/verification/browser118.mjs
node tooling/verification/browser100.mjs
TEA_ACTION=legacy node tooling/verification/browser100.mjs
```

單項可設定 `BROWSER119_CASE=continue|open|switch|controls|moved`；continue同時包含60及90。

畫面：[中斷後已發生水保留](assets/activity-time/browser119-interrupted-water.png)、[控制／規則模式沿同一時間重用](assets/activity-time/browser119-controls-reused.png)。已視覺檢查中斷圖，物件內容與無未來飲品一致。兩張代表圖之外，續做與移走結果以API重讀及實際輸入斷言保存。

正式站仍待新版部署後核對版本驗收。此矩陣不取代真實模型，也不冒稱逐項付費正式站已通過；審查修正整合後仍需最終回歸。
