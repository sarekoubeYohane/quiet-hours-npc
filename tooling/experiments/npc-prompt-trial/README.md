# NPC prompt 試驗工具

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

- 草稿的組裝是在送出前替換 request 的 system message，產品程式沒有改。量到的是「草稿加上這份原型」的表現。
- `needy` 情境是直接改數值，不是世界自然推進到的狀態。
- 多回合的場景是舊規則世界，人物沒有屬性、身體需求與精神電量。
- 模型有非決定性，同樣設定各輪差異很大，單輪結果不要當結論。
