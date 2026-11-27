# 製作工作回覆大小量測

量各項製作工作（人物欄位補寫、人物卡判讀、AI 開局整理、補路建議、開局備料）的真實模型回覆有多大，用來決定格式修正時回送原回覆的上限。直接呼叫各工作的正式函式，輸入是內建範例人物卡與範例場景。只觀察，不修改產品程式。不登記到 `pnpm test`。

## 執行

在專案根目錄：

```sh
# 乾跑：不連網，固定回覆 `{}`，只確認六項工作都接得上；數字沒有意義
TRIAL_DRY=1 node tests/run-activities.mjs tooling/experiments/setup-reply-size/setup-reply-size.test.cjs

# 真實模型：Key 從 OPENAI_API_KEY 或 TRIAL_KEY_FILE（檔案路徑）取得
TRIAL_KEY_FILE=/path/to/key node tests/run-activities.mjs tooling/experiments/setup-reply-size/setup-reply-size.test.cjs
```

預設六項工作各跑 3 次，共 18 次派送，會產生模型費用。第一次真實呼叫沒有取得回覆就停止。

## 環境變數

| 變數 | 預設 | 說明 |
| --- | --- | --- |
| `TRIAL_PROVIDER`、`TRIAL_MODEL` | `openai`、`gpt-6.1-sol` | 製作工作在產品裡用的是裁定模型的設定 |
| `TRIAL_RUNS` | 3 | 每項工作的次數 |
| `TRIAL_TASKS` | 全部 | 逗號分隔：`character-generation`、`card-assessment`、`opening-arrangement`、`opening-arrangement-rooms`、`opening-road-repair`、`opening-resources` |
| `TRIAL_DIR` | 系統暫存目錄 | 紀錄輸出位置 |

## 輸出

兩個檔，檔名開頭 `setup-` 或 `setup-dry-`：

- `-summary.md`：每項工作的回覆字元數（最小／中位／最大）、最大位元組、輸出 token 最大值與上限、字元÷輸出 token 的範圍。
- `-calls.jsonl`：逐筆紀錄，含原回覆全文、輸入大小、用量、是否通過該工作的驗證與失敗原因。不含 Key。

## 限制

- 沒有涵蓋 `initialize-city` 與 `suggest-opening-relationships`，這兩項目前沒有介面入口。
- 輸入只有一組範例（四位人物、三個場所）。場所或人物更多時，開局整理與開局備料的回覆會更長。
- 輸出 token 數由供應商回報，推理型模型可能把思考 token 算在內。
