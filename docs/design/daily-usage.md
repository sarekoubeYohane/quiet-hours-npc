# 每日模型用量帳本（#27）

伺服器上限固定為每個 GitHub 使用者每日 144 次模型請求；日期為 Asia/Taipei。
OpenAI 與 OpenRouter 合計，不受畫面上的小時上限調整影響。

## 儲存與預留

`USAGE_DB` 是獨立 D1，migration 位於 `drizzle-ledger/`，不得套進世界 D1。
每筆預留包含 GitHub user id、台北日期、已發出次數、未用次數及到期時間。
單一 INSERT…SELECT 原子檢查同帳號同日的已用＋有效預留，再准入整回合的自主角色數量。
即使活動原可延續，也保守預留自主角色數：本回合較早的角色可能中斷後面的角色。
接管或指定活動中的角色不需要預留。啟用主動回想時，每名自主角色預留最多兩次聊天（首次決策＋一輪回想續接）；回想未使用的份額在回合結束釋放。Embedding、索引與搜尋另由 RECALL_USAGE_DB 的服務預算計量，不算每日聊天次數。預留期限與回想共用工作截止時間（世界租約到期前 10 秒）。

每次模型輸入序列化完成、實際 fetch 前，原子把一份預留轉為已用。
失敗、逾時、格式錯誤均保留次數；重試新回合重新計量，同 operation id 的重播不重複計量。
結束時釋放未用預留。Worker 終止時，未用預留隨世界租約到期失效，已用不退還。
跨午夜先釋放前日未用預留，為剩餘請求重新預留新日額度；不足即停止並回復原世界。
世界存檔失敗不影響帳本；登出、換 Key、重置世界也不會操作帳本。

D1 與外部模型無分散式交易：帳本成功計入後、fetch 前程序若終止，或寫入成功但回應遺失，該次保守保留，不假定可安全退款。
因此故障時「已用」可能包含無法確認是否送出的嘗試；不能宣稱絕對精確的供應商帳單。
資料庫不可用時禁止新模型請求，不改用另一資料庫或自動切規則模式。

## 本機與雲端設定

本機已綁 `quiet-hours-npc-local-usage`，與世界 D1 分開：

```sh
pnpm db:migrate:local
pnpm dev
```

**雲端尚未配置**：使用者確認 #21 的共用 D1 尚未建立，本次僅完成程式與本機驗證。
測試站、正式站的 `env.<environment>.d1_databases` 都必須加入以下 binding，兩者使用同一個真實 UUID：

```json
{
  "binding": "USAGE_DB",
  "database_name": "quiet-hours-npc-usage",
  "database_id": "填入已建立的共用帳本 D1 UUID",
  "migrations_dir": "drizzle-ledger"
}
```

建立並填入後，部署前只需對共用帳本套一次 migration，例如：

```sh
pnpm exec wrangler d1 migrations apply USAGE_DB --env test --remote
```

#28 的 CI migration 守門與部署流程目前只處理世界 DB，合併本功能前必須補上帳本 migration／binding 驗證。
不得直接將本分支發布到現有雲端環境：缺少 USAGE_DB 時模型回合會停止，GET 仍可顯示世界及帳本未就緒提示，規則模式可用。
真人登入、測試與正式站共用 D1 實測仍待完成。PR #58 已合併，重置 API 與每日額度／重播的整合自動驗收已通過。

## 驗證介面

沿用 #27 指定的世界 API、模擬模型、記憶體 SQLite。兩個獨立世界資料庫共用一個帳本，驗證並行預留不超賣。
同時以 fixture 替換世界及真實 reset API 驗證帳本獨立性；每日額度耗盡後重置與重播仍保留已用次數。
另於既有 Workers/D1 整合測試載入獨立 USAGE_DB，驗證實際 runtime 的 SQL。
