# Quiet Hours · NPC 觀察室

一個每帳號獨立的 NPC 生活模擬原型。React / Vinext 提供介面，Cloudflare Worker 處理行動，D1 保存世界進度。每個帳號有獨立世界。

- 四位測試角色（Cass、Vera、Kris、咖啡店主）、三個地點；手動推進 15 或 30 分鐘。
- 規則模式以固定行為序列試玩。OpenAI 直連或 OpenRouter 模式在需要新活動時對 NPC 呼叫模型，活動延續期間不重複詢問，按供應商費率計費。
- Key 只保留在本次瀏覽器頁面記憶體，在請求中送到後端使用，不存入 D1 或紀錄。
- 每個角色只收到自己的性格、目標、關係、記憶與同地點角色，沒有全世界事件紀錄。私密想法僅自己知情；訊息僅收發雙方；現場說話對在場者可見。
- 位置由規則更新。移動耗掉一個回合；說話需同地點。工作限泡茶、整理與畫髮飾。
- 角色最近 80 則記憶、最近 300 則事件持久保存。尚無長期摘要、關係數值成長或離線持續運行。
- 世界更新用資料庫租約與版本條件避免平行回合覆蓋。最終保存確認零列衝突時，只把本次已付費嘗試與回報 token 差額原子加入最新世界，不覆蓋角色進度或較新租約；累計用量保留，過期請求不改寫較新的小時計量窗口。資料庫拋錯且提交結果不明時不重播差額，避免重計；資料庫全面中斷或工作程序終止的用量持久性仍需要另行加入冪等帳本。
- 角色設定來自對話中的概念測試，非小說正史。

## 共用 Playbook、意圖與店主控制

[#1 規格](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/1) 的四項工作已由 [PR #6](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/6) 於 2026-10-08 合併至 `main`，#1–#5 已關閉。合併後的 48 項測試、型別檢查、建置與跨日模擬通過；店主介面點按及真實模型表現仍待驗證。已合併的程式與正式網站版本分開管理，詳見 [合併後驗證紀錄](docs/verification/npc-playbook-2026-10-08.md)。

所有角色共用 `lib/playbook.ts` 的生活判斷原則，各自保留意圖佇列。模型同次回覆意圖與下一步，按角色性格排列最多 12 個意圖，記錄強度、重要程度、急迫性與等待背景；程式不另作固定評分或過期倒數。角色狀態面板唯讀呈現意圖，舊世界相容載入空佇列並加入獨立測試店主。

收到新事情後，模型可更新佇列並繼續原活動，保留原進度及完成時間；也可切換活動。同一已看過的消息不在延續回合重複決策或產生記憶與習慣證據。

店主支援單次指定下一行動、暫時接管與交還控制權。接管且沒有指令時店主待命，其他角色繼續生活；指定行動保留意圖且不計為自主習慣。交還後首次自主模型請求會取得原佇列、當前狀態、最近 12 則記憶，以及控制期間另行保留的最近 80 則已知經歷；不包含未執行指令或他人的私密事件。該經歷緩衝在首次自主決策成功提交後清除，失敗時保留供重試。這是有界上下文，不是長期摘要；更早經歷仍可能超出保存上限。

## D20 行動判定

本段僅描述 [行動判定工作票 #8–#13](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/8) 的受限實作，不包括另外尚待 Grill 的感知與記憶系統。行動結果仍透過現有事件與角色文字記憶傳遞；**沒有新增感知與記憶架構**。

- 已支援的髮飾設計挑戰與說服使用 D20；容易 DC8、普通 DC12、困難 DC16，能力修正 −4／−2／0／+2／+4。結果按差值分為大成功 ≥8、成功 0～7、部分成功 −6～−1、失敗 −10～−7、大失敗 ≤−11；天然 1、20 無特權。
- 角色可從設定的自然語言能力標籤取得相應修正；不同挑戰難度與能力分開。普通工作仍直接完成，不擲骰。
- 髮飾成果會保存狀態與來源事件；在同樣條件、同一主題與方法下重試不會洗骰。研究場景中既有的布料與髮飾參考後可換方法。
- 社交說服由主動者擲一次骰，目標的意願、關係及下一步由對方自己決定；同樣條件反覆說服不重擲。
- 觀察者事件頁可以看見客觀結果及骰值，NPC 的模型上下文不會取得骰值與內部級別；新的行動結果不會替 NPC 自動新增意圖。
- 這是**限定在現有工作與社交行動上的可試玩切片**，尚未具備通用自由技能、物件互動、模型自由生成後果或完整 AI 模型真人試玩驗收。

詳見 [PR #20](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/20)。

## 本地與部署

專案以 vinext 與 Cloudflare 的 Vite plugin 建置，執行在 Workers，世界資料存在 D1，不再依賴 OpenAI Sites 的 hosting 設定、受控安裝腳本或 connector 預覽。`wrangler.jsonc` 宣告三組環境，各自綁定獨立的 D1；頁面右上、頁尾與登入卡顯示目前環境與建置時的提交短碼，`/api/environment` 不需登入即可讀到同樣資訊，供部署後從外部核對版本。

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

這是現有 Workers Builds 的錯誤排查設定，不代表 #31 的正式發布流程已完成。PR 分支由 GitHub CI 驗證，不使用 Cloudflare 自動分支 preview。測試站的固定網址與自動部署仍依 #28 建立；測試站建置用 `pnpm build:test`，同樣部署該次產生的 `dist/server/wrangler.json`。

2026-10-09 的 PR #36 失敗紀錄是 `npx wrangler preview` 查詢 `quiet-hours-npc-local`，得到 `10007: This Worker does not exist on your account`。這是預設 preview 部署讀到本機 Worker 名稱，不是依賴安裝或程式編譯失敗。不要為了排除此錯誤在雲端建立本機 Worker，或僅以 `--worker-name` 改名：preview 還需要獨立的 bindings、secrets 與 OAuth origin，目前專案沒有配置這套流程。

官方參考：[Workers Builds 分支設定](https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/)、[Vite plugin 環境選擇](https://developers.cloudflare.com/workers/vite-plugin/reference/cloudflare-environments/)。

測試站與正式站的部署流程分別由 [#28](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/28) 與 [#31](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/31) 建立。GitHub 登入已由本 PR 實作；啟用對外網址前仍需填入對應環境的秘密、套用 migration，並完成 #28 的部署與登入驗收。整體規格見 [Infra 工作票 #19](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/19) 與 [Infra 工作拆分](docs/design/infra-environments-ticket-plan.md)。舊 Sites 站保留作參考。

OpenRouter API 文件：https://openrouter.ai/docs/quickstart

模型內容並非保證符合世界觀；規則控制狀態更新，不保證每句台詞沒有錯誤。請透過紀錄檢查知情對象。

## OpenAI 直連

在模型設定選 OpenAI 直連，貼上官方 API Key。預設 `gpt-6-luna`、無額外推理；可切換 `gpt-6.1-sol`、low 推理。後端使用 Chat Completions 的 strict JSON Schema 格式，對需要新活動的 NPC 分別產生行動與持續時間。無 Key 不發出模型請求；API 使用由 Key 擁有者計費。

## 逐漸形成的生活習慣

AI 成功執行的自主行動按時段（深夜、上午、下午、晚上）、出發地點與行動種類累積。相同模式在三個不同世界日出現後，成為模型可參考的生活傾向；同一天重複行動只算一天。活動延續、規則試玩、無效行動與待回應的使用者介入不計入。

習慣保存於角色自己的世界狀態，重新整理後保留。最多保存 24 個模式，介面顯示前五個，包含形成中、已形成與正在淡化。近期 21 天的跨日證據決定強度，久未出現時每七個世界日強度減半；超過 30 天未出現的模式在下一次學習時清理。

模型只收到自己的、與當下時段及地點相關的已形成習慣，最多五個，作為偏好；沒有固定作息強制執行，也不把其他角色習慣或原始統計交給模型。學習由程式統計，不增加模型呼叫；傳入少量習慣文字仍會增加一些輸入 token。既有世界從新行動開始累積，不回填歷史事件。

## 活動計畫與自動推進（試用版）

- 休息、工作、思考與觀察可持續 15、30、60 或 90 世界分鐘；程式延續活動，避免重複對話、想法與記憶。移動、說話與私訊為一次性行動。
- 活動結束、切換模型，或角色知情的新對話、私訊、觀察者介入與在場者進出，會觸發重新決策。私密想法不會讓其他角色重新決策。
- 預設手動；按「開始自動」後每 30 秒推進 15 世界分鐘，可調整速度與世界時間間隔。請求與動畫完成後才排下一回合；離開前景分頁、重新整理、模型錯誤或用量達限時停止。已送出的回合會完成。
- 預設每小時最多 12 次 AI 呼叫，30,000 已回報 token 為停止門檻；可在介面調整。後端保存每個帳號的計數，即使重新整理也不重置。計量窗口自使用起持續一小時，之後歸零；累計統計保留。
- 呼叫次數包含失敗嘗試。供應商未回報用量時只計呼叫、不猜測 token；token 不是金額，也不包含其他應用程式使用的 API 額度。每次請求前檢查門檻，單次回覆可能超過 token 門檻。
- 為避免同回合新對話增加額外請求，需要決策時會預留可自主決策角色的呼叫空間。門檻不足或模型失敗會保留用量並回復世界回合，避免保存部分角色的行動。
- 世界仍保存最近 80 則角色記憶；一般模型請求收到最近 12 則、性格、目標與待回應介入；交還控制權後首次自主決策另有上述已知經歷。不提供長期摘要。
- 核心驗證：`node tests/run-activities.mjs`。使用模擬模型及記憶體 SQLite 資料庫執行實際保存 SQL，不發出付費 API 請求。

## 登入流程

首頁與世界 API 共用 GitHub 工作階段驗證；未登入時提供「用 GitHub 登入」，API 回 401。第一版僅允許設定白名單中的 GitHub 數字 ID，無匿名／共用世界或 Sites 身分 header 路徑。每環境使用自己的 OAuth App，D1 保存工作階段，24 小時到期，登出立即失效。OAuth callback 固定在 `/api/auth/github/callback`。

本機與雲端的完整設定與驗收步驟見 [GitHub 登入設定](docs/design/github-login.md)。尚需填入自己的秘密並實際驗證 GitHub 登入；模擬測試通過不代表真人登入已完成。

## 部署相容性

使用 GitHub 穩定數字 ID 作為世界鍵，不使用 email 或顯示名稱。新增登入資料表不刪除世界；不自動搬移舊 Sites 世界。靜態資源由 `ASSETS` binding 提供，登入入口與登出表單不依賴 JavaScript hydration。

# 像素觀察室

觀察者的介入以事件順序判斷是否待回應，每位角色只看到自己知情、且在上次行動之後收到的介入。下一次行動後即消費，避免固定回覆重複觸發。規則模式支援回家、前往已知地點、休息、泡茶；在目的地時直接私下回覆觀察者。Cass 的住處為暫住的 Kris 家，Vera 回自己的房間，Kris 回自己的家。GPT 決策收到獨立的 `pendingInterventions` 與 `home`，優先以行動或 `say` / `observer` 回應，也可說明拒絕或延後。觀察者回覆只寫入該角色記憶，不能藉此讓同地點的其他角色知情。既有事件可沿用，無需資料遷移。

地圖沿用 Kris 的住處、Vera 的房間、街角咖啡館三個既有地點。每次推進時間後，依照已儲存的行動依序播放：移動走過房門與街道，當面說話顯示對話泡泡，私訊、思考、休息與工作顯示動作提示。點角色同時選取狀態面板與介入對象。動畫播放時暫停下一次推進，避免回合重疊；重新載入直接呈現已儲存的位置。支援減少動態效果偏好。

`WorldEvent.scene` 為可選欄位，記錄行動前後地點、對象與當面說話內容。舊世界和舊事件可以繼續載入，無需資料庫遷移。私訊和私密想法不放入公共泡泡；原有知情範圍與記憶規則保留。

地圖與角色採測試外觀，非小說正式設定。使用內建 ImageGen 生成地圖與透明角色圖集，從圖集抽出角色，保留 alpha。素材保存於 `public/pixel/`：`night-map.png`、`cass.png`、`vera.png`、`kris.png`。素材風格提示為：夜色海軍藍與青綠、琥珀燈光、俯視屋頂剖面的三個相連空間；三位成人角色分別採橘紅開襟外套、銀髮藍裙、橄欖綠外套的像素 RPG 小人。實際路線按成品房門與空地座標配置。
