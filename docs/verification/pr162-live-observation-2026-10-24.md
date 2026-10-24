# PR #162 部署後有限觀察：裁定逾時，整回合回復（2026-10-24）

**A．當次短期引用約束已在四筆真實 NPC request 驗證；安全候選失敗原因分類未觸發。B．原泡茶 loop：證據不足。** 本輪第一個新 advance 的第八次派送（Vera 裁定）逾時，整輪回復。店主在候選世界形成的新茶杯與獨立茶飲未提交，沒有成果後正常決策樣本；不能稱未重現或已修復。

## 版本、授權與備份

接續[版本預檢停止報告](pr162-live-preflight-2026-10-24.md)。使用者後續詢問「現在呢」，依原有限觀察授權再次核對並續行：
- 最新 main／正式站 `b97edf2`，builtAt `2026-10-24T10:45:20.868Z`（台北 18:45）。Git 確認其包含 #162 merge `cb5f293`；相較 #162 只有 #163 報告，產品程式相同。UI 與 GET /api/environment 一致。
- 沿現有 daily-life-v1 隔離故事，version=329、minute=750、turn=2；沒有重建、返回／重置原世界、直接改 DB、加介入或更改角色／物件／Playbook／規則。
- 起點原杯 active、revision=2、holder=null、contents=tea、clean=yes、allowedTo 包含 owner／vera；沒有獨立茶飲物件，routineRules=[]。grant、杯中 tea 與完整泡茶成果分別核對。
- 預先 GET 世界與三筆舊 advance、一筆介入私有實錄，實際讀回原始 request／response／steps，私有備份並逐檔 JSON 解析、zip／SHA-256 重讀校驗後才推進。原世界暫存仍在；API 不匯出其內部快照，本輪未獨立還原測試，也沒有為備份而切換故事。
- 原實錄驗證 NPC OpenAI gpt-6-luna／裁定 OpenAI gpt-6.1-sol。瀏覽器初始規則試玩，正常選回 OpenAI 直連與既有 GPT-6 Luna；沒有更換歷史模型或參數，實際新 request 再核對。
- 玩家 Key 只讀配置／到期狀態，不讀出憑證。裁定配置維持 gpt-6.1-sol；帳戶有效每小時 240 calls／5,000,000 tokens，沒有提高或修改。
- 本輪門檻仍是最多 6 advance 嘗試／48 次實際派送／已知 input＋output 500,000 tokens，先到者停止；接受最後已開始回合可能超過 token 門檻。第一回合前已知本輪 0 calls／0 tokens；以四角色、隔離場景不回想、每 slot 最多一次裁定，預留至多 8 calls，250,000 tokens 作保守估算。token 估算參考前次約 8–10 萬實測並留餘量，**不是已證明硬上限或預約**。本輪沒有第二回合預檢，因技術故障先停。
- 全程手動、自動保持暫停；不注入「不要重複」提醒，不修改泡茶政策或規則誘導結果。

原舊實錄可重讀：1792825040433:8fb4da02-a01f-4ae1-afc1-21f6230af0f4、1792825168769:01b54bb9-dac1-4ed0-bda0-8396beded49c、1792825309342:c8725c2f-60e3-40f2-b4c4-08b12211a372。其缺少新版 failure.reason 不由本輪回填。

## 唯一新操作與停止

- operationId：`1792842387321:f1a2711d-dcb1-43a0-bf78-8badd935c43f`。
- API requestId：`ea3b943d-47cd-49df-b9a7-015af7484871`。
- 台北受理 2026-10-24 19:46:30.930；世界回復回條確認於 19:48:23.865。
- 329 → 330，HTTP 502、outcome=rolled-back；minute=750、turn=2 不變。候選評估時間 765（12:45）沒有成為已提交故事時間。
- operation.error 為模型回應逾時、本回合未推進；stopReason=technical/technical_failure。私有 trace 第八次 failure.kind=timeout、stage=dispatch，無 HTTP headers／原回覆／usage。這是傳輸逾時證據，不能說是記憶候選驗證失敗。
- 不重試、不恢復、不重送、不換模型、不建立第二個 operationId。只 GET 原操作及最新世界重讀；實錄仍八次派送、累計用量不變。
- 機械比較完整起終 world：只排除 aiUsage 後深度相等；時間、物件、角色記憶／認知／意圖、事件、活動、供應及規則均未半提交。版本增加是失敗回條／用量保存，不是成功回合。

| 順序 | 角色／task | 實際模型（皆 OpenAI） | input／output | 已取得結果 |
| --- | --- | --- | --- | --- |
| 1 | Kris／NPC | gpt-6-luna | 9,839／401 | 合法候選，再詢問既有餐點 |
| 2 | Kris／裁定 | gpt-6.1-sol | 16,297／212 | denied、effects=[] |
| 3 | 店主／NPC | gpt-6-luna | 9,193／321 | propose acceptance-tea-kit，替自己泡茶 |
| 4 | 店主／裁定 | gpt-6.1-sol | 18,097／1,140 | accepted，v2 cafe-service 日常核准；候選世界形成杯與茶 |
| 5 | Cass／NPC | gpt-6-luna | 9,434／224 | 合法候選，再提取得餐點 |
| 6 | Cass／裁定 | gpt-6.1-sol | 16,303／150 | denied、effects=[] |
| 7 | Vera／NPC | gpt-6-luna | 9,202／411 | 合法候選，用茶具並指向已借用驗收杯的泡茶方法 |
| 8 | Vera／裁定 | gpt-6.1-sol | 未知／未知 | timeout；沒有收到可解析裁定，不補造答案 |

第八次 requestId：`1792842387321:f1a2711d-dcb1-43a0-bf78-8badd935c43f:vera:adjudication:136997cd-814c-4a2f-9e2c-a03c5d65a8fe`。其 startedAt 到 round-failure 約 9.6 秒；整次操作距受理約 110.4 秒才記 round-failure。程式 signal 同時受單次 25 秒和世界租約剩餘工作期限限制，因此**不能把本筆直接描述為供應商完整用滿 25 秒**。剩餘期限可能縮短等待是程式／時序支持的推論，不是 provider 根因證明；未取得 Cloudflare stage logs 或供應商後台紀錄。

## A．實際 request 的記憶選留約束

四筆 request 全部檢查實際 requestBody，而非事後重建提示：
- model=gpt-6-luna，response_format=json_schema、strict=true；每個 memorySelections.items.anyOf 分支以單一 id enum＋單一 version enum 綁定一對。
- 逐筆解析 user message 的 self.shortTerm，與 schema 的全部配對集合相等；長期來源不被加入合法短期集合。每筆收到的 memorySelections 全部存在於該次短期集合。
- 四筆 NPC 均產生 npc-parsed 機械步驟、進入後續裁定，沒有 NPC candidate-format／candidate-validation failure。這只證明這四筆通過，不能推論未來非法引用不可能產生。

| NPC 派送順序 | 短期可見筆數 | 長期可見筆數 | 實際選留筆數 | 成對集合及選留 |
| --- | ---: | ---: | ---: | --- |
| 1 Kris | 8 | 4 | 3 | 一致／合法 |
| 3 店主 | 7 | 3 | 2 | 一致／合法 |
| 5 Cass | 9 | 1 | 0 | 一致／合法；仍可不選留 |
| 7 Vera | 8 | 2 | 3 | 一致／合法 |

**已驗證：** 真實供應商接受本輪四份動態 schema，實際短期投影與引用約束一致，四份候選合法，Vera 沒有在原先記憶選留邊界中斷。整輪故障後故事與原記憶完全回復、已知用量保留。

**仍未知：** 非法候選的新版安全分類／保存／UI 沒有自然觸發；沒有注入非法輸出。成功選留的持久長期提交未驗證，因本回合回復。空短期、最大集合、回想首輪／續答、OpenRouter 及容量省略故障也未在線上覆蓋。安全原因 fixture 通過仍只依[既有本地報告](memory-selection-diagnostics-2026-10-24.md)，不算本輪實測。timeout 不用來宣告 #92 所有候選分類已通過，更不關閉 #85。

## B．店主泡茶行為與成果界線

### 真正收到的情境

派送 3 的 user input 已含：
- self.intents 保留 make-tea；context 表示共用茶具已獲准使用、尚待實際泡製。
- 短期七筆、長期三筆；短期包含前兩回合混合借杯／泡茶提案的本人回饋，結果是同意 Vera 使用杯子。
- 物件投影含驗收杯 contents=tea／clean=yes、holder=null，共用茶具 available=yes；knownMethods=[]、沒有可延續活動。
- 本輪沒有加入新提醒、把裁定 explanation 放入角色輸入，或讓角色讀私有實錄。

因此能確認店主看到了原杯已有茶及前次借杯結果，不能說回饋根本沒有傳入。但這些回饋未證明店主本人已完成泡茶。

### 候選、核准與候選世界成果

派送 3 實際為 propose、target=acceptance-tea-kit，purpose 表示替自己泡茶。與前次混合 grant 的提案相比，這次沒有再代同意借杯。interpretation 表示 Vera 已用杯子泡茶、自己仍想另泡一杯；這是**模型自述**，不是世界已有完整 Vera 茶飲的證明。

派送 4 的裁定 accepted、一般 effects／stages 為空、routine.version=2，確認 cafe-service tea 與完整 timings／programs；tea 原始 minutes=5，機械對齊15。explanation 表示驗收杯已有茶不可覆蓋、方法執行須檢查空杯與背景，這是裁定模型自述。

機械 rule-selection 起初 no-matching-rule，因起點沒有保存規則，不能叫作「已有規則卻沒重用」。核准後六模板的 purpose=false／wording=not-evaluated 步驟，最終另有 branch=approved、operation=tea；需連同最終分支閱讀，不能只摘單一 false 宣稱執行失敗。bound-candidate 為 accepted、confirmedDurationMinutes=15，後續 npc-feedback 已記錄完成茶杯與一份茶。

後續派送 7／8 的權威 worldSnapshot 證實候選世界已有：
- 原 acceptance-cup 維持 revision=2、tea、無人持有；原借杯 allowedTo 不被新形成成果取代。
- 另一只「日常茶杯」，active、holder=owner、contents=tea、revision=2。
- 獨立「一份茶」，active、holder=owner、state.beverage=tea、state.vessel 指向新日常茶杯，revision=1。
- 新背景供應／形成來源與日常規則存在；不是只做 grant、把原杯改 tea 或僅 accepted 文案。這是本回合候選世界的機械執行進展。

**但第八次派送逾時，使以上新杯／茶／規則／回饋全部回復。** 最終 GET 只有原三件物品，無新茶飲；沒有已提交的完整泡茶成果，沒有店主下一次真正派送可確認其承接完成回饋。成果後正常決策為 **0**，不能以純程式完成或其他 NPC 同輪派送替代店主後續決策。

### 其他角色及規則診斷

Kris／Cass 對餐點有重複提案，兩筆裁定均 denied、無效果，模型說明提到有限餐點已耗盡等條件；這些中途回饋也未提交。本輪未安排同一角色後續正常決策，不以此推論所有 NPC 都有泛 loop。

Vera 派送 7 仍提出用茶具把茶倒入已授權的驗收杯，interpretation 未承認它自己的泡茶已完成。其規則模板 purpose=false／wording=not-evaluated、最終 no-matching-rule，於是派送裁定；第八次未取得結果。這是可追查的候選不一致／規則路徑，**不是已提交的再次否決或已確認 loop 根因**。

**B 判定：證據不足。** 本輪店主的方法在候選世界實際取得另一杯茶，不能只因仍想泡茶視為同障礙 loop；同時沒有提交成果與其後最多三次正常決策，故不能稱「有限條件下未重現」或修復。前次舊世界與乾淨起點的行為問題仍待驗，沒有修改政策消除症狀。

## 用量、私有保存及終點

- 1 次 advance 嘗試，0 次故事成功提交，8 次實際派送（4 NPC＋4 裁定）；其餘授權沒有動用。
- 已知 input=88,365、output=2,859，合計 **91,224 tokens**；cached input 已包含於 input，不重複加算。第八次 token／費用未知，不當零，不宣稱完整供應商帳單。
- 累計 595 → 603 calls；input 7,529,072 → 7,617,437；output 171,699 → 174,558；未知用量 calls 3 → 4。
- 終點 version=330、minute=750、turn=2，隔離場景仍在、自動暫停；原日常世界未推進。UI 顯示逾時及本小時8 calls。
- 私有保存完整 baseline world、四筆相關舊實錄、新原操作定案／重讀實錄與 end world，JSON 解析、zip 完整性及 SHA-256 重讀通過；公開 repo 不含 transcript、記憶正文、operationScope、Key／Cookie 或認證 header。停止畫面另私下保留，沒有納入公開 repo。
- 私有 trace gaps=[]、redacted=false，內容未因容量省略；有界 operation.evidence.truncated=true，因此本輪分析使用另存的完整私有 trace，不以截短 journal 重建。第八次無回覆仍是實際缺失，不能因 gaps 空就說有完整 provider 回覆。
- 沒有同 ID POST 重送驗證；只有 GET 原 ID 重讀，不能冒稱本輪重驗冪等 POST。

## 未知與下一個最小可反證步驟

先沿這個已停止原操作及可取得的安全 stage logs 確認最後裁定的剩餘工作期限／等待時間，區分單次模型延遲與整輪期限消耗；現有時間戳支持期限可能縮短等待，尚未證明哪個基礎設施環節是根因。沒有在本輪修改期限、並行化派送、加自動恢復或開修正票。

若另行授權恢復正式觀察，沿目前保留世界、原模型及已有歷史，先備份並核對版本／預算，只手動開始一個新回合；這必須明示是新操作，不假裝重送本次模型結果。先取得真正提交的完整茶杯／獨立茶飲與完成回饋，再在有限額度內觀察店主其後最多三次正常決策。若再次技術截斷仍停止並判證據不足。不能從本次候選世界成果直接跳至「已泡好」的起點，也不清空歷史求取成功。

## 來源與文件驗證

沿用已讀 AGENTS、Matt Pocock、GLOSSARY、相關 ADR 0001–0005、diagnosing-bugs／pr 流程、完整 PR #162、#161、#85、#92 頂端補充，以及：
- [乾淨起點預檢](clean-start-preflight-2026-10-24.md)／[正式觀察](clean-start-live-observation-2026-10-24.md)。
- [記憶選留與候選安全診斷](memory-selection-diagnostics-2026-10-24.md)。
- [隔離場景契約](../design/minimal-acceptance-scene.md)、[操作與私有追溯工程契約](../design/operation-evidence.md)。
- [操作驗收流程](operation-evidence-live-runbook.md)／[通用變更驗收流程](world-changes-live-runbook.md)。

本輪只新增本報告；本地核對實際 request schema／短期集合／合法選留、逐派送用量加總、整輪回復深度比較、原 ID GET 重讀、私有包完整性及 Markdown 相對路徑／敏感內容邊界。未重跑產品 fixture，也不把歷史627項通過算成本輪真實模型通過。未自行合併、部署、修產品或關閉 #85。
