# 2026-10-29 首輪中斷診斷：已知用量恢復缺口與尚未確認的中斷原因

## 判定與範圍

**確認一個可重現的工程缺口：原 worker 不再進入收尾時，已持久保存於 trace 的正常 usage，沿原 ID 到期恢復後仍未納入世界累計，也沒有待核對帳務的明確標示。正式站最初為何未完成仍未知。** `pending → uncertain`、同 ID 不再派送符合原設計，不能因此把整個事件判為正常，也不能只因 502 判為 bug。

本輪使用 repository 的 `diagnosing-bugs`：先建立 RED 訊號，再以單角色／固定回覆／受控時間縮小案例，列出假說與對照。產品修正及其 GREEN 驗收依使用者限制留給後續；本 PR 只含本文件及診斷腳本，沒有修改產品程式、期限、上限、正式世界或 Key 政策，沒有付費呼叫、合併或部署。診斷 RED 放在 `tooling/diagnostics/`，不加入預設 suite。

| 問題 | 判定／信心 | 依據與限制 |
| --- | --- | --- |
| 首輪為何未確認完成 | **未知**；對特定根因信心不足 | 最後 durable trace、原 ID 回讀與世界版本已確認；缺原 POST／失敗 GET 原始回應及平台 invocation 結果。中斷注入可產生同症狀，不能證明正式 worker 被終止。 |
| pending 到期轉 uncertain | **符合契約，高** | GET 依原絕對期限投影；同 ID POST 保存／重放 uncertain，不重做模型。未從 archive 偽造原 HTTP 成功或失敗。 |
| 已知用量未進世界累計 | **工程缺口，高**；正式站全額差異範圍未知 | 合成 SQLite 案例正常 usage 已 durable，恢復後 totals 仍為零；正常及可捕捉失敗對照會保留。正式站至少有 22,339 已知 tokens，讀回累計無相應增加，不能說零花費或只花這些。 |
| 前端讀取失敗與提交中斷同源 | **未證明** | 原失敗 GET 缺 HTTP／Content-Type／request 關聯。獨立 trace-read 故障對照可在世界成功提交後發生；後續正式 GET 成功。 |
| NPC loop 是否改善 | **無法判定** | 無新完整回合與下一次真實輸入；未完成半小時行為觀察。 |

沿用 [#92](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/92) 的故障／已知用量契約補充具體修正驗收；沿用 [#77](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/77) 收納新事件的中斷／讀取補證工作，**不是認定兩次事故同根因**。沒有新產品取捨，不對既定工程契約重開 Grill／規格。Key 保存 24 小時另案。

## 來源、版本與去重

- 重新取得 main `0e786de9ad26a72344201976ac14c212010f6224`，讀取 AGENTS、Matt Pocock 工作流程、GLOSSARY、ADR 0004、[追溯契約](../design/operation-evidence.md)、[期限契約](../design/round-time-budget.md)及適用 skills。
- [PR #217](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/217) 已合併，全文與留言已查（無留言）。[原報告](live-observation-2026-10-29.md) 在 main；亦核對 PR head `3b345c` 所屬報告。main 相較正式站 `c3ce5af6f0e4ba0ac2bcc238b60179b9cb01cd08` 只增加此報告，產品程式相同。
- 核對 #153／#91／#92、#166／#168 全文與相關留言；比對 #77 的歷史留言、#81／#82／#27 及近期 PR，搜尋 uncertain／用量／中斷相關票，未另開重複票。#92 上一個候選安全原因切片已由 PR #162 實作，不把本次情形再歸為同一解析分類缺陷。#91 仍 open，沒有解除 #92 原有依賴或替整票驗收。
- #77 舊事件的 1102／CPU 證據只屬於 10 月 15–16 日；不能套用到本次。#27 跨環境每日成本台帳與本次原操作的已知用量保存不同，不以全面台帳重構阻擋窄修正。
- 私有包已解壓並核對 manifest：JSON SHA-256 為 `bf4c9d2a76e497cd894b9c6ea1f43731a99cfee7027af753b03c19d4c5caa3fb`，與報告相同。原件、私人 ID、世界、記憶、request／response 與憑證均不隨本 PR 公開。

## 私有原件能確認的時間線

以下皆 2026-10-29 Asia/Taipei。時間是保存的程式觀測點，不能替代平台 CPU／SQL 服務端時間。

| 時間 | 可確認事項 |
| --- | --- |
| 12:03:23.896 | 採集紀錄的觀察起點；報告記載約 12:03:24 啟動唯一新 advance。包內沒有完整網路請求清單獨立稽核所有點擊。 |
| 12:03:35.528 | leaseCreatedAt；工作截止 12:10:15.528、固定租約截止 12:10:45.528，clientMs 445,000。 |
| 12:03:37.736 | 保存的 leaseAcquired／trace accepted 時點。 |
| 12:03:41.399 | 第一個 checkpoint 開始。 |
| 12:03:43.658 | 模型 prepared／signal 建立；本次模型截止 12:04:08.658。 |
| 12:03:45.049 | 首筆 fetchStarted。 |
| 12:03:53.229 | 收到模型 HTTP 200 headers。 |
| 12:03:54.478 | body 收到與 usage 已知：input 21,813／output 526／cached 0。 |
| 12:03:57.323 | 第 7 個 checkpoint 開始；讀回內容為 candidate-received。比模型截止早 11.335 秒。 |
| 12:11:14.319 | 私有包 observedAt；原 ID operation 為 uncertain、status 502、evidence null。這是採集時間，不是已量得的故障發生時間。 |
| 14:16:30.037 | 本輪新增原 ID **唯讀 GET**，仍 version 354／turn 18／minute 1140、同一 uncertain／502／null 與 candidate-received。沒有新增正式 POST。 |

兩個私有讀回均是操作嘗試之後的快照，**不是完整的事前原世界備份**。排除 aiUsage 後故事深比對相等；aiUsage 差異只有小時窗口起點正規化，累計 calls 仍為 726，累計 input／output／unknownCalls 及成本 cohorts 差額均為零。trace baseVersion 354 與最終 version 354 一致。起點 turn／minute 另由原報告佐證；不能用兩個事後快照補造未保存的逐步回復過程。

查詢專屬 `operation.evidence=null`。同份回應頂層的 `operationEvidence` 屬於較早、version 353→354 的回復操作，**不是此次提交證據**。包內沒有 raw journal SQL row；本次 journal 的已知狀態來自 API 投影，沒有從最終 uncertain 反推當初是否已執行 catch／CAS。

保存了一筆 Kris 的 NPC 派送；rawCandidate 與原 response 的 content 相同，finish_reason 為 stop。沒有保存其他 NPC／裁定／回想派送，不等於它們絕對沒有發生。request／response 各 83,798／2,692 UTF-8 bytes，該 trace API retention bytes 137,539，小於 1 MiB、gaps 為空。當時 owner 共 32 筆、16,723,269／16,777,216 bytes、曾淘汰 4 筆；這不證明所有後續寫入都成功，也不能把容量接近上限當成根因或據此提高上限。

## 保存點與故障點必須分開

| 邊界 | 同版程式與原件能證明什麼 | 不能推論什麼 |
| --- | --- | --- |
| 模型 HTTP／body／usage | 此筆模型回覆與已知 usage 被保存；onUsage 已先更新執行中的 RAM ledger。 | 世界已提交、完整帳務已 durable、所有派送已知。 |
| candidate-received | adapter 收到候選字串並呼叫 observer；該 checkpoint 的副本可重讀。 | 已通過 candidate JSON／欄位／記憶驗證。它在那些驗證之前，也在 adapter 後續拒絕檢查之前。 |
| NPC 驗證 | `aiDecision` 後續先驗原租約，再 parse／validate；npc-parsed step 先存在記憶體，等之後 checkpoint 才一起保存。 | 缺 npc-parsed 就等於未執行 parser；本地 after-validation 中斷已反證。 |
| trace checkpoint | `persist` 先 snapshot，再排隊保存，完成後才把 completedAt 填進 RAM 的 point。 | 最後一筆沒有自己的 completedAt 就代表 SQL 卡住；正常成功最後一筆同樣沒有。 |
| 世界提交／journal | 原子世界 CAS 與 journal 決定已保存故事和操作結果；archive 是另一份證據。 | trace 有候選即等於局部故事成功；頂層舊 evidence 可代替原 ID receipt。 |
| 故障收尾 | 一般可捕捉錯誤會回復故事並保留已知用量；原 worker 活著才可能執行 RAM 差額補記。 | 最後狀態能證明正常收尾曾執行，或原 worker 已被終止。 |
| HTTP 交付 | `operation.status=502` 是該操作保存／投影的結果碼。 | 最後 GET 自己回 HTTP 502、最初 POST 就是相同 502，或原失敗 GET 的內容型態已知。 |

首六個 checkpoint 記錄的完成耗時為 1,268／1,391／1,183／1,249／749／2,096 ms；包含 queue、複製／遮蔽與儲存，不是 D1 純耗時。fetch→headers 為 8,180 ms；headers→body 的 1,249 ms 也跨過 await headers 保存。不能據此分配 provider、CPU、D1 責任或推論當時已撞到 400 秒期限。

## 可執行的 RED 與對照

執行環境 Node 24.22.1／TypeScript 5.9.3；沿既有 `tests/run-activities.mjs`，實際 route／模型 adapter／引擎與真實 SQLite `:memory:`、專案 migrations。auth／Key 是既有測試替身；transport 明示固定回覆。外層為程序內 Request／Response，**不是 Cloudflare runtime、真實網路或瀏覽器端到端驗收**。no-network preload 預設禁止外連；fixture 不呼叫底層 fetch。

### Phase 1–2：精確症狀與縮小案例

[中斷腳本](../../tooling/diagnostics/interrupted-round-2026-10-29.cjs)只用一角色、一個合法 rest 候選、30 input＋10 output tokens。子程序在已 durable candidate 之後直接退出，繞過 catch／finally；父程序只把實際保存的 worlds／decision_traces SQL rows 放進另一個隔離 SQLite，丟棄 RAM 候選與 ledger。受控時鐘推到原 locked_until 之後，再以相同合成 ID 恢復。這是明示故障注入，沒有修改產品實作來強迫 RED。

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tooling/diagnostics/interrupted-round-2026-10-29.cjs
```

最終版本連跑兩次，均 exit 1，約數秒完成；先通過 pending→uncertain、故事 version／turn 不變、原 receipt 重放、零 redispatch 等斷言，再在用量斷言 RED：

```text
INTERRUPTED_ROUND {"injected":"process exit","boundary":"before-validation","parsedInMemory":false,"sent":1,"redispatches":0,"stage":"candidate-received","state":"uncertain","status":502,"evidence":null,"traceKnownTokens":40,"totalCalls":0,"totalInputTokens":0,"turn":0,"version":0}
AssertionError: RED: durable known usage is absent from world cumulative totals after same-ID expiry recovery
```

預期世界累計為 calls 1／input 30／output 10，同 ID 多次讀回／恢復不重算；實際 calls／input 為 0。沒有角色順序競爭、長 prompt、真實模型、不合法候選或容量壓力也能出現。拿掉終止、讓同一路徑正常結束即通過；改成可捕捉候選錯誤也能保留用量。這個回饋迴圈針對**中斷後已知用量遺漏**，不冒充正式站最初中斷的穩定重現。

### Phase 3–4：排序假說與單一變因結果

先展示以下排序與可反證預測，再執行對照：

| 排序／假說 | 預測與 probe | 實際結果／可收斂範圍 |
| --- | --- | --- |
| 1. 執行程序未進入持久收尾 | 在 durable candidate 後終止，保留 SQLite，恢復後仍缺用量；保留程序則正常收尾。 | RED 與正常對照成立，證實此故障模式的恢復缺口；沒有證明正式 worker 因何停止或是否真的終止。 |
| 2. 普通候選解析／驗證拒絕 | 合成 malformed JSON 應保存安全 failure.reason 並回復、保留已知用量；原捕獲候選若同樣失敗應可離線觸發。 | 合成拒絕是 settled／rolled-back／json-parse，40 tokens 保留；原候選離線通過。不能把正式最後點當成候選失敗證據。 |
| 3. candidate 保存超過模型 deadline | 僅讓該保存延遲 26 秒，正常 timeout／catch 路徑應能收尾。 | settled／rolled-back、40 tokens 保留，與正式長期 unknown 不同。未模擬 D1 永久故障／平台強制終止，不能排除它們。 |
| 4. 讀取失敗必與提交同源 | 在已提交後單獨使 trace read 失敗，若仍可保留 committed 世界，則讀取失敗不能單獨證明提交中斷。 | 世界 turn 1、settled，trace-read-failed；下一次讀取正常。僅覆蓋 archive 讀取，不涵蓋所有 GET／網路／認證故障。 |

另把終止點移到**已驗證、下一次 trace 寫入之前**：

```bash
DIAGNOSTIC_CRASH_POINT=after-validation NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tooling/diagnostics/interrupted-round-2026-10-29.cjs
```

同樣 exit 1，`parsedInMemory=true`，durable 仍 `candidate-received`、40 tokens／世界 calls 0。相同最後保存點可對應不同真實進度，不能定位故障行。

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tooling/diagnostics/interrupted-round-controls-2026-10-29.cjs
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/round-deadline-api.test.cjs tests/decision-trace-faults-api.test.cjs
```

[五組對照](../../tooling/diagnostics/interrupted-round-controls-2026-10-29.cjs) **5/5 PASS**：正常提交、malformed candidate、26 秒保存、獨立 trace read 故障、trace write 全失敗。最後一組世界仍成功且用量保留，回應明示 write-failed，不能用 trace 不完整反推世界未提交。正常成功的最後 checkpoint 同樣缺自己的 completedAt。既有期限／追溯故障回歸 **52/52 PASS**（約 62.4 秒）；沒有宣稱完整產品 suite 或正式效能驗收通過。

### 私有原回覆離線重播

另在公開 repo 外，以私有事後世界投影及**原 responseBody bytes**作本地 transport，沿相同 route 執行。第一筆 NPC 輸入的解析後 JSON 與捕獲 request 中的 NPC 輸入深比對相等、角色相同；首候選通過解析／驗證、無該筆 failure。到第二次 fixture 派送立即故意停止，沒有呼叫真實模型。正常故障收尾保存第一筆 input 21,813／output 526，世界 turn 18、settled／rolled-back，測試 1/1 PASS。

此結果只驗證第一筆確定性處理及用量收尾；不是原世界所有隱藏 server 欄位的完整事前重建、不是整輪成功重播，也不證明正式 parser 曾到達。第二次派送與故意停止是本地 fixture 事件，不能填入正式時間線。原輸入／回覆與私人重播檔均不公開。

## 工程判斷與票務切片

同版 [world route](../../app/api/world/route.ts) 的 expired-pending 分支只更新 journal 的 uncertainResult，再回讀原 receipt；已定案分支直接重放。此處沒有恢復原執行 RAM 中的 paidBefore／paidAfter，亦未把 durable 正常 usage 的未入帳狀態與世界累計關聯。`retainPaidUsage` 的正常故障／CAS 衝突路徑需要原 worker 繼續執行。這是本地症狀可定位的程式責任，**不是正式站中斷根因**。

[#153](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/153) 與 ADR 0004 接受模型／世界／實錄非原子、未捕獲內容不可得及 unknown。期限契約也不承諾 DB 完全不可用時所有用量立即 durable。這些例外不能把**已成功 durable、正常時限內可得的 usage，在儲存恢復後仍無入帳／待核對閉環**當成零花費。本次資料不是 lateUsage；不要求從 archive 重建原 HTTP 結果或改寫已定案費用。

判定依據也包括 [#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166) 的「技術失敗仍保留已知用量並明示未知部分」、[#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168) 的成功／失敗皆只計一次，以及 [#82](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/82) 的累計已發生費用與失敗費用保留。不是為本次診斷新增無限可靠性或分散式交易承諾。

### #92：補入可驗收的已知用量恢復修正

- 對上述單角色 RED，原 ID 恢復後保留一筆已知派送的累計 calls／input／output；同 ID 重載、重複／競爭恢復及原 worker 晚到均不得重算。世界故事、版本、原 uncertain receipt 及停止新操作保障不被改寫。
- 對已入帳、部分已知、資料缺失／淘汰／不可讀案例，分清已入帳、尚待核對與未知；不能把找不到 trace 當零成本，也不能無依據加總。沿既有權限與容量，不引入公開原件或無界帳本。
- 正常 deadline 內的 usage 與 lateUsage 分開；依原費率／窗口契約驗證成本與 unknown 標示，不把舊窗口費用塞入目前小時，不更動原定案 receipt 的 body。工程可選安全的入帳／去重機制，本診斷不指定「直接累加全部 archive」等未驗證修法。
- seam：世界 API → 共用 transport fixture → 真實 SQLite → 中斷／恢復／重讀，再以既有成本與分析入口驗證呈現；把此 RED 轉為永久 regression。延伸多派送及同時晚到需在實作驗收補測，本輪沒有宣稱已覆蓋。
- 保留 #91 前置與 #92 其他未完成驗收；此窄問題不等於候選生成、#85 或 NPC 行為已修復。

### #77：補證診斷，不能先寫修法

本輪已讀原件、同版程式、正式原 ID GET、既有回歸並完成以上反例。仍缺下列最小關聯證據：

1. 原操作／request 的 Worker invocation 結果，涵蓋 12:03:35–12:11:14：exception／取消／資源限制、CPU 與 wall time、最後安全階段；如可得，再對照模型後 guard、round-failure、CAS、journal-confirmed 時點。私人關聯 ID 由原件提供，不公開。
2. 該 invocation 的 D1 錯誤／延遲或收尾 SQL 結果，區分 worker 未續行、儲存不可用、CAS 前／後／未知；不能用 checkpoint 間隔直接替代。
3. 原始失敗 POST 與各失敗 GET 的方法、時間、status、Content-Type、平台 request 關聯及去識別錯誤類型。無歷史 HAR 時明示不可追回，不要求重跑原操作取樣。

現有世界 API 沒有提供上述平台 invocation、raw journal 寫入時間／CAS 結果或原 HTTP 回應。已檢查可用來源並搜尋平台連接能力，本輪未取得可用的 Cloudflare 歷史 logs 入口；沒有因此聲稱平台正常或借用 #77 舊 CPU 證據。若歷史記錄不可得，工作票應明確結論「本次根因無法追回」，另在授權測試環境建立有界、安全階段觀測，不把推測的調時限／加容量當修正。

## 恢復半小時行為驗收之前

1. 原操作仍沿原 ID 唯讀查證；查明可得的 journal／世界／用量狀態，修正並驗收 #92 的已知用量保存與去重，保留原始不明狀態，不用新 ID、重置或直接改 DB 偽造原操作成功。
2. #77 的中斷調查需取得可驗證原因及對應修正，或明確記錄歷史原因不可追回，先以隔離環境完成受影響提交／恢復路徑及必要觀測驗證。不能只因本地 fixture 通過就宣布正式可靠性恢復。
3. 由後續授權完成產品修正、部署與原操作安全恢復／停止狀態確認；若仍不允許下一個新回合，保持停止。重新取得付費正式觀察授權後，沿原隔離故事、原期限與上限及原 30 分鐘／8 advance／64 派送／1,500,000 已知 tokens 停止線執行，先到即停，pending／uncertain／技術故障立即停新回合。
4. 記錄版本、起訖、世界版本／回合、已知與未知用量及實際 NPC 後續行為。至少取得成功提交與後續真實輸入，才能討論方法承接／loop；未跑滿不可標成半小時通過，不關閉 #85／#104／#106／#211。
