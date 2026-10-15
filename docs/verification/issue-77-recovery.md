# #77 操作恢復診斷與回歸

基準：`e74c6f6c9e73a8230c6be26d7c590403120bf485`（本次取得的最新 main，與票內網站短碼一致）。獨立分支 `fix/77-operation-recovery`。未部署、未合併，未使用真實付費服務。

## 證據界限

#77 正文已完整讀取，留言為空。票內沒有 operationId、原 HTTP 狀態／Content-Type／本文或 Worker 日誌。本次重現的是**注入暫時故障後的恢復缺陷**，不是對當晚首次逾時來源的確認。不認定 D1 死鎖、Cloudflare 額度耗盡或模型故障；也不以未達介面限制推論供應商狀況。

## 快速迴圈與縮小

```sh
node tests/run-activities.mjs tests/recovery-ui.test.cjs
```

執行實際 WorldApp（React DOM）、世界 API 與記憶體 SQLite。只替換瀏覽器 DOM、登入／環境 binding、網路故障及時間；不 mock 自有的世界／決策／日誌邏輯。DOM 使用 happy-dom。Chromium 兩個版本下載都取得不完整 ZIP，未能啟動瀏覽器；最初的缺 executable 不是應用程式 red。刪除了未能執行的瀏覽器原型。

最初完整鏈：租約等待超過前端預算 → 按重試 → API 提交但遺失回應 → 再等待逾時 → 重新載入取得 HTML。原始失敗輸出：

```text
HTML reload: Unexpected token '<', "<!DOCTYPE "... is not valid JSON重新載入
✖ reload recovers after lease timeout, committed lost response and HTML outage
AssertionError: expected not to match /Unexpected token|not valid JSON/
```

縮小時逐步移除第一次等待、明確重試及 HTML 故障。只剩「提交但遺失回應 → pending → 成功 GET 重新載入」仍失敗：

```text
AssertionError: reload must reconcile the saved operation
true !== false
```

單次 HTML GET 足以重現解析錯誤；不需要模型或特定共同事件。兩個症狀可分開重現。新增唯讀查詢的 API 測試亦先 red：`Cannot read properties of undefined (reading 'state')`，當時 GET 沒有操作狀態。

早期執行用 `HAPPY_DOM_MODULE=<本機暫存安裝路徑>` 載入 DOM 工具；正式保留測試已將 happy-dom 加入 devDependencies，不需此參數。完整鏈一般約 3 秒、含 42 回合前置約 8–10 秒；可無人操作重跑。舊版偶爾因 AssertionError 展開整個 DOM 物件拖慢，已改為純布林斷言，避免巨型失敗輸出。

## 排序假說與結果

在修復前向使用者展示四個假說，再逐項驗證：

| 順序 | 可證偽預測 | 結果 |
| --- | --- | --- |
| 1 | 若 reload 未對照日誌，單純 GET 成功後 pending 仍在；唯讀查到定案後可恢復 | 成立。原程式 readLatest 僅依 sessionStorage 設 pending，不查日誌。新增查詢後恢復 |
| 2 | 若讀取直接假設 JSON，HTML GET 本身即可觸發原始解析錯誤 | 成立。HTML、空白、壞 JSON、null 及缺欄位物件分別注入；修復後顯示 HTTP／格式，不移除 pending |
| 3 | 若伺服器重放不可靠，同 ID 恢復會多一回合、事件或模型用量 | 模擬邊界未支持。原有重放／CAS／回應遺失測試通過；新增付費 mock 查詢三次仍只有 4 次模型 dispatch，120 input／80 output tokens |
| 4 | 若服務仍不可用或結果不明，GET 成功也不能安全解除 pending | 成立。unknown／pending／uncertain／expired 分別保留；查詢不派送未知操作，不修改到期 pending |

沒有證據把以上任一項提升為當晚最初逾時或 HTML 來源的根因。

## 修復與測試邊界

- `GET ?operationId=` 用同一筆 row 的世界、版本與日誌提供定案狀態；只讀，不自動重送未知付費操作。
- 重新載入／回前景只在日誌確認定案時清除同 scope pending。失敗保留原因，成功恢復按鈕；不明／淘汰／非 JSON 保留原 ID。
- 前端所有世界回應解碼拒絕不合契約的格式。HTML 4xx 不當作已確認的受理前拒絕，401 不會先被 JSON 解析遮蔽。無回應本文、憑證或模型 Key 被記錄。
- 保持原 lease、CAS、日誌提交與模型 dispatch 行為。沒有強制解鎖、刪 pending 來繞過不明結果、重置世界或新增自動排程。
- 既有真實租約競爭／可控時鐘／保存前後故障注入，搭配新 UI 鏈與付費 mock，驗證保存結果恢復、未知操作不執行、版本不倒退、世界／事件／用量一致。
- UI 中的等待 409 與回應遺失由請求邊界注入；不是實際 Cloudflare 網路。完整 Worker runtime 仍由現有 workerd 回歸檢查，不代表新 UI 已在真實瀏覽器通過。

## 執行紀錄

```sh
node tests/run-activities.mjs tests/operations-api.test.cjs tests/recovery-ui.test.cjs
RECOVERY_HISTORY_TURNS=42 RECOVERY_AUTOMATIC=1 node tests/run-activities.mjs tests/recovery-ui.test.cjs
pnpm test
pnpm typecheck
pnpm exec eslint app/api/world/route.ts lib/world-response.ts tests/recovery-ui.test.cjs tests/operations-api.test.cjs tests/run-activities.mjs
pnpm build:test
git diff --check
```

42 回合 fixture 額外經 API 放入共同事件，從「開始自動」觸發相同故障鏈（加速 30 秒排程）；回復後為第 43 回合，不是線上原世界的完整狀態重播。正常快迴圈只有一個回合。模型用量由額外 API mock 回歸驗證，沒有使用使用者的 Key。

完整 `pnpm test`：238/238 通過（196 世界 API／行為／UI、32 登入／Key、10 Workers／migration）。`pnpm typecheck`、上述指定檔案 ESLint、`pnpm build:test`、建置環境檢查及 `git diff --check` 通過。

WorldApp 單檔 ESLint 仍有 3 errors／1 warning（render 使用 ref、effect 同步 setState、頁面原生連結、act dependency）；以 `git show e74c6f6:components/world-app.tsx` 取出基準逐一比對，四項均已存在，未宣稱全 repo lint 通過。

雙軸 review：Standards 無硬性違規，提出過期判斷重複與固定時間等待兩項建議；已共用 ID／過期判斷，並改為有 5 秒上限的 UI 狀態等待。Spec 提出 JSON 4xx `{}` 仍清 pending、以及缺失敗／不明結果 UI 分支兩項 P2；新增測試先 red（`malformed 4xx must retain pending`, actual null），再修正拒絕回應必須具有效 error 欄位，並驗證真實 API 保存失敗、expired pending tombstone 的 UI 協作。此版本同時檢查 pending 原 ID、控制按鈕、模型 dispatch 1 次與已保存用量；均通過。Standards／Spec 複審均通過，各 0 項未解決發現；審查者分別重跑 13 項 API／UI 與 1 項 UI 測試通過。臨時診斷訊息及未採用的瀏覽器 harness 已移除，保留的測試為日常 `pnpm test` 的一部分。

## 待驗證與最少額外資料

- **一小時線上實測未執行、未通過**。部署後再記錄起訖、版本、回合、用量差額及故障／恢復狀態。
- 要定位當晚首次逾時與 HTML 來源：需要該時間段 Worker request／exception 日誌（2026-10-15 23:11–23:14，Asia/Taipei）、失敗的 GET 或 POST 路徑、HTTP 狀態／Content-Type、Cloudflare request ID，及 pending operationId 和唯讀日誌狀態。請勿附 cookie、Authorization 或 API Key。現有票內沒有這些證據。
- 仍不保證跨模型供應商與 D1 的交易原子性。Worker 在 dispatch 後終止而未保存的用量無法由此查詢還原，不能宣稱已防止所有供應商用量遺失；本次驗證的是已保存用量不因恢復而消失或重複計入。


## 後續：開啟觀測（使用者確認）

使用者確認改為啟用 Workers Logs：`enabled:true`、`invocation_logs:true`、`head_sampling_rate:1`、`persist:true`。以 Wrangler 解析 local／test／production，均繼承此設定。先前使用者提供的 false 已由本次確認取代。

伺服器 `rsc`／`ssr` 建置產生 external source maps，Wrangler 開啟 `upload_source_maps`。首次建置產物缺少觀測設定；只增加 Cloudflare Vite plugin 的 `configPath:"wrangler.jsonc"` 後，重建確認產物帶入日誌及上傳開關，避免沿用舊的產物設定。`dist/server/index.js.map`、ssr 與伺服器 chunks 的 maps 存在，`dist/client` 沒有 map。部署前檢查增加日誌／map 上傳設定守門。

世界 API 新增結構化 `world_api` 記錄，白名單只有 requestId、已驗證 operationId、stage、lease、version、outcome、status、durationMs。回應附 `X-World-Request-Id` 供 Network 面板與日誌對照。階段包括讀取、日誌重放、租約等待／取得／到期、模型派送、提交開始／成功／衝突及失敗；不記錄 URL、headers、帳號、請求本文、模型內容或錯誤原文。診斷輸出失敗不改變操作結果。

新增 API 測試先 red（缺 `X-World-Request-Id`），再 green；檢查 requestId 與 operationId 可關聯提交、回應狀態，事件私密文字與 Key sentinel 不出現在日誌。外部模型繼續全數模擬。這次修改不會自行部署，Cloudflare 端實際保存、source map 上傳成功與一小時實測仍待部署後驗證。


觀測追加最終檢查：`pnpm test` 240/240（198 世界／UI、32 登入／Key、10 Workers／migration），typecheck、相關 ESLint、build:test、建置守門與 diff check 通過。Standards 新增審查 0 發現；Spec 找到模糊保存後缺確認日誌，已以 throw-after-save 先 red 後 green，補 `journal-confirmed` 並區分 settled／uncertain；複審通過。另驗證 console.info 拋錯不影響世界操作成功。本段仍不代表 Cloudflare 實際日誌保存與 source map 上傳已驗證。
