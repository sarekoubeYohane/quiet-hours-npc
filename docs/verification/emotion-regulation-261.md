# #261 固定成本主動情緒調節

本切片只接行為契約，不決定 #256 的正式數值。政策沿 #257/#258 的明示 local/test 設定；測試的 initial=5、maximum=10、regulationCost=4、experience.levels=[0,2,5] 皆為隔離 fixture，沒有產品預設。

## 完整選擇與結算

啟用精神電量的正常自主決策才有 `emotionRegulation` wire 欄位：`null` 表示保留電量，或唯一一個 `{effort, reason, mood}` 物件。努力、理由必須非空且最多 256 字，文字心情最多 20 字；不接受任意點數、陣列或多份申請。模型輸入只保留本人定性感受與 `canRegulate`，不送固定費用或精確餘額。

後端驗證順序：

1. 解析本次最終決策；`emotionRegulation` 與感受／記憶等心理工作共用四項及 8KiB 額度。純回想要求只能有 type/questions，不能先付款；回想續答才產生唯一最終選擇。
2. 既有活動時間生命週期確認自然消耗和真正睡眠，先完成當輪實際區間。首次睡眠的自然耗電重算不能覆蓋後續心理收支。
3. actor 的 finally 先 `applyFeelingUpdates` 結算同輪獨立合法收入／耗損及自然情緒，再 `applyEmotionRegulation` 檢查實際餘額是否足額。可以從同輪合法收入補足；同輪負向耗損也不能忽略。
4. 只有明示物件且足額才完整扣固定成本並保存 effort/reason/moodBefore/moodAfter。缺額直接使整輪失敗，不以截斷到零冒充付款。最後選擇 identity 是同輪 turn/minute/actor，保存最後一次已付款 identity，拒絕同選擇重複付款。下一次正常思考才可再次選擇。
5. 費用、心情、努力和理由沿原世界 CAS/save/journal 同輪提交；保存失敗或後續角色失敗整輪回復，付費 provider usage 沿既有政策保留。原 operationId 重放不能再次呼叫模型或付款。

調節不另開活動，不改 NPC 已選擇的 work/reflect/continue/sleep。自動續作、規則試玩、接管和直接控制不產生自主付費候選。主動調節只寫精神電量歷史，不建立新的 feeling origin、事件或記憶收入來源；同輪其他合法獨立來源仍可結算。

實際 system prompt 明列「至少小幅緩和」「到自己覺得能承受」「可保留電量」，心情很差且取得新電量時優先考慮是否調節，但不強制花費；沒有心情分數、字串情緒分類器、額外模型鏈或付費語義裁判。`canRegulate` 是輸入時的餘額感受，若同輪合法收入補足仍可提出一次，由後端按最後合法餘額確認。自然好轉在零電量也可用來源合法的 mood-only feeling update 表達，既不強制收費，也不要求發放收入。

## 驗證

TDD 第一個真世界 API 測試先出現 502（尚不支援調節欄位），實作後通過；日誌 `/tmp/261-red-1.log`、`/tmp/261-green-1.log`。測試沿真 POST/GET、SQLite 序列化重讀、實際 transport body/schema/calls/usage；沒有 mock 內部 writer。

`tests/emotion-regulation-api.test.cjs` 的 9 個測試覆蓋足額、恰好付至零、不足額、未選擇、非法點數／重複陣列、普通續作與控制權、回想及最終續答一次付款、零電自然情緒、同輪獨立正／負收入、首次真睡眠後付款、後續角色失敗、保存前失敗／CAS 衝突／提交後不明，以及原操作回放。單次普通調節只有 1 個受控 NPC call、30/10 tokens；回想後最後付款是 2 個受控 NPC calls，不能再開第二條調節鏈。

相關回歸共 **37/37 通過**：emotion-regulation、mental-energy、mental-experiences、npc-input-equivalence。Typecheck 通過；lint 0 errors、4 個既有 warnings；diff check 通過。完整全測由 integration 最末統一跑。

既有分析畫面的精神電量歷史顯示「主動情緒調節」、扣費前後值、心情前後文字、心理努力與理由；Chromium runner 和證據由 root 核對後另附。

受控回覆證明結構、權限、記帳與保存承接，不能證明自由文字真的比先前緩和。沒有跑付費模型，本票不宣稱完成真實心理語義品質驗收，也不關閉 #255 或解除 #263 對 #256 的阻擋。
