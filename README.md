# Quiet Hours · NPC 觀察室

一個每帳號獨立的 NPC 生活模擬原型。React / Vinext 提供介面，Cloudflare Worker 處理行動，D1 保存世界進度。每個帳號有獨立世界。

- 四位測試角色（Cass、Vera、Kris、咖啡店主）、三個地點；手動推進 15 或 30 分鐘。
- 規則模式以固定行為序列試玩。OpenAI 直連或 OpenRouter 模式在需要新活動時對 NPC 呼叫模型，活動延續期間不重複詢問，按供應商費率計費。
- Key 在 D1 加密保存，供同帳號、同環境的瀏覽器共用，最長 24 小時；登出只撤銷目前登入，手動清除則停止所有瀏覽器後續的模型呼叫。Key 不存入世界或紀錄。啟用前須套用 migration 與加密秘密，見 [模型 Key 管理](docs/design/account-model-keys.md)。
- 每個角色只收到自己的性格、目標、關係、記憶與主觀觀察；現場人物依區域、門與遮擋決定是否看見。私密想法僅自己知情；訊息僅收發雙方；隔門聲音不揭露說話者身分或逐字內容。
- 位置與門由世界規則更新。移動、開關門耗掉一個回合；當面說話需能看見對象。工作限泡茶、整理與畫髮飾。
- 角色最近 80 則記憶、最近 300 則事件持久保存。尚無長期摘要、關係數值成長或離線持續運行。
- 世界更新用資料庫租約與版本條件避免平行回合覆蓋。最終保存確認零列衝突時，只把本次已付費嘗試與回報 token 差額原子加入最新世界，不覆蓋角色進度或較新租約；累計用量保留，過期請求不改寫較新的小時計量窗口。資料庫拋錯且提交結果不明時不重播差額，避免重計；資料庫全面中斷或工作程序終止的用量持久性仍需要另行加入冪等帳本。
- 角色設定來自對話中的概念測試，非小說正史。

## 工作票與驗收狀態（2026-10-12）

| 項目 | 程式狀態 | 仍待驗收／開放工作 |
| --- | --- | --- |
| 共用 Playbook／意圖／店主控制 | [PR #6](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/6) 已合併，#1–#5 已關閉 | 真人模型與部署環境操作由後續整體驗收追蹤 |
| D20 行動判定 P1 | [PR #20](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/20) 已合併，#8–#13 已關閉 | 僅限現有髮飾／社交可試玩切片；未涵蓋通用行動與完整真實 GPT 驗收 |
| 感知咖啡館 PoC | [PR #47](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/47) 已合併，#41–#46 已關閉 | 目前是受限地圖與感官 PoC；不含長期信念修正 |
| GitHub 登入 | [PR #35](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/35) 與修補 #36／#38 已合併 | [#23](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/23) 保留作本機／測試站及正式登出真人驗收；正式站已回報成功登入 |
| 帳號模型 Key | [PR #39](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/39) 已合併 | [#26](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/26) 依 10/09 修訂為同帳號跨瀏覽器共用，待部署配置與雙瀏覽器真人驗收 |
| Infra 其餘工作 | #22 已完成 | [#21](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/21)、[#24–#25](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/24)、[#27–#32](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/27) 尚有工作，尤其共用用量帳本、正式測試站 CI、伺服器排程與正式發布 |
| 長期記憶／信念修正 | #52 短期與選留已由 #61 合併；#53 已由 PR #63 合併；#54／#55 依各自 PR 交付 | [#16](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/16)、[#18](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/18) 保持 Open；[#7](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/7)、[#19](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/19) 為未全部完成的母規格 |

上述「已合併」不等於已部署到所有環境；以 GitHub PR、部署版本與各 Issue 的驗收紀錄為準。

## 共用 Playbook、意圖與店主控制

[#1 規格](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/1) 的四項工作已由 [PR #6](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/6) 於 2026-10-08 合併至 `main`，#1–#5 已關閉。合併後的 48 項測試、型別檢查、建置與跨日模擬通過；店主介面點按及真實模型表現仍待驗證。已合併的程式與正式網站版本分開管理，詳見 [合併後驗證紀錄](docs/verification/npc-playbook-2026-10-08.md)。

所有角色共用 `lib/playbook.ts` 的生活判斷原則，各自保留意圖佇列。模型同次回覆意圖與下一步，按角色性格排列最多 12 個意圖，記錄強度、重要程度、急迫性與等待背景；程式不另作固定評分或過期倒數。角色狀態面板唯讀呈現意圖，舊世界相容載入空佇列並加入獨立測試店主。

收到新事情後，模型可更新佇列並繼續原活動，保留原進度及完成時間；也可切換活動。同一已看過的消息不在延續回合重複決策或產生記憶與習慣證據。

店主支援單次指定下一行動、暫時接管與交還控制權。接管且沒有指令時店主待命，其他角色繼續生活；指定行動保留意圖且不計為自主習慣。交還後首次自主模型請求會取得原佇列、當前狀態、最近 12 則記憶，以及控制期間另行保留的最近 80 則已知經歷；不包含未執行指令或他人的私密事件。該經歷緩衝在首次自主決策成功提交後清除，失敗時保留供重試。這是有界上下文，不是長期摘要；更早經歷仍可能超出保存上限。

## D20 行動判定

本段描述已由 [PR #20](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/20) 合併、並已關閉的 [行動判定工作票 #8–#13](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/8) 的受限實作。感知使用同一套 D20 結果門檻，功能與資訊邊界見下節；長期記憶與信念修正仍待另外設計。

- 已支援的髮飾設計挑戰與說服使用 D20；容易 DC8、普通 DC12、困難 DC16，能力修正 −4／−2／0／+2／+4。結果按差值分為大成功 ≥8、成功 0～7、部分成功 −6～−1、失敗 −10～−7、大失敗 ≤−11；天然 1、20 無特權。
- 角色可從設定的自然語言能力標籤取得相應修正；不同挑戰難度與能力分開。普通工作仍直接完成，不擲骰。
- 髮飾成果會保存狀態與來源事件；在同樣條件、同一主題與方法下重試不會洗骰。研究場景中既有的布料與髮飾參考後可換方法。
- 社交說服由主動者擲一次骰，目標的意願、關係及下一步由對方自己決定；同樣條件反覆說服不重擲。
- 觀察者事件頁可以看見客觀結果及骰值，NPC 的模型上下文不會取得骰值與內部級別；新的行動結果不會替 NPC 自動新增意圖。
- 這是**限定在現有工作與社交行動上的可試玩切片**，尚未具備通用自由技能、物件互動、模型自由生成後果或完整 AI 模型真人試玩驗收。

詳見 [PR #20](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/20)。

## 感知咖啡館 PoC

[PR #47](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/47) 已合併至 main，實作 [#41 規格](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/41) 的 #42–#46，相關工作票已關閉。驗證包含 129 項自動測試與隔離的桌機／手機 Chromium 操作；未進行付費模型呼叫，亦不代表已部署到所有環境。

咖啡館提供前台、儲藏室與一扇門，其餘場所維持單區域；配置資料可替換。明顯線索直接察覺，不確定線索依環境、受控能力標籤與活動注意力綜合 D20 判定一次。關門阻擋跨區視線；聽到動靜不等於知道是誰或發生什麼事。舊世界補安全預設，不補發歷史事件。

店主可在直接控制中選擇「主動查探」、查看／聆聽方式及附近已知目標，再推進時間執行。查看只取得當前可見的人物；聆聽只取得仍在持續的工作聲響，不能重聽已消失的對話或腳步。相同有效條件、換文字、持續觀察、重新載入及回到已處理條件不重新擲骰；開門、移動或新線索可能提供新的機會。

店主也可選擇「大聲說話」。隔著關門可聽到匿名喊聲；只有確實聽清的明確警告會提高主觀關注的急迫性，不會在世界中建立危險事實。

模型在同次活動決策附上最多 12 條關注條件，依主觀線索匹配；例如等 Vera 時，未知腳步不直接匹配 Vera。角色仍自行選擇續做或切換活動。大失敗可按情境與已有期待加權抽出誤聽／誤看或沒有對應刺激的感受，無合適候選就沒有新線索；錯誤感受不改變真實世界，也不強制下一個行動。

生活紀錄的「感知詳情（觀察者）」顯示各角色的感官、來源、清晰度、骰子及錯誤結果；角色狀態另有關注與決策詳情。這些診斷不送入 NPC 模型。感知、去重、候選抽選與詳情都由程式執行，不額外呼叫模型；主觀觀察仍會增加模型輸入文字。接管／待命期間照常保存感知，動作由使用者決定；交還不補發未知真相。

觀察、機會、抽選結果及決策使用進度跟世界一起保存，模型失敗或保存衝突時一致回復。最小觀察保存不等於長期 Memory & Belief：來源信任、信念確信與認知修正仍留待 #16／#18。這是小型感知原型，沒有完整地圖重做、聲學模擬或背景感知排程。

## 記憶選留（#52）

NPC 的主觀經歷共用短期容量（最多 80 筆／64 KiB，包含未處理觀察與接管經歷），並在既有自主決策中，以穩定 ID／版本和簡短理由選留原片段到長期。未選留內容繼續暫存；短期滿額依最舊順序淡去，長期最多 64 筆／64 KiB 且不自動淘汰。單筆短／長期文字上限為 4096 bytes，以容納既有合法 500 字中文訊息；輸入與保存另有總量驗證。

舊文字標為來源未分類，既有主觀觀察與關係保守保留；GET 不寫回或呼叫模型。選留結果由世界 API 讀回，隨世界版本與操作日誌一致保存。無效選留或中途失敗回復整回合，保留已知模型用量；接管、待命及純活動續做不為記憶新增呼叫。異常超限舊資料會明確報錯，原存檔不會被截斷或清空。

[#50 規格](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/50) 與 [記憶實作契約](docs/design/npc-memory-contract.md) 記錄完整設計。#51 已完成、[#61](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/61) 已合併 #52。本分支實作信念與關係標籤（#53），待獨立 PR 審查／合併；摘要／遺忘（#54）與主動回想（#55）仍未包含。#56 UI 尚未批准，沒有新增記憶頁面；服務選型不代表已開通或授權付費試跑。

## 信念與關係標籤（#53，已合併）

NPC 在原本的自主決策中，可以新增、更新、堅持或撤回自己的短信念，使用存疑（`doubtful`）、傾向相信（`leaning`）、深信（`certain`）表示主觀確信。經歷被記住不代表被相信；不同確信程度不強制角色採取某個意圖或行動。模型先重新理解情境、調整意圖，再選擇既有合法行動；同次心理解讀產生現在的情緒，包含重新評估後選擇繼續原活動的情況。

人物關係改用多項自由短標籤，能按料理、私密談話等情境表達不同信任。舊關係整句保守保留為來源未分類的單筆標籤，不自行拆成信念；首次認知候選成功時才保存正式欄位。相同主題優先更新既有 ID，變更或堅持均附短理由；相反信念可明示為未解矛盾共存，不能由程式默默刪掉其中一邊。

每 NPC 現行信念最多 24 筆／16 KiB，關係標籤最多 32 筆／12 KiB；輸入按在場人物、已知來源與當前意圖選最多 8 個相關標籤，沒有完整關係網向量搜尋。更正痕跡只保存有限 ID、版本、狀態與短理由，舊信念全文不送回模型。容量壓力下提供最多 8 個有限整理候選；模型可明示釋放未被現行認知引用的歷史中介資料，不能自動淘汰現行信念、標籤或解決矛盾。記憶選留及認知更新共用每次 4 項／8 KiB 輸出與 88 KiB 輸入預算。

正式結果在 `GET /api/world` 的 `world.characters[].cognition` 讀回；`relationships` 是現行關係標籤的舊介面投影。撤回標籤後不會重新灌入舊關係文字。引用只能來自本次模型實際看見的自己資料及有效版本；無效候選回復整回合，保留已付用量，同 operationId 重放原結果。接管、待命與純活動延續不為認知整理增開呼叫。自動驗證與尚待真人模型／部署驗收的限制見 [#53 驗證紀錄](docs/verification/npc-memory-53-2026-10-14.md)。

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

## OpenAI 直連

在模型設定選 OpenAI 直連，貼上官方 API Key，按「保存 Key（24 小時）」。同帳號在本站的其他瀏覽器可按「重新檢查 Key」取得設定狀態，不需再貼。預設 `gpt-6-luna`、無額外推理；可切換 `gpt-6.1-sol`、low 推理。後端使用 Chat Completions 的 strict JSON Schema 格式，對需要新活動的 NPC 分別產生行動與持續時間。無有效 Key 不發出模型請求；API 使用由 Key 擁有者計費。完整設定、期限與驗收步驟見 [模型 Key 管理](docs/design/account-model-keys.md)。

## 逐漸形成的生活習慣

AI 成功執行的自主行動按時段（深夜、上午、下午、晚上）、出發地點與行動種類累積。相同模式在三個不同世界日出現後，成為模型可參考的生活傾向；同一天重複行動只算一天。活動延續、規則試玩、無效行動與待回應的使用者介入不計入。

習慣保存於角色自己的世界狀態，重新整理後保留。最多保存 24 個模式，介面顯示前五個，包含形成中、已形成與正在淡化。近期 21 天的跨日證據決定強度，久未出現時每七個世界日強度減半；超過 30 天未出現的模式在下一次學習時清理。

模型只收到自己的、與當下時段及地點相關的已形成習慣，最多五個，作為偏好；沒有固定作息強制執行，也不把其他角色習慣或原始統計交給模型。學習由程式統計，不增加模型呼叫；傳入少量習慣文字仍會增加一些輸入 token。既有世界從新行動開始累積，不回填歷史事件。

## 活動計畫與自動推進（試用版）

- 休息、工作、思考與觀察可持續 15、30、60 或 90 世界分鐘；程式延續活動，避免重複對話、想法與記憶。移動、說話與私訊為一次性行動。
- 活動結束、切換模型、私訊或觀察者介入會觸發重新決策。新主觀觀察只有符合角色關注條件或屬直接互動、已察覺危險／強刺激時才提前評估；一般線索等待正常決策。每個角色每輪最多一次模型行動決策，較晚到達的線索保存到下輪。私密想法不會讓其他角色重新決策。
- 預設手動；按「開始自動」後每 30 秒推進 15 世界分鐘，可調整速度與世界時間間隔。請求與動畫完成後才排下一回合；離開前景分頁、重新整理、模型錯誤或用量達限時停止。已送出的回合會完成。
- 預設每小時最多 12 次 AI 呼叫，30,000 已回報 token 為停止門檻；可在介面調整。後端保存每個帳號的計數，即使重新整理也不重置。計量窗口自使用起持續一小時，之後歸零；累計統計保留。
- 呼叫次數包含失敗嘗試。供應商未回報用量時只計呼叫、不猜測 token；token 不是金額，也不包含其他應用程式使用的 API 額度。每次請求前檢查門檻，單次回覆可能超過 token 門檻。
- 為避免同回合新對話增加額外請求，需要決策時會預留可自主決策角色的呼叫空間。門檻不足或模型失敗會保留用量並回復世界回合，避免保存部分角色的行動。
- 世界仍保存最近 80 則角色記憶；一般模型請求收到最近 12 則、性格、目標與待回應介入；交還控制權後首次自主決策另有上述已知經歷。不提供長期摘要。
- 核心驗證：`node tests/run-activities.mjs`。使用模擬模型及記憶體 SQLite 資料庫執行實際保存 SQL，不發出付費 API 請求。

## 登入流程

首頁與世界 API 共用 GitHub 工作階段驗證；未登入時提供「用 GitHub 登入」，API 回 401。第一版僅允許設定白名單中的 GitHub 數字 ID，無匿名／共用世界或 Sites 身分 header 路徑。每環境使用自己的 OAuth App，D1 保存工作階段，24 小時到期，登出立即失效。OAuth callback 固定在 `/api/auth/github/callback`。

本機與雲端的完整設定與驗收步驟見 [GitHub 登入設定](docs/design/github-login.md)。正式站於 2026-10-09 已由使用者確認成功登入；這不代表本機／測試站的真人 OAuth／登出流程已驗收通過，請參考 [#23](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/23)。其他環境仍需依設定文件填入各自 Secrets。

## 部署相容性

使用 GitHub 穩定數字 ID 作為世界鍵，不使用 email 或顯示名稱。新增登入資料表不刪除世界；不自動搬移舊 Sites 世界。靜態資源由 `ASSETS` binding 提供，登入入口與登出表單不依賴 JavaScript hydration。

# 像素觀察室

觀察者的介入以事件順序判斷是否待回應，每位角色只看到自己知情、且在上次行動之後收到的介入。下一次行動後即消費，避免固定回覆重複觸發。規則模式支援回家、前往已知地點、休息、泡茶；在目的地時直接私下回覆觀察者。Cass 的住處為暫住的 Kris 家，Vera 回自己的房間，Kris 回自己的家。GPT 決策收到獨立的 `pendingInterventions` 與 `home`，優先以行動或 `say` / `observer` 回應，也可說明拒絕或延後。觀察者回覆只寫入該角色記憶，不能藉此讓同地點的其他角色知情。既有事件可沿用，無需資料遷移。

地圖沿用 Kris 的住處、Vera 的房間、街角咖啡館三個既有地點。每次推進時間後，依照已儲存的行動依序播放：移動走過房門與街道，當面說話顯示對話泡泡，私訊、思考、休息與工作顯示動作提示。點角色同時選取狀態面板與介入對象。動畫播放時暫停下一次推進，避免回合重疊；重新載入直接呈現已儲存的位置。支援減少動態效果偏好。

`WorldEvent.scene` 為可選欄位，記錄行動前後地點、對象與當面說話內容。舊世界和舊事件可以繼續載入，無需資料庫遷移。私訊和私密想法不放入公共泡泡；原有知情範圍與記憶規則保留。

地圖與角色採測試外觀，非小說正式設定。使用內建 ImageGen 生成地圖與透明角色圖集，從圖集抽出角色，保留 alpha。素材保存於 `public/pixel/`：`night-map.png`、`cass.png`、`vera.png`、`kris.png`。素材風格提示為：夜色海軍藍與青綠、琥珀燈光、俯視屋頂剖面的三個相連空間；三位成人角色分別採橘紅開襟外套、銀髮藍裙、橄欖綠外套的像素 RPG 小人。實際路線按成品房門與空地座標配置。


### 多頁面操作與網路重試

世界變更現在帶持久操作 ID；同一操作重送會回傳原結果，不重複推進或呼叫模型。租約競爭會短暫等待，逾時及重整後可按「重試未完成操作」。回前景與成功後讀取最新世界，舊快照不使畫面版本倒退。部署前須套用 `0003_world_operations.sql` 並重新載入瀏覽器。保留範圍、失敗邊界及升級/回退注意見 [操作重送設計](docs/design/world-operations.md)；[驗證紀錄](docs/verification/world-operations-2026-10-12.md)。
