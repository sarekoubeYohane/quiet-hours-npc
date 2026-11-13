# 架構地圖

給接手的工程師與 agent 用的找檔地圖：先看「我要改 X，去哪找」，再看對應分組的檔案表。
本文描述 `main` 上**已實作**的程式結構；設計意圖與已確認但未實作的內容見 [docs/README.md](docs/README.md)。

讀之前先知道三件事：

- **不要用行號定位。** 原始碼單行可達數千字元（`lib/world.ts` 的 `World`／`Character` 型別各是一行），請用符號名搜尋。
- **檔名常常會誤導。** 動手前先看[檔名陷阱](#檔名陷阱)。
- **舊世界與新世界並存。** 多數模組都有相容分支，開關見[版本與相容分支](#版本與相容分支)。

## 總覽

React 介面由 vinext（Vite 上的 Next App Router 相容層）提供，執行在 Cloudflare Workers，資料存 D1。沒有 middleware，登入檢查寫在每個 route 與 page 內。`next.config.ts` 是空的，實際設定在 `vite.config.ts` 與 `wrangler.jsonc`。

| 路徑 | 內容 |
| --- | --- |
| `app/` | 頁面與 API route。`app/api/world/route.ts` 是所有世界變更的單一入口 |
| `lib/` | 全部領域邏輯，約 110 個檔，平鋪不分子目錄 |
| `components/` | 自家 React 元件。`components/ui/` 是 vendored shadcn，自家只用到 `button`、`select`、`alert-dialog` |
| `db/schema.ts`、`drizzle/` | 資料表宣告與 migration SQL |
| `tests/` | 整合測試與手寫 runner，見 [docs/testing.md](docs/testing.md) |
| `tooling/` | 部署守門腳本、瀏覽器驗證 runner、診斷與實驗腳本 |
| `docs/` | ADR、設計契約、驗證紀錄，見 [docs/README.md](docs/README.md) |
| `public/characters/`、`public/pixel/` | 角色素材（現行）與舊版像素圖 |
| `.agents/skills/` | Matt Pocock 工程技能副本，見 `docs/agents/matt-pocock.md` |

Worker bindings：D1 `DB`、靜態資源 `ASSETS`。`wrangler.jsonc` 頂層是本機，另有 `env.test`、`env.production`。秘密的鍵名見 `config/local-auth.example` 與 `cloudflare-env.d.ts`。回想功能需要的 `RECALL_USAGE_DB`、`MEMORY_VECTOR_INDEX` 沒有綁在 `wrangler.jsonc`，所以三個環境預設都是關閉的。

## 責任分工

天上意志是世界主持的責任，像 TRPG 的 GM：維持世界、界定角色可知的資訊、接收提案、協調裁定並一致保存。它由程式與受約束的模型任務組成，不是世界內的角色。

- **NPC 決定想做什麼**，世界主持承接嘗試，NPC 再依自己得知的結果選擇下一步。
- **裁定模型不擲骰**、不指定最終結果級別、不替其他角色決定是否同意。擲骰與計算都由程式做。
- **模型拿不到完整的 `World`。** 程式先投影出角色所知，`model-adapter.ts` 只收到篩選後的訊息與 schema。
- **世界只能經受限效果改變。** `world-effects.ts` 檢查供應、身分、權限、位置與版本後才執行，不接受任意的世界 patch。
- **技術回復與遊戲內中斷是兩件事。** 回合技術失敗時回復本回合候選並保留已知費用，先前已提交的事實仍然存在。
- **操作證據與決策追溯只給觀察者看**，不進入 `World` 或 NPC 的上下文（[ADR 0004](docs/adr/0004-operation-evidence-stays-outside-story.md)）。感知與知情的邊界見 [ADR 0001](docs/adr/0001-perception-uses-known-clues.md)。

## 我要改 X，去哪找

| 想做的事 | 從這裡開始 |
| --- | --- |
| 回合怎麼推進、哪個角色要重新決策 | `lib/activities.ts` 的 `advanceActivities` |
| 單一角色活動的開始、延續、取消、睡醒 | `lib/activity-lifecycle.ts`；暫停與復工在 `lib/paused-activities.ts` |
| 送給 NPC 模型的輸入 | `lib/npc-input.ts` 的 `normalDecisionInput`，底層視角是 `lib/world.ts` 的 `perception()` |
| NPC system prompt | `lib/models.ts` 串接；共用原則在 `lib/playbook.ts`，各子系統的 `*Prompt` 在各自檔案 |
| NPC 輸出的 JSON schema 與契約版本 | `lib/npc-decision-schema.ts`（`npc-decision.v3`） |
| NPC 輸出的驗證 | `lib/models.ts` 內部的 `parseDecision`，再委派各子系統的 parser |
| 實際打模型 API | `lib/model-adapter.ts` 的 `requestModel`，全專案唯一的 LLM HTTP 出口 |
| 骰子與檢定（D20 與 d100） | `lib/action-checks.ts` 的 `resolveActionCheck`；`lib/d20.ts` 只有 D20 與共用的 `Resolution` 型別 |
| 天上意志的裁定 | `lib/adjudication.ts`（呼叫）、`lib/adjudication-contract.ts`（schema 與 parser）、`lib/adjudication-limits.ts`（上限） |
| 物件效果的檢查與提交 | `lib/world-effects.ts` 的 `commitFreeAction`、`commitActivityPhase`；狀態讀寫在 `lib/world-state.ts` |
| 說話、移動、開關門等確定性行動 | `lib/world.ts` 的 `resolve()` |
| 看得見誰、聽得到什麼 | `lib/perception.ts`；關注條件在 `lib/attention.ts` |
| 記憶的容量、選留、整理 | `lib/memory.ts` |
| 信念與關係標籤 | `lib/cognition.ts` |
| 追求（資料欄位叫 `Character.intents`） | `lib/pursuits.ts`、`lib/pursuit-selection.ts` |
| 身體需求 | `lib/needs.ts`（入口與舊版）、`lib/body-needs-policy.ts`（個人化 v2） |
| 精神電量 | `lib/mental-energy.ts`（入口）、`lib/formal-mental-policy.ts`（正式政策） |
| 手機、行事曆、提醒 | `lib/phones.ts`、`lib/phone-calendar.ts`、`lib/phone-notifications.ts` |
| 日常規則（泡茶等） | `lib/routine-rules.ts`（入口），見[日常](#日常規則) |
| 建立新世界 | `lib/city-creation.ts` 的 `prepareCity`、`lib/opening-drafts.ts` 的 `confirmOpening` |
| 人物卡與數值形成 | `lib/character-formation.ts`、`lib/character-cards.ts` |
| 存檔的另存與刪除 | `lib/save-management.ts`；存檔身分與綁定在 `lib/world-saves.ts` |
| 預算、用量、費用 | `lib/player-account-budget.ts`（帳號帳本）、`lib/usage-recovery.ts`、`lib/costs.ts` |
| 模型 Key 與模型設定 | `lib/model-keys.ts`、`lib/model-settings-store.ts` |
| 登入 | `lib/auth.ts` |
| 回合時間預算（400／430／445 秒） | `lib/round-time-policy.ts` |
| 決策追溯與操作證據 | `lib/decision-traces.ts`、`lib/decision-trace-capture.ts`、`lib/operation-evidence.ts` |
| 觀察頁介面 | `components/world-app.tsx`；人物狀態卡在 `components/character-status-board.tsx`，回合紀錄在 `components/round-log.tsx` 與 `lib/observation-log.ts` |
| 開局精靈介面 | `components/opening-wizard.tsx` |
| 樣式 | `app/globals.css`，以手寫語意 class 為主（`.panel`、`.opening-*`、`.analysis-*`） |
| 新增資料表或欄位 | `db/schema.ts`、`drizzle/`，並依 [docs/testing.md](docs/testing.md) 手動登記到測試 |

## 一個回合的請求流程

`POST /api/world`（`operation: "advance"`）在 `app/api/world/route.ts` 的 `mutateWorld` 內依序進行：

1. **驗證**：`lib/auth.ts` 的 `getGitHubUser`，再檢查 Origin。
2. **綁定存檔**：`lib/world-saves.ts` 的 `bindWorldSave` 取得 `storageOwner`；body 的 `operationScope` 必須與它相符。
3. **冪等**：`operationId`（格式為 13 位毫秒時間加 UUID）已有收據就回放原結果；仍在處理回 409；租約過期則標為結果不明並回補用量。
4. **解析模型設定**：`lib/model-settings-store.ts` 的 `readEffectiveModels`（存檔 → 帳號 → 舊世界設定）與 `lib/model-keys.ts`。
5. **取得租約**：對 `worlds` 做一次帶 `version`、`operations`、`state` 條件的 UPDATE，寫入 `locked_until`。
6. **建立證據與追溯**：`createOperationEvidence`、`createDecisionTrace`。
7. **推進**：`lib/activities.ts` 的 `advanceActivities`。它本身不做 I/O，模型呼叫由 route 以 callback 注入。
8. **每次派送前檢查預算**：`lib/player-account-budget.ts` 的 `playerBilling`，並重新確認租約。
9. **失敗**：整個回合回復（`restoreWorld`），已發生的用量保留；回 429（預算）或 502。
10. **提交**：對 `worlds` 做一次條件 UPDATE，`version + 1`、釋放租約、寫入收據。衝突時只保留已付用量。
11. **提交後**：完成 decision trace，把狀態補進 journal。

`GET /api/world` 只讀取，不會派送模型。

`advanceActivities` 內一位角色的決策：

1. 先推進世界時間、自然變化、身體需求、精神電量區間與旅程。
2. 逐角色判斷：旅途中跳過；有玩家指定行動就用它；被接管就不問模型；`canContinue` 成立就由程式續做。其餘才需要決策。
3. 規則模式走 `lib/world.ts` 的 `demoDecision`；AI 模式走 `lib/models.ts` 的 `aiDecision`。
4. `lib/npc-decision-preparation.ts` 的 `prepareNpcDecision` 組輸入並壓到上限，`requestModel` 送出，`parseDecision` 驗證。模型要求回想時多走一輪。
5. 行動是 `propose` 或泡茶時需要裁定：先以 `lib/routine-rules.ts` 的 `selectRoutineForDecision` 找既有規則，沒有才呼叫 `requestAdjudication`。
6. 回到 `advanceActivities` 寫回記憶、認知、追求，再由 `startActivity` 開始活動：有效果走 `commitFreeAction`，沒有走 `resolve()`。

## lib 模組分組

`lib/` 沒有子目錄，以下是邏輯分組。標「純」表示不碰網路或資料庫（但多數會直接修改傳入的 `World`，也會用 `Math.random`、`crypto.randomUUID`）。

### 世界與決策核心

| 檔案 | 職責 |
| --- | --- |
| `world.ts` | 核心型別（`World`、`Character`、`WorldEvent`、`Action`、`ActivityPlan`、`Intent`）、seed 與 `normalizeWorld`、事件記錄 `record`、NPC 視角投影 `perception()`、確定性行動 `resolve()`、規則模式 `demoDecision`。約 60 個 lib 檔依賴它 |
| `world-state.ts` | 物件、身體、環境狀態的權威讀寫與提交 |
| `world-configuration.ts` | 執行期世界拓樸型別（`WorldConfiguration`、場所、房間、門）與存取函式；`legacyConfiguration` 是舊存檔的 fallback |
| `activities.ts` | 整回合的 orchestrator（`advanceActivities`）與用量、預算判斷 |
| `activity-lifecycle.ts` | 單一角色計畫的開始、推進、取消、旅程、睡醒 |
| `paused-activities.ts` | 暫停、復工、放棄 |
| `models.ts` | NPC 決策主流程：組 system prompt、呼叫模型、回想迴圈、`parseDecision` |
| `model-adapter.ts` | 唯一的 LLM HTTP transport（OpenAI、OpenRouter）與 observer 事件 |
| `direct-models.ts` | OpenAI 直連的模型 ID 清單 |
| `npc-input.ts` | 組 NPC user message，88 KiB 上限 |
| `npc-decision-preparation.ts` | 把輸入、schema、messages 收斂成一次請求 |
| `npc-decision-schema.ts` | NPC 輸出 schema 與契約版本 |
| `playbook.ts` | NPC 共用原則的 prompt 文字 |
| `action-checks.ts` | 檢定系統選擇與 d100 實作 |
| `d20.ts` | D20 擲骰、判定，以及共用的 `Resolution` 型別 |
| `adjudication.ts` | 天上意志的模型任務：組輸入、派送、失敗收據 |
| `adjudication-contract.ts` | 裁定候選的 schema、規則文字、純驗證 parser |
| `adjudication-limits.ts` | 裁定與世界物件的上限常數 |
| `world-effects.ts` | 效果執行引擎：在副本上驗證、擲骰、提交、產生行動回饋 |
| `world-formation.ts`、`world-formation-contract.ts` | 執行期物件的切分、轉換、分離效果（與建立世界無關） |
| `natural-changes.ts` | 延遲後自動發生的狀態變化 |
| `round-time-policy.ts` | 回合時間預算常數與 AbortSignal 工具 |
| `acceptance-scene.ts` | 最小驗收場景的進出（原世界 gzip 備份）與給 client 的投影 `worldForClient` |
| `entry-rules.ts` | 進出規則的型別與常數，沒有邏輯 |
| `decision-traces.ts` | 私密決策追溯的 D1 存取 |
| `decision-trace-capture.ts` | 記憶體內的 trace builder |
| `operation-evidence.ts` | 給觀察者的操作證據，64 KiB allowlist |
| `diagnostic-redaction.ts` | 診斷文字中的秘密遮罩 |
| `observation-log.ts` | 觀察頁回合紀錄的純投影：把事件、檢定與感知擲骰、精神電量與需求歷史整理成依時間分組的紀錄；只讀，不進 NPC 輸入 |
| `observed-activity.ts` | 共用活動名稱與狀態呈現。活動計畫及既有事件保存有界的名稱與活動實例；沒有感官事件的停止另存於同一世界 JSON，最多 300 筆。回合紀錄只隱藏明確標記的續做；原事件文字、感知、記憶與決策投影不變 |

### 感知

| 檔案 | 職責 |
| --- | --- |
| `perception.ts` | 視聽可達性、事件轉感官候選、擲骰、主動查探、物件與供應發現、寫入 observation |
| `attention.ts` | 關注條件：解析模型輸出、比對 observation、決定是否打斷 |
| `false-perception.ts` | 感知大失敗時的錯誤感受抽選，只被 `perception.ts` 呼叫 |

### 記憶、認知、回想

| 檔案 | 職責 |
| --- | --- |
| `memory.ts` | 短期與長期記憶、整理操作、輸入預算裁切、整體狀態驗證 |
| `memory-limits.ts` | 單一常數（短期文字上限） |
| `cognition.ts` | 信念、關係標籤與更正歷史 |
| `recall.ts` | 回想流程：向量索引同步、搜尋、回 D1 重驗 |
| `recall-services.ts` | 回想的外部傳輸層（Embedding、Vectorize）與用量帳本 |
| `opening-knowledge.ts` | 開局時各角色已知的房間與物件快照 |

### 生活

| 檔案 | 職責 |
| --- | --- |
| `needs.ts` | 四項身體需求的入口與舊版引擎、睡眠判定 |
| `body-needs-policy.ts` | 個人化需求 v2；`needs.personal.status === 'active'` 時由 `needs.ts` 委派過來 |
| `habits.ts` | 時段習慣（程式統計）與事件習慣（模型提候選） |
| `preferences.ts` | 主觀喜好 |

### 追求與安排

| 檔案 | 職責 |
| --- | --- |
| `pursuits.ts` | 分層追求圖的增量更新 |
| `pursuit-selection.ts` | 同次決策內候選的發散與收斂驗證 |
| `arrangements.ts` | 柔性安排（時間、事件、情境條件） |
| `arrangement-cues.ts` | 安排與提醒共用的條件觸發狀態機 |

### 精神電量

| 檔案 | 職責 |
| --- | --- |
| `mental-energy.ts` | `MentalEnergy` 型別與結算入口；依 `policy.kind` 分流到 test 或 formal |
| `formal-mental-policy.ts` | 正式政策 `mental-energy-271-v1` 的建立、驗證、每五分鐘結算 |
| `formal-mental-enablement.ts` | 啟用與導入時的輸入驗證 |
| `mental-experiences.ts` | 經歷帶來的自然感受與收據 |
| `mental-process.ts` | 活動過程中的感受 |
| `emotion-regulation.ts` | 付費的主動情緒調節 |
| `controlled-feelings.ts` | 玩家接管後的獨立模型呼叫 |
| `mental-history.ts` | 歷史紀錄的 append 與裁切 |

### 手機

| 檔案 | 職責 |
| --- | --- |
| `phones.ts` | 手機狀態、可及性、phone action 的解析與執行、訊息送達 |
| `phone-calendar.ts` | 行事曆與提醒推進 |
| `phone-map.ts` | 城市公開地圖的分頁讀取 |
| `phone-notifications.ts` | 提示音事件、曝光與去重 |

### 日常規則

`RoutineRule.version` 決定走哪一代：`bindRoutine` 先試 v3，找不到才走 v1／v2。

| 檔案 | 職責 |
| --- | --- |
| `routine-rules.ts` | 總入口：內建範本、`RoutineRule` 型別、規則選取、v1／v2 綁定、NPC 可知方法 |
| `routine-program-contract.ts` | v2 程序的 schema、驗證、prompt 規則 |
| `routine-programs.ts` | v2 綁定：把程序編成具體效果候選 |
| `routine-world-contract.ts` | v3 程序的 schema、驗證、prompt 規則 |
| `routine-world-programs.ts` | v3 綁定：依方法文字找規則、綁角色、編譯階段 |
| `routine-world-bindings.ts` | v3 提交時重驗前提、重綁、來源與背景供應權限 |
| `routine-materials.ts` | 材料與器具的資格判定 |
| `routine-obstacles.ts` | v1／v2 的受阻原因文字 |

日常的模型契約屬於裁定模型，不是 NPC 決策模型。

### 人物與開局

| 檔案 | 職責 |
| --- | --- |
| `character-templates.ts` | 人物文字欄位的 schema（十個欄位、長度上限） |
| `character-drafts.ts` | 建角草稿型別與文字來源追蹤（使用者或 AI） |
| `character-generation.ts` | 用模型補空白欄位 |
| `character-formation.ts` | 草稿轉數值：判讀加成、擲骰 |
| `character-cards.ts` | 完成人物卡型別（v2 五屬性）與配點驗證 |
| `character-card-world.ts` | 把人物卡套到世界的 `Character` |
| `character-attributes.ts` | 舊制四屬性（v1，1 到 5 級） |
| `character-assets.ts` | 角色素材路徑，來源是 `public/characters/manifest.json`。`PixelSprite` 先用世界角色 ID 查，再用人物卡 ID（`profileSource.id`）查；都沒有就顯示人物顏色與名字首字 |
| `scene-templates.ts` | 場景範本 schema 與內建範本 |
| `city-draft.ts` | 開局配置的純型別（`CityDraft`、`CityPreview`）與上限 |
| `city-creation.ts` | `prepareCity`：把開局配置與來源轉成預覽與世界 |
| `city-finalization.ts` | 疊在場景範本上的額外房間、物件、連接與步行時間 |
| `daily-place-context.ts` | 自訂場所住戶／主人／工作者的日常資格，以及入口到房間的許可與通路 |
| `opening-resources.ts` | 第 0 回合天上意志備料契約、完整綁定驗證、有限供應與陳設使用權；經 world operation 計費及保存 |
| `opening-resource-knowledge.ts` | 僅投射本人開局知道的物資位置與許可，不揭露遠端即時庫存 |
| `city-access.ts` | 進入許可的建立與執行期查詢（`entryPermission`） |
| `city-initialization.ts` | 用模型產生 finalization |
| `opening-drafts.ts` | 開局草稿的版本化儲存與 `confirmOpening` |
| `opening-arrangement-model.ts` | AI 整理開局：只補留白 |
| `opening-relationship-generation.ts` | 用模型從開局描述抽出住處、工作、關係 |
| `opening-authoring.ts` | 瀏覽器端 helper：自動預填、把成品帶回開局草稿 |
| `pixel-scene.ts` | 舊版固定地圖的座標與走位 |

### 帳號、存檔、儲存

| 檔案 | 職責 |
| --- | --- |
| `auth.ts` | GitHub OAuth、工作階段 cookie、白名單 |
| `store.ts` | D1 handle（`database()`）與 `loadWorld` |
| `account-scope.ts` | 帳號工作區 scope 字串與比對 |
| `world-saves.ts` | 存檔身分與 `storageOwner` 的綁定、存檔清單 |
| `save-management.ts` | 另存、刪除（含冪等收據）與帳號用量彙總 |
| `save-identities.ts` | 存檔 UUID 的 regex |
| `model-keys.ts` | 加密保存的帳號模型 Key |
| `model-settings.ts` | 模型偏好的純型別與驗證 |
| `model-settings-store.ts` | 模型偏好的讀寫與生效來源解析 |
| `player-account-budget.ts` | 帳號層級的用量帳本、預算、自訂單價、派送預留 |
| `usage-recovery.ts` | 世界內的已付用量收據與回補 |
| `costs.ts` | 費用計算（純） |
| `character-template-store.ts`、`character-draft-store.ts`、`character-card-store.ts`、`scene-template-store.ts`、`opening-arrangement-store.ts` | 各自資料表的存取 |
| `environment.ts` | 環境名稱、提交短碼、建置時間 |
| `bound-navigation.ts`、`bound-navigation-server.ts` | 帶 `?owner=` 的 URL helper；後者在伺服器端 redirect |
| `world-response.ts` | 瀏覽器端的回應檢查 |

其他：`world-clock.ts`（把世界分鐘數顯示成「第 N 天 HH:MM」，給存檔清單用）、`text-equivalence.ts`（文字正規化比較）、`utils.ts`（shadcn 的 `cn()`，只被 `components/ui/` 使用）。

## 建立世界的流程與詞彙

人物文字範本 → 建角草稿 → 數值形成 → 完成人物卡 → 開局草稿 →（AI 整理）→ `prepareCity` → `confirmOpening`

| 詞 | 在程式裡的意思 |
| --- | --- |
| character template | 純文字的來源庫，不能直接進世界 |
| character draft | 可編輯的建角草稿，記錄每段文字的來源 |
| formation（人物） | 模型判讀加成後擲骰，產生能力與精神容量 |
| character card | 凍結的成品，ID 以 `card-` 開頭 |
| city | 一次開局的配置（`CityDraft`），不是地理概念 |
| scene template | 可重用的場所藍圖；`CityDraft.places[]` 是它的實例 |
| opening draft | 開局精靈的持久化草稿，內含 city、凍結的來源與 `prepareCity` 的結果 |
| world configuration | 已建世界內的執行期拓樸（`world.configuration`） |
| world formation | 執行期物件的切分與轉換效果，與建立世界無關 |

每次保存開局草稿都會重跑 `prepareCity` 並存成 candidate；`confirmOpening`（經 `POST /api/saves`）把 candidate 的世界原樣寫入 `worlds` 與 `world_saves`。開局精靈存的 `step` 值是 1／3／4，對應畫面上的三段。

## API routes

| Method 與路徑 | 作用 | 進入點 |
| --- | --- | --- |
| GET `/api/auth/github`、`/api/auth/github/callback`，POST `/api/auth/logout` | 登入與登出 | `lib/auth.ts` |
| GET `/api/environment` | 不需登入的環境與版本資訊 | `lib/environment.ts` |
| GET `/api/world` | 讀世界、journal 狀態、用量、追溯 | route 內的 `readWorld` |
| POST `/api/world` | 所有世界變更與模型派送 | route 內的 `mutateWorld` |
| GET、POST `/api/saves` | 存檔清單；另存、刪除；確認開局建立世界 | `lib/save-management.ts`、`lib/opening-drafts.ts` |
| GET、POST `/api/opening-drafts` | 開局草稿讀寫 | `lib/opening-drafts.ts` |
| POST `/api/opening-drafts/arrange` | AI 整理開局、編輯、採納 | `lib/opening-arrangement-store.ts` |
| GET、POST `/api/character-templates` | 人物文字範本 | `lib/character-template-store.ts` |
| GET、POST `/api/character-drafts`，POST `/from-template`、`/generate`、`/form` | 建角草稿、AI 補空、數值形成與配點 | `lib/character-draft-store.ts`、`lib/character-formation.ts` |
| GET、POST `/api/character-cards` | 完成人物卡 | `lib/character-card-store.ts` |
| GET、POST `/api/scene-templates` | 場景範本（寫入的 SQL 直接寫在 route 裡） | `lib/scene-template-store.ts` |
| GET、POST `/api/model-settings` | 帳號或單一存檔的模型偏好 | `lib/model-settings-store.ts` |
| GET、POST `/api/player-budget` | 帳號預算與自訂單價 | `lib/player-account-budget.ts` |

`POST /api/world` 的 `operation`：

- **推進**：`advance`（`minutes` 為 5／15／30；`mode` 為 `demo`、`ai`、`openai`）。
- **只改狀態**：`takeover`、`return-control`、`direct`、`intervene`、`set-budget`、`set-price`、`set-adjudication`、`enter-acceptance`、`exit-acceptance`、`enable-mental-energy`、`enable-body-needs`、`adopt-character-attributes`、`set-character-sense-limits`。
- **會派送模型的準備工作**：`generate-character-template`、`assess-character-card`、`arrange-opening`、`suggest-opening-relationships`、`initialize-city`。
- **不需 operationId**：`set-model-key`、`clear-model-key`、`preview-city`。
- **已退役，一律回 409**：`start-city`、`reset`。

`/api/character-drafts/generate`、`/api/character-drafts/form`、`/api/opening-drafts/arrange` 會在 process 內直接呼叫 world route 匯出的 `POST`（帶 `?workspace=account`）。改 `POST` 的簽名或回應欄位會連帶影響這三條與多個測試。

## 資料表與負責模組

所有查詢都是手寫的 D1 `prepare()` 字串。`db/schema.ts` 只給 drizzle-kit 用，執行期沒有任何程式 import 它，也沒有涵蓋回想資料表與 migration 內的 trigger。要查某張表誰在讀寫，請直接搜尋表名。

| 資料表 | 負責模組 |
| --- | --- |
| `worlds` | 租約與提交在 `app/api/world/route.ts`；新增在 `opening-drafts.ts`、`save-management.ts`、`world-saves.ts`；讀取在 `store.ts` |
| `world_saves`、`save_tombstones` | `world-saves.ts`、`save-management.ts`、`opening-drafts.ts` |
| `save_operation_receipts`、`deleted_world_usage` | `save-management.ts` |
| `auth_sessions`、`oauth_attempts` | `auth.ts` |
| `account_model_keys` | `model-keys.ts` |
| `model_preferences` | `model-settings-store.ts` |
| `player_accounts`、`player_usage_origins`、`player_dispatches` | `player-account-budget.ts` |
| `character_templates`、`character_drafts` | 對應的 `*-store.ts` |
| `character_cards`、`character_card_assessments` | `character-card-store.ts` |
| `scene_templates` | 讀在 `scene-template-store.ts`，寫在 `app/api/scene-templates/route.ts` |
| `opening_drafts` | `opening-drafts.ts` |
| `opening_arrangements` | `opening-arrangement-store.ts` |
| `decision_traces`、`decision_trace_retention` | `decision-traces.ts`；保留上限由 migration 0005 的 trigger 執行 |
| `world_before_city` | 只由 migration 0008 的 trigger 寫入 |
| `recall_index_entries` | `recall.ts` |
| `recall_dispatch_usage` | `recall-services.ts`（在 `RECALL_USAGE_DB`） |

migration 編號是 0000–0008、0013–0020，沒有 0009–0012。`drizzle/meta/` 只到 0003，之後都是手寫 SQL。

## 介面

| 路徑 | 頂層元件 | 主要子元件 |
| --- | --- | --- |
| `/` | 登入卡或 `SavePicker` | `SaveNavigation`、`SaveActions` |
| `/new` | `OpeningWizard` | `opening-configuration-controls`、`OpeningArrangementPanel`、`city-access-editor` |
| `/character-templates` | `CharacterDraftEditor`、`CharacterTemplateEditor` | `CharacterFormationControls`、`ModelSettingsPanel` |
| `/scene-templates` | `SceneTemplateEditor` | |
| `/observe?save=&view=` | `WorldApp` | 見下 |
| `/settings?save=`（帳號設定） | `ModelSettingsPanel`、`PlayerAccountSettings` | `BudgetControls`、`CostPanel` |

所有頁面都在伺服器端先驗證登入與 URL 的 `owner` 參數。觀察頁以外的頁面共用 `components/site-header.tsx`；導覽列是 `components/save-navigation.tsx`，其中的「帳號設定」一律連到 `/settings`（模型、Key、預算、單價只在那裡改）。

`components/world-app.tsx` 以 `page` 狀態切換觀察、分析、設定、人物檔案，面板大多用 `hidden` 屬性切換而不卸載，切頁不會重新載入世界。

- **觀察**：`PixelWorld`（場所畫面）、`CharacterStatusBoard`（全員的心情、精神電量、四項需求）、`RoundLog`（誰做了什麼、擲骰與數值變化），以及寫在 `world-app.tsx` 內的角色近況與介入。時間列固定在頁面頂部。
- **分析**：`CharacterAnalysis`（需求、追求、習慣、認知、關注）、`WorldAnalysis`（日常、檢定、感知）、用量與 `CostPanel`、`ForecastPanel`、`OperationEvidenceDetails`、`DecisionTraces`。
- **設定**（`view=settings`）：有存檔的世界已不從導覽列進入，運行設定改由時間列的「運行設定」開啟，`AcceptanceSceneControls` 收在其中的「進階：驗收場景」；預算與單價連到帳號設定。沒有 `saveId` 的舊入口仍保留完整的設定分頁與 `BudgetControls`。
- **人物檔案**：`CharacterProfile`。

瀏覽器端的暫存只用 sessionStorage 與 URL 參數，沒有用 localStorage：

| 位置 | 內容 | 實作 |
| --- | --- | --- |
| sessionStorage `quiet-hours:pending:<scope>` | 尚未確認的世界操作，重試沿用同一個 operationId | `world-app.tsx` |
| sessionStorage `quiet-hours:saves:*` | 存檔操作與另存名稱 | `save-actions.tsx` |
| sessionStorage `quiet-hours:character-reroll:*` | 重骰操作 | `character-formation-controls.tsx` |
| sessionStorage `quiet-hours:scene-draft:*` | 場景未保存草稿 | `scene-template-editor.tsx` |
| URL `?save=`、`?view=`、`?draft=`、`?restart=`、`?owner=`、`returnTo` | 頁面狀態與帳號綁定 | `lib/bound-navigation.ts` |

開局草稿與建角草稿存在 D1，不在瀏覽器。離頁保護在 `components/use-draft-navigation.ts`，帳號切換保護在 `components/use-original-account-scope.ts`。

樣式：Tailwind 4 經 `@tailwindcss/postcss`，沒有 `tailwind.config`。只有深色主題。

## 版本與相容分支

| 開關 | 意義 |
| --- | --- |
| `world.configuration` 是否存在 | 沒有 = 舊的固定世界（Cass、Vera、Kris、店主與咖啡館）；有 = 由開局流程建立的世界。`world.ts`、`models.ts`、`PixelWorld` 都以此分流 |
| `world.timeContract === 'five-minute-v1'` | 五分鐘世界時間；行動先存成 `plan.deferredAction`，到期才執行 |
| `CheckSystem`：`d20-v1`、`d100-v1`、`d100-v2` | 由 `action-checks.ts` 的 `newCheckSystem` 依角色屬性版本決定；沒有屬性的角色 fallback 到 D20 |
| 人物屬性 v1 與 v2 | `character-attributes.ts`（四屬性 1–5）對 `character-cards.ts`（五屬性 3–18） |
| `needs.personal.status` | `active` 時走 `body-needs-policy.ts`，否則走 `needs.ts` 的舊版 |
| `mentalEnergy.policy.kind` | `test` 只允許本機與測試環境；`formal` 是正式政策 |
| `RoutineRule.version`：1、2、3 | v1／v2 是範本與符號程序，v3 是通用世界程序 |
| `world.pursuitVersion === 1` | 分層追求已啟用 |
| `character.memories` 等舊欄位 | 是 `shortTerm` 的相容投影，不要直接寫入；`relationships` 同理，來源是 `cognition.relationshipTags` |
| `acceptance.original` 與 `acceptance.snapshot` | 驗收場景的舊版未壓縮備份與現行 gzip 備份 |

NPC 決策契約只接受 `npc-decision.v3`，沒有 v1／v2 的相容分支。其他版本字串：`world-adjudication.v1`、`world-effects.v5`、`round-v1`、`controlled-feelings.v1`。

## 檔名陷阱

- **`lib/models.ts` 不是資料模型**，是 NPC 的 LLM 決策流程。核心型別在 `lib/world.ts`。
- **沒有 `lib/d100.ts`**。d100 在 `lib/action-checks.ts`；但 d100 結果用的 `Resolution` 型別定義在 `lib/d20.ts`。
- **`world.ts` 的 `perception()` 與 `lib/perception.ts` 不同**：前者組 NPC 視角，後者是感官引擎。
- **沒有叫 `Activity` 的型別**：進行中的是 `ActivityPlan`（`world.ts`），模型決策結果是 `ActivityDecision`（`activities.ts`），階段是 `ActivityPhase`（`world-effects.ts`），暫停的是 `PausedActivity`（`paused-activities.ts`）。
- **追求的資料欄位叫 `Character.intents`**，沒有 `pursuits` 欄位。
- **「formation」有兩個意思**：`character-formation.ts` 是擲骰形成人物數值，`world-formation.ts` 是執行期物件效果。
- **「owner」有三種**：帳號 owner（`github:<id>`）、`storageOwner`（`worlds.owner`，每份存檔一個）、帳號工作區（`account-operations:<owner>`）。`decision_traces.owner` 存的是 `storageOwner`。
- **`operationScope` 各 route 期待不同**：`/api/world` 要 `storageOwner`；存檔、開局草稿、預算要帳號 owner；人物與模型設定要帳號工作區，欄位名有的叫 `accountScope`。
- **`mode: 'ai'` 指 OpenRouter**，`'openai'` 才是 OpenAI 直連。
- **`CityDraft.characters[].templateId` 放的是人物卡 ID**，是歷史命名。
- **`RoutineRule.family` 一律是 `'cafe-service'`**，真正的分流看 `version`。
- **`lib/world-response.ts` 是瀏覽器端程式**；`model-settings.ts` 是純邏輯，`model-settings-store.ts` 才做 I/O。
- **`entry-rules.ts` 只有型別**，實際的許可判斷在 `city-access.ts`。
- **同名的 lib 與元件**：`decision-traces`、`operation-evidence`、`acceptance-scene`、`character-attributes` 在 `lib/` 與 `components/` 各有一個。
- **re-export 會讓搜尋找到轉手處**：`activities.ts`、`world-effects.ts`、`models.ts`、`routine-rules.ts` 都轉出別的檔案的符號，找定義時要追到原檔。
- **循環 import 很多**（例如 `world` ↔ `world-effects`、`memory` ↔ `cognition`）。`memory-limits.ts`、`mental-history.ts` 這類單一 export 的小檔就是為了避開循環而拆出來的。
- **`playerAccount()` 不是純讀取**，每次呼叫都會做初始化與回補。`listWorldSaves` 也有寫入的副作用。
- **用量有兩本帳**：世界內的 `world.aiUsage` 與帳號的 `player_accounts`。預算以帳號帳本為準；`world.playerBudget`、`world.modelPrices` 是舊的鏡像。

## 目前沒有介面入口的程式

以下在 `main` 上找不到從介面到達的路徑。這裡只記錄現況，是否移除要另外決定，動之前請先搜尋 `tests/` 與 `tooling/` 的引用。

- `components/city-editor.tsx` 沒有任何 importer；`opening-people-editor.tsx`、`city-finalization-editor.tsx` 只被它使用。
- 因此 `preview-city`、`initialize-city`、`suggest-opening-relationships` 三個 operation，以及 `lib/city-initialization.ts`、`lib/opening-relationship-generation.ts`，目前沒有介面呼叫者。
- `world-app.tsx` 的 `page === 'city'` 沒有觸發點。
- `lib/world.ts` 的 `resetWorld`、`lib/world-saves.ts` 的 `createWorldSave` 在 `app/` 與 `lib/` 內沒有呼叫者。
- `vendor/shadcn-tailwind-4.13.0.css` 沒有被任何檔案引用。
