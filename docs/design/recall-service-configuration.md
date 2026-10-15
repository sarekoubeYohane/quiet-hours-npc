# 主動回想服務設定交接（#55）

本次只交付 adapter、D1 用量保留與模擬測試；未建立 Vectorize 索引、設定正式 Key、執行正式 migration 或付費 smoke test。預設沒有 `RECALL_ENABLED=true`，所有回想傳輸拒絕服務，不能改用文字搜尋。世界仍以 D1 保存的 NPC 主觀記憶及版本為權威。

## 各環境設定

local、test、production 必須分別使用自己的世界 D1 及 Vectorize 索引，不能將測試索引綁至正式世界。站主付費預算則使用唯一共用 `RECALL_USAGE_DB`，所有使用同一站主服務的環境均綁至此用量資料庫，避免各環境分別耗用一整份站主額度；未設定時不能啟用。實際設定須在另行授權後進行。

| 設定 | 用途 |
| --- | --- |
| `MEMORY_VECTOR_INDEX` | Cloudflare Vectorize **V2** binding；1536 維、cosine；各環境索引名稱不同 |
| `OWNER_EMBEDDING_KEY` | 站主的 OpenAI Embedding secret；不使用使用者聊天 Key，也不存入世界、操作結果或文件 |
| `RECALL_USAGE_DB` | 跨環境共用付費帳本 D1；不與各環境世界 DB 混用；未設定時拒絕啟用 |
| `RECALL_ENABLED` | 只有字串 `true` 明確啟用；缺少 binding 或 secret 同樣拒絕回想 |
| `RECALL_BUDGET_LIMITS` | 各類服務每月站主總量及單一帳號保守用量限額的 JSON |
| D1 migration `0004_recall_usage.sql` | 持久保留已 dispatch／可能已計費的用量；不隨世界回復釋放；`recall_index_entries` 保存無原文的已同步 ID／版本清單，供刪除／改寫時清理舊索引 |

Vectorize metadata 必須預先建立 `owner`、`world`、`npc`、`memoryId` 四個 string metadata index，以及 `version` number metadata index，搜尋同時使用 owner／world／npc filter；就緒查詢另指定 memoryId／version。記錄只存 memory ID／版本與範圍，不包含可回憶原文、他人秘密或系統診斷。命中後仍須從 D1 世界重新查驗範圍、版本及是否可回憶；filter 不能取代這個權限檢查。

向量刪除使用 `remove`／`deleteByIds`，一次最多八筆，同樣先保留 index 用量；非同步刪除完成前由 D1 權威回讀拒絕舊版本。

Embedding 固定為 OpenAI `text-embedding-3-small`，傳送 `dimensions:1536`，最多八筆、單筆 UTF-8 4096 bytes。回覆需具有唯一輸入索引及 1536 個有限數值。每次向量搜尋最多五個結果，不取回向量值。

## 預算及失敗語義

`reserveRecallDispatch` 在每次 dispatch 前使用單一 SQLite `INSERT SELECT` 同時檢查「當月所有帳號總和」與「當月此帳號總和」，避免跨頁面、跨世界及跨帳號併發超支。月份使用 UTC `YYYY-MM`。`recallBudgetDatabase()` 只回傳明確啟用且已設定的共享用量 binding；關閉回想時一般世界 API 不要求此服務。保留識別碼全域唯一；相同識別碼回傳 `replayed:true` 時**不能**再次送出外部請求，必須沿 operationId 已保存結果或提交不明語義處理。

Embedding 成功回覆的 `usage.total_tokens` 以獨立 nullable `known_input_tokens` 欄位保存，callback 在後續向量格式驗證前等待完成；世界回復也保留這筆已知用量。缺失回報保留 unknown，不能假報零付費。

用量分為站主付費 `embedding`、`index`、`search`，以及玩家自付 `chat`；保守 dispatch units 不是供應商回報 token，也不是美元。Embedding 以輸入 UTF-8 bytes 做 token 上界保留；索引與搜尋使用各自明示的 dispatch 上界；聊天保留冪等派送紀錄，但不佔站主月預算。正式啟用前站主須依當時服務單價把可接受金額換成保守 units 限額，並另外設定供應商帳戶支出控制；本文件不宣稱能限制 Vectorize 已存向量的持續儲存帳單。

設定示例（不是正式啟用授權）：

```json
{
  "embedding": { "ownerMonthly": 1000000, "accountMonthly": 100000 },
  "index": { "ownerMonthly": 10000, "accountMonthly": 1000 },
  "search": { "ownerMonthly": 10000, "accountMonthly": 1000 }
}
```

省略類別採上列保守預設；零代表禁止該類 dispatch；負數、小數、非安全整數拒絕設定。`chat` 的舊站主月上限不再套用至玩家 Key。付費方由實際持有憑證的派送路徑明確指定，不依模型供應商名稱推測。玩家付費 chat 仍保留獨立於世界回復的冪等 reservation，但不經站主上限；Embedding／索引／搜尋仍以站主路徑原子保留，不能套用玩家無上限。使用者聊天仍用自己的有效聊天模型 Key；站主 Embedding／Vectorize 額度不轉嫁給使用者。

Vectorize binding 沒有 AbortSignal 參數，adapter 會在取消時停止等待；伺服器端的 mutation 可能繼續且計費，因此保留用量。OpenAI fetch 傳入 AbortSignal，取消同樣不能當作未計費證明。所有 transport 仍須由呼叫端在 dispatch 前重驗世界租約、工作期限及預算。

## 上線前仍須驗證

1. 各環境資源與 secret 經授權設定，正式 D1 migration 另行執行。`0004_recall_usage.sql` 的 `recall_dispatch_usage` 表與 `recall_usage_month_kind` index 必須另套用至共用 `RECALL_USAGE_DB`；`recall_index_entries` 表及其 index 留在各環境世界 DB。若完整 migration 也套用至共用 DB，多出的空 manifest 表不作權威、不用來讀寫世界資料。
2. 使用真實索引驗證 async mutation 的搜尋就緒證據：adapter 的 `ready` 以 `queryById` 加上帳號／世界／NPC／memoryId／version 精確 filter 確認該版本可在搜尋面命中；每筆就緒查詢也要獨立保留 search 用量、檢查租約與期限。不能把 upsert 或 getByIds 成功視為可搜尋，也不能比較 mutation UUID 字典順序。
3. 以站主帳戶進行經授權的有限付費 smoke test，核對 provider 回報用量與保守帳本、metadata filter、版本水位與取消行為。
4. 確認金額換算、供應商支出控制及持續向量儲存費用；未確認前保留關閉。

官方介面參考（2026-10-15 查閱）：[Vectorize API](https://developers.cloudflare.com/vectorize/reference/client-api/)、[metadata filtering](https://developers.cloudflare.com/vectorize/reference/metadata-filtering/)、[OpenAI Embedding API](https://developers.openai.com/api/reference/resources/embeddings/methods/create)。

## 介面與政策（#78／#81）

`GET /api/world` 的 `recallUsage.ownerUnits` 只含站主 embedding／index／search；`playerPaidChatCalls` 為共享派送紀錄中的玩家聊天次數，舊 `units` 欄位保留相容用途，不能全加總成站主成本。已知 Embedding tokens 另列，保守 units 不是 tokens 或美元。回想關閉顯示未啟用；不要求共用 binding 才能一般聊天。

失敗回應的 `stopReason.scope` 分為 `player`（玩家預算）、`owner`（站主預算或設定）、`provider`（供應商額度／速率）、`technical`（期限、連線或資料故障），並提供 `code`。瀏覽器顯示作用範圍且停下自動運行。站主回想失敗仍回復整個未完成回合、保留已發生用量，不降級成空記憶。

#19／#27 已依 #78 修訂：沒有固定每日 144 次攔截。每日真實用量及完整跨環境帳本仍由 #27 承接，不能把本站小時／累計資料宣稱為完整每日帳單。
