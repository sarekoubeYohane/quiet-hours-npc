# #281 登入驗證 D1 接點回歸

root 固定 `c2a38a3` 的完整 `pnpm test` 已完成 core **1264/1264**，後續 auth runner 出現 502；原始完整 log `/tmp/quiet-hours-context/integration-c2a38a3-full.log` 保留，不以本次窄覆驗改稱整份已通過。這次僅補測試 hosting 接點，沒有修改產品、既有 API 斷言或 legacy 世界安裝前提。

窄反例選用既有「缺少 encryption secret，demo 仍可用」案例：尚未移除 secret，保存合法 adjudication 已回 502。臨時增加回應診斷、保留原狀態斷言，確認產品回覆 `db.prepare(...).bind(...).all is not a function`。全 schema 已套用，根因是 `tests/run-auth.mjs` 的 SQLite D1 替身只有 first/run，缺少中央帳務使用的 all/batch，並且 bind 會修改同一物件的共用 values。

修正後每次 bind 回傳獨立值、all 讀取實際 SQLite rows；batch 使用同步 `BEGIN IMMEDIATE → execute → COMMIT`，失敗完整 ROLLBACK。交易內沒有 await，其他普通 first/run/all 不能讀到或加入半個交易。新增兩項 hosting 契約測試：原 mutable bind 造成 UNIQUE 失敗、原 batch 不存在，均先 red；修正後確認兩組 bound values 分開保存、並行普通 read 看不到失敗 batch 的 partial 值、失敗後仍可提交下一個成功 batch。

| 命令 | 結果 |
| --- | --- |
| 原 missing-secret 窄案例 | red 502≠200；診斷明確為缺 all |
| 新 D1 fixture 契約（修正前） | red 0/2：重綁值覆蓋、batch 缺失 |
| `node tests/run-auth.mjs` | **40/40**，原 38 項斷言保留，另加 2 項 fixture 契約 |
| `node --test tests/auth-workerd.test.mjs tests/model-keys-workerd.test.mjs` | **2/2**，實際 Workers／D1 |
| `npm run typecheck` | 通過 |
| `eslint tests/run-auth.mjs tests/auth-d1-fixture.test.cjs` | 通過 |
| `git diff --check` | 通過 |

窄 red／診斷／green／Workers／typecheck log 位於 `/tmp/quiet-hours-context/review-auth-fixture-*`。沒有重新跑已固定全綠的 core；最後整份 integration suite 仍由整合者於後續固定來源執行。沒有新 migration、正式操作、付費模型或部署。

## 人物文字範本的獨立 D1 fixture

root 固定 `1b09069` 補跑 assets／templates／scenes／drafts／cards／models／migration／versioned 組，原始 **43/44** 結果保留於 `/tmp/quiet-hours-context/integration-1b09069-assets.log`；人物編輯器案例尚未開始操作就因 `scope.world.contextId` 中斷。唯一修復者在最新 `1b09069` 上，先讓既有 helper 明確斷言帳號 GET 狀態，確認實際為 503；再以同 fixture 的原子批次契約反例確認 `d1.batch is not a function`。原 generic 安全錯誤與後續讀 undefined 不是產品建角失敗的證據。

`tests/character-templates.test.mjs` 原本已有 first/all/run 與每次 bind 獨立 closure，僅補 execute 及同步 SQLite batch。原 RETURNING 的 `writeFault=before/after` 分支完全保留，既有故障、去重、版本衝突與全部產品斷言未放寬。新增契約驗證獨立重綁值、失敗 batch 對普通並行 read 的原子可見性、完整 rollback 及後續可繼續寫入；此測試表只是 hosting 接點驗證，不代替使用者建立人物旅程。

`node --test tests/character-templates.test.mjs` 修正後 **3/3**（原 2＋接點 1），包含原完整編輯／保存／重開旅程、提交前後故障與來源隔離；typecheck、該檔 ESLint、diff check 通過。窄 red、契約 red、完整 green 及檢查 log 位於 `/tmp/quiet-hours-context/review-character-fixture-*`。沒有重跑其他已通過 43 項或 core，也未改 root 的隔離驗證工作樹、產品、seed、migration 或正式資料。
