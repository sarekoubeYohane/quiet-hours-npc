# #209 查找確認普通背景與後續使用驗收（2026-10-28）

基於 integration `c56a0e4`（已含 #206／#207／#208）。開始前讀取 #205／#209 全文、#209 留言（0則）、repo 指引與 TDD／領域契約。沿既有一次 v3 裁定確認普通背景，不增加分類、反思、修復或新決策服務；不要求第一步搜索。

## 逐項行為證據

所有 API 測試使用正式 GET／POST、活動、效果驗證、感知、序列化與 SQLite；只替換外部 NPC／裁定 transport、必要骰子，no-network preload 阻止非預期外網。真正 messages 在 fetch 邊界捕捉，不以預估輸入冒充。

| 可驗收路徑 | 實際證據 |
| --- | --- |
| 普通背景查找→後續取得 | 查找首次只有 pending 來源，正式階段成立並真感知；0實物、sequence=0；重讀後 next messages 有供應；後續 materialize 同 source，sequence=1、實物 holder=actor |
| 同義重問與漏看 | 原實作新 rule／label 會生成2來源（red）；canonical scope 修正後始終1來源，原miss同條件0重骰，不自行改 knownTo |
| 未知有限原料限制 | knownTo=[] 的適用整體原料仍進主持 authority，原實作誤造另1普通來源（red）；修正只辨識既有來源，remaining=0、不生成、不洩私有原因 |
| 跨 operator 及權利 | 原owner的已成立來源、有權／無權兩對照均只1來源；owner／allowedTo 不變；有權可後續實際取得，無權候選拒絕且不另造自己所有供應 |
| 30分階段、validateOnly、取消 | 首輪 pending／knownTo=[]、0骰；GET不改資料；下一階段才成立／1骰；取消只清未提交 pending，不發現或拿取 |
| 較晚限制 | 30分尚pending期間撤回operator或加入適用未知有限原料，正式phase拒絕、清待確認來源、0感知／0實物 |
| 缺正常場所／訪客／無效候選 | 無 routinePlace、訪客、無效超大quantity、physical背景核准均拒絕／回復；特殊／大量請求另以同次裁定拒絕案例驗證，不當成世界永久缺貨 |
| 故障及原ID重送 | 保存衝突、保存前失敗、較後角色錯誤均不留下來源／知情／成果；派送用量保留，原ID重送不再生成或派送 |
| 容量與舊世界 | 512既有來源後拒絕第513來源，未留下rule；GET不補來源或metadata；舊背景缺scope保持原資料 |
| 中斷後改方法 | 原實作新候選重用即將刪除的舊pending，結果0來源（red）；prepared clone先清舊future，再綁新方法，正式提交只有新已成立來源，舊pending消失 |
| 身份／消耗續用 | 舊 `source:1` 已消耗保持；新查找／成功重送不改其狀態，後續只形成 `source:2`，sequence2→3；next input只有active新物件 |
| 查找可選，已有普通方法可直接準備 | 漏看後選真正既有 `cafePrograms.food`（background.initialState=[]，既有來源含category=食材），原實作被未知來源阻擋（red）；修正在真正materialize接觸同來源，原料實際consumed、meal實際active，原owner／allowedTo不變，0追加裁定；next messages有meal |
| 已知／未知來源一律尊重有限約束 | 搜索成功已知ordinary後新增相同scope的未知有限限制，既有food免費blocked、自由materialize亦拒絕；知情不會繞過世界限制，原料不物化／不增sequence |
| 真正不同方法的新機會 | A首次miss、同A同義新rule不重骰；世界確認B不同operation後，同canonical source新機會1骰成功，仍只有1來源，next input可用 |
| 稀疏方法背景不繞過原權利 | 真正food方法bg[]遇原owner來源的category額外真狀態，Cass無權時維持1來源／0物件／0裁定，不另造Cass私有供應 |
| 合法有限來源優先 | ordinary在前、耗盡／別人持有權利／未到可用時間的finite在中、合法finite在後；正常場所與明確target兩路均實際用合法finite成餐，不扣其他來源、不新增裁定 |
| 任意未知來源拿取反例 | 相同漏看後，沒有server routineSourceScope的自由materialize仍502；knownTo／sequence保持，不因來源已成立就給任意候選權限 |

## 既有畫面及用量

最終產品重跑 `tooling/verification/browser-routine-discovery-209.mjs`，真實 WorldApp → 世界 API → SQLite → 下一輪實際 messages：4次既有「下一回合」、4 NPC＋2裁定＋1感知骰，0真實付費呼叫。來源確認、感知與後續物化分開；保存重讀及查找／最後操作的原ID重送均0新增派送。1280px、390px無水平溢出／pageerror，另以 `browser-routine-discovery-pending-209.mjs` 驗證30分鐘首輪僅pending、0知情／0骰，既有畫面不冒稱已成立；主要四張圖及另一次尚pending核對圖已目視。

- [30分鐘查找尚pending（1 NPC＋1裁定、0骰，尚未成立）](assets/routine-discovery-209/pending-background.png)
- [來源成立但尚無實物](assets/routine-discovery-209/confirmed-source.png)
- [實際供應感知](assets/routine-discovery-209/source-perception.png)
- [後續材料實物及同來源](assets/routine-discovery-209/acquired-material.png)
- [390px既有分析](assets/routine-discovery-209/mobile-analysis.png)
- [篩選證據、派送計數與容量](assets/routine-discovery-209/evidence.json)

代表資料：來源472 bytes、短期經歷3332 bytes、receipts3591 bytes、NPC輸入最大9899 bytes。實際request與authority容量以 evidence.json 的最後重跑值為準；fixture tokens 不是正式模型費用。

## 驗證與界線

本票17條 API 案例覆蓋以上完整路徑（含參數對照）；核心修正各有獨立red→green。承接 #208 已確認方法修正後，相關跨模組 **111/111** 通過（當時本票16條，另含方法4條、#206、#208、替代食物、world changes、sharing、verified obstacles）。最後有限來源優先排序反例 red→green 後，針對本票17條＋#206來源11條＋替代食物8條再驗 **36/36** 通過，0失敗／略過／取消。Typecheck、變更檔ESLint及diffcheck通過；完整全repo suite由 #210整合後統一執行，不將本票局部回歸稱作全repo測試。

沒有新增SQL migration或無界canonical索引，來源≤512、規則≤32及既有感知／記憶／預算上限保持；新scope有版本且舊資料不補造，取消／原子性／回退見[工程契約](../design/routine-discovery.md)。同次世界裁定仍可能語義誤判普通／特殊範圍；本票不藉固定物品白名單取代它。固定回覆證明程式能力，不證明真實NPC已會自主接手需求；跨角色多輪閉環交由 #210、真實自主性交由 #211。未合併main、部署、推進或重置正式世界，未改／關閉 #205。

## 整合 Spec 審查修正：獨立單份與整體範圍

API 反例先 red：查找已成立的普通食材背景後，加入 kind 同為 cooking-ingredient、僅一份且耗盡的奶酪來源，已知製餐竟未生成 meal。原因是合法原料 eligibility 被當成跨來源的整體限制。新增 optional、有版本的 finiteScope 明示 region／location coverage 與 subject；分類、名稱與單份數量不推定它。原有整體負例改明示真正範圍，不以改字修掉行為；來源自身及 finiteSourceBindings 約束保持。

新增三條 API 案（本票共20條）：獨立單份四組對照（material/category、缺分類、label含食材且category食材、不同subject明示範圍）皆沿既存來源實際製餐，sequence 0→1，獨立耗盡來源仍0；SQLite重讀後，下一實際 request/messages 有 meal 身份。同場所儲藏室的 location-wide 未知限制阻止前廳普通來源使用，沒有新實物／消耗，私有 label 不進 NPC；真主持請求只有唯讀限制投影，遠端庫存與 label 不整包輸入。34個遠端限制保留32個、omitted=2、complete=false，與當地資料合計不超64KiB。未知版本／錯誤coverage／空subject均502並回復來源與實物，而非保存缺貨敘述。

本票＋#206＋替代食物回歸39/39通過；主持投影最後修改後，跨區域／格式兩案另重驗2/2，並執行原 #208 discovery API 回歸13/13。最後來源／scope矩陣再驗7/7通過。有限來源先用完後，另有既存合法普通背景的下一輪仍可使用它，有限來源保持0；沒有把 historical finiteSourceBindings 變成對既存獨立來源的整體禁令。Typecheck、變更檔 ESLint、diffcheck通過。此修正沿既有資料與畫面，不新增UI；先前UI證據不冒稱包含新finiteScope矩陣。固定回覆仍只證明程式流程，真實自主性另由 #211判定。
