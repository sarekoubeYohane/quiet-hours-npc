# #289 AI 整理世界配置：逐項交付與證據

狀態：T8 可交整合及獨立審查，尚未關票，不代替 #281 全分支最終審查、完整固定套件或正式站驗收。開始前重新讀 GitHub #281／#289 本文、#289 留言（0）及原生 blocked-by（#288 已 closed）；從 integration `b9ece91` 建立獨立 `feat/ai-opening-arrangement-289`。已讀 AGENTS、Matt Pocock／issue-tracker、GLOSSARY、implement-spec、TDD 與相依參考、code-review／PR 技能及 ADR 0012 等既有初始化／權限／知情契約。沿已授權真頁、產品 API、磁碟 SQLite、受控 transport／骰邊界驗收。

產品實作 `3b3247ec3579a3ceac873072d39f8559fcb97e28`；合最新 integration `8176774` 後為 `bcff5f5`，整合內容僅 T1 唯讀導覽證據及狀態文件。接續 `03bd196` 更正方向無關的描述文案、`ef41488` 處理 pending 重載鎖定／失敗解鎖、`2fb450b` 保留前一份已存建議與名稱／步驟版本承接。最終產品固定 **`2fb450bb1c0ef3054b7695aebcd7a2efd9298af0`**，兩條真頁旅程與全部針對性檢查均以此產品樹重跑。最終真頁 CAS pin 的 origin、建置時間與 commit 見 [機器證據](assets/ai-opening-arrangement-289/evidence.json)。後續證據／README 提交不更改產品。

## 行為與保存責任

在五步開局的世界配置按「請AI整理本次開局」，使用已保存的描述、選定卡與精確場景版本快照；AI 只回受限配置候選，不可更改卡值、來源或世界。程式保留已填起點、住處、工作、所有權、需求、電量與關係等安排，新增空白與不衝突的建議。候選先存為獨立建議；使用者查看並修改，按「保存建議修改」，再明示「採納建議到開局草稿」。採納後仍可手動修改，最後沿同一開局確認及保存入口進觀察，第 0 回合不自動推進。可完全略過 AI。

`/api/opening-drafts/arrange` 綁原 raw owner／draft ID／版本／operation ID；內部 `arrange-opening` 沿帳號製作 operationScope、原 worldContext、既有租約／journal、帳號預算、Key 與 server 模型設定快照派送一次。pending 唯一索引及同一 SQL 的草稿寫入／建立 guard 阻止處理中另一份整理或舊頁覆寫。結果、原輸入快照與建議修改版號留在獨立 `opening_arrangements`，不塞進故事或原始開局；採納使用 T7 的 `saveOpeningDraft`、`prepareCity`、來源快照與相同合法性檢查，最終世界仍只由已保存 candidate 安裝。

## #289 驗收矩陣

| 驗收條件 | 外部可觀察證據與結果 |
| --- | --- |
| 使用已選卡與場所，保留明示內容，不重建／重骰 | 真卡形成／完成保存→場景→T7 草稿→AI；模型刻意提出不同起點／住處／工作／所有權／關係，server 保留原明示值。來源更新為 v2 後整理仍收到凍結 v1，重載建議不重派。真頁形成的 20 個受控 d6 已耗盡，之後整理、採納、確認／保存均無額外卡骰；卡值讀回一致 |
| 建議房間、物件、門、道路、關係可查看修改，不改來源或其他世界 | 真頁兩處同源場所；修改建議臥室、桌名／狀態、道路分鐘、關係描述並保存，重載仍相同。建議尚未採納時原草稿 city 不變；來源卡及 scene GET 保持原值，世界直到最終確認才建立。新增空間編輯器亦可供手動配置使用 |
| 缺設定原頁面板、取消／失敗／回覆 lost 保留 | 真頁清 Key 後點整理→原頁面板，取消保留描述；保存 Key 返回不自動派模型。整理提交前 503，transport 仍只有形成一次；按原操作恢復，實際 model 結果已保存的回覆故意中斷，再以原 owner GET 讀回，沒有新增派送。建議修改 503 保留本頁輸入，採納已提交回覆 lost 亦讀回原採納結果 |
| 與手動共用驗證，不繞過權限／知情／可達性 | API 把建議改成缺失房間，保存可見 preview.issues，採納回 422，原草稿不變；修正後採納成功。所有 candidate 用 `prepareCity` 與 T7 已凍結 access／來源版本、openingKnowledge、道路驗證，AI 不直接寫 permissions／knowledge 世界欄位。未提道路不隱式連接 |
| durable、去重、CAS、失敗及慢回覆不自動付費重試 | API 慢回覆期間另一個整理／草稿更新回 409；外帳號原 scope POST／GET 均 409。原 operation 重送復用結果，已改草稿不能再採納舊版。模型壞格式 settled failed 保留原稿與實際用量，同 ID 不再派送；缺 Key 保存設定不自動重試。再整理失敗後仍可在重載頁取回前一份已存建議；單純更名／往返步驟不失效或要求付費重生，實質配置／描述更新才拒絕舊採納。磁碟 server／DB 關閉重開後 GET／原 ID replay，0 模型／0 卡骰 |
| 候選採納後與確認頁／實際 DB 保存一致 | 真頁修改、保存、重載、採納後到步 4／5，畫面顯示改名房間、圓桌、12 分鐘道路、使用者關係及電量 30；保存後觀察 turn 0。原確認 candidate 與從已保存原請求重讀的 world 全量 deepEqual；GET world 另核對卡值、回合與物件。模型設定的 GET effective projection 不當作故事寫入 |

額外真頁 CAS 反例：本頁尚未同步的圓桌輸入，另一頁透過真 API 先存「另一頁已存木桌」；本頁重送回 409，仍顯示圓桌，沒有用 GET 靜默覆寫。使用者明示重載後才見另一頁內容，再修改保存。另以磁碟 SQLite BEFORE UPDATE trigger 注入採納前保存錯誤，API 503、原草稿與 complete proposal 保持；移除故障後同一 request 成功，原 request 再重播不另採納／派模型。

新增真頁 pending／手動略過旅程：慢模型派送後重載，原 pending 手動欄位與步驟鎖定，但原恢復按鈕仍可按；原模型完成後明示恢復同一結果、解除鎖定。再明示一個壞格式模型請求，已知 failed 立即解除鎖定，下一步可用，且重載仍可明示取回先前已保存建議（不派模型）。隨後實際手動完成世界。另以同卡另開合法草稿、清 Key→面板取消→直接手動確認／保存 turn 0，沒有模型新增。此旅程 transport 3 次（形成、原整理、明示失敗），付費 0；原完整編輯／CAS／採納旅程在新鎖定產品樹亦重新 PASS。

## RED → GREEN 與檢查

- 首個真旅程在舊分支整理路由為 404；新增受限候選、durable operation 與明示採納後，真 API 建立、確認及保存通過。
- 建議修改的首個行為測試原回 400（沒有 edit 契約）；增加 proposal revision CAS、保存重讀及採納 guard 後通過。
- pending 重載真頁原顯示可編輯，與原操作恢復可能互相覆寫；鎖住原 pending 的手動欄位及步驟，保留恢復入口，已知 failed 解鎖後，原反例及缺 Key／失敗後手動保存皆 GREEN。
- 後一次 AI 失敗原只顯示最新 failed，先前結果雖在 DB 但無產品取回接點；新增 scoped 前次建議讀回與明示取用，真 API 及重載真頁 GREEN。單純名稱／步驟變更沿原建議，採納仍 CAS 核對最新草稿與原配置內容。
- 首兩輪 browser 中斷是測試 selector 未沿現有 aria-label（住處、建議人物欄位）；依實際具名欄位修正／補具名可及性後重跑。沒有把中斷推定為未知產品導覽根因，亦不代替 T1 正式站查證。

```sh
node --test tests/ai-opening-arrangement.test.mjs tests/opening-wizard.test.mjs tests/character-cards.test.mjs tests/model-settings.test.mjs
node tests/run-activities.mjs tests/world-saves-api.test.cjs tests/operations-api.test.cjs tests/save-management-api.test.cjs tests/city-creation-api.test.cjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t8-browser-complete node tooling/verification/browser-ai-opening-289.mjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t8-pending-final node tooling/verification/browser-ai-opening-pending-289.mjs
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

最終固定產品相關 API 組 **51／51**（含本票 **9／9**，包含真正 SQLite 採納前故障與原請求恢復）。世界／操作／另存管理／城市回歸 **40／40**。完整編輯／真 CAS／採納旅程及 pending 重載／失敗解鎖／缺 Key 取消後手動完成旅程皆 PASS。早期 49 項及分開補證只保留為歷程，沒有與本次固定組混算。Typecheck、build、diff check 通過；lint 0 errors／4 個既有 warnings，沒有新增 warning。全專案 final fixed full 及兩軸由整合者後續執行。

真頁固定 transport **2 次**：合法完成卡形成一次、開局整理一次；編輯／重載／採納／保存／恢復均不派模型，付費 **0**。僅 auth cookie、Cloudflare hosting、模型 HTTP 及骰亂數邊界受控，其餘是真頁路由／產品 API／磁碟 SQLite，全程禁止外部模型網路。沒有安裝 fixture 世界冒充使用者建立。

## 畫面與機器資料

- [建議修改與未採納狀態](assets/ai-opening-arrangement-289/proposal-edited.png)
- [另一頁 CAS 衝突保留本頁輸入](assets/ai-opening-arrangement-289/proposal-conflict.png)
- [採納後確認頁](assets/ai-opening-arrangement-289/confirmation.png)
- [保存後第 0 回合觀察](assets/ai-opening-arrangement-289/saved-observation.png)
- [origin／commit／身分與次數邊界](assets/ai-opening-arrangement-289/evidence.json)
- [pending 重載鎖定](assets/ai-opening-arrangement-289/pending/pending-reload.png)、[原操作恢復](assets/ai-opening-arrangement-289/pending/pending-restored.png)
- [已知失敗後可手動繼續](assets/ai-opening-arrangement-289/pending/known-failure-manual.png)、[缺 Key 取消後可手動完成](assets/ai-opening-arrangement-289/pending/missing-key-cancel-manual.png)
- [重載取回前次已存建議](assets/ai-opening-arrangement-289/pending/prior-proposal-restored.png)、[pending／手動略過證據](assets/ai-opening-arrangement-289/pending/evidence.json)

## 真 Wrangler 本機 D1 遷移與回退限制

新增 additive `0020_opening_arrangements.sql`：owner／draft／operation 複合鍵、原版本與請求／快照、pending／complete／failed／adopted 狀態、候選、revision、錯誤與採納收據；每草稿同時至多一個 pending。這是恢復資料，世界及 immutable 原始開局只存已確認 city／卡／場景快照，不複製 Key、實際帳號用量或本表收據。既有另存／刪除回歸 40 項通過；未另宣稱本票對 AI 產生世界再重跑一整套外部記憶服務驗收。

已用真正 Wrangler 的獨立 fake DB config 及 `/tmp/quiet-hours-t8-d1/{fresh-state,upgrade-state}`，所有命令明示 `--local`、沒有 remote。空庫 17 份 SQL 全成功；升級庫先套至 0019，再以 Wrangler 插入明示歷史遷移 fixture，然後只補 0020。Readonly SQLite 核對 legacy state／原 D20 journal／version 42／lease 1700000430000／city_started 與 original_opening=null 前後完整 hash：

`a781915bc7a24e1844cbbb4f34a3cbf94c83ba5915881127dedd931f1ac8fb54`

前後相同，新表 rows=0，partial unique index 存在。migration fixture 只驗舊列保留，不作產品建立證據。完整 [D1 hash／命令／結構](assets/ai-opening-arrangement-289/d1-migration-evidence.json)、[空庫](assets/ai-opening-arrangement-289/t8-d1-fresh.log)、[前置 0019](assets/ai-opening-arrangement-289/t8-d1-pre20.log)、[歷史 fixture](assets/ai-opening-arrangement-289/t8-d1-legacy.log)、[0020 升級](assets/ai-opening-arrangement-289/t8-d1-0020.log)皆保留。

程式更新前須先套 additive migration。回退須保留已保存世界、草稿與本表 pending／結果／採納依據；舊程式不理解 AI 整理恢復狀態，不可透過刪表、換 ID 重送或複製故事重置真實用量。正式回退與服務中斷後的長期外部恢復未演練，沒有正式遷移／部署／世界推進或刪除。

## 未驗範圍

受控模型只證明受限候選、採納、驗證與保存接合；**不代表真實模型語義品質已通過**。未使用真人 OAuth／真跨裝置部署／正式世界，不宣稱整份 #281、T1 正式站導覽或 PR 最終套件完成。高容量內容仍沿既有有界模型輸入／輸出限制，無效或超限保留原輸入並可手動完成；沒有新增付費自動重試或產品配額。
