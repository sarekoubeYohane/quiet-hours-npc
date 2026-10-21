# PR #124 合併後正式站真實模型驗收

結論：**部分通過，不能宣稱 #122／#123 原始提案完整驗收通過。** 真實模型完成了泡茶、原杯沿用與成果保存；成功回合的既有診斷沒有保留原始提案 target／裁定候選，無法完成使用者要求的逐欄證明。沒有觀察到本輪契約錯誤、假成功或保存異常。未修產品、未部署、未關閉 #104／#106。

## 部署與起點

- 正式站：<https://quiet-hours-npc.houmengkou.workers.dev/>。
- main／PR #124 合併 SHA：`c6e0e938056b87f5c98f3d2cac2b91e55f53ab02`。
- 正式站 UI 與公開 `/api/environment` 均顯示 `production`、`c6e0e93`；builtAt=`2026-10-21T07:41:15.410Z`（台北 15:41）。先核對版本才推進，沒有以舊版結果判定修正失敗。
- NPC：OpenAI `gpt-6-luna`；世界裁定：OpenAI `gpt-6.1-sol`。API 用量 cohort 確認本輪確實派送這兩個模型。
- 既有登入及 OpenAI Key 已設定；未讀取、輸出或更動 Key。玩家原預算 240 calls／5,000,000 tokens 不變。
- 帳號已在上輪失敗後的 `daily-life-v1` 隔離場景；沿用該場景，未退出再進入、未重置。原世界仍暫存。
- 起點 version 311、D1 12:00／turn 0；無 routineRules，杯子 empty／clean=yes／revision 1。上輪失敗診斷屬舊操作，不當作本輪失敗。
- 終點 version 313、D1 12:15／turn 1。一次正常介入保存（312）加一次十五分鐘 advance（313），沒有新增第二次付費回合。

## 實際操作與可重現步驟

1. 已登入正式站→設定→決策方式「OpenAI 直連」。未修改模型、Key、預算、物件或資料庫。
2. 觀察頁選「只對 店主 說」，正常加入：「若你現在想喝茶，可以用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。先只泡茶，喝茶與清洗之後再決定；是否要做由你自行決定。」
3. 按「下一回合」一次，十五分鐘。等候「回合已儲存」；沒有按自動或重試。
4. 以已登入 `/api/world` 重讀、分析頁檢查日常規則與成果，再重新載入 UI 及 API。
5. 比較 objects、routineRules、events 與 totalCalls，全部一致；店主沒有 plan，活動顯示「活動已完成」。維持場景暫停留證。

介入是觀察者請求，**不是 NPC 原始提案證據**。本輪沒有直接傳送自由提案，也沒有把 target 換成杯子；既有 UI 無直接指定 propose 的欄位。模型實際採取泡茶，但成功回合不回傳其原始 action，不能據此斷言它選了 `acceptance-tea-kit`。使用者要求的原句「我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶」及 target 約束因此仍未獲直接驗證。未將上述介入冒充模型原始提案。

## 實際成果與身份

| 物件 | 起點 | 完成後及重載後 |
| --- | --- | --- |
| `acceptance-cup` | cafe-front、owner=owner、holder=null、revision=1、empty／clean=yes | 同 ID、同位置及 owner；holder=owner、revision=4、tea／clean=yes、active |
| `acceptance-tea-kit` | available=yes、revision=1、holder=null | 完整保持 |
| `supply:b8cc37b6-3378-44fa-a3ca-a78c087e4247:1` | 不存在 | 一份茶；food、active、revision=1、cafe-front、owner=holder=owner；state={vessel:acceptance-cup, beverage:tea} |
| `acceptance-meal:1` | 不存在；供應 remaining=1 | Cass 取得並食用，consumed；供應 remaining=0（同輪自主行為） |

杯子數仍為一；沒有新增替代杯。事件先記錄交付持有及 water，再記錄 tea 與取得飲品；都在本回合 12:15。店主無未完成 plan，結果不是僅 HTTP 成功或口頭「泡好了」。

規則 `94d72970-66b2-4126-87aa-a613f8981a0b`：family=cafe-service、version=1、origin=cafe、knownTo=[owner]；六項 tea／coffee／food／drink／wash／return 全部保存為對齊後 15 分鐘。routineAudit 有 owner、turn=0、result=approved；UI 顯示第一回合首次確認。

## 裁定契約與證據限制

本輪實際回應中沒有 adjudicationFailure。保存六項規則並完成活動，與合法首次核准相容。部署來源 `lib/routine-rules.ts` 要求日常 accepted、check=null、effects/stages 空；有 completionMinutes 時必須為 null，完整 timings 才能綁定。但成功 API 不保存原始 candidate、原始未對齊 timings 或原始 action；routineAudit 只保存 actor、turn、location、ruleId、result。

因此**不能把來源檢查推論寫成已捕獲 completionMinutes=null**，也不能重建六個原始分鐘數或捏造本輪裁定 JSON。下一步應先在既有可觀察性範圍取得這次成功操作的原始請求／裁定紀錄，或另行安排可保留成功 transport 的驗收；本輪不增加正式測試後門、不修改可觀察性、不注入模型輸出。重複付費回合不會補回已丟失的首回合候選，所以停止新增付費測試。

既有「重試未完成操作」在成功提交後消失；本輪沒有取得已完成 advance 的原始 operationId／payload，無法以相同識別碼重送。UI／API 重載一致是保存證據，**不是冪等重送通過**。未以新「下一回合」冒充重送。

## 本輪真實用量

以累計帳本差分計算（跨小時，不能用小時數字直接相減）：

| 任務 | 呼叫 | 輸入 tokens | 輸出 tokens | 其中 cached input |
| --- | ---: | ---: | ---: | ---: |
| NPC gpt-6-luna | 4 | 29,103 | 1,248 | 16,857 |
| 裁定 gpt-6.1-sol | 4 | 17,419 | 285 | 3,999 |
| 合計 | 8 | 46,522 | 1,533 | 20,856 |

已知合計 48,055 tokens；cached input 已包含於輸入，不再加算。累計 calls 533→541、input 6,943,407→6,989,929、output 156,007→157,540。NPC 已知新增小計 USD 0.00201717；裁定價格未設定，不能當完整費用。

本輪有四名自主角色，每名一次 NPC 與一次裁定，符合既有每 slot 至多一次裁定的數量上限。分類帳沒有逐請求 action 或用途，故無法獨立證明每筆是否分類／修復；來源未新增額外修復路徑，此屬來源核對，不能取代 transport 證據。

## 驗收矩陣

| 項目 | 本輪正式站結果 |
| --- | --- |
| 已部署 #124、登入、隔離世界、既有 Key／預算 | 通過 |
| 首次規則完整六項保存及十五分鐘活動完成 | 通過可觀察成果；原始核准 JSON 未捕獲 |
| 原始 NPC 長句及茶具 target | 未直接驗證：成功 action 不可重讀 |
| 合法空效果、completionMinutes=null、原始 routine.timings | 未直接驗證；僅嚴格解析來源及保存結果支持 |
| 現有杯沿用、茶與飲品存在、plan 完成 | 通過上述實際物件檢查；仍不可代稱原 target 場景通過 |
| UI 重載與 API 重讀保持身份／狀態／成果 | 通過；未增加模型呼叫 |
| 同 operationId 重送無重複效果 | 未驗證：成功後 UI 不再提供重試，未取得原 payload |
| 無杯／髒杯需另一只時背景具體化 | 未建立條件，不宣稱正式站通過 |
| 喝茶→洗杯→同杯新泡茶、免費重用 | 未驗證：原杯 contents 只有 empty／water／tea，沒有 dirty；未補欄位或強跑 |
| 指定杯、明確短缺、工具不可用、投入不足、取消 | 未自然建立相應條件；未驗證 |
| 原長句再裁定與已知規則短句免費重用 | 皆未驗證；保留兩者差異，未混報 |

Vera「目前的方法無法落實」、Kris「這次方法沒有成功」為同回合可見 blocked 結果，但既有成功回合也不保留其原始提案／裁定。沒有據此判定程式缺陷或另跑候選。

## 證據與本機結果分界

- [經篩選的基準／完成／重載 API 原始欄位](assets/pr124-live/pr124-live-evidence.json)：不含 Key、帳號 scope、原世界備份或完整私人記憶。
- [重載後規則與杯子成果截圖](assets/pr124-live/pr124-live-rules.jpg)。
- [完成與加水事件截圖](assets/pr124-live/pr124-live-reloaded.jpg)。
- 本機 fixture 已通過的 400 項及五組 Chromium 情境，僅引用 [#124 整合報告](routine-object-integration-2026-10-21.md)，本輪未重跑，不能算正式站通過。
- 本輪未發生新的契約錯誤，沒有可提供的新增失敗候選或錯誤堆疊；舊失敗見 [原報告](activity-time-live-failure-2026-10-21.md)，不可套用為本輪失敗。

依 diagnosing-bugs 紀律，本輪沒有足以指向產品缺陷的 red-capable repro；已具體確認的是成功診斷證據不足，未進入猜測修正階段。未改程式或產品設計。文件與證據經 JSON 解析、內容／敏感資料及 diff 檢查；未對正式站做一小時壓測、無界重試或 fixture 注入。
