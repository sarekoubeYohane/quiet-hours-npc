# 模型任務契約

目前 NPC 決策透過 `models.ts` 組裝自己的主觀上下文，再由 `model-adapter.ts` 傳送已篩選的 transcript、schema 與獨立服務設定。轉接層不接收 World；候選仍回到共用驗證器驗證記憶、認知、關注與意圖，再由既有活動引擎執行及世界 API 一致保存。程式保留擲骰及提交權。

NPC 契約為 `npc-decision.v1`，輸入 `contractVersion` 由系統指定。既有未宣告版本回覆相容；顯式宣告時只接受 `npc-decision.v1`，未知版本、額外欄位及不可見引用皆拒絕，整回合回復並保留已知付費用量。合法候選例如 `{ "contractVersion": "npc-decision.v1", "type": "rest", "target": "", "content": "", "mood": "平靜", "durationMinutes": 15, "intents": [], "attentionConditions": [], "memorySelections": [], "memoryOperations": [], "cognitiveUpdates": [], "interpretation": "" }`。`npc-decision.v99` 是不相容失敗範例。

這不是模型自行篩選真相，也不是通用裁定已上線的宣告。裁定任務須獨立組裝權威最小輸入、分開歷史及配置；既有行動、純續做、接管與規則試玩維持原呼叫數。

每次傳送有系統建立的 requestId、角色歸屬、契約版本與實際 transcript 的 SHA-256 關聯，operationId／世界版本沿原操作傳入，並不要求模型自行聲明 NPC 歸屬。支援的轉接服務若回傳 `X-Decision-Request-Id` 必須匹配本次請求；沒有此 header 的既有供應商維持相容。回應用量先入既有帳，再拒絕錯配。回覆後重新查核原版本、租約與工作截止時間，過時候選不能提交；同 operationId 仍由原持久 journal 重放，沒有新隊列或新交易。

裁定任務獨立使用 `world-adjudication.v1`、獨立服務設定和兩則新 transcript，只有本輪方法／對象、執行者位置與能力，以及相關對象的位置與限制；不附私人記憶、信念、意圖或 NPC 聊天歷史。`requestAdjudication` 接受呼叫者提供的受限候選 schema；它本身沒有寫世界、擲骰或記帳提交權。

世界 API handler 的可選伺服器依賴 `adjudicateExistingAction` 供受控 fixture 驗證，不能由 HTTP JSON 啟用；框架傳入一般 context 時不啟用。既有合法行動只接受 `{ "status": "accepted" }`，任何額外骰值或效果都拒絕，仍由原引擎執行及保存。正式既有行動不派裁定模型，不額外付費。自由提案、實際裁定配置及效果候選在 #93 另行接入，不以這個 fixture 宣稱已上線。
