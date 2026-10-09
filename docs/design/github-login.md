# GitHub 登入與環境設定（#23）

三個環境各使用一個 GitHub **OAuth App**，不要選 GitHub App。只讀取 GitHub 公開身分，不要求 repo、email 或離線存取權限。

## OAuth App 欄位

| 環境 | Application name | Homepage URL | Authorization callback URL |
| --- | --- | --- | --- |
| 本機 | Quiet Hours Local | http://localhost:5173 | http://localhost:5173/api/auth/github/callback |
| 測試 | Quiet Hours Test | https://quiet-hours-npc-test.houmengkou.workers.dev | https://quiet-hours-npc-test.houmengkou.workers.dev/api/auth/github/callback |
| 正式 | Quiet Hours | https://quiet-hours-npc.houmengkou.workers.dev | https://quiet-hours-npc.houmengkou.workers.dev/api/auth/github/callback |

Device Flow 不啟用；若有 Expire user access tokens，保留預設。程式只在回呼當下交換 token、查詢身分；不保存 access token 或 refresh token，因此不需要 refresh 流程。之後使用本服務自己的 24 小時工作階段。

## 設定名稱

| 名稱 | 放置位置 | 用途 |
| --- | --- | --- |
| APP_ENV | Wrangler 各環境 vars | local、test、production |
| AUTH_ORIGIN | Wrangler 各環境 vars | 固定網站 origin，不含尾端斜線或路徑 |
| GITHUB_ALLOWED_IDS | Wrangler 各環境 vars | 逗號分隔的穩定 GitHub 數字 ID，第一版只有 89203678 |
| GITHUB_CLIENT_ID | 各環境 Secrets／本機 .dev.vars | 該環境 OAuth App 的 Client ID |
| GITHUB_CLIENT_SECRET | 各環境 Secrets／本機 .dev.vars | 該環境 OAuth App 的 Client Secret |
| SESSION_SECRET | 各環境 Secrets／本機 .dev.vars | 各環境獨立隨機值，至少 32 字元，用於 cookie 簽章 |

不要在公開 issue、PR、聊天或版本庫貼秘密。Client Secret 不等於 OpenAI API Key。換 SESSION_SECRET 會讓該環境所有既有工作階段失效。

## 本機

1. 複製 config/local-auth.example 為 repo 根目錄的 .dev.vars（已被 Git 忽略）。
2. 用編輯器填入本機 OAuth App 的 Client ID／Secret。SESSION_SECRET 可以在自己的電腦用 `openssl rand -hex 32` 產生，填入結果；不要用文件裡的示意文字。
3. 執行 `pnpm db:migrate:local`，新增登入資料表不刪世界。
4. 執行 `pnpm dev`，開 http://localhost:5173 ，點「用 GitHub 登入」，確認授權頁的 App 是 Quiet Hours Local。
5. 回觀察室後以規則模式推進一回合，重新整理應保留進度；按「登出」後再開世界 API 應得到 401。

使用 localhost，避免與 127.0.0.1 的 cookie／回呼設定混用。本機使用 HttpOnly、SameSite=Lax cookie；雲端另加 Secure。

## 雲端秘密

先不要重跑正式部署。完成後續測試部署工作 #28 後，才進行實際雲端登入驗證。以下指令由站主在自己的電腦執行；Wrangler 會互動式要求輸入值，不把秘密放在命令參數。

測試站（填測試 App 的值與獨立 SESSION_SECRET）：

```sh
pnpm exec wrangler secret put GITHUB_CLIENT_ID --env test
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --env test
pnpm exec wrangler secret put SESSION_SECRET --env test
```

正式站（填正式 App 的值與另一個獨立 SESSION_SECRET）：

```sh
pnpm exec wrangler secret put GITHUB_CLIENT_ID --env production
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET --env production
pnpm exec wrangler secret put SESSION_SECRET --env production
```

也可在 Cloudflare 對應 Worker 的 Settings → Variables and Secrets 選 Secret 加入同名設定。建立秘密與 migrations 時明確確認環境；不要將測試 Key 填入正式 Worker。

## 行為與驗證

- 登入入口 `/api/auth/github`，回呼 `/api/auth/github/callback`，登出為 POST `/api/auth/logout`。
- OAuth 使用隨機 state、瀏覽器 cookie 與 10 分鐘 D1 登入嘗試，加入 PKCE S256；回呼原子消費該嘗試，重播不可建立工作階段。
- 回呼固定使用該環境 AUTH_ORIGIN 與 OAuth client 設定；不從外部 Host／forwarded header 推導回呼網址。
- 不受邀帳號得到 403，不建立工作階段或世界。
- 身分鍵為 github:<GitHub id>，改 GitHub 名稱不換世界。
- Cookie 含隨機 token 與 HMAC 簽章，簽章绑定環境 origin；D1 只存 token 的 SHA-256，工作階段最長 24 小時。頁面與世界 API 共用驗證，白名單移除後立即失去存取權。
- 登出需同源 POST，從 D1 刪除工作階段；即使保存舊 cookie 也不能重用。已在處理的回合可能完成。
- 過期資料在新登入時清理。資料庫需先套用 migration；缺少秘密或儲存不可用時不允許登入。
- 新增資料表為相容變更，不搬移或删除舊世界。舊 Sites 身分對應的世界不會自動對應 GitHub 世界。

`node tests/run-auth.mjs` 使用真實路由、身分驗證及世界儲存模組，GitHub HTTP 與 next request headers 位於外部邊界的測試替身，D1 SQL 在記憶體 SQLite 執行。測試不呼叫真實 GitHub、不發出付費模型請求。舊世界行為測試保留自己的身分 fixture；真實登入隔離由上述整合測試覆蓋。

本 PR 不包含 #26 的模型 Key 24 小時管理、#27 的每日帳本、#29 的多頁面排程或 #28 的雲端部署。建置成功不等於雲端已發布；真實 OAuth 本機登入需站主填入自己的秘密後驗收。

官方參考：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
