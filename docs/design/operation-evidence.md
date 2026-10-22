# 操作驗收證據

規格 [#133](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/133)，單一垂直工作票 [#134](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/134)。基準 main `d2f3ec3`；本輪承接 #122／#123 決策，不重新 Grill。

## 修正前盤點與最小範圍

| 既有來源 | 已能證明 | 缺口／處理 |
| --- | --- | --- |
| #132 API JSON 與兩張截圖 | 原杯 tea、飲品 ID、完整對齊規則、活動完成及重載一致 | 沒有原 proposal、target、candidate 或 operationId；不能回推 |
| GET 世界與 `?operationId=` | 帳號隔離、最新世界、settled／pending／uncertain／expired／unknown、失敗診斷 | 補成功與失敗的有界證據及可發現的 operation ID |
| 操作 journal | 原子提交、原 HTTP 結果、同 ID 精確回放、最多八筆與水位淘汰 | 沿用；證據附原結果，不另建交易或重播引擎 |
| Worker `world_api` logs | API requestId、operationId、階段、版本、結果 | 刻意不記 payload，無法補回已丟棄的成功候選 |
| NPC／裁定 transport | 原 requestId、回覆、已知 usage 在當次請求中存在 | 在既有邊界被動捕獲必要欄位；不加模型呼叫 |
| 瀏覽器 pending | 網路中斷時以原 payload 重試 | settled 後移除；沿 journal 提供安全的已完成 advance 重送資料 |

最小 API／SQLite red：`NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/operation-evidence-api.test.cjs`。基準上成功回合 HTTP 200、操作 settled，但 `operation.evidence` 不存在；一項測試失敗，訊息 `settled success must expose original proposal and raw adjudication evidence`。這個測試檢驗證據缺口，不把泡茶成功改寫為 runtime 失敗。

診斷假設依次為：journal 已存但 GET 未暴露、成功路徑解析後丟棄、僅 UI 遺失操作資料。逐一核對後，成功候選確實只存在於當次執行記憶中，journal 從未保存；UI 也移除 settled payload。既有同 ID 重放機制沒有故障，故不新增重送 endpoint。

## 資料與權責

證據只供觀察者使用，跟隨 journal 的存活期限，不寫入 World、事件、NPC 記憶或下一次模型上下文。NPC 只投影行動種類、原文、target、purpose、一般估時及投入上限；不保存整份含記憶／認知的回覆或輸入 transcript。裁定候選在驗證及時間對齊前投影必要契約欄位，與實際保存後的規則時間、活動及物件身份對照。

原執行部署和 API requestId 保存在證據內；重送有自己的 HTTP requestId，但不改寫原證據。實際 transport 派送與原費用帳的「付費嘗試」分開記錄；未知 usage 保持未知。診斷 callback 不影響原模型回覆、驗證、預算或世界效果。

同一原子 UPDATE 保存世界與證據。技術回滾的證據可保留已收到候選，但結果只能描述實際保存的回滾世界；提交未確認時不可宣稱候選成果已保存。原子失敗恢復沿用既有 journal 與已知用量補記流程。

此契約涵蓋已受理且定案的操作。驗證／認證拒絕發生在受理之前，不新增 journal；Worker 硬中斷或資料庫持續不可寫時，尚未持久化的候選與供應商用量仍可能不可得。沿用 pending／uncertain、禁止同 ID 再執行的保障，不宣稱跨模型服務與資料庫有分散式交易，也不把未知用量補成零。

一般 GET 可發現有界近期操作；指定 ID 使用原 `GET /api/world?operationId=...`。分析頁顯示證據，安全重送使用原 `POST /api/world` 與原 ID。對已淘汰、舊版缺證據、不明結果明示缺口，不製造候選或新 ID。重送資料不保留 advance UI 夾帶的無關文字、對象或認證；API Key 不在任何證據內。

### 讀取欄位與上限

- POST 的 `operationEvidence` 是該次原執行證據；一般 GET 的同名欄位是當前場景最近證據，`recentOperations` 提供保留操作摘要。指定 ID 後以 `operation.evidence` 為準；舊記錄沒有證據時為 null。
- `deployment`、`operationId`、`requestId`、`baseVersion`／`resultVersion` 關聯執行；`dispatches` 逐筆記錄 task／actorId／requestId／provider／model／usage 與 `candidate.value`。這是原值的必要欄位投影，不是整份模型 transcript 或原始 HTTP 本文。
- `outcome` 分 committed／rolled-back／not-committed。`result` 只投影保存的世界時間、活動、對齊規則及變更物件；未確認世界提交時不附候選世界成果。
- 單筆證據 JSON 的 UTF-8 硬上限為 64 KiB；超過 32 KiB 的原回覆不展開保存，候選明示 omitted。最多保留 32 筆派送明細，總 counts 仍反映實際派送。陣列、巢狀深度及字串另有界限，遮蔽或截短皆有標記。
- 仍沿用 journal 最多八筆及 500,000 bytes 的淘汰目標；「最新完整原回應本身超過門檻仍保留」是既有精確重放契約，不表示新證據可無界增加。淘汰後同 ID 不會重新執行。

## 原杯能力與驗收界線

`daily-life-v1` 原杯只有 contents 的 empty／water／tea 及 clean 的 yes／no。現行日常 drink 會消耗飲品並將杯 contents 設為 dirty，嚴格效果驗證要求物件事前宣告此轉換，因此原杯不具備這條 drink→wash 驗收鏈。背景具體化普通杯原本已有 dirty 能力；兩者不可混報。

本輪不修改驗收場景或杯子能力。正式站先唯讀核對能力，不足時記錄「場景準備不足」並停止該分支；不能直接補欄位，也不能把未測當失敗。獨立具備完整能力的本機 fixture 僅證明該 fixture 的行為。

本機通過不代表已部署；正式執行見 [合併部署後流程](../verification/operation-evidence-live-runbook.md)。

## 完整私有實錄（#91／#153）

原有64KiB必要欄位投影與8筆 journal繼續負責精確HTTP重送及近期操作證據，不能冒充完整實錄。新增 `decision_traces` 私有 SQLite/D1 資料表，與 `worlds.state`、記憶、回想、Embedding及記憶恢復分離；世界API驗證原登入owner後才讀取。一般 GET 的 `decisionTraces` 提供目前context清單和整個owner世界保存範圍；`?operationId=` 另回 `decisionTrace`。即使journal已淘汰，仍可查保存界限內的私有實錄；重送仍使用原journal，不因有實錄而重跑模型或骰子。

共用 `requestModel` 在真正fetch邊界擷取當次序列化request body，以及收到的response text。實錄逐次保存NPC／裁定的角色、原requestId、供應商／模型、usage、輸入當時的權威物件／供應／環境／身體／活動／規則快照。每次snapshot在當次派送時凍結，不用回合起末或world diff替代；後一角色因此可看到先前實際改變。授權headers不捕獲；已知服務Key及可辨認credential字段／文字在保存前遞迴遮蔽（包含JSON內再編碼的messages和候選），有變化時明示redacted。無須遮蔽的request/response保留原字串。

同一實錄按順序保存解析候選、實際程式規則檢查、活動執行後角色自己的shortTerm／memories／observations及活動、骰值／分支和已提交結果。權威snapshot可含hidden事實，因此只供觀察者；回饋snapshot是原角色實際資料，不用權威診斷替角色補知識。下一次上下文只有實際發生派送時才能在其request body看到，讀取實錄不推進世界。

集中裁定契約新增nullable `explanation`，含summary（最多512字）及facts（最多8筆，每reference160字、value256字）。供應商schema要求這個欄位，但舊候選未含欄位仍可解析，顯示未記錄、不補造；整體候選原有上限仍適用。這是有界可核對的模型自述，不是內部思考，也不是程式已驗證的真實因果。`source=program`的規則檢查與`source=model-self-report`分開；維護者假設不寫成原模型理由。

### 量測與有界政策

以既有API／模型替身／SQLite的實際serialized bytes量測：routine-v2 NPC請求26,088／回覆342、裁定請求89,636／回覆2,728 bytes；world-v3 NPC請求26,088／回覆306、裁定請求89,600／回覆10,180 bytes。這些是合成fixture，含真實生成的schema/prompt，不是10/22原事件。單一2dispatch的body已約120KB，64KiB必要投影不足以保存。因此本輪選定單筆1MiB、每owner世界64筆及16MiB雙上限。這容納一般2dispatch及較多角色操作的保守倍數，但不是一小時保證。

- 上限以完整JSON的UTF-8 bytes計數；SQLite CHECK驗證單筆bytes值，INSERT／UPDATE trigger在同一statement transaction依created_at／rowid最舊優先淘汰，達任一上限即淘汰。所有context共享owner總上限，不能透過反覆進出驗收繞過；淘汰累計metadata每owner一行。
- 單筆超過1MiB時，不靜默截斷成完整件；改存帶`single-record-limit`、原始bytes數及有界派送／已知用量的缺口骨架。列表、詳情可見缺口。無按日數到期。
- 實錄在世界CAS確定成功後才標committed／rolled-back保存。世界及供應商呼叫與實錄不是單一交易；journal先放`pending / world-and-trace-are-separate-transactions`狀態，實錄寫入後補狀態。寫入失敗回`write-failed / trace-write-failed`，不能宣稱完整；世界原提交及精確重送不受影響。持續資料庫故障可使狀態補記本身也失敗，因此pending必須視為缺口而不是完整。
- reset成功後清除owner舊實錄，再保存reset操作本身；清除失敗以trace-lifecycle-gap呈現。驗收場景進出保留舊context證據，在同一owner總容量下淘汰；當前context列表不把其他context混入。
- 舊世界、舊操作及舊候選不回填內容。找不到實錄可能是舊版、淘汰、未捕獲或寫入失敗，不代表沒有派送。#92持久checkpoint、遲到／租約與故障崩潰窗口見下節。

新資料表為附加migration；新讀取器兼容無實錄的舊世界。發布前須套用0005 migration；#91初版未套用時故事仍可執行、讀寫實錄明示失敗；#92為防同ID重派新增受理前歷史查詢依賴，未套用時停止受理，詳見下節。回退程式可保留新表，不能刪除已記錄證據當作回退步驟。完整payload不寫入console，一般安全stage logs仍只攜既有關聯欄位。

## 故障與未提交的保存點（#92）

#92沿同一張私有實錄表與同一GET／分析詳情，新增awaited保存點。受理後先保存accepted；共用transport在fetch前保存真正準備的body與當時世界快照，fetch開始後保存dispatched，收到headers／body／候選／已知usage／技術故障後逐步保存。observer與保存失敗不改原模型候選或增加呼叫。首個保存點前註冊目前帳號兩種configured服務的Key，以免NPC輸入意外包含另一供應商Key時在較早保存點洩漏；headers仍不捕獲。

| 最後已知階段 | 能證明 | 不能證明 |
| --- | --- | --- |
| accepted | 本操作取得原租約、被受理 | 已呼叫模型 |
| dispatch-prepared | 當次真正準備的body／當時世界已保存 | fetch確實發生；保存返回到fetch之間仍可中斷 |
| dispatched | 此worker已開始fetch並保存關聯 | 供應商完成、usage、候選合法 |
| response-headers | 已收到HTTP狀態 | body收到或可解析；429body失敗仍保留provider-limit分類 |
| received／candidate-received | 實際回覆／候選原文已可得 | 解析／驗證或世界提交成功 |
| timeout／transport／response-body／provider-body／candidate-format／candidate-validation | 程式實際失敗的邊界 | 模型內部根因、正常世界否決 |
| commit-start | 世界結果仍為交易候選 | 已提交 |
| world-commit-confirmed／journal-confirmed | CAS成功或原journal確認的結果與版本 | 原事件未記錄的模型理由 |

NPC格式錯誤以實際JSON解析與契約驗證catch記錄，不從錯誤文案反推。裁定的純解析、綁定／效果驗證及世界提交保持分工；較早NPC已執行的候選仍可查，後一角色失敗時整回合回復，實錄outcome為rolled-back並展示回復後世界，不能稱局部效果已提交。

provider timeout由同一signal／原25秒上限約束；忽略abort的底層回覆可在worker仍活著時保存為late-discarded、保留原失敗及可機械讀得的lateUsage，但不續做parser、D20、世界效果或改寫原journal／已知費用。租約／版本失效後已收到的候選亦標discarded及lease-invalid。lateUsage是供應商回覆證據，與已定案費用帳分開，不把未知用量補成0；負數／非有限數不列為已知。Worker已終止或body永不返回時，實際回覆仍不可得，不保證可捕獲所有晚到內容。

保存點以序列queue逐個await，final outcome也經同一queue，避免較早保存點在最終定案後覆蓋新結果。第一次成功保存保留原acceptedAt；之後僅UPDATE原owner／operation／request的紀錄。被淘汰或reset清除的in-flight紀錄不因晚到worker重新INSERT；所有內容仍受1MiB／64筆／16MiB同一限制。超限骨架保留有界failure、discarded、已知usage／lateUsage及原資料缺口，不把大回覆省略誤當沒有用量或沒有錯誤。

world CAS衝突明示not-committed；throw-before經原pending確認未提交，throw-after則讀原journal確認已提交，不能只按exception判定。若原receipt被替換、已淘汰或儲存持續不可讀，保留unknown及最後成功保存階段；不把較後新操作成功覆蓋原失敗。讀取或重送仍沿原journal。若原journal receipt已遺失但archive證明同ID曾受理，只回uncertain並說明journal-receipt-unavailable，禁止用archive重建／重做操作。

因此#92新增一項**受理前的私有歷史讀取依賴**：在接受一個journal未見ID前，必須能查archive確認未曾受理。查詢故障回本地化503、operationUncertain與prior-acceptance-unavailable／before-acceptance，不取得租約、不派送模型、不更改世界；可用原ID待讀取恢復後重試。這修訂#91「未套migration故事仍可執行」的初始退化行為：發布#92前必須先套0005，讀取不可用時選擇停在受理前以維持同ID不重派。**trace寫入失敗仍不阻斷已受理操作的世界提交**；journal留write-failed／pending及最後已知階段，不能把這兩種故障混稱故事已回復。

分析頁以本次操作ID聚焦，不依舊成功operationEvidence猜測；無世界／evidence的uncertain或conflict回應也可由停止原因進詳情。原journal的世界結果、archive最後durable副本與本次HTTP回應的非持久狀態分開標示；有舊checkpoint且最終寫入失敗時，仍須顯示該筆journal的gap，不用當前最新操作替它背書。

這些保存點增加序列化及D1讀寫成本；每次NPC或裁定通常多個statement，仍受原110秒工作／120秒租約及25秒provider限制，不能保證任意大型回合完成。包含40角色極端容量情境的48項本機相關回歸合計約144秒，僅證明上限與故障保障，不是正式站效能或永不逾時保證。原模型／世界／實錄不形成單一交易：fetch與dispatched保存點、世界CAS與final trace之間仍有不可消除的崩潰窗口，必須保留未知，不能補造。

configured但無法解密的未使用Key不應阻擋demo、直接控制或另一正常供應商。此時不猜測憑證明文，實錄切換credential-redaction-unavailable骨架：省略所有body、snapshot、steps原文、result、context與自由服務／角色標籤，僅保存安全操作／HTTP UUID、程式階段、outcome與有界已知用量。實際選用服務原有readModelKey驗證仍會照常停止不合法派送，診斷不替其放行。

單筆1MiB限制亦在capture中生效：第一次跨界即按當時JSON bytes量測轉骨架，後續派送仍記機械收據／用量，但不繼續收集本文、世界snapshot或step原文。`omittedOriginalBytes`是首次超界值，不代表未知的最後原件總大小。metadata-only因憑證未知而不保存context，列表會在同owner當前查閱路徑併列此類骨架並明示場景未知；不因此替它補造context或放寬跨帳號權限。
