# 規格群與實際驗證對照

此表列出現行已實作行為的驗證群。F/L/W 定義見主報告；**通過只限下列實際案例與邊界，不是同群每句規格的完整證明**。逐段來源與未獨立核對列保留在 clause-audit.csv。測試群的每個實際測試標題、結果及分組見 test-index.csv；瀏覽器逐命令結果見 browser-results.json。

| 現行規格群／條款範圍 | 測試／驗證方法 | 實際結果／證據限制 |
| --- | --- | --- |
| account-model-keys：兩服務保存／替換固定14天；登入24h獨立；跨登入共用、不續期、舊期不遷移、清除／到期停止後續派送、已派送計量與回復；帳號／origin／環境／provider隔離、密文竄改拒絕 | `model-keys-api`、`auth-api`；L：`browser-model-key-retention` | F 測試群通過；L 旅程通過；W 另2項實際Workers/D1通過；OAuth/外網為fixture；參見同名測試與runner結果 |
| github-login：OAuth state/PKCE、單次消費、白名單、環境origin、token不保存、登出撤銷、24h邊界、固定錯誤診斷與redirect拒絕 | `auth-api`、`auth-workerd`、`environment-api` | F 測試群通過；此群無新增瀏覽器證據；W 另2項實際Workers/D1通過；OAuth/外網為fixture；參見同名測試與runner結果 |
| world-operations：固定ID journal、租約/CAS、平行衝突、同ID重放、過期pending、unknown/uncertain保留、不明保存不盲重做、scope隔離、reset水位與用量保留、HTML/JSON安全解碼 | `operations-api`、`reset-api`、`conflict-api`、`recovery-ui`、`usage-recovery-ui`、`interrupted-usage-api`；L：`browser-smoke`、`browser-decision-trace-faults` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| round-time-budget：400/430/445秒、逐角色／整輪原子、受理前15秒、單模型25秒、回想10秒、舊client426、晚到工作不恢復候選或派送 | `round-deadline-api`、`operations-api`；L：`browser-decision-trace-faults` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| npc-playbook：共用Playbook／各人性格、消息後續做或切換、單次指定、接管／交還、經歷有界與失敗重試 | `intents`、`takeover-api`、`owner-control-api`、`continue-api`；L：`browser89`、`browser90` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| npc-action-model：當前方向／唯一追求、純活動零新決策、角色順序、控制與動機分開；舊完整陣列語義由v3取代 | `pursuits-api`、`pursuit-lifecycle-api`、`continue-api`；L：`browser-pursuits-221`、`browser-pursuit-lifecycle-224` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| npc-perception-spec：D20級別、同條件不洗骰、區域／門／遮擋、匿名聲音、主動查探、錯誤感知、關注只比對本人可知、接管持續感知、保存回復 | `perception-api`、`active-perception-api`、`attention-api`、`false-perception-api`；L：`browser95`、`browser90` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| npc-memory-contract：短期FIFO80/64KiB、長期64/64KiB不自動淘汰、可見id/version選留／整理／更正／遺忘、認知同輪、有界投影、真recall流程及過期向量拒絕 | `memory-api`、`cognition-api`、`maintenance-api`、`memory-selection-contract-api`、`recall-api`；L：`browser56`、`browser-flexible-life-integration` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| recall-service-configuration：玩家／站主budget分離、回想單輪兩題、權威D1回查、已知Embeddingtokens及dispatchunits、失敗／重送保留；正式資源未驗 | `recall-api`、`budgets-api`；L：`browser81` | F 測試群通過；L 旅程通過；Vectorize/Embedding為受控邊界；參見同名測試與runner結果 |
| model-task-contract：NPC主觀輸入與裁定權威輸入分離、真正body/hash/request關聯、v3 schema與非法引用拒絕、adapter不取得World、候選不擲骰或寫世界 | `model-contract-api`、`adjudication-contract-api`、`pursuits-api`；L：`browser-pursuits-221`、`browser93` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| free-action-effects：自由提案／裁定／真正成果分開、借還權利與物理操作、同杯攜帶洗還、首次日常核准／跨活動重用、有限供應、已知障礙／新方法、場地角色共用 | `free-actions-api`、`tea-api`、`routine-api`、`routine-sharing-api`、`routine-obstacles-api`；L：`browser93`、`browser94`、`browser100`、`browser109`、`browser110`、`browser111`、`browser112` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| activity-lifecycle：開始／續做／到期／取消、長活動1440分鐘、可暫停保存進度／自主復工、條件重驗、成果／消耗／骰子不重播、睡眠與普通休息不同 | `activity-lifecycle-api`、`long-activities-api`、`sleep-api`；L：`browser175-176`、`browser-sleep` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| activity-lifecycle-results：五種D20結果、自由與v2日常程序分支、部分／失敗真成果、純續做保留所選結果與原骰、中斷保留早先提交成果 | `activity-results-api`、`routine-results-api`、`routine-program-api`；L：`browser127`、`browser128`、`browser129` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| activity-time-contract：世界確認完成時間、明示投入上限不足不啟動、開放時段與完成目標、首次核准／免費重用、15/30分鐘推進與控制相容 | `activity-time-api`、`activity-time-limit-api`、`activity-time-review-api`、`long-activities-api`；L：`browser116`、`browser117`、`browser118`、`browser119` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| operation-evidence：公開有界證據／私有完整實錄分層、真request/response、已知／未知時間／用量、owner範圍、Key遮蔽、失敗checkpoint、原ID讀回、晚到用量恢復 | `operation-evidence-api`、`decision-traces-api`、`decision-trace-faults-api`、`candidate-diagnostics-api`、`interrupted-usage-api`；L：`browser-operation-evidence`、`browser-decision-traces`、`browser-decision-trace-faults`、`browser-candidate-diagnostics` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| world-changes-framework：新狀態／曝光、環境與身體外在影響、未經許可後果、來源／形成／分拆／共同權利、份量與飲品容器連續性、通用日常symbolic程序、有限來源不重生 | `world-changes-object-api`、`world-physical-api`、`world-external-api`、`world-formation-api`、`routine-world-changes-api`、`source-scope-api`、`drink-binding-api`、`partial-drink-api`；L：`browser146`、`browser147`、`browser148`、`browser149`、`browser151`、`browser151-world` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| natural-changes-time：只按已提交世界時間、同點先自然後活動、條件持續／破壞後不復活、無關revision不失效、重載／同ID不重做 | `natural-changes-api`；L：`browser-natural-changes` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| character-visual-assets：四角色實際素材／尺寸alpha／像素baseline、真map/profile、日夜／門／移動、低動態／手機版、圖片失敗fallback | 素材／瀏覽器及建置檢查；L：`browser88`、`browser95` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| minimal-acceptance-scene：進入／取消／返回原世界、超1MiB故事保存、餐點取得食用、店主自主grant、借杯攜帶洗還、泡茶中斷、跨分頁舊操作與共用用量 | `acceptance-scene-api`、`live-acceptance-cup-api`；L：`browser-acceptance-scene`、`browser-live-gaps` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| autonomous-life：四需求只隨世界時間、真正攝取／休息／睡眠後果、重評估不強制行動、跨日習慣、本人經驗喜好、長活動、同次心理容量、故障／舊資料啟用 | `life-needs-api`、`long-activities-api`、`sleep-api`、`preferences-api`、`life-habits-api`、`life-integration-api`、`life-cognition-integration-api`、`life-trace-api`；L：`browser-life-needs`、`browser175-176`、`browser-sleep`、`browser-preferences`、`browser-life-habits`、`browser-life-forecast`、`browser-life-integration` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| flexible-life：內在安排沿記憶／遺忘、事件／時間／情境一次機會、手機私有備忘錄／收件匣／行事曆、通知不等於讀取、睡眠漏提醒與晚讀、帳號／NPC／context隔離 | `arrangements-api`、`arrangement-cues-api`、`phone-memos-api`、`phone-inbox-api`、`phone-notifications-api`、`phone-calendar-api`、`flexible-life-integration-api`、`flexible-life-review-api`；L：`browser-arrangements`、`browser-arrangement-cues`、`browser-phone-memos`、`browser-phone-inbox`、`browser-phone-notifications`、`browser-phone-calendar`、`browser-flexible-life-integration` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| last-known-state：僅真正可見來源、短長期版本、原主觀文字／遺忘缺口、已知物件狀態不是已確認受阻原因、隱藏庫存A/B不改回饋 | `last-known-state-api`、`action-feedback-api`；L：`browser-method-reassessment` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| method-assessment：正常同次目的／方法評估、已知來源／選中action／當前追求一致、評估不造外在真相、原私有實錄、重載及下一真input | `method-assessment-api`；L：`browser-method-assessment` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| method-reassessment-integration：餐點耗盡替代來源／真攝取、同杯新茶與部分飲用、別名免費重用、同條件否決免費、真條件變化可重試、跨角色請求與自主回覆 | `method-reassessment-integration-api`、`alternative-food-api`、`drink-binding-api`、`partial-drink-api`、`verified-obstacles-api`；L：`browser-method-reassessment` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| object-observation：觀察未知現存物件、有效D20機會、看見不等於取得／授權、已知清晰程度、下一真正input、回復與重送 | `object-observation-api`；L：`browser-object-observation` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| world-discovery：裁定discover真來源→活動→感知→記憶→下一input；新確認方法才新機會、既有資源不洗骰、權威scope/omitted不進NPC | `discovery-api`、`discovery-method-api`；L：`browser-discovery-208` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| routine-discovery：pending普通背景須活動確認、來源成立與察覺分開、原許可／有限scope、跨規則共用、沒有合法來源不以背景補回、容量與舊資料 | `routine-discovery-api`、`source-scope-api`；L：`browser-routine-discovery-209`、`browser-routine-discovery-pending-209`、`browser-source-scope-206` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| demand-integration：詢問→另一NPC真正回覆→探索→已知替代方法→材料消耗→餐點形成／交付／攝取；同世界保存、下一真input與失敗回復 | `demand-integration-api`；L：`browser-demand-integration-210` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| layered-pursuits：#220 C1–C24/C28–C30：唯一圖、共享下層／排序、版本與來源、主觀滿足、改範圍／退出、單一活動進度、安排喚起、舊世界明示reset、容量／故障／控制／隔離 | `pursuits-api`、`pursuit-graph-api`、`pursuit-lifecycle-api`、`pursuit-exit-api`、`pursuit-arrangements-api`、`pursuit-review-api`、`pursuit-new-waiting-api`、`pursuit-capacity-api`；L：`browser-pursuits-221`、`browser-pursuit-graph-223`、`browser-pursuit-lifecycle-224`、`browser-pursuit-exit-225`、`browser-pursuit-arrangements-226`、`browser-pursuit-capacity-227`、`browser-pursuit-history-review-220` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| pursuit-selection：#220 C25–C30：同次候選／承接／拒絕／未選／focus、空候選合法、未承接不回灌或變待辦、當次可見來源、無額外模型呼叫 | `pursuit-selection-api`；L：`browser-pursuit-selection-222` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| pursuit-capacity：12nodes/16edges/4depth/12KiB、4updates/4KiB、心理4項/8KiB、88KiB input及provider body、全圖不盲截、可知source gaps、明示archive/drop維護與原子性 | `pursuit-capacity-api`；L：`browser-pursuit-capacity-227` | F 測試群通過；L 旅程通過；參見同名測試與runner結果 |
| infra-environments-ticket-plan：本機／測試／正式環境配置與帳號世界隔離、重置與migration相容；未交付每日帳本／伺服器排程／發布回復另列 | `environment-api`、`migration-gate` | 已實作環境/API契約通過；不含未實作設計及真人雲端驗收；參見同名測試與runner結果 |
| test-site-deploy：測試建置Worker/origin/D1/logging/source-map守門、migration前綴／陌生歷史拒絕；本輪不執行遠端部署流程 | `migration-gate` | migration/建置守門通過；未操作遠端D1、部署或Actions觸發／序列化；參見同名測試與runner結果 |

## 跨功能整合

| 實際旅程 | 本次證據 | 能支持／不能支持 |
| --- | --- | --- |
| UI→API→SQLite→重載／原ID重送 | 完整78組browser runner；78個入口含多個分支／故障子案例，數目不等於78個單一斷言 | 真應用與保存鏈；登入、host、模型仍fixture |
| 候選形成→共享追求→詢問／他人回覆→等待→探索→材料→餐點→主觀滿足／退出 | 受控runner10trial／80advance；實體SQLite重開；原WorldApp只讀副本／390px／POST拒絕 | 證明plumbing與payer連續；100calls/1000000tokens為明示高額度合成payer，不是原預設或真實授權 |
| 手機提醒→睡眠漏過→晚讀→安排延期／放下→recall／forget | flexible-life API與browser；真正一次召回流程、有效版本與遺忘拒絕 | 通知不是正文；不從trace復活忘記資訊 |
| 受阻方法→新回合免費否決→真條件解除→新方法／真正攝取 | routine-obstacles、verified-obstacles、method-reassessment、demand-integration | 非同ID重送冒充跨次重試；沒有強制NPC換意圖 |
| 新物件／身體／環境→感知→需求／喜好／習慣→下一正常決策 | life/formation/external/natural與整合API／browser | 整輪故障回復、早先成果保留；不證明真模型自然語義品質 |
| 模型Key→登入／服務→派送guard→成本／實錄→失敗回復／重送 | auth/key API、workerd、Key雙context UI、fault browser | 14天Key／24h登入獨立；只有假Key，未測正式雙瀏覽器 |
| 晚到用量→uncertain操作→owner-row CAS去重→預算與實錄 | interrupted-usage API、usage-recovery UI及故障矩陣 | 已知用量可恢復；未知／未保存仍未知，不宣稱分散交易或帳單完整 |
| 觀察者樣本10分鐘過期→成功釋放→UI暫停／恢復→兩新回合 | browser83；只推觀察者時鐘、server模型／租約仍有效 | 只證明樣本老化與明示重採；不是十分鐘伺服器請求成功或無重啟恢復 |

## 模型 Key 特別條款

| 條款 | 有效方法／本次結果 | 證據級別與缺口 |
| --- | --- | --- |
| OpenAI/OpenRouter保存及替換後固定14天 | model-keys-api兩provider，字面期限1209600000ms；browser保存兩服務／替換一服務且另一期不變 | F＋L；真正加密另W；無真Key |
| 登入24h不變 | auth/model-keys API在24h邊界拒絕舊session | F；真人OAuth為fixture |
| 重新登入可用未到期Key | 真auth模組建立新session後世界API可派送合成模型 | F；不能用固定登入browser取代 |
| 讀取、使用、重整、重登不續期 | API讀取／模型派送／新session的expiresAt完全相同；browser跨context與reload | F＋L |
| 舊Key原到期時間不變 | 建立舊24h合法AES-GCM資料，API使用／讀取／重登不延長，到期拒絕，重存才14天 | F；不操作真資料migration |
| 到期／清除停止後續模型呼叫 | NPC之間、NPC後裁定前等fixture時鐘／clear分支；只計已發出的呼叫；browser分服務clear與expiry | F＋L；未送出不計付費 |
| 已發出請求保留既有處理 | API pending transport在撤銷／到期後仍按原結果／費用／整輪回復處理，後續guard停止 | F；無實際供應商在途請求 |
| 環境／origin／帳號／provider隔離及遮蔽 | API＋Workers/D1；世界、request、錯誤／實錄不回Key；雙context只顯示狀態 | F＋W＋L；正式Secrets／跨環境部署未驗 |

未實作與真人／正式環境項目列在主報告；此表沒有將那些項目改列通過。
