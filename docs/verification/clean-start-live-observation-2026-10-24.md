# 乾淨起點真實模型觀察：第三回合技術中斷（2026-10-24）

**結論：取得可定位的 NPC 記憶選留驗證故障；原泡茶 loop 的乾淨起點對照仍無法判定。** 已重建一次隔離場景、只加入一次原句介入，正常提交兩個十五分鐘回合；第三回合 Vera 的候選驗證失敗，整回合回復。依停止規則未重試、未繼續推進，沒有產品修改、合併、部署或新增規格／票務。

本報告接續 [重建前預檢](clean-start-preflight-2026-10-24.md)。該報告是前一階段快照；使用者隨後明確授權「調上限，然後測到有問題」。

## 授權與控制條件

- 本輪 token 上限由 500,000 提高為 5,000,000；沿用帳戶現存每小時 240 calls／5,000,000 tokens，沒有修改帳戶設定或改成無上限。執行界線仍為最多 6 回合／48 次派送，遇具體故障即停。
- 先前未完成的是嚴格整回合 token 上界證明；本次依使用者提高上限後的續行授權，改以擴大的有限額度、每回合最多 8 calls 與逐回合實際用量核對執行，**沒有宣稱新增了 token 預約能力或已完成嚴格輸入上界證明**。
- main／正式站均為 `6dfe6c70d922741a0a38e3ab3a791e35cb649253`；UI 與追溯部署為 `production / 6dfe6c7`，builtAt `2026-10-22T08:02:27.650Z`。
- 實際派送為 NPC OpenAI `gpt-6-luna`、裁定 OpenAI `gpt-6.1-sol`。第一回合店主兩種 request 的 model、system prompt SHA-256、response_format/schema SHA-256、reasoning_effort、max_completion_tokens，均與舊第二筆追溯一致。
- 未修改 Playbook、回饋、purpose 匹配、模型參數、角色設定或注入回覆。只用 UI 正常推進 15 分鐘，不開自動。
- 舊場景杯子的 contents 狀態清單不含 dirty，當前種子包含 dirty；此差異事先記錄，未修改任何一方。新舊不是除歷史外所有世界欄位逐欄相同的嚴格單變因實驗。

## 證據保存與場景重建

原世界／三筆指定追溯已於上一階段私有備份並重讀校驗。原始 transcript 不進本公開文件。

| 操作 | operationId | 版本／結果 |
| --- | --- | --- |
| 返回原世界 | 1792824930664:36ba397f-16a9-473c-bc35-13abfcacc278 | 323 → 324，200 |
| 進入新隔離場景 | 1792824966617:c1f2c11a-5b46-462f-9c1a-b520a7254aaa | 324 → 325，200 |
| 唯一一次店主介入 | 1792825017194:519b135b-cdbe-423d-8747-afe038eb719e | 325 → 326，200 |

返回後唯讀取得原日常世界為 minute=1260、turn=0，另私有保存原世界 API JSON；沒有推進該世界，再以既有 enter-acceptance 暫存並重建隔離故事。切換後帳戶累計仍為 576 calls／7,312,243 input／166,205 output。未使用一般 reset。

進入後確認種子：

- minute=720、turn=0，四人在 cafe-front，沒有 routineRules。
- acceptance-cup：active、holder=null、revision=1、empty／clean=yes。
- acceptance-tea-kit：active、available=yes；僅一份明示 Cass 使用的有限餐點。
- 店主與 Kris intents=[]；Cass、Vera 分別是種子餐點／泡茶意圖。
- 四人的 longTerm=[]；memories／shortTerm 只有本次種子說明，沒有舊 make-tea、舊失敗回饋或舊介入。
- 第一回合店主真正 request 的 self.intents=[]、knownMethods=[]；新增內容是本次原句、同回合已發生的角色觀察與借杯對話。

唯一加入的請求，GET 核對只有 owner 知情：

> 若你現在想喝茶，可以用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。先只泡茶，喝茶與清洗之後再決定；是否要做由你自行決定。

之後沒有提醒已有茶、指定喝茶、催促、修改意圖或重新介入。

## 逐回合結果

| 回合／operationId | 世界版本 | 已保存世界時間 | 狀態 | 呼叫 | input／output tokens |
| --- | --- | --- | --- | ---: | ---: |
| 1 · 1792825040433:8fb4da02-a01f-4ae1-afc1-21f6230af0f4 | 326 → 327 | 12:15，turn 1 | 200／committed | 7 | 80,508／2,028 |
| 2 · 1792825168769:01b54bb9-dac1-4ed0-bda0-8396beded49c | 327 → 328 | 12:30，turn 2 | 200／committed | 8 | 99,975／2,372 |
| 3 · 1792825309342:c8725c2f-60e3-40f2-b4c4-08b12211a372 | 328 → 329 | 仍為 12:30，turn 2 | 502／rolled-back | 4 | 36,346／1,094 |

第三回合候選評估時間是 12:45，但該故事時間沒有提交；版本增加反映失敗回條及用量保存，不是故事已成功前進。

### 第一回合：授權完成，沒有泡茶成果

Vera 自然詢問借杯。店主真正輸出建立 make-tea／lend-cup 意圖，以 propose、target=acceptance-cup，將同意借杯與自己泡茶放在同一提案。

實際裁定 accepted，但只返回 grant(acceptance-cup, vera)，沒有取水、沖茶或茶飲形成效果。裁定 explanation 說明其只承接授權，這是私有模型自述；可獨立核對的已提交事實為 allowedTo 新增 vera、杯子仍 empty、無茶飲物件。

店主回饋沿既有短期經歷保存原提案，結果摘要為同意 Vera 使用杯子，相關物件仍為空杯。未把原提案內的泡茶文字當作已泡好。

### 第二回合：Vera 改成茶；店主再次提交授權

Vera 選擇 propose、target=acceptance-tea-kit；裁定 accepted，唯一效果為 state(acceptance-cup, expectedRevision=1, contents=tea)。已提交杯子 revision=2、holder=null、tea／clean=yes。沒有獨立茶飲物件、供應形成來源或 vessel 關聯，也沒有待續活動 plan。保存後另次 GET／UI 均看到相同茶狀態。

**這只能證明杯子 tea 狀態已提交，不能宣稱與舊例「店主持有滿茶杯＋active 茶飲指向同杯」的完整成果條件相同。** 本輪不補造缺失身份，也未以 fixture 增加它。

店主真正 request 已看見杯中 tea；輸入亦承接上一回合授權回饋。店主仍以 propose、target=acceptance-cup，提出同意借杯並替自己泡茶，意圖為 make-tea，context 仍表示尚待實際泡製。interpretation 承認 Vera 已開始用杯子泡茶，並表達自己還想泡茶。

裁定再次 accepted，但實際只有 grant(acceptance-cup, vera)，沒有新增茶。私有 explanation 提到滿杯與 grant／日常封套互斥，不直接送入角色知識；NPC 回饋仍是授權結果與既有物件狀態。

這裡能確認重複授權及泡茶目的未落實；不能僅憑另想泡茶判為異常，也沒有兩次店主在滿茶條件下反覆提出相同錯誤前提的正常決策。

### 第三回合：店主換成回答；Vera 驗證失敗，整輪回復

店主正常決策候選選擇 say、target=kris，回答餐點已由 Cass 取得並食用；保留 make-tea 意圖，沒有提出新泡茶行動。這是已收到的真實模型候選，**因稍後回合回復而未成為已提交故事**。

Vera 的實際 request 顯示 cup.contents=tea，候選卻仍以空杯／開始泡茶表述下一步。同一候選另有可定位的工程失敗：

- JSON 已成功解析並保存 rawCandidate，不是可斷言的 JSON 語法破損。
- memorySelections 引用的 id/version 存在於當次 self.longTerm，**不存在於當次 self.shortTerm，也不在當次 finally 保存的 Vera 短期集合中**。
- 該欄位按 prompt 與 lib/memory.ts 的 selectedMemories，只接受本人的短期經歷版本。
- trace 記錄 failure.kind=candidate-validation、stage=npc-candidate-validation；沒有新增 Vera 裁定派送。operation.error 是泛化的「模型未回傳有效的意圖與行動格式」。
- outcome=rolled-back，世界故事回復。比較第二回合與第三回合保存的 world，**只有 aiUsage 不同**；物件、記憶、意圖、事件、時間、活動等保持第二回合結果。

旁人均只是自然行為觀察，未另外誘發。Vera 的空杯自述是本輪另一項可見不一致，但沒有完成後續裁定與提交，不能把它當作再次正常否決或已確認泛問題。

## 離線定位：記憶選留引用了錯誤集合

為定位失敗，只重放驗證邊界，不派送模型：

1. 保留第三回合 Vera 原始 rawCandidate，不修改任何輸出欄位。
2. 使用第二回合已保存 Vera 狀態，配合第三回合 npc-feedback 保存點的實際 shortTerm，確認引用不是自己的短期版本。
3. 將同版 lib/memory.ts、lib/cognition.ts 複製到私有暫存目錄，僅將互相 import 的相對路徑補 .ts，讓 Node 24 原生 TypeScript 載入；不改驗證邏輯、不改 repo。
4. 呼叫實際 export selectMemories，使用原候選 memorySelections。

結果：

```text
short ref matches false
long ref matches true
ACTUAL REPO VALIDATOR: MemoryValidationError: 只能選留本次自己的短期經歷版本
```

這確認原回覆有一個足以觸發記憶選留驗證失敗的具體問題。正式 trace 原本沒有保存內層例外文字，因此上面的具體訊息是離線原驗證器重現，**不是聲稱正式站實錄已逐字保留該訊息**。此重放只證明程式驗證結果，不是新模型對任何修改輸入的反應，也不證明泡茶 loop 根因。

## 舊觀察與乾淨起點對照

| 面向 | 舊觀察 | 本次乾淨起點 |
| --- | --- | --- |
| 部署／店主提示與 schema | 6dfe6c7 | 同版；首回合店主 request 靜態契約雜湊一致 |
| 店主初始意圖 | 已有 make-tea 及背景 | 空佇列，收到一次原句後自行建立 |
| 杯子／茶飲 | 店主持有茶杯，另有 active 茶飲 vessel 關聯 | Vera 將杯子改 tea，holder=null，沒有獨立茶飲身份 |
| 店主提案 | 在共用茶具／自己杯子間換方法 | 前兩回合混合借杯授權與泡茶；第三回合改答 Kris |
| 正常後果 | 兩筆正常 denied；第三筆裁定 timeout／回復 | 前兩回合 accepted 授權；第三筆 Vera 候選驗證失敗／回復 |
| 行為判定 | 尚有歷史、語義與規則互動假設 | 技術中斷，未取得足夠同條件對照 |

**已確認事實：** 清除了舊意圖／記憶／介入仍自然產生泡茶意圖；兩次混合提案只提交授權；杯中茶由 Vera 的狀態效果產生；第三回合的記憶選留集合引用錯誤有可重現驗證失敗；原日常世界未被推進。

**待驗證假設：** 累積歷史是否必要；泛化許可提醒是否被誤當障礙；店主未承接成果是否與提案混合、多角色互動或其他輸入因素有關。均未獲充分反證或支持，不預設 Playbook 或模型能力造成。

**證據缺口：** 沒有店主自己完成且帶獨立茶飲身份的完整新成果，沒有成果後最多三次已提交正常決策；原 loop 的「重現／未重現」皆不可宣稱。不能由本次改答 Kris 推論已修好，亦不能由 Vera 單次空杯自述推論所有 NPC 都有問題。

## 用量、私有交付與結束狀態

- 3 次 advance 嘗試，2 次成功、1 次回復；19 次真實派送（12 NPC、7 裁定）。
- input 216,829＋output 5,494＝**222,323 tokens**；cached input 已包含於 input，不重複加算。低於原 500,000，但這是事後實測，不是開跑前上界。
- 終點累計 595 calls／7,529,072 input／171,699 output；本輪供應商已知用量已保存。UI 費用只有部分模型價格，不視為完整費用。
- 最終 version=329、minute=750、turn=2，仍在 daily-life-v1；自動未啟動。沒有按失敗重試、換模型、繼續推進、再重置或返回原世界。
- 完整私有包包含舊三筆追溯、原世界返回快照、乾淨種子、介入後起點、三回合完整 API／trace、最終重讀及 SHA-256 manifest；JSON 解析、zip 完整性與逐檔重讀通過，已持久私有保存。公開 repo 僅本去識別報告，沒有完整 transcript 或憑證。
- 最後 UI 可見候選格式技術故障及 12:30／19 calls；另有停止畫面作使用者可核對的結果，未將截圖納入公開 repo。

後續建議先針對這筆真實候選研究記憶選留邊界與失敗處理，以及是否應保留更精確的內層驗證原因。這是診斷方向，不是本輪已批准的修正規格；未直接實作、發布 issue 或拆票。原泡茶對照需在技術阻擋被處理後另行續行，不以反覆重置求取漂亮結果。

文件驗證採用量差分、世界回復欄位比較、原 request 靜態契約雜湊、私有包重讀及 repo 路徑／敏感資料檢查。沒有重跑產品完整測試，不把歷史 fixture 結果算成本輪真實模型驗收。
