# #181 認知跨票整合驗證（2026-10-27）

本記錄只涵蓋 #181 的認知／容量／原子性子切片；跨日生活、睡眠、暫停復工及總體應用 UI 另有整合驗證。fixture 通過不表示真實 NPC 或正式站已驗收。本次未付費呼叫模型、操作正式世界、合併或部署。

## 真正流程與紅綠

測試入口 `tests/life-cognition-integration-api.test.cjs`，沿世界 GET／POST、實際 JSON／SQLite 保存與操作 journal。模型 transport、受控 RNG、初始保存資料為 fixture；活動、行為證據、來源核對、整輪候選與保存使用應用流程。

第一個壓力案例發現原心理 payload 雖納入喜好，尚未計入相關 `learnedHabits`，造成實際傳入心理內容超過原88 KiB而紅。將相關傾向納入相同計數，依剩餘空間保留本次投影後轉綠；不提升容量，不刪存檔，不改全部世界物件的尺寸責任。壓力後未展示的現行喜好仍不能被模型修改。

## 六個端到端案例

1. 真正自主整理→休息後，下一次正常決策同時保存1筆喜好、1筆事件型習慣候選、1筆記憶選留及1筆信念，並自主維持「先工作、後休息」意圖順序。三輪只派送3次 owner 決策；一次世界日的候選仍未形成習慣。原 ID 重送不新增派送、喜好版本／痕跡、習慣 links 或長期來源。
2. 第5項心理操作、或錯誤的習慣來源，令原本合法的其他更新一起回復；時間、角色與事件未留下半套新狀態。同 ID 回覆原失敗，不重派。
3. owner 已在候選內同時更新主觀資料後，較後 Cass 的候選失敗時整輪回復，保留兩次已知用量。保存前、保存後不明結果及 CAS 衝突亦驗證；成功回合的舊事實保持，原 ID 不重複派送／更新。
4. 兩筆喜好、一筆信念與一筆事件候選的個別欄位、來源、操作各自先沿 API 成功；同樣≤4項的完整合併 JSON 超過8 KiB時被拒絕。這不是以單欄位超限代替共同 byte 預算。
5. 真正 `work/craft-challenge` 經程式 D20 產生 failure（roll2、unfinished）及 critical-failure（roll1、spoiled）。下一正常輸入含該次本人可知後果，模型仍可明示喜歡構思過程；user input 無內部骰級、roll／DC／resolution，主觀評價與普通休息沒有再擲骰。每個情境只有2次正常 NPC calls。
6. 80筆短期、接近上限的長期、信念、16筆喜好與時段／事件型傾向共同壓力下，實際心理 payload≤88 KiB；保存重讀仍保有原長期、信念、喜好及習慣。省略投影不是保存淘汰，修改省略喜好會回復整輪。

最終提示明列 `memorySelections`、`memoryOperations`、`cognitiveUpdates`、`preferenceUpdates`、`habitCandidates` 五類共用4項／8 KiB，並保留各類較小上限。沒有新增獨立喜好／習慣模型、提高 model output token、伺服器期限或固定租約。

## 驗證與界線

執行：`node tests/run-activities.mjs tests/life-cognition-integration-api.test.cjs`。本切片6／6通過；聯合 `preferences-api`、`life-habits-api`、`cognition-api`、`memory-selection-contract-api` 共49／49通過。TypeScript、變更範圍 ESLint 及 diff check 通過。整合分支其他生活流程回歸另於總體交付紀錄列出。

固定輸出只證明正常應用可承接角色選擇。此記錄的一世界日候選不宣稱跨日習慣形成，D20測試不證明模型自然會喜歡失敗，壓力測試不宣稱完整世界物件 input 被限制為88 KiB，也不據此關閉泡茶 loop 相關票。

## 通用身體效果的心理寫入邊界補查

在 `69bffa8` 後補查：真實世界 API 的裁定候選包含合法 body 前提（Vera 的手背狀態尚不存在），同一活動階段先改物件再把 `preference` 寫成 subject 身體感受，原先竟回覆200；這會讓裁定以通用 physical 狀態旁路角色的主觀喜好權威，紅測已重現。

最小修正僅將 `preference`、`preferences`、`喜好`、`偏好`、`habit`、`habits`、`習慣` 明確心理名稱納入既有 body key 保護。沿既有大小寫及 dot-path 檢查，不建立猜測任意文字含義的新分類器，也不阻止一般身體感覺。

`world-external-api` 新增真 API／SQLite 案例核對七個直接名稱、大小寫及既有 dotted 子欄位共10個變體：完整候選拒絕，物件、角色（含需求、進度、認知）、事件、世界時間不留下副作用；同 ID 重送不派送，下一個正常回合的本人及旁人輸入沒有偽造喜好感受。普通 subject 手心刺痛案例仍通過，未新增模型或擲骰。此處所有模型回覆均為 transport fixture，沒有真實模型請求。
