# #92 故障與未提交回合追溯本地驗收

依賴 #91／PR #154，規格 #153；本輪只交付 #92。基準本地 #91 `c8e9bb3`，#92核心 `dea034c`，最終修正 `e1e1808`。沒有呼叫付費模型、推進或重置正式世界、取得Cloudflare授權／日誌、合併、部署或關閉 #153／#85／#104／#106。

## 實作結果

同一私有保存／查閱路徑增加accepted、準備派送、fetch開始、HTTP headers／原body、已知usage、候選與技術失敗保存點，逐個await。保存準備本文與證實fetch開始分開；跨服務credential在首個保存點前註冊，無法安全取得未使用服務Key時只存明示省略的安全metadata，不阻擋demo／直接控制或正常另一供應商。

格式、HTTP、傳輸、body讀取、逾時、非法NPC候選、較早候選後回合回復、租約失效／晚到、保存衝突與模糊save結果均沿原世界交易／journal定案；候選效果和D20不是已提交世界。trace自身寫入失敗保留最後durable副本並在journal／API／分析顯示缺口，不回滾已提交世界。journal遺失但archive證明曾受理時禁止再派送；仍在別的lease時維持409 waiting，之後只回uncertain，不從archive重建原HTTP結果。

停止原因的分析焦點獨立保存原operationId，無world／evidence的錯誤亦不會選到較早成功操作。archive durable階段、journal提交結果和本次HTTP的非持久缺口分開顯示；後者只在React state、匹配本操作時呈現，重載不補造。未知context的安全骨架仍在同owner列表可發現。

## 紅綠與外部故障矩陣

最初API red：provider gate仍pending時，GET只有journal pending，沒有durable private trace，`in-flight operation must expose its durable checkpoint`失敗。Chromium red：無world／evidence的conflict後，分析仍選舊成功ID；另malformed body沒有實際provider-body分類。review另重現cross-provider Key只在後續裁定才註冊，導致較早NPC保存點洩漏；此項以不帶sk前綴的合成Key做紅綠修正。

所有回覆皆為本地固定fixture；瀏覽器與API實際執行產品React／world handler／共用transport／SQLite，未以直接寫trace表代替產品保存。外部邊界才注入provider回覆、時間、加密儲存損壞與DB故障。

| 場景 | 可核對結果 |
| --- | --- |
| NPC／裁定malformed HTTP body | 原body仍存，provider-body失敗，不捏造usage／答案 |
| NPC malformed JSON／合法JSON非法action | candidate-format的parse階段與candidate-validation的contract階段分開 |
| 裁定malformed candidate／既有效果驗證 | 原NPC與裁定輸入／回覆保留，驗證證據和回復世界可核對 |
| HTTP429、傳輸reject、200／429 body-read failure | HTTP狀態與已知usage保留；429即使body壞仍維持provider-limit分類 |
| 在prepared保存點abort | 沒有fetch、沒有實際dispatch證據；本文標示準備，發送未知 |
| NPC與裁定timeout後回覆 | 原timeout可讀；若worker仍活著且晚到body可得，只存late-discarded與有界lateUsage，原世界／journal／費用／D20不續做 |
| 較早actor已產生候選、後一actor失敗 | 保留中途世界快照與早先回饋，整回合世界原子回復、已知用量保留 |
| lease失效、uncertain後遲到、舊trace被淘汰再遲到 | 不執行候選、不回生舊journal或trace；原ID不再派送 |
| save-before／save-after／CAS conflict／replacement journal loss | 分別未提交、讀journal確認已提交、明確衝突或缺口；同ID零新增模型／重擲／效果 |
| D20已產生後save-before | roll 6仍只是候選證據；失敗世界不含效果；原ID重送不重擲 |
| trace全寫入失敗／prepared後寫入失敗 | 世界仍按原交易提交，最後durable實錄與journal後續結果不混淆；本筆gap即使已有較早trace亦顯示 |
| archive讀取不可用 | 本地化503、before-acceptance／prior-acceptance-unavailable；零模型／世界更新；恢復後原ID只首次執行一次 |
| count／bytes／單筆超限故障紀錄 | 故障同受64筆／16MiB／1MiB；超限骨架不丟failure、discarded、lateUsage與既有gap |
| cross-provider Key／unused damaged Key | 早期保存點遮蔽所有已知configured Key；未使用損壞Key不阻其他行為，但trace明示credential-redaction-unavailable且無不安全payload |

## 測試執行

- 新API／SQLite故障測試31項，涵蓋上表及原ID重送。
- 最終完整suite（`e1e1808` runtime）：world／activities／API **558／558**、auth **32／32**、真Workers／D1與migration gate **10／10**全部通過。較早snapshot曾有兩項lease HTTP狀態回歸；修正後完整最新suite零失敗，未把舊snapshot通過項誤稱最新全綠。
- 最新runtime的Typecheck與production build通過；ESLint零錯誤、原有4項img／hook警告。`git diff --check`通過。
- Chromium 13種故障情境通過，backend `30a2b5f`：[摘要](assets/decision-trace-faults/ui-test-summary.json)。包含NPC body／candidate錯誤、裁定錯誤、HTTP、傳輸、後actor回復、CAS conflict、save前／後、lease晚到、兩種trace寫入失敗及archive讀失敗。每例原始operationId／requestId、API讀回、原候選或缺口、重載／同ID零新增派送檢查及PNG／JSON位於同目錄。
- 第14個Chromium場景以最終runtime `e1e1808`執行：正常OpenAI＋unused damaged OpenRouter Key，世界200提交、安全metadata-only；9次操作後journal已淘汰，原實錄仍可於列表發現／選取／重讀，列表明示場景未知，原ID410且零額外模型。見[JSON](assets/decision-trace-faults/credential-redaction-unavailable.json)及同名PNG；原13場景版本保持原樣，未偽稱重跑。
- 父代理獨立執行backend `30a2b5f`正常Chromium四例（success／denied-full-cup／unsupported／rule-reuse）全部通過，對照wire bytes、SQLite重讀、UI與same-ID無額外呼叫。這是#91正常路徑回歸，不把未變fixture當新根因證據。

命令：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/decision-trace-faults-api.test.cjs`；`node tests/run-tests.mjs`；`node tooling/verification/browser-decision-trace-faults.mjs`使用既有browser-runtime的Playwright／Chromium變數，`FAULT_SCENARIO`可只跑單例。所有fixture transport拒絕真模型網路。

容量：與#91相同1MiB單筆、owner世界64筆／16MiB雙上限、最舊淘汰、無按日數到期。跨context共享上限，metadata未知context也不能繞過；reset清除原owner歷史。首次跨單筆上限時量測完整JSON bytes，轉有界骨架並停止繼續收集本文，`omittedOriginalBytes`表示首次超界當時實測值，而非虛構最後本來會有多大。這避免每個後續保存點重串所有已超限舊payload；包含40actor容量情境的59項相關API回歸通過、合計35.2秒，先前未壓縮的48項回歸約144秒。這些是本機多測試合計，不能解讀為正式站單回合延遲或永不逾時保證。

## Review與修正

Standards review重現早期checkpoint cross-provider Key洩漏，現任何本文持久化前註冊可用configured Key；若未使用服務無法解密，改只存安全metadata而不是阻世界或繼續保存未遮蔽內容。共用骨架處理容量及安全省略，保留機械故障與有界用量。

Spec review指出超限時丟lateUsage／discarded／failure／原gaps，已保留；NPC generic錯誤無法區分解析與驗證，已在實際catch機械記錄。未知context安全骨架原先不出當前context列表，現以owner權限併列並明示未知。原有formation／physical lease conflict回歸發現502取代409，修正為較新lease仍有效先waiting，原世界、用量及零新增派送的斷言維持。

## 相容性與正式待驗

沿#91附加0005 migration；#92不新增另一付費儲存服務或重送引擎。舊世界／舊候選／舊journal仍讀取，缺理由／未捕獲實錄不回填。#92為防journal遺失窗口重派，新增受理前archive查詢可用性依賴，必先套migration；讀不可用則停在受理前，寫不可用則不影響已受理世界交易。這是相較#91初版的明示可用性取捨。

完整私有實錄不進World、記憶／回想／Embedding／恢復或一般console。unknown／prepared與寫入gap仍可能在崩潰時留下：provider與SQLite沒有原子交易；fetch到dispatched保存點、world CAS到final trace之間無法消除窗口。Worker回應後或硬終止可能不再完成底層provider Promise，因此晚到捕捉是「執行仍存活且回覆實際到達時」的best effort；Node fixture不能保證正式Workers lifecycle或所有provider都相同。

正式待驗包括套migration／部署版本、真D1延遲與lease成本、Workers晚到／中止生命週期，以及依原隔離世界、明確預算與停止條件的一次受限真模型輸入→理由／事實引用→驗證→提交→NPC承接鏈。Cloudflare CLI受環境網路政策阻擋，未取得授權或日誌；不要求用戶貼憑證。

## 原案例的觀測、假設與未知

#153記載原部署81f6a4b，operation `1792643094506:e7e221f3-ae00-49e2-879b-0380c4e1037d`、API request `9b5767d8-614e-4ebc-bd4b-cefc4cc6e592`，318→319，HTTP200、4次NPC／2次裁定、68,764 tokens，兩次denied且effects空。這些觀測證明該次Key／呼叫成功，不證明否決合理。

「舊措辭／purpose沒匹配」「杯中已有茶」「完成回饋未承接」仍是維護者假設。#91單變因合成對照只改措辭、purpose或來源狀態，#92固定回覆故障對照只改傳輸／格式／儲存／租約條件，能驗證新的程式追溯與隔離，但不能還原原先沒有保存的裁定input／理由或模型內部根因。下一步是部署後受限真模型驗收並用原關聯ID對照可取得的安全stage logs；證據仍不足時保持未定，不以工具完成、fixture通過或某次未復現結案。
