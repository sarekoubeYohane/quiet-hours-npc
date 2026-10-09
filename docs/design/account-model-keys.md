# 帳號共用模型 Key：最長 24 小時

2026-10-09 使用者確認：在自己的瀏覽器保存 Key，讓同一 GitHub 帳號在同環境的雲端瀏覽器也能測試；登出只結束該登入，其他已登入瀏覽器繼續使用，直到 24 小時到期或手動清除。

這取代 [#26](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/26) 原本的「工作階段綁定、換裝置重填、登出清除」條件。其餘安全、規則試玩、用量及測試要求沿用。#23 的 GitHub 登入程式已由 #35／#38 合併；Issue 狀態與三環境真人驗收仍分開追蹤。本文件描述本變更的程式與已確認行為，並不表示已部署。

## 行為

- Key 按 GitHub 穩定使用者 ID、環境、origin 與服務（OpenAI／OpenRouter）分開保存。不同帳號、測試站與正式站不可互用。
- 保存或替換時重新起算 24 小時；讀取、重新登入、使用及重新整理不延長期限。登入本身仍有獨立的 24 小時期限。
- 登出撤銷該瀏覽器工作階段，不刪除帳號 Key。未登入、登入到期或白名單移除後不能使用 Key；重新登入後可使用仍未到期的 Key。
- 「清除已存 Key」刪除目前所選服務的 Key，影響該帳號在同環境的所有瀏覽器；另一服務的 Key 保留。
- 每次實際模型呼叫前重新確認 Key。清除或到期後不再送出新請求；已送出的請求可完成且保留用量。失敗回合回復世界進度，不能把尚未送出的請求計為付費嘗試。
- Key 不可用時 AI 暫停，不自行切換規則模式。新頁面仍預設規則試玩，需主動選 AI 並開始。

## 保存與 API

`account_model_keys` 是獨立 D1 資料表。AES-256-GCM 使用隨機 12-byte nonce；認證資料含版本、環境／origin、帳號、服務與到期時間，避免密文搬到另一個帳號或竄改期限。加密用的 32-byte 隨機秘密只放在各 Worker 的 `MODEL_KEY_ENCRYPTION_SECRET`，與 `SESSION_SECRET` 分開。

既有 `/api/world` 測試介面新增：

| 請求 | 用途 |
| --- | --- |
| GET | 世界與 `modelKeys` 狀態／到期時間、`modelKeyStorageAvailable` |
| POST `set-model-key`，`mode`，`key` | 同源、登入後保存；只有這個操作需要傳入 Key |
| POST `clear-model-key`，`mode` | 同源、登入後清除所選服務 |
| POST `advance`，`mode`，`model` | 後端讀取帳號 Key；拒絕請求中的 `key` 欄位 |

`mode=openai` 對應 OpenAI；`mode=ai` 對應 OpenRouter。API 只回傳設定狀態與到期時間，沒有解密／顯示 Key 的接口。後端解密後僅用於模型請求的 Authorization header，不送進 NPC 上下文、世界、錯誤或日誌。供應商網路／JSON 錯誤轉成固定訊息，模型請求不跟隨轉址。

到期時立即禁止讀取使用；過期密文在該環境下一次狀態讀取、保存或使用時清理。本變更沒有定時清理器，因此不保證閒置 D1 在到期當刻物理刪除密文。手動清除立即刪除目前資料列；D1 備份的生命週期不由本功能控制。

## 啟用順序

先套用 additive migration，再部署新版程式。缺少資料表會使世界 API 無法讀取；缺少加密秘密時規則模式仍可使用，AI 保存／使用明確回報尚未設定。

1. 在自己的終端產生獨立 32-byte 隨機秘密：`node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"`。不要貼到聊天、Issue 或版本庫。
2. 對目標 Worker 加入名稱 `MODEL_KEY_ENCRYPTION_SECRET`、類型 Secret、值為上述 64 位十六進位字串。本機寫入未追蹤的 `.dev.vars`。每環境使用不同秘密；輪替會令現存密文無法解密，使用者須清除後重新保存。
3. 套用目標 D1 migration。本機：`pnpm db:migrate:local`；測試：`pnpm exec wrangler d1 migrations apply DB --remote --env test`；正式：`pnpm exec wrangler d1 migrations apply DB --remote --env production`。
4. 依既有發布流程建置／部署；正式發布仍需另外授權。先確認 `/api/environment` 的環境與提交版本。

官方設定參考：[Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)、[D1 migration 指令](https://developers.cloudflare.com/d1/wrangler-commands/)。

## 雙瀏覽器驗收

1. 自己的瀏覽器登入目標網站，開「模型設定」，選服務，貼上 Key，按「保存 Key（24 小時）」。應顯示已設定與到期時間，輸入欄清空。
2. 雲端瀏覽器登入同一 GitHub 帳號、同一網址，選相同服務，按「重新檢查 Key」。應顯示同一到期時間，無需再貼 Key。
3. 主動選模型，手動跑一回合，檢查角色行動、事件與呼叫用量；真實模型會使用 Key 擁有者的 API 額度。
4. 登出自己的瀏覽器；雲端瀏覽器仍可使用。接著在任一已登入瀏覽器清除 Key，另一個瀏覽器重新檢查後應顯示未設定，後端也拒絕後續 AI 回合。

自動測試透過 world API、模擬 OAuth／模型及 SQLite 驗證登入隔離、期限、清除、錯誤與用量；另外使用同版 Miniflare／workerd、真實 D1 與 AES-GCM 驗證密文保存及竄改拒絕。沒有付費 API 呼叫。真人 UI、有效真實 Key 與部署後雙瀏覽器驗收另行記錄。
