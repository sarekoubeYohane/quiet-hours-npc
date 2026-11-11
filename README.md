# Quiet Hours · NPC 觀察室

一個以帳號保存獨立世界的 NPC 生活模擬原型。玩家用完成的人物卡與場景建立世界，再逐回合或自動推進時間，觀察每位 NPC 依自己知道的事情生活。

- **介面與執行環境**：React 介面由 vinext 提供，執行在 Cloudflare Workers，世界資料存在 D1。
- **決策方式**：規則模式以固定行為試玩，不需要模型；OpenAI 直連或 OpenRouter 模式在 NPC 需要新活動時呼叫模型，費用由 Key 擁有者負擔。
- **資訊邊界**：每個角色只收到自己的性格、記憶與主觀觀察；位置、門、物件與檢定結果由程式維護，模型不能直接改寫世界。
- **帳號**：GitHub 登入，僅限白名單。每個帳號可有多份存檔，共用同一份模型 Key 與玩家預算。

角色設定來自對話中的概念測試，非小說正史。

## 文件入口

| 想知道 | 讀 |
| --- | --- |
| 檔案在哪、模組怎麼分工、哪些檔名會誤導 | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 怎麼跑測試、怎麼新增測試與 migration | [docs/testing.md](docs/testing.md) |
| 設計契約、ADR、驗證紀錄怎麼找 | [docs/README.md](docs/README.md) |
| 正式用語 | [GLOSSARY.md](GLOSSARY.md) |
| 各功能的詳細說明與有日期的進度紀錄 | [docs/history.md](docs/history.md) |
| 協作規則與工程流程 | [AGENTS.md](AGENTS.md) |

## 常用指令

需要 Node 22.13 以上與 pnpm 11。

| 指令 | 作用 |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | 安裝依賴 |
| `pnpm db:migrate:local` | 把 migration 套用到本機 D1 |
| `pnpm dev` | 開發伺服器，http://localhost:5173 |
| `pnpm typecheck` | 型別檢查 |
| `pnpm test` | 全部測試，不連外網、不發付費請求 |
| `pnpm lint` | eslint |
| `pnpm build`、`pnpm build:test`、`pnpm build:production` | 依本機、測試站、正式站設定建置 |
| `pnpm start` | 以 Wrangler 在本機執行建置成品 |
| `pnpm db:generate` | 修改 `db/schema.ts` 後產生 migration |

本機啟動前要把 `config/local-auth.example` 複製成根目錄的 `.dev.vars` 並填入秘密，步驟見 [GitHub 登入設定](docs/design/github-login.md)。跑單一測試檔與新增測試的方式見 [docs/testing.md](docs/testing.md)。

## 開始與管理世界

登入後先到「存檔」，每次登入都先選擇要接續的世界；選「繼續」直接進觀察。首次沒有存檔時，按「建立第一個世界」；也可從共同導覽「＋新開存檔」開始。導覽另有人物、場景、觀察、分析及設定；尚未選檔時，觀察與分析不可進入。

### 三段建立新世界

| 階段 | 操作 |
| --- | --- |
| 準備人物 | 選至少一位完成人物卡；按「建立人物卡並返回」製作後，完成卡會自動選入原開局。文字範本與未完成建角草稿不能直接開世界。 |
| 場景與安排 | 加入場所、命名世界並安排人物起點。從此處建立場景，保存後會帶回並選入。唯一場所／房間會填入空白起點；已有選擇不覆寫，多個選項仍由玩家決定。同一範本可重複加入成為不同場所；同住者選同一處實際場所。需求、電量、住處、工作、所有權、許可、房間與物件、關係、背景人物及道路可展開調整。 |
| 核對並開始 | 核對實際人物及來源版本、背景、能力、需求與電量、起點、房間、物件、門、道路及許可；有阻擋問題時返回修改。按「確認開局，進入觀察」，保存成功即進入第 0 回合，再自行推進時間。 |

沒有安排道路的場所不能互相步行，系統不會為建立成功偷偷補路。所有權、住戶／員工身分、出入許可、物理通行與角色知情各有責任；給予進入許可不會自動打開門，也不會讓人物知道全部房間或物件。

開局草稿自動存到帳號；離開後可從存檔頁「繼續準備世界」接續原階段。在開局流程建立人物或場景時，先保存開局草稿，再前往資產頁製作，返回後保留本次其他安排。留意「保存中」「已保存至帳號」「未同步」的狀態；失敗時保留輸入，使用恢復原操作，版本衝突則先核對已存內容。回覆遺失不代表未保存，不要另建操作來代替恢復。

場景未完成內容保存在目前分頁；同分頁離開、返回或重載可恢復。只有按「保存」才同步到帳號，關閉分頁後不保證保留。完成人物卡與場景自動選入若失敗，已完成資產仍在帳號，可按帶回重試；版本衝突不盲目覆寫其他頁面的開局。

### 可選的 AI 開局整理

在「場景與安排」寫開局描述後，可按「請AI整理本次開局」。AI 使用本次已選人物卡與場景，保留已填起點、住處、工作及其他安排，建議新增的房間、物件、門、道路與關係先獨立保存，不會直接建立世界或改動來源。

在同頁查看建議，修改後按「保存建議修改」，再按「採納建議到開局草稿」。採納後仍可手動調整，最後以確認頁實際內容保存世界；也可全程略過 AI 手動完成。已保存的建議可重載接續；再次整理失敗時可取回前一份已保存建議，修改尚未同步時保留本頁輸入。模型設定不足時在原頁補齊，保存設定本身不開始整理；回覆遺失先按「恢復原AI整理操作」，不自動重試付費請求。再次明示請 AI 整理會是新的模型請求。

### 先完成可重用的人物卡

人物概念、文字編輯、AI 補空、數值形成與配點在同一頁。可全部手填，也可先輸入概念，讓 AI 只補空白；已有內容不會被擴寫。姓名、外觀描述、性格、能力描述、背景經歷、初始記憶、信念、喜好與在意方向須在形成前完成，沒有特殊設定時可如實明示。具體起點留在本次世界配置。

按「確認設定並產生數值」前請核對文字：形成後全部文字鎖定，包含姓名與錯字。五項能力與精神容量先存入建角草稿，重載、離開或尚未按完成卡都不重抽。每次已保存骰組的五項總分固定，可在畫面所示的各項下限與上限內配點；精神容量不參與交換，外觀保存及展示但不參與檢定。確認後再按「保存為完成人物卡」，才可供開局選用。

保存完成卡前可按「重骰整組數值」，確認後取代五項能力、精神容量、需求特性與目前配點。文字仍鎖定，沿用原背景判讀，不再次呼叫模型。取消不取骰；保存結果不明時用「恢復原重骰操作」，沿同 ID 核對已保存結果。完成卡固定後不再重骰。

人物卡保留最後確認的能力、需求特性與精神容量；每份世界另有自己的位置、當前需求、目前電量、關係、所知與經歷。沿用同一卡不重骰，來源更新也不會改寫已開始的世界。舊文字範本須明示建角；舊人物能力、D20／d100、進行中活動與已存結果保持原版本，不因新卡尺度重算。用語與版本責任見 [GLOSSARY](GLOSSARY.md#世界存檔與人物準備) 及 [ADR 0012](docs/adr/0012-stable-characters-and-versioned-life-policies.md)。

### 模型設定與續玩

人物製作前就會提示模型與 Key 的需求。第一次需要 AI 而缺設定時，原流程會開啟模型設定面板；模型與已填 Key 一起保存，取消也保留輸入。人物製作可明示按「保存並繼續這次操作」，接續原本的補完或形成；單按「保存模型與 Key」不會呼叫模型。NPC 自主決策與天上意志分開設定：人物製作採帳號預設，存檔可沿用預設或自訂，畫面標示生效來源。單純保存設定不會自動補完、形成數值、重送進行中請求或推進世界；明示續作綁定原人物草稿，修改只影響後續新操作。

規則模式推進不需要 AI 設定，人物補完與形成判讀需要的模型仍須另行設定。Key 沿同帳號、同站與供應商的共用範圍及有效期保存，不隨人物卡、原始開局或另存副本複製。

續玩直接選存檔進觀察，不重做建角或世界配置。切換存檔先停止原世界自動推進；選檔、重載、保存設定或接續建立中草稿均不自動推進。

### 觀察與分析

觀察頁以世界時間與「下一回合」為主要入口；「管理存檔」與「運行設定」一次展開一組工具。運行設定集中模式、模型入口及自動推進節奏；自動運行時可直接暫停。另存與刪除沿用原本的版本核對及確認流程。

分析分為人物分析、世界紀錄、用量與費用、操作追溯。人物分析再分近況與需求、追求與生活、記憶與信念；事件可按人物篩選，詳細計算與來源按需展開。切換分類不推進世界或呼叫模型；原操作重送仍須明示。切換同一存檔的觀察、分析、設定會保留未送出介入與未套用設定，重新整理依 URL 回到對應頂層頁面。完整驗證與畫面見 [觀察與分析驗證](docs/verification/observation-analysis-20261111.md)。

## 本地與部署

專案以 vinext 與 Cloudflare 的 Vite plugin 建置，執行在 Workers，世界資料存在 D1，不再依賴 OpenAI Sites 的 hosting 設定、受控安裝腳本或 connector 預覽。`wrangler.jsonc` 宣告三組環境，各自綁定獨立的 D1；頁面右上、頁尾與登入卡顯示目前環境與建置時的提交短碼，頁尾與登入卡另有建置時間（台北時間），右上標籤的提示文字也有；`/api/environment` 不需登入即可讀到同樣資訊（含 `builtAt`、`builtAtLabel`），供部署後從外部核對版本。

| 環境 | Wrangler 設定 | Worker 名稱 | 網址 |
| --- | --- | --- | --- |
| 本機 | 頂層，`APP_ENV=local` | `quiet-hours-npc-local` | `http://localhost:5173` |
| 測試站 | `env.test` | `quiet-hours-npc-test` | `https://quiet-hours-npc-test.houmengkou.workers.dev` |
| 正式站 | `env.production` | `quiet-hours-npc` | `https://quiet-hours-npc.houmengkou.workers.dev` |

GitHub OAuth App 的回呼網址以上表網址為 origin，路徑固定為 `/api/auth/github/callback`；完整欄位與秘密設定見 [GitHub 登入設定](docs/design/github-login.md)。

本機啟動：

1. `corepack pnpm install --frozen-lockfile`
2. `pnpm db:migrate:local`：把 migration 套用到本機 D1。本機資料存在 `.wrangler/state`，重啟後保留。
3. `pnpm dev`：開 http://localhost:5173 。先依 [GitHub 登入設定](docs/design/github-login.md) 填入本機 OAuth 秘密；沒有模擬登入。
4. `pnpm build` 產出 `dist/`；`pnpm start` 以 Wrangler 在本機執行建置成品，用來檢查 `/api/environment`、靜態資源與首頁能否服務。本機啟動成品也需要 OAuth 秘密與正確回呼網址；OAuth App 以 5173 為回呼時，請用 `pnpm start --port 5173` 啟動成品。`CLOUDFLARE_ENV=test pnpm build` 會改以測試站設定建置。

修改資料庫結構後執行 `pnpm db:generate` 產生 migration，再跑 `pnpm db:migrate:local`。測試用 `pnpm test`，型別檢查用 `pnpm typecheck`。

### Cloudflare Workers Builds 的環境選擇

`pnpm build` 預設使用本機設定；雲端建置請明確選環境。Vite plugin 在建置時讀取 `CLOUDFLARE_ENV`，不能只在部署指令補 `--env`。建置完成後，部署 `dist/server/wrangler.json`，其中已包含編譯後的入口、靜態資源與該環境的 D1／vars。

現有正式 Worker `quiet-hours-npc` 的 **Settings → Builds** 應設為：

| 欄位 | 設定 |
| --- | --- |
| Production branch | `main` |
| Build command | `pnpm build:production` |
| Deploy command | `pnpm exec wrangler deploy --config dist/server/wrangler.json` |
| Builds for non-production branches | 關閉 |

這是現有 Workers Builds 的錯誤排查設定，不代表 #31 的正式發布流程已完成。PR 分支由 GitHub CI 驗證，不使用 Cloudflare 自動分支 preview。測試站由 GitHub Actions 的 `Deploy test site` 在 main 合併後自動部署：檢查通過後以 `pnpm build:test` 建置、先做 migration 相容守門與套用，再部署該次產生的 `dist/server/wrangler.json`，最後核對 `/api/environment`。流程、需要的 secrets 與判讀見 [測試站自動部署](docs/design/test-site-deploy.md)；第一次實際部署要等 token 與 variable 設定完成。

2026-10-09 的 PR #36 失敗紀錄是 `npx wrangler preview` 查詢 `quiet-hours-npc-local`，得到 `10007: This Worker does not exist on your account`。這是預設 preview 部署讀到本機 Worker 名稱，不是依賴安裝或程式編譯失敗。不要為了排除此錯誤在雲端建立本機 Worker，或僅以 `--worker-name` 改名：preview 還需要獨立的 bindings、secrets 與 OAuth origin，目前專案沒有配置這套流程。

官方參考：[Workers Builds 分支設定](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)、[Vite plugin 環境選擇](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)。

測試站的自動部署流程見 [#28](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/28) 與 [測試站自動部署](docs/design/test-site-deploy.md)；正式站的手動發布由 [#31](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/31) 建立。GitHub 登入已由 [PR #35](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/35) 及 [PR #38](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/38) 合併實作；正式站於 2026-10-09 已回報可成功登入，但本機／測試站與登出驗收仍記於 #23。各環境須各自核對 OAuth Secrets 與 migration；測試站自動部署的工作流程已加入，首次實際部署待 secrets 設定。整體規格見 [Infra 工作票 #19](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/19) 與 [Infra 工作拆分](docs/design/infra-environments-ticket-plan.md)。舊 Sites 站保留作參考。

OpenRouter API 文件：https://openrouter.ai/docs/quickstart

模型內容並非保證符合世界觀；規則控制狀態更新，不保證每句台詞沒有錯誤。請透過紀錄檢查知情對象。

## 登入流程

首頁與世界 API 共用 GitHub 工作階段驗證；未登入時提供「用 GitHub 登入」，API 回 401。登入後先到存檔頁選檔；空帳號由「＋新開存檔」開始，不會先建立或推進預設世界。第一版僅允許設定白名單中的 GitHub 數字 ID，無匿名／共用世界或 Sites 身分 header 路徑。每環境使用自己的 OAuth App，D1 保存工作階段，24 小時到期，登出立即失效。OAuth callback 固定在 `/api/auth/github/callback`。

本機與雲端的完整設定與驗收步驟見 [GitHub 登入設定](docs/design/github-login.md)。正式站於 2026-10-09 已由使用者確認成功登入；這不代表本機／測試站的真人 OAuth／登出流程已驗收通過，請參考 [#23](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/23)。其他環境仍需依設定文件填入各自 Secrets。

## 部署相容性

使用 GitHub 穩定數字 ID 作為世界鍵，不使用 email 或顯示名稱。新增登入資料表不刪除世界；不自動搬移舊 Sites 世界。靜態資源由 `ASSETS` binding 提供，登入入口與登出表單不依賴 JavaScript hydration。
