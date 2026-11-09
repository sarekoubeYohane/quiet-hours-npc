# #276 五分鐘世界推進驗證

依已批准 [A–D 的 B 時間契約](../design/character-dice-energy-recommendation-2026-11-09.md) 與 [ADR 0012](../adr/0012-stable-characters-and-versioned-life-policies.md) 實作；本票不啟用 #256 正式精神電量政策，也不實作 #278 身體需求隨機化。

## 實際行為與相容

WorldApp 預設每步五分鐘，發送 `timeContract: five-minute-v1`，成功世界寫入後保存時間版本。普通 GET 不導入；舊世界的已保存活動、階段、需求與睡眠端點原樣續行。已採用世界只能新建五分鐘推進，不能以省略版本或十五／三十分鐘旁路；未採用的舊客戶端維持原契約。已受理操作先以原 ID 精確回放，再檢查新操作版本與時間，舊十五／三十分鐘收據仍可讀。

新選擇從目前邊界向後開始。世界確認活動沿原十五分鐘粒度與原階段；真正睡眠從零分鐘開始，其後才累計恢復。確定短動作也保存待完成計畫，完整十五分鐘後才操作門、說話、讀寫手機或取得觀察結果。到期時重新檢查當前條件，目標離場等正常變動會取消未發生結果並提供受阻回饋，不把它變成重複失敗的整輪故障。開始事件只讓本人知道已開始、結果尚未發生，保留自主開始證據。

十五／三十分鐘 UI 快轉分別執行三／六個獨立操作，每步獨立 ID、pending 保存、SQLite CAS、預算、租約及期限。失敗或離開前景停止後續步，已提交前步保留；結果不明仍沿原 ID 查證。快轉顯示逐步進度，直到整批結束；未把六輪塞入單 HTTP。長活動純續做不重新估時、擲骰或派送模型。跨地點旅程保留既有路程耗時。

## 受控 API 與 SQLite

`tests/five-minute-time-api.test.cjs` 走實際世界 GET／POST、模型 transport 邊界與序列化 SQLite 保存重讀，沒有替換活動或保存邏輯。最後十項全部通過，零失敗／略過：

- 明示五分鐘導入、GET 不導入、合法時間驗證、導入後拒絕大步旁路、舊收據及原 ID 重送不前進。
- t5 選短動作，t10／t15 不出完整結果，t20 恰好出一次。
- t5 開始六十分鐘活動，t65 到期；純續做只有一次 NPC 呼叫（30 input／10 output tokens）。
- legacy 睡眠在 t7 精確自然醒，t7..t10 計清醒，t10 才取得新選擇，不倒填睡前時間。
- 保存前失敗、CAS 衝突、保存後回應故障共同承接時間版本／計畫／世界及已知用量；原 ID 不重新派送。
- 新確認睡眠在選擇點實睡零分鐘，之後二十分鐘累積二十分鐘，不因十五分鐘技術估時醒來。
- 世界確認十五分鐘茶，真正跨三個五分鐘後才完成；續做不再裁定。
- 延後說話的對象離場後，保存對方移動事實並正常回饋受阻。
- 既有自然事件名義 t7，t5 尚未生效、t10 提交時已可見，名義時間不改寫。
- 舊世界 t127 的計畫仍保留 startedAt100／until145，下一步132不重排，至147正常提交點才結束。

## WorldApp Chromium

[runner](../../tooling/verification/browser-five-minute-time.mjs) 使用真正 WorldApp、世界 API 與 SQLite。最終 R3 通過：五分鐘導入、短動作延後、三／六步快轉、每步獨立 ID、重載與原 ID 回放；零付費模型呼叫。[JSON 證據](assets/time-276/evidence.json) 與 [重載畫面](assets/time-276/five-minute-reload.png) 已保存並目視。畫面顯示21:05開始，21:20才說出完整內容。

保留前兩次 runner 失敗：R1 未同步瀏覽器與 fixture 固定日期，產生 future operation ID 而回400；R2 固定全部操作在同一毫秒，journal 淘汰界線使最後新 ID 回410。R3 在每次派送前同步推進受控時鐘，等整批進度結束再斷言最終時間；未放寬產品回應、終點或去重斷言。這些是 fixture 時鐘修復，不能記為產品測試一開始就成功。

## 執行範圍

- 首次新增 API 紅燈：五分鐘回400；最終 `node tests/run-activities.mjs tests/five-minute-time-api.test.cjs`：**10/10 pass**。
- 活動、活動估時／生命週期、精神電量、睡眠、自然變化、城市旅行及當時新增八項案例合跑：**68/68 pass**。之後新增兩項舊時刻案例，最新十項再完整通過；不重複加總這兩個報告數字。
- `pnpm typecheck`：PASS。
- 變更範圍 eslint：0 errors，僅既有 WorldApp effect dependency warning。
- `git diff --check`：PASS。

完整整合回歸與 code-review 由 integration 流程另外執行。本票只證明受控應用流程與機械一致性，沒有呼叫真實付費模型、部署或推進正式世界。
