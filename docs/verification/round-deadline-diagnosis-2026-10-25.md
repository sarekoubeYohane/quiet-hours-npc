# 四角色回合末次裁定逾時：原件核對與本地可反證診斷（2026-10-25）

**兩案可收斂至同一技術阻擋：累積工作接近整輪截止，最後裁定被剩餘期限縮短。不能歸因為供應商每次用滿25秒，也尚不能把延遲全部歸給D1。** 本地經真實世界API／transport／序列化／測試SQLite重現兩種最後階段，取得可重跑RED；沒有交付產品修正。追蹤票：[待Grill診斷 #166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)。下一步是窄範圍 `grill-with-docs`，先決定是否接受調整有界回合時間／租約／前端等候政策，再to-spec。泡茶loop仍證據不足，#85不結案。

本輪只讀取既存資料、執行無網路合成測試、發布診斷與報告；未連正式世界API、修改產品程式、呼叫付費模型、推進／重置正式世界、合併或部署。

## 來源、版本與證據等級

- 查核main：`4c54b156fa2e247aac1ec9b039d8d2e94a1138ed`。PR [#164](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/164)已合併；[#165](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/165)仍open，head `067ee67d1c05be5f35ae1e608a151b624e2b439e`。兩PR皆只有一份報告變更，完整票面／diff及discussion已讀，留言皆空。
- A：[#164報告](pr162-live-observation-2026-10-24.md)，部署`b97edf2`；B：[#165報告固定版](https://github.com/sarekoubeYohane/quiet-hours-npc/blob/067ee67d1c05be5f35ae1e608a151b624e2b439e/docs/verification/loop-followup-2026-10-25.md)，部署`4c54b15`。git diff證實兩部署只差#164文件，產品程式相同。本輪沒有重新查正式站當前部署。
- **已取得並獨立重讀兩份私有ZIP及其JSON原件**；ZIP CRC與內附SHA-256清單一致。B包的prior實錄與A包最終實錄逐欄相等。這證明保存副本一致，不是供應商簽章或新的線上GET。
- 私下解析實際request／response／候選及快照，獨立確認：兩案相同故事起點、四份NPC短期引用schema與可見集合相等、選留合法、新杯及獨立茶飲只存在候選世界；起終world排除aiUsage後深度相等。原日常世界隱藏備份沒有還原測試。
- 公開只保存[白名單擷取器](assets/round-deadline-2026-10-25/extract.py)、[去識別時間線](assets/round-deadline-2026-10-25/timeline.json)、[合成harness](assets/round-deadline-2026-10-25/repro.cjs)及[本地結果](assets/round-deadline-2026-10-25/local-results.json)。不公開完整transcript、記憶正文、世界備份、operationScope、憑證或畫面。
- 已讀AGENTS、Matt流程、GLOSSARY、ADR 0001–0005（含兩份0002）、diagnosing-bugs、grill-with-docs／grilling／domain-modeling、to-spec、to-tickets、pr，以及[工程契約](../design/operation-evidence.md)、[#92既有驗收](decision-traces-92-2026-10-22.md)、[操作驗收流程](operation-evidence-live-runbook.md)、[隔離場景契約](../design/minimal-acceptance-scene.md)。本輪不把未決方案寫成accepted ADR。

## 兩次原操作時間線

以下為原trace的實測事件時間，單位秒，相對各自`acceptedAt`。A基準為台北10/24 19:46:30.930；B為10/25 12:39:55.248。`—`代表沒有記錄，不是零延遲。

**語義修正：`startedAt`實際是prepared observer建立紀錄的時間，在await準備保存點之前；不是fetch實際派送時間。** `headersReceivedAt`在observer處理headers時記錄，`receivedAt`在body讀完後observer處理時記錄；都不是D1寫入完成的時間。下表的「parsed／bound」是機械步驟事件，不能當作所有保存已完成。

| 順序／任務 | A prepared | A headers | A body | A parsed／bound | B prepared | B headers | B body | B parsed／bound |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 Kris NPC | 1.850 | 7.383 | 7.952 | 9.923 | 2.340 | 8.066 | 8.651 | 11.323 |
| 2 Kris裁定 | 10.755 | 18.270 | 19.713 | 23.882 | 12.376 | 18.569 | 19.824 | 24.208 |
| 3 店主NPC | 24.547 | 29.184 | 30.553 | 34.308 | 25.045 | 30.769 | 32.278 | 36.560 |
| 4 店主裁定 | 35.141 | 53.747 | 55.231 | 59.712 | 37.613 | 51.702 | 53.271 | 58.101 |
| 5 Cass NPC | 60.401 | 65.194 | 66.485 | 72.086 | 58.961 | 64.640 | 66.321 | 70.252 |
| 6 Cass裁定 | 72.931 | 80.043 | 81.825 | 87.128 | 71.302 | 77.944 | 79.660 | 85.107 |
| 7 Vera NPC | 87.805 | 93.425 | 95.099 | 99.943 | 85.955 | 91.781 | 93.576 | 98.769 |
| 8 Vera裁定 | 100.810 | — | — | — | 99.827 | 107.202 | — | — |

裁定2／6為正常denied，4為accepted；不是前七次皆世界成功。前三角色npc-feedback分別在相應bound時間。最後角色在catch／finally記有npc-feedback，**不能解讀為取得不存在的第八次裁定回覆**。

| 收尾事件 | A | B | 證據含義 |
| --- | ---: | ---: | --- |
| round-failure | 110.414 | 110.617 | failure保存await後才到此，非精確abort時間 |
| world-candidate／commit-start | 110.414 | 110.617 | 準備保存回復後世界及用量 |
| world-commit-confirmed | 112.935 | 114.123 | CAS確認失敗回條／用量保存，不是故事成功提交 |
| 故障分類 | timeout／dispatch | timeout／response-body | B有HTTP200，兩案無最後body及usage |
| 世界版本 | 329→330 | 330→331 | minute=750、turn=2均不變 |
| 已知input／output | 88,365／2,859 | 88,377／3,175 | 分別91,224／91,552 tokens，末次usage未知 |

### 缺少與可推導的時間

1. **租約建立／取得精確時間：未知。** route在建立trace之前設定`lease = Date.now()+120000`，CAS取得鎖後才有acceptedAt；原私有實錄未保存lease，未取得兩案Cloudflare安全stage logs。因此不能把acceptedAt直接當租約起點。原operationId中的數字亦不是伺服器租約時間。
2. **signal建立／實際fetch開始／abort精確時間：未知。** 原trace沒有這些時間欄位。租約工作截止為lease−10秒，故在時鐘正常前進前提下，不晚於acceptedAt+110秒；實際abort與round-failure之間還有故障保存等待。
3. 第八次prepared到round-failure為A **9.604秒**、B **10.790秒**。在prepared時的剩餘工作時間上界為A **9.190秒**、B **10.173秒**；不是實測signal timeout值。初始signal在prepared稍前建立，並包含準備保存／序列化時間。
4. 前七次prepared→body事件窗口合計A **63.428秒**、B **59.989秒**。到第八次prepared前，其餘窗口合計A **37.382秒**、B **39.838秒**，包含setup、body後保存、usage／candidate保存、驗證、世界處理、guard／Key讀取等。這是互不重疊窗口的算術分解，**不是provider vs D1的時間分帳**：prepared→body本身也包含儲存及排程等待。
5. usage已保存在七次實錄中，但沒有usage事件時間；checkpoint開始／完成與每次SQL／scrub／序列化耗時也沒有保存。B headers→round-failure的3.415秒，混合headers checkpoint、body等待及failure checkpoint，不能稱純body網路時間。
6. commit-start→confirmed為A2.521秒、B3.506秒，包含commit前trace保存、序列化及世界CAS；不是單筆SQL時間。final trace寫入、journal狀態補記、HTTP送回與finally解鎖的完成時間未在私有trace逐項記錄。

## 程式責任鏈與可反證假設

以本次main為準：

- [世界route](../../app/api/world/route.ts)：318–325建立120秒固定租約，沒有續租；381驗證原lease／version且在lease−10秒提前停止；414及442的單次signal皆取`min(25000, lease−10000−Date.now())`。它只確認剩餘時間為正，並沒有為所有後續角色預留完整呼叫窗口。
- [共用transport](../../lib/model-adapter.ts)：signal進函式前已建立。prepared保存完成才fetch；fetch開始後的dispatch保存與網路可能重疊。HTTP headers保存是await，之後才開始`response.text()`；`withDeadline`用同一signal包住headers／body工作，忽略abort的fetch也不能讓caller無限等。body observer保存也在bounded工作內；usage／candidate保存發生於其後，返回前再次檢查signal。
- [trace capture](../../lib/decision-trace-capture.ts)：每個observer事件都snapshot／scrub並經queue await保存；步驟事件先放記憶體，在下一保存點落盤。[trace storage](../../lib/decision-traces.ts)另做有界序列化與SQLite寫入。保存錯誤會記gap，但**catch錯誤不等於保存等待沒有時間成本**；沒有獨立的checkpoint時間保證。
- 回合catch還原故事、保留用量；commit-start checkpoint後CAS保存原世界＋用量＋定案journal；最後trace及journal狀態補記另交易。10秒是預留，不保證任意D1延遲都能收尾；若超過租約，仍會走既有衝突／不明結果處理。
- [前端](../../components/world-app.tsx)POST另有125秒timeout。15秒外層deadline限制等待retryable／再次嘗試，**不會在15秒強制中斷已發出的125秒fetch**。只把後端租約加長會撞上前端上限，並可能中斷原request。

RED之後排序及對照：

| 假設／預測 | 本地結果 | 對正式案的界線 |
| --- | --- | --- |
| H1累積工作耗盡總deadline；相同單次延遲、少一角色應能完成 | 四角色8×14秒最後截斷；三角色6×14秒成功 | 支持兩案同一截止機制，原lease／abort精確時間仍缺 |
| H2 awaited保存侵蝕工作窗口；只增加保存延遲應使成功變失敗 | 8×12秒成功；每個trace寫入加0.4秒後最後body逾時 | 證明此機制可造成故障，不證明正式D1就是0.4秒或唯一主因 |
| H3必須有單次provider超過25秒才失敗 | 最後替身14秒即可回覆，卻只給12秒；單角色兩次14秒成功 | 完整25秒provider等待不是此故障的必要條件；正式末次如果多等會否成功仍未知 |
| H4必須先有租約競爭／CAS衝突 | 單操作者、未注入衝突，110秒截斷、120秒租約仍有效，回復CAS成功 | 兩原案也定案rolled-back；無證據將它們視為#77舊CPU事件，但不能聲稱已讀Cloudflare全部日誌 |

Cloudflare官方文件在本輪查核時說明：HTTP-triggered Worker在client保持連線時沒有固定wall-clock上限；client斷線可取消工作；CPU time與等待I/O的wall time不同。[Workers limits](https://developers.cloudflare.com/workers/platform/limits/)不能證明本帳號實際CPU／記憶體設定或本案無資源壓力。[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)列單次SQL最長30秒及每次請求額外成本；這也不等於本案SQL實測30秒。**110秒是本產品程式政策，不應寫成Cloudflare硬上限。**

## 本地重現：RED與對照

沿使用者指定最高層seam：既有POST世界API → 真實活動／決策／裁定／共用transport → 真實JSON序列化及既有測試SQLite migration／CAS／journal／私有trace → GET原操作與同ID POST。只替換模型回覆、elapsed clock／AbortSignal timer及測試儲存延遲，沒有修改產品來源或timeout常數。

```bash
# 從repo根目錄執行，Node 24；現有依賴需已安裝。
# 預期exit 1，斷言HTTP200實際得到502；這是尚未修正的完成能力RED。
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" DEADLINE_EXPECT_COMPLETE=1 \
  node tests/run-activities.mjs --test-name-pattern=cumulative-body \
  docs/verification/assets/round-deadline-2026-10-25/repro.cjs

# 預期exit 0：驗證目前故障／成功對照及保護，不表示產品已修復。
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" \
  node tests/run-activities.mjs \
  docs/verification/assets/round-deadline-2026-10-25/repro.cjs
```

RED已取得兩次一致結果；最小case實際約3.8秒，虛擬時間110秒。最後派送在98秒，signal=12秒；HTTP200 headers存在，body及usage缺，HTTP502、整輪回復，已知7×40=280 tokens、1未知usage。同ID重送原502／body，零新派送。三角色控制84秒完成，證明在此14秒包絡內第四對呼叫是必要觸發條件。

| 合成case | 派送 | trace寫入 | 最後signal／實際fetch餘額 | 結果 |
| --- | ---: | ---: | --- | --- |
| cumulative-body | 8 | 49 | 12秒／12秒 | 110秒timeout／response-body |
| cumulative-dispatch | 8 | 48 | 12秒／12秒 | 110秒timeout／dispatch |
| fast-control，8×12秒 | 8 | 51 | 25秒／25秒 | HTTP200、turn+1 |
| storage-pressure，同上＋每寫入0.4秒 | 8 | 49 | 11.6秒／11.2秒 | round-failure110.4秒、timeout／response-body |
| three-actor-control，6×14秒 | 6 | 39 | 25秒／25秒 | HTTP200、turn+1 |
| single-call-control，一角色2×14秒 | 2 | 15 | 25秒／25秒 | HTTP200、turn+1 |

六個對照全部符合預期；失敗案另斷言完整故事回復、已知用量保留、最後usage未知、原ID精確回放。`traceWrites`是本地fixture實測，不是原案的正式寫入數。增加0.4秒會消耗prepared後到fetch的0.4秒，直接顯示signal在派送前已運作。

限制：這是保存在docs資產目錄、未加入預設CI的診斷harness。固定合法denied裁定用來維持每角色一次裁定；不是私有transcript重播，也未在本地重演新杯／茶的全部效果。SQLite是既有D1相容測試adapter、非遠端D1；虛擬時間不量測真實CPU、網路或SQL性能，body只模擬受控串流截止。不能把六項綠燈稱為修正交付、Workers生命週期保證或泡茶行為通過。初稿曾因合成角色尚未經GET正常化而得到感知欄位差異；已修正baseline取法，該訊號未算作本案RED。

## 最小方案比較與設計界線

已確認不可重新訪談的邊界：角色逐slot承接前面候選變化；整輪原子提交；已知用量保留／未知不填零；同operationId不重派；不並行NPC、不部分提交、不自動重試／換模型。ADR0004明定awaited保存與原期限，ADR0005保留逐slot資訊順序。

| 方案 | 順序／原子性／冪等 | 成本、租約與未知風險 | 是否解決完成能力 |
| --- | --- | --- | --- |
| 只把單次25秒增加 | 其他可不改 | 仍取整輪剩餘min，可能多等但無新總容量 | 否；本案末次本來就不到25秒 |
| 只提早拒絕餘額不足的末次派送 | 可保持 | 可省最後一次費用，但前七次仍回復；不能自動新ID重試 | 否；只是較便宜地失敗，可作附屬保護 |
| 減少序列化／寫入等待且保留必要持久保存點 | 可保持；需證明保存及晚到次序不變 | 降成本；若刪checkpoint或改fire-and-forget，會改變硬中斷證據契約，不能擅做 | 對目前快路徑可能有效；8×14秒零儲存延遲仍失敗，不能單獨承諾有界四角色情境 |
| **有界完整回合時間預算，成套調整工作期限／固定租約／前端等候** | 可保持既有逐slot、單次原子CAS、同ID回放，不必續租或背景恢復 | 不新增派送次數；原請求仍可能付費而無回覆。最長等待、競爭者等待及過期pending時間增加；收尾餘量與舊client相容需測 | 推薦研究方向：在明定模型／儲存延遲包絡內能完成，且仍有硬停止；不是任意把120改成更大數字 |
| 有界續租／heartbeat | 順序和原子性可保持 | 要新增fencing、失聯／續租失敗／同ID pending一致性，避免舊worker晚提交；硬上限仍必要 | 可處理較長回合，但改變租約／恢復語義，範圍較大，須另決策 |
| 並行NPC、部分提交、額外重試、切模型 | 可能改變可知資訊、故事或費用 | 改自主順序／故障粒度或增加重複付費 | 不在已授權最小方向內 |

總時間應以「有界呼叫鏈＋setup／guard／保存／驗證＋收尾」推導，包含可能的回想續答；隔離場景本次無回想。四角色八次各25秒光呼叫包絡就是200秒，尚未加其他階段。這是容量上界算式，**不是批准200秒、300秒或任意新值**。每段與整輪皆需有限界線；無限慢儲存仍須安全停止，不能靠無限續租。前端125秒和同ID pending／過期分支須一起驗證；不把改長單一常數當完成。

### 流程決定與最小後續範圍

本案已足以立獨立技術診斷／決策票，但**尚不適合將更改期限政策標為ready-for-agent修正規格**。需要grill的唯一當前分岔是：是否接受較長但有限的完整回合等待／鎖定，以保留既有順序與整輪提交。具體數字與延遲包絡待工程量測後定稿；不重問自主性、提交粒度、重試等已確認決策。

若接受推薦方向，最小交付是一個垂直切片：統一時間預算政策 → 每次準備／派送／body及保存的界線 → lease／CAS與收尾 → 前端等候／原ID恢復 → 安全時間診斷與API／SQLite／必要UI驗收。可先作不改語義的序列化效率改善，但需以完成測試證明效果。不要先拆成互相不能驗收的多張層級票；to-spec可沿本輪已指定seam，後續僅在完整切片過大時to-tickets。

必要診斷應保存安全的lease建立／workDeadline、signal建立／有效deadline及限制來源、實際fetch開始、headers／body讀取、保存開始／完成耗時、usage已知與commit關聯。不得加完整payload到一般logs，不回填舊紀錄未知時間。可對照既有#92補充責任，不另開同義「追溯平台」票。

票務核對：#77 open，原案含已查證exceededCpu及HTML／恢復問題，不能宣稱同因；#85 open為候選／行為診斷，不能承接本次容量修正或被結案；#92／#91／#153 open但相關實錄已有程式，保存點與診斷責任沿用；#24、#55、#73 closed是冪等／回想／失效回覆契約，不重開；#29是共用自動排程，非本次手動單輪前置；#70是模型內容容量，非回合wall-time；#106是物件／泡茶舊成果缺口，非本次timeout。本輪搜尋同repo issue及上述完整票面／留言，沒有找到相同八次派送工作窗口的專票，因此新增一張**待Grill診斷票**，不套ready-for-agent、不關閉舊票。

## 交付驗收介面與部署後有限重驗

以下是後續修正的驗收條件，**本輪尚未全部執行**：

1. 最高層沿既有世界POST → transport替身 → 真實序列化／SQLite → 原ID GET／POST；只有錯誤呈現與等待變更再補實際前端。四角色、八合法回覆於選定延遲包絡內完整提交；必須包含目前8×14秒RED及含checkpoint延遲情境，不能只驗證更晚仍失敗。
2. 鎖定初始世界與實際輸入，後一角色仍只看到既有順序可知內容；成功回合的世界／記憶／意圖／回饋一起提交。單次真正超時、總上限、body未完、保存過慢仍安全停止；此前成果全部回復，已知用量保留，未知明示。
3. 同ID重送、並行分頁、過期pending、失聯、世界CAS前／後故障、trace寫入失敗、晚到回覆／lease失效皆不重派、不重套效果、不覆蓋較新世界。若方案沒有續租，不新增續租旁路；若另選續租，另加fencing矩陣。
4. 定稿時間預算需列明支援角色／呼叫／回想包絡與有限儲存延遲，驗證服務端、UI及恢復等待一致；安全階段時間可區分provider、儲存與整輪限制。Cloudflare真實CPU、D1和request生命週期仍另驗。
5. 合併部署後**另行取得有限付費觀察授權**：核對部署含修正、保存目前隔離世界及原操作、維持原NPC／裁定模型、預算和歷史、自動暫停；先只一個新advance（最多原場景8次派送，既有預算先到即停）。不重置、加反覆提醒、灌回候選杯茶或補造舊結果。
6. 一個完整回合真正提交後，才在批准的總額度內取店主後續最多三次正常決策（最多再3 advance／24派送；實際可能較少）。若要沿之前門檻，總上限不超過4 advance／32派送／已知500,000 tokens／30分鐘，任一先到即停；token是已知事後量測、非硬預約，不足時不開下一回合。任何技術故障或pending／uncertain即停，只查原ID與保留證據，不為湊30分鐘重抽。
7. 分開判定技術提交與泡茶行為：技術通過後仍要核對真正提交的杯／獨立茶飲／完成回饋，再觀察本人如何承接；不要求喝茶或每輪換事。沒有後續樣本仍是證據不足，不以fixture或本票定位結案#85。

## 尚不能推論

沒有取得兩案原Cloudflare stage logs、CPU／D1 timing、供應商後台、精確lease／signal／fetch／checkpoint時間；不知道最後裁定多等多久會完成、會回何種答案及費用。不能斷言D1、模型大小、Playbook或舊記憶是唯一根因，不能將不同故障階段當不同NPC行為，也不能從候選茶杯推論loop已修復。兩次觀察本身是強烈線索；加上同版程式與本地反證，足以定位共同截止機制及下一步設計決策，尚不足以宣告特定生產效能修正成功。

## 本次交付檢查

- 私有原件解析／ZIP CRC／SHA-256、前後故事比較、B prior與A final比較、七次usage加總及四NPC引用集合均由擷取器斷言通過；只輸出白名單欄位。
- 最終harness：六項對照通過；單獨RED命令1項失敗，正是`502 !== 200`的預期完成能力缺口。最終RED單獨執行兩次一致重現，未修改產品使其轉綠。
- Node語法、Python AST、JSON解析、Markdown本地連結、公開JSON敏感欄位掃描與git diff --check通過。人工核對表格數值與原件白名單結果。
- 只有本報告、合成harness、白名單擷取器及兩份去識別JSON；app／lib／components／tests／migration／部署設定皆未變。未跑完整產品suite或瀏覽器；診斷之外的既有保護以本次實際涵蓋範圍為限。
