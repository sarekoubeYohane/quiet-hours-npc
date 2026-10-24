# 記憶選留引用與候選安全診斷（2026-10-24）

範圍：[完整 #161](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/161) 與 [#92 頂端 2026-10-24 補充](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/92)。本地合成 fixture 驗證，不是正式站或真實模型驗收；零付費模型呼叫，未操作正式世界。

## 來源與前置

- 基準 main `58b8aa954802183a1e937c714c893fb0763a0c99`；`git diff --stat 6dfe6c7 HEAD` 在修正前只有 PR #160 的兩份報告，產品程式相同。
- 已讀 #161、#85、#92、#91、#153 票面及留言（上述票留言皆空）、PR #160 與其空討論，以及 `clean-start-preflight-2026-10-24.md`、`clean-start-live-observation-2026-10-24.md`。歷史長期引用錯集合的定位依報告；未取得原私有包，沒有獨立重放原 transcript。
- 沿 AGENTS、Matt Pocock implement-spec／diagnosing-bugs／TDD／code-review／PR 流程、GLOSSARY、記憶工程契約及 ADR 0001／0003／0004。本次補既有工程契約，沒有新的產品或架構決策，不新增 ADR。
- #91 本切片的必要前置已存在：`0005_decision_traces.sql` 的附加表、共用派送 awaited 保存點、owner 限定的讀取／列表、原操作 GET 與分析入口、單筆 1 MiB／64 筆／16 MiB 容量及缺口骨架。本輪沿用並驗證，不以 Issue open 判斷需重做，也不關閉 #91 或全面宣告 #92 完成。

## RED 與可反證對照

最高層 seam 沿世界 API → 共用派送替身 → 真實序列化／測試 SQLite → 世界與私有實錄重讀；schema 測試驗證真正 outbound request 的行為，不以原始碼字串代替。

1. `node tests/run-activities.mjs tests/memory-selection-contract-api.test.cjs`：修正前長期 ID／版本仍符合實際送出的 schema，預期拒絕卻得到 `true`。假設依序為靜態 schema 未綁集合、驗證讀完整短期而非實際投影、回想續答沒有同步當次引用範圍；以實際 request 和合法／非法引用的單一變因對照核驗。
2. `node tests/run-activities.mjs tests/candidate-diagnostics-api.test.cjs`：修正前 malformed JSON、長期 ID、錯版本、外來引用、格式錯誤五案重讀的 `failure.reason` 皆為 `undefined`。假設依序為 NPC catch 遺失分類、capture 遺失欄位、容量省略遺失原因；先小型紀錄，再獨立驗證省略骨架與寫入故障。

沒有以既有泛化錯誤文案推定歷史模型根因，也沒有用新診斷回填舊紀錄。

## 驗收界線

OpenAI 一般決策及回想續答使用 strict schema，引用 ID／版本成對約束；回想首輪沿一般 JSON 模式，OpenRouter 沿現有派送模式，這些路徑仍須收到候選後驗證，不能宣稱全路徑在生成階段保證合法。各模式不新增派送、付費修復或回退模型。

現行輸入預算優先保留 canonical 短期，裁剪相容文字投影、長期及認知；若必要短期已無法容納則拒絕，不為本票新增短期截斷政策。引用快照以每次最後真正送出的短期集合建立，完整角色記憶仍供評估／提交，不以投影覆寫。

固定替身通過只證明程式、schema、保存及隔離行為。真實供應商接受性、模型是否較少選錯集合、10/16 Luna 歷史故障及泡茶 loop 仍未驗證；#85 不因本輪交付結案。

## 整合驗證與審查

審查產品樹 `070e576`（tree `44e66ff6b90f2f1cb9afeeb580dc428ec93ff214`）；公開 PR 初始提交 `2938e2e` 與該樹完全一致。最終只追加本驗證文件。

- 修正前完整 `pnpm test`：613 項通過（571 活動／API、32 認證、10 Workers／migration）。
- 修正後完整 `pnpm test`：627 項通過（585 活動／API、32 認證、10 Workers／migration），0 失敗；包含原派送上限、追溯容量及缺口政策回歸。runner 載入 `no-network.mjs` 封鎖外網模型請求。
- 整合 focused：`node tests/run-activities.mjs tests/memory-selection-contract-api.test.cjs tests/candidate-diagnostics-api.test.cjs tests/recall-api.test.cjs tests/memory-api.test.cjs tests/maintenance-api.test.cjs tests/cognition-api.test.cjs`，98 項通過、0 失敗。
- 整合 Chromium：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tooling/verification/browser-candidate-diagnostics.mjs`（另以環境變數指定 Playwright 與本機 Chromium），5／5 通過。真正 WorldApp／API／SQLite 的 JSON、引用、格式三分類與舊缺失／未知碼，分析與重載保持，查看不派送。
- `pnpm typecheck`、`pnpm build`、`git diff --check` 通過。
- `pnpm lint`：0 errors，4 個既有 warnings，位於未修改的 character-profile.tsx、pixel-world.tsx、world-app.tsx（img 與 effect dependency）。沒有為本輪順帶修改 UI 政策。

依 code-review 執行兩個獨立代理，固定比較 `git diff 58b8aa9...070e576`，並核對該區間提交、完整工作票與工程規範：

- Standards：0 項 finding，無文件規範違反或需要處理的 baseline smell。
- Spec：0 項 finding，無阻擋性缺項或範圍擴張；真實供應商與模型品質維持未驗證。

兩軸均無待修 finding。沒有關閉 #91、#92、#85；PR 的 closing reference 僅 #161。沒有新增 migration 或改變原派送／容量／缺口政策。
