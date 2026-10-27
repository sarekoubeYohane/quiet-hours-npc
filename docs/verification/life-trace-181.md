# #181 自主生活私有追溯與預估修正（2026-10-27）

這是跨日整合的觀察者證據子切片，完整跨日流程另由 #181 整合紀錄負責；不代表正式 NPC／正式站已驗收。

## 實際保存的生活狀態

原 `traceWorldSnapshot` 的角色快照只有位置、身體文字、活動與計畫；`npc-feedback` 也沒有四項需求、喜好、習慣來源、事件型形成中候選及暫停進度，無法比對每次派送當時的權威生活狀態。

現在派送當時快照、整輪 result 與逐角色 feedback 共用私有角色快照，保存需求及有限變化史、喜好及來源／變更、時段習慣／真正開始的證據／省略數、事件關聯及引用、暫停活動／未來前提與意圖。每次在原捕獲點複製，後續選擇不改寫先前快照。

`tests/life-trace-api.test.cjs` 從種子世界走真正 API／SQLite：整理→世界確認可暫停閱讀→同次正常決策評價喜好及提出事件關聯並暫停→後續決策。沒有手填喜好、習慣或暫停結果。RED 為派送權威需求不存在；GREEN 核對保存的本人來源、正常派送前狀態、feedback／result、下一次派送、原ID重讀與重送，無新增模型派送。

資料仍只在既有 owner 私有實錄入口，沒有存入故事或 NPC 輸入。原每筆1MiB、64筆／16MiB容量、遮蔽、缺口與失敗政策不變；新增有界狀態會占用原容量，不宣稱永久完整心理歷史。舊實錄缺欄位保持缺口，不補造歷史或新增 migration。

## 真實畫面的下一回合預估

`tooling/verification/browser-life-forecast.mjs` 使用真正 Chromium／WorldApp／世界 API／SQLite，以已實際睡眠105分鐘、下一個15分鐘將自然醒的保存世界核對預估。普通飢渴均未升級，避免偶然掩蓋問題。

RED 畫面顯示「下一回合預計詢問 0 名角色」，但實際自然醒必須一次正常 NPC 決策。原因是預測已推進需求至自然醒，卻落回原睡眠計畫的一般續做判斷。修正只讓已有醒點的睡眠計畫不可算作繼續睡眠；實際睡眠仍不新增決策。GREEN 畫面預估1名，下一API確實新增1次NPC、零新增裁定，未更改預算／期限或派送政策。

- [畫面證據](assets/life-forecast-181/next-wake-decision.png)
- [有界結果](assets/life-forecast-181/evidence.json)

命令沿既有 `browser-runtime` 的 Chromium／CJK 環境執行上述腳本。模型全為明示 transport fixture，沒有付費模型或正式世界操作。型別、相關 API／追溯故障／容量／遮蔽與睡眠回歸由本輪實際測試核對。

本切片實際驗證：`tests/life-trace-api.test.cjs`、既有私有實錄／故障／容量／遮蔽、睡眠與需求 API 合計 **61/61** 通過；`tsc --noEmit --incremental false`、變更檔 ESLint、Markdown 本地證據連結及 diff whitespace 通過。Chromium 預估畫面已目視核對。
