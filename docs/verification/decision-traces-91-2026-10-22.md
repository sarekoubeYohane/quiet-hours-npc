# #91 私有決策實錄本地驗收

基準 main `81f6a4b`；規格 #153，先交付 #91，故障／未提交的持久checkpoint及晚到回覆由 #92 承接。未呼叫付費模型、未推進／重置正式世界、未取得Cloudflare授權或日誌，未合併或部署。

## 結果與範圍

實際NPC／裁定fetch request body及response text在共用派送邊界被捕獲；保存序列、角色／task／requestId、模型參數、usage及每次派送當時的權威scene／物件／供應／身體／活動／規則快照。snapshot保留未變滿杯及耗盡來源，後一角色看見前一角色已發生的世界變化。實錄不從事後prompt重建。

分析頁可唯讀開啟每次操作；純解析候選、規則機械分支、綁定結果、角色實際回饋與真正提交分開。新增模型說明是有界自述，舊理由缺失保持未記錄。完整實錄與8筆journal獨立，NPC遺忘、記憶恢復、上下文及Embedding不讀實錄。單筆1MiB、每owner世界64筆／16MiB、最舊淘汰、無日數到期；容量／遮蔽／寫入／reset缺口可見。

## 執行證據

最初red：`decision-traces-api.test.cjs` 在基準世界操作HTTP200，但 `decisionTrace`不存在；斷言 `completed operation must expose durable private transcript` 失敗。裁定新explanation在舊parser亦遭拒。後續綠測：

| 驗證 | 結果 |
| --- | --- |
| 新trace API／SQLite測試 | 8／8通過：bytes對照、正常否決／未變滿杯、重讀／journal淘汰／8天、遺忘後下次真實派送隔離、跨owner、reset、count／bytes／單筆上限、深層憑證／hidden隔離、兩actor中途世界變化與完整scene、措辭／purpose／來源單變因、trace寫失敗與同ID零新增呼叫 |
| `pnpm test` | activities／world API 527／527、auth 32／32、real Workers/D1及migration gate 10／10通過 |
| `pnpm typecheck` | 通過 |
| `pnpm lint` | 無錯誤；原有4項img／hook警告，本輪檔案指定ESLint無警告 |
| `pnpm build` | 通過 |
| 新Chromium瀏覽器→真實應用→世界API→模型替身→SQLite | success、denied-full-cup、no-progress（unsupported裁定）、rule-reuse四例通過；實際wire bytes、分析詳情、重載及同ID無新增派送 |
| 原operation-evidence Chromium回歸 | 四例通過，8次fixture transport；無真模型 |

運行命令：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/decision-traces-api.test.cjs`；`node tooling/verification/browser-decision-traces.mjs` 使用browser-runtime現有Playwright／Chromium環境變數。runner可用`TRACE_SCENARIO`選單一場景。模型服務是固定回覆替身，結果只證明確定性程式行為。

[成功實錄與wire bytes檢查](assets/decision-traces/success.json)、[滿杯否決](assets/decision-traces/denied-full-cup.json)、[正常無進展](assets/decision-traces/no-progress.json)、[既有規則重用](assets/decision-traces/rule-reuse.json)；各有同名PNG，已人工確認中文payload可讀。rule-reuse JSON另含第二次操作 `reuseTrace`、其原始wire bytes對照檢查及大小。此fixture明示把已形成飲品設consumed、杯子設dirty並加合法dirty轉換能力，模擬已喝完後清洗；不宣稱原正式驗收杯具備該能力，也不修改正式世界。瀏覽器reload後重新選OpenAI，避免demo模式被誤當模型重用測試。

實際完整trace量測：success 154,336、denied-full-cup 147,443、unsupported 146,401 bytes（各2派送，含真schema與snapshot）。早先代表v2/v3 wire body量測與政策理由見[工程契約](../design/operation-evidence.md)。筆數、位元組及單筆上限都由世界API實際操作驗證，非只assert常數；跨context共享owner總上限。

## Review及修正

獨立standards review：無硬規違反，1項重複判定heuristic。已將wording／purpose檢查集中至`checkRoutineMethod`，實際選擇與觀測共用，保留短路語義。

獨立spec review：2項缺口。首次核准原先先綁定後才記parsed，且未帶規則observer；現單次純解析先記候選／模型自述，再帶observer綁定，另記bound-candidate。權威snapshot原先僅scene.external；現同時保存完整scene（doors／noise／occluded等），包括未改變的機械可見／可達條件。另修深層JSON與world snapshot的key-value憑證遮蔽、oversize／read-failure UI空陣列防護及回饋骰值／分支證據。

新增SQLite trigger讓舊real-workerd測試的`;`字串切割器錯拆BEGIN/END；fixture改按既有Drizzle statement-breakpoint分段後真D1測試通過。這是測試migration載入修正，不是跳過D1驗證。

## #153案例的證據邊界

| 項目 | 目前能說明 |
| --- | --- |
| 已觀測（來源#153原報告） | 部署81f6a4b，operationId `1792643094506:e7e221f3-ae00-49e2-879b-0380c4e1037d`、API requestId `9b5767d8-614e-4ebc-bd4b-cefc4cc6e592`，318→319，HTTP200、4次NPC及2次裁定，兩次denied空effects，理由未保存 |
| 假設 | 舊措辭未匹配、杯已裝茶、完成回饋未承接，都仍是待驗證假設 |
| 本輪單變因對照 | 固定合成世界／回覆，分別只改content、purpose或有限來源remaining；程式分支與保存快照能區分這些差異。另正常denied滿杯fixture保存未變cup |
| 結果 | 新工具可查這些合成案例的實際輸入及機械過程，不能補回原事件未存輸入／理由 |
| 未知／下一步 | 部署後依原隔離場景、明確預算及停止條件做一次受限真模型驗收；對照新實錄與可取得的安全stage logs。若仍缺證據，保留unknown，不以本地通過宣稱原根因已修復 |

#153、#85、#104、#106保持各自規格／根因及正式驗收責任，本輪不自動關閉。新資料表需套用0005 migration；舊候選／世界可讀，舊缺理由不回填。世界提交與私有實錄仍是分開交易，#92需明示更多故障及崩潰窗口，不能把候選當成已提交。
