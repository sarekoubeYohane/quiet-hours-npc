# NPC prompt 試驗工具

## 精神電量三組對照

在專案根目錄執行下列指令。試驗使用 `gpt-6.1-sol`、正式 NPC 驗證器及 world route，資料存在記憶體內的測試資料庫。

```powershell
node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
```

實測從 `OPENAI_API_KEY` 或 `TRIAL_KEY_FILE` 取得憑證。設 `TRIAL_DRY=1` 可用固定回覆檢查測量工具。預設兩位人物、三種提示、每組兩次，共 12 次 NPC 決策；需要世界裁定的行動另有模型呼叫。`TRIAL_RUNS` 可設 1–10，`TRIAL_DIR` 可指定本機輸出目錄。

每位人物從同一份初始快照分支，保持角色輸入、模型與回覆格式相同，輪換組別順序。三組分別使用原提示、原提示加提醒、原提示加同一提醒及範例；增補文字見 [energy-prompts.cjs](energy-prompts.cjs)。Cass 初始精神 1/50，Vera 為 49/70。各自的房間都有床和椅子，還有一張真的收到且可引用的便條。

每個樣本記下原始心理欄位、回合是否提交、活動評估、經歷收據、下一個五分鐘的擲骰與精神收支。`processTriggered` 表示遊戲真的為活動感受擲骰，`positiveCredit` 表示活動或新經歷有正向入帳；淨電量另以起訖讀值核對。活動若未成立或下一格需要新的自主決策，依實際狀態記錄。睡眠需要更長的實際時段，這個短測不量睡眠回電率。

解讀 #353 的數字時，使用[封存的當次派送結果](../../../docs/design/npc-prompt-change-log.md)。單人與同房工具是在當前 checkout 的提示上追加實驗文字；產品納入 #353 後再跑，基準組也已經有感受與陪伴提醒。若要重建部署前的對照，須以 #353 之前的產品文字為起點。

### 陪伴提示對照

在 PowerShell 選擇同房場景後執行同一支工具。

```powershell
$env:TRIAL_SCENARIO = 'companion'
node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
```

兩組都有一般感受提醒，實驗組多一段關於陪伴的提示。預設每人每組三次，共 12 次 NPC 決策。兩人都在共用起居室，保留舊版世界的雙向關係與範例卡的記憶。各次從同一人物快照開始，另一人靜靜在場，對方的感受評估以空回覆固定。這個場景沒有觀察者便條。工具會核對實際送給模型的可見人物、關係及原始輸入雜湊。

比較時逐筆閱讀 `candidate.processFeeling.reason`。人物明說同伴在場或兩人正在相處如何影響感受，才算把感受歸因於陪伴。另記正向、負向或中性。單純想留空間、希望未來見面、動作裡提到對方，或收到某個事件而安心，都不能單憑這些算作喜歡有人陪。每組分別報告全體決策、可歸因於陪伴的評估，以及實際五分鐘活動結算。無法判定的理由保留原文。

第一回合由真模型決策，必要時由模型裁定。若有進行中的活動，下一個五分鐘切到規則模式，使用正式時間結算函式計算先前已提交的活動。紀錄檔以 `companion-live-` 或 `companion-fixture-` 開頭。設 `TRIAL_SCENARIO=solo` 可切回原本的單人測試。

### 睡眠與清醒休息

```powershell
$env:TRIAL_SCENARIO = 'sleep'
node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
```

Cass 和 Vera 各自在自己的房間，能看到自己的床。每人各測「有些睡意且想睡」、「睡意強烈且想睡」、「有些睡意但想清醒休息」。想做的事寫在人物自己的開局意圖。每個情境都有一對相同快照，新版使用產品的完整提示，舊版僅移除睡覺與休息的說明。預設每格一次，共 12 個 NPC 決策，另計動作需要的裁定。加設 `TRIAL_DRY=1` 可先用固定回覆檢查測試工具。

在 `sleep-live-*.jsonl` 核對模型實際選的動作與目的、世界裁定、提交後的身體活動。已確認入睡的樣本透過世界 API 每次推進五分鐘，最多十二次。後續採規則模式結算已開始的睡眠。未滿一小時就醒來會提前停止。逐格記下實睡分鐘、累積格數、睡眠專屬回電與活動收支，可分別檢查第 55 與第 60 分鐘。

### 重跑「先嘗試入睡」的一句話對照

```powershell
$env:TRIAL_SCENARIO = 'sleep-onset'
$env:TRIAL_RUNS = '1'
$env:TRIAL_DIR = 'artifacts/energy-prompt-trial'
node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
```

真模型使用上文的憑證設定；加設 `TRIAL_DRY=1` 會用固定回覆，恢復真模型前清除此變數。每次重新建六份快照，同一人物、情境的兩版使用同一份副本起點。共 12 筆決策，是否呼叫裁定由世界決定。`current` 使用「希望睡到自然醒」原句，`candidate` 只替換為「先躺下試著入睡」的開放式時段句。候選句只供重放。

在 `sleep-onset-live-*.jsonl` 以 `name`、`sleepCase` 配對，核對 `snapshotHash`、修改前整份 request 的 `inputHash`。逐筆的 `calls[].request` 是實際送出的 body，`reply` 是模型原文。比較 `timeIntent` 與 `firstWorld` 的前後分鐘、活動及事件；若只有 NPC 呼叫，便沒有裁定模型的判詞。固定回覆的同名 `fixture` 檔只檢查這些紀錄與世界分支。[修改紀錄與本輪決定](../../../docs/design/npc-prompt-change-log.md)

## #341 草稿對照

### 比較 v0.2.3 與 v0.2.4

兩版使用相同的 user JSON、模型與設定，只替換組好的 system message。`v0.2.3.md` 是歷史原文，v0.2.4 讀取 `docs/design/npc-prompt-rewrite-draft.md`。以下重現第 7 節的規模。設好 `OPENAI_API_KEY` 或 `TRIAL_KEY_FILE` 才跑真模型；`TRIAL_DRY=1` 可先以固定回覆驗證流程。

```powershell
$env:TRIAL_DIR = 'artifacts/energy-prompt-trial'
$runs = @{'companion-revision'=3; 'sleep-revision'=1; 'solo-revision'=2}
foreach ($scene in 'companion-revision','sleep-revision','solo-revision') {
  $env:TRIAL_SCENARIO = $scene
  $env:TRIAL_RUNS = [string]$runs[$scene]
  node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
  if ($LASTEXITCODE -ne 0) { throw '試驗中斷，請核對最後一列紀錄。' }
}
foreach ($scene in 'meal-revision','layout-revision') {
  $env:TRIAL_SCENARIO = $scene
  node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/meal-draft-trial.cjs
  if ($LASTEXITCODE -ne 0) { throw '試驗中斷，請核對最後一列紀錄。' }
}
```

前三組共 32 次自主決策，必要時另叫裁定模型。後兩組共 14 次自主決策（Cass 用 Luna、店主用 Sol），都經正式世界 API；用固定裁定做出一致的餐前與餐後場景，其他人物安靜在場。店主場景也取自最小驗收咖啡館。欄位壓力試驗沿用 #85 的 JSON 模式、low 推理、4,096 輸出上限，場景是本機重建。查 `calls[].reply` 辨認實際欄位，`firstWorld` 核對是否提交、活動與餐點餘量。技術回滾與回覆欄位放對是兩項不同的計數。[本輪驗收與資料索引](../../../docs/design/npc-prompt-change-log.md)

### 重放產品提示與 v0.2.3 的比較

要在上述臥室或同房場景直接比較本機現行提示與完整 v0.2.3 草稿，可用下列兩個情境。兩版從同一人物、同一世界快照開始，逐對核對替換前的完整 request。草稿版用 `assemble.cjs` 組 system message，依原型把性格與目標從人物 JSON 移到開頭；世界裁定、schema 和其他人物輸入照常。`calls[]` 留下每次實際派送與回覆，`firstWorld` 記錄回合後的世界。比較輸入 token 取 NPC 呼叫的 `usage.prompt_tokens`。

```powershell
$env:TRIAL_DIR = 'artifacts/energy-prompt-trial'
$env:TRIAL_RUNS = '1'
foreach ($scene in 'sleep-draft','companion-draft') {
  $env:TRIAL_SCENARIO = $scene
  node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/energy-trial.cjs
  if ($LASTEXITCODE -ne 0) { break }
}
```

每格一次時，睡眠共 12 次 NPC 決策，同房共 4 次，另外計入世界實際需要的裁定；`TRIAL_DRY=1` 可先檢查固定回覆流程。同房情境的另一人固定安靜在場。真模型回覆要分別讀活動選擇、`processFeeling.reason` 對陪伴的描述，以及下一格的遊戲結算。

用真實模型比較現行的 NPC system prompt 與改寫草稿（[`docs/design/npc-prompt-rewrite-draft.md`](../../../docs/design/npc-prompt-rewrite-draft.md)）。背景、設計與既有結果見 [`docs/design/npc-prompt-rewrite-2026-11-16.md`](../../../docs/design/npc-prompt-rewrite-2026-11-16.md)。

這些是一次性的實驗腳本，不在 `pnpm test` 內，不會被 CI 執行。除了 `--dry`／`TRIAL_DRY=1` 以外都會呼叫付費的模型 API。

| 檔案 | 用途 |
| --- | --- |
| `assemble.cjs` | 草稿的組裝原型：依這回合的輸入決定放哪些條件段落 |
| `single-turn.mjs` | 單回合：每位人物的第一個決定，回覆經正式的 `aiDecision` 驗證 |
| `multi-turn.test.cjs` | 多回合：經正式的 world route 連續推進，NPC 與裁定都用真實模型 |

## Key

腳本只讀環境變數或你指定的檔案，不會把 Key 寫到任何地方。不要把 Key 放進 repo。

- 單回合：`OPENAI_API_KEY`、`OPENROUTER_API_KEY`，或 `--key-file <路徑>`。
- 多回合：`OPENAI_API_KEY`，或 `TRIAL_KEY_FILE=<路徑>`。

## 單回合

```bash
node tooling/experiments/npc-prompt-trial/single-turn.mjs --dry
```

```bash
node tooling/experiments/npc-prompt-trial/single-turn.mjs --scenario needy --runs 2
```

| 選項 | 說明 | 預設 |
| --- | --- | --- |
| `--mode` | `both`、`current`（現行 prompt）、`draft`（草稿） | `both` |
| `--model` | 模型 id | `gpt-6-luna` |
| `--runs` | 每位人物、每種 prompt 各幾次 | 1 |
| `--who` | `all`、`cass`、`vera`、`kris`、`owner` | `all` |
| `--world` | `cafe`：內建範例「街角咖啡館」，新規則、沒有物件。`minimal`：最小日常驗收場景，舊規則、有餐點杯子茶具 | `cafe` |
| `--scenario` | `calm`：開局狀態。`needy`：飢渴疲累、心力見底（只對 `cafe` 有效，是直接改數值） | `calm` |
| `--variant` | 只改草稿一處：`no-goal`、`no-findit`、`full-playbook`、`no-hints` | 無 |
| `--out` | 紀錄與實際送出的 prompt 存放處 | 新的暫存目錄 |
| `--key-file` | Key 檔的路徑 | 無 |
| `--dry` | 不連網，只組 prompt 並印出字數 | 關 |

呼叫次數 = prompt 種類 × 人物數 × `--runs`。

變體是用「從草稿拿掉某一段文字」做的，草稿改寫後對應文字可能不存在，腳本會直接報錯。

## 多回合

要經由 `tests/run-activities.mjs` 啟動，它會把 `lib` 與 route 編譯到暫存目錄並提供記憶體內的資料庫：

```bash
TRIAL_DRY=1 TRIAL_ROUNDS=2 node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/multi-turn.test.cjs
```

```bash
TRIAL_PROMPT=draft TRIAL_ROUNDS=8 node tests/run-activities.mjs tooling/experiments/npc-prompt-trial/multi-turn.test.cjs
```

| 環境變數 | 說明 | 預設 |
| --- | --- | --- |
| `TRIAL_PROMPT` | `current` 或 `draft` | `current` |
| `TRIAL_ROUNDS` | 推進幾次，每次 15 分鐘 | 6 |
| `TRIAL_MODEL` | NPC 模型 | `gpt-6-luna` |
| `TRIAL_ADJ_MODEL` | 裁定模型 | `gpt-6.1-sol` |
| `TRIAL_FEEDBACK` | `1`：回覆被 parser 拒絕後，下一次把原因告訴同一位人物（#340 的原型） | 關 |
| `TRIAL_DIR` | 紀錄存放處 | 新的暫存目錄 |
| `TRIAL_KEY_FILE` | Key 檔的路徑 | 無 |
| `TRIAL_DRY` | `1`：不連網，所有人物都休息 | 關 |

場景固定是最小日常驗收場景。每回合約 4 次 NPC 呼叫加上數次裁定；回合失敗時整回合回復，但已派送的呼叫照樣計費。

輸出三個檔案：`-summary.txt`（逐回合的行動、事件、物件狀態）、`-calls.jsonl`（每次模型呼叫與原始回覆）、`-rounds.jsonl`（每回合後的世界狀態）。

### 診斷用的改動

多回合腳本會改**暫存編譯目錄**裡的 `models.cjs` 副本，讓 parser 的拒絕原因出現在錯誤訊息中。產品對外只回報「模型未回傳有效的意圖與行動格式」，看不出是哪一條規則。repo 裡的原始碼不會被改動。

## 限制

- 本工具在送出前替換 system message。測試站 v0.2.4 共用相同組裝器，會在正式 request 大小檢查時一併計入 system 與 user message。第 7 節的 46 次決策是工具內的本機對照。
- `needy` 情境是直接改數值，不是世界自然推進到的狀態。
- 多回合的場景是舊規則世界，人物沒有屬性、身體需求與精神電量。
- 模型有非決定性，同樣設定各輪差異很大，單輪結果不要當結論。
