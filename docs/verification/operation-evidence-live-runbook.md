# 合併部署後：最小日常驗收剩餘缺口

本流程由使用者合併、部署本輪修正後，另行授權正式模型驗收時執行。本輪開發不部署、不合併、不呼叫正式付費模型。#132、#143 的舊回合缺失欄位不能追補；以下取得的是新操作的證據。

#143 在 production `3b352cb` 已證明 Cass 餐點取得／食用、店主原長句及茶具 target 首次 v2 核准、原杯及飲品保存、UI/API 重讀與同 ID 重送。該結論保持；本流程補杯子生命週期與新版有界證據，不把上述功能重新列為未實作。

## 本次執行上限與停止條件

- 自動運行全程暫停；沿用玩家已設預算，不提高上限。先記錄用量起點。
- 一次驗收最多 **12 個新 advance、20 分鐘實際經過時間或既有預算耗盡**，先到者停止。正常介入、唯讀 GET、原 ID 重送不算新 advance，但都在時間上限內。
- 任何技術／候選契約／保存錯誤，或結果 pending／uncertain，立即停止新增付費操作；僅沿原 ID 查詢／恢復，保存當時證據。
- 連續兩回合在同一障礙且沒有新方法／條件／進展時，記錄實際提案、可知回饋與未驗證項並停止該路徑；這是成本停止條件，**不是「無限循環」的證明**。
- NPC 拒絕、選別的行動、未自然產生跨回合或某結果分支，都如實標為未到達。不改模型回覆、骰子、正式資料庫或角色權限來完成矩陣。


## 起點與一次有界操作

1. 開啟正式站 <https://quiet-hours-npc.houmengkou.workers.dev>，核對 UI 版本及 `/api/environment` 的 commit／builtAt 確實包含本次 PR。記錄 NPC 與裁定服務／模型，沿用玩家預算及已保存 Key；不讀取、匯出或更動 Key。
2. 暫停自動推進。沿既有「最小驗收場景」入口使用新的隔離場景，正常保存原世界。若仍停在 #132／#143 或更新前的場景，先保存其必要證據，再正常結束並重新進入；不得把已有核准當首次核准。確認 turn 0、杯子空、無 routineRules，記錄茶具／杯 ID 與能力。新版新場景的 contents 應包含 empty／water／tea／dirty；若缺 dirty，先停止並核對版本／場景來源，不直接改資料庫或替舊杯補能力。
3. 觀察頁只對店主加入正常介入：「若你現在想喝茶，可以用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。先只泡茶，喝茶與清洗之後再決定；是否要做由你自行決定。」這是觀察者請求，不能充當 NPC 原提案。
4. 按「下一回合」一次（15 分鐘），等候原操作定案。若未完成則使用既有「重試未完成操作」，不按新的回合冒充重送。出現候選或保存錯誤時先保留證據並停止新增付費操作。
5. 在分析頁「操作驗收證據」讀取該 advance，記錄 operationId、原 API requestId、部署及 resultVersion。以 `GET /api/world?operationId=<原 ID>` 重讀同一證據。若舊版無證據、已淘汰、截短或遮蔽阻礙判定，明記缺口，不推測通過。

## 必須逐項比對

| 證據 | 判定條件 |
| --- | --- |
| NPC 實際候選 | `type=propose`，原文「我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。」（可標明句尾標點差異），`target=acceptance-tea-kit`；一般估時及 timeIntent／maxMinutes 原值均可讀 |
| 裁定原始候選 | accepted、completionMinutes=null、effects=[]、stages=[]、check=null；routine.timings 恰有 tea／coffee／food／drink／wash／return 六項合法原始分鐘數 |
| v2 原始程序 | routine.programs 六項的 operation、effects、stages、check、branches 可讀；各 stage 的 afterMinutes 與符號 role／效果保留，不能以保存規則倒推原候選 |
| 原始結果分支 | 一般及日常 branches 的 outcomes、effects、stages 與 check 可辨；明示 null／未提供與截短，不能把部分摘要視為完整候選 |
| 保存規則與進度 | 六項以 15 分鐘向上對齊；原值逐項比較。比對保存程序、活動 phaseCursor／階段與 selectedResult；活動已結束時，以原操作證據及實際效果判斷，不能只看 plan=null |
| 活動成果 | 杯子 contents=tea；獨立飲品存在且 vessel 指向該杯；角色 plan 完成，非僅 HTTP 200 或口頭描述 |
| 身份與狀態 | 杯 ID、revision、holder、owner、region 與飲品 ID 在 API、證據及 UI 一致；原杯應優先沿用 |
| 真實派送 | 每筆 NPC／裁定的 requestId、actor、provider/model 與 usage；依 counts 及已知 usage 彙總；未知用量不能寫成零 |

NPC 有自主性。如果它改用杯子 target、改說另一句、選別的行動或拒絕，記錄實際發生的場景及「原長句／茶具 target 未驗證」；不改 target、不注入回覆、不將介入文案冒充 NPC 輸出，也不無界重試到想要的結果。

若裁定合法完成時間跨多回合，先保留首次核准證據，再使用正常回合讓實際活動推進至完成；每次記錄新 operationId，追蹤同一杯／活動與有界停止條件。新回合是正常推進，與原 ID 重送分開。後續回合將耗用的 NPC 派送照實記錄，不能預設免費。

## UI／API 重讀與同操作重送

完成後重載 UI，再 GET 最新世界和指定原 operationId；證據、規則、杯子、飲品及活動結果須一致，累計模型呼叫和已知用量不增加。分析頁「重送同一操作（不新增回合）」會使用原 advance 的安全資料與原 ID，走既有 POST。重送後再 GET 最新世界，不用 POST 歷史快照判斷目前世界。

也可在已登入的同源頁面 DevTools 執行以下普通 API 操作。把 ID 換成分析頁顯示的原 advance ID；不需要 Key 或複製 Cookie。此腳本不建立新 ID，且在讀不到 settled 證據時停止。

```js
const operationId = '貼上原 advance operationId';
const read = async () => {
  const r = await fetch('/api/world?operationId=' + encodeURIComponent(operationId), {cache:'no-store'});
  if (!r.ok) throw Error('讀取失敗 ' + r.status);
  return r.json();
};
const before = await read();
const evidence = before.operation?.evidence;
if (before.operation?.state !== 'settled' || !evidence?.replay || evidence.operationId !== operationId)
  throw Error('缺少已定案的原操作資料，停止重送');
const replay = await fetch('/api/world', {
  method:'POST', headers:{'Content-Type':'application/json'},
  body:JSON.stringify({...evidence.replay, operationScope:before.operationScope})
});
const reply = await replay.json();
if (!reply.operationSettled) throw Error('原操作結果仍未確認，停止');
const after = await read();
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
console.table({
  status: replay.status === before.operation.status,
  evidence: equal(evidence, after.operation?.evidence),
  version: before.version === after.version,
  objects: equal(before.world.objects, after.world.objects),
  rules: equal(before.world.routineRules, after.world.routineRules),
  events: equal(before.world.events, after.world.events),
  calls: before.world.aiUsage.totalCalls === after.world.aiUsage.totalCalls,
  input: before.world.aiUsage.totalInputTokens === after.world.aiUsage.totalInputTokens,
  output: before.world.aiUsage.totalOutputTokens === after.world.aiUsage.totalOutputTokens
});
console.log('原執行', evidence.requestId, '重送 HTTP', replay.headers.get('X-World-Request-Id'));
```

只匯出經篩選的 operation evidence 和必要物件／規則差分；不匯出整份 GET 世界、operationScope、完整 HAR、Cookie、認證 header 或原世界備份。證據會隨有界 journal 淘汰，應在繼續其他操作前保存必要報告。

## 新場景：喝茶、清洗、同杯重用

先完成上述首次核准並記錄杯子、飲品 ID，再分次用正常介入請 NPC 自主考慮喝茶、清洗及再次泡茶。每次新回合都在總上限內，取得新的 operationId；原操作重送只用該操作的原 ID。

| 步驟 | 必須保存重讀的事實 |
| --- | --- |
| 喝茶 | 原飲品 lifecycle=consumed；原杯 contents=dirty；沒有另一份憑空消耗或複製飲品 |
| 洗杯 | 原杯 contents=empty、clean=yes，ID／owner 不變；舊飲品仍已消耗 |
| 再次泡茶 | 用同一杯子，產生新的飲品 ID；只有一份 active 茶飲，原飲品不復活 |
| 免費規則重用 | 已知普通表述（例如「泡一杯茶」）符合保存規則時，該次 evidence counts.adjudication=0；NPC 決策次數及用量另計 |
| 重載與重送 | 每一步以 GET 與 UI 重載核對；原 ID 重送後版本、證據、物件、規則、事件與用量不變 |

指定同杯時尊重 NPC 實際提案 target。若它自行改用別杯，記為已發生的另一情境，不能稱同杯驗收。原長句首次核准與後續已知普通表述免費重用是不同條件；不預設任意長句均命中規則。

既有場景不會自動遷移，新程式不補舊杯 dirty。舊杯能力不支援某程序時，既有效果驗證仍拒絕該候選，不提交半套飲用／消耗；舊物件的安全拒絕是本機回歸，不能冒稱正式站完整生命周期已通過。

## 借還、跨回合與結果分支

以下是獨立判定項，不要求同一 NPC 在固定回合內選完：

- **自主授權／借杯：** 正常請求後，只有店主自主提案所形成的 grant 效果才算授權；「可以借」台詞不算。核對 allowedTo，再看借用角色持有同杯、移動時杯子跟隨、洗淨並歸還。owner 保持店主，holder 與位置按實際行動更新。
- **跨回合／續做：** 若首次確認時間大於 15 分鐘，記錄開始、until、phaseCursor、階段及 selectedResult。正常介入後 NPC 選 continue 時保留原時間及分支，純階段推進不新增裁定或重擲。
- **中斷／前提改變：** 透過既有接管、角色自主換事或自然發生的物件改變觀察。保留已提交的材料消耗／中間成果，未來階段停止。不可直接改正式世界來製造失效。
- **失敗／部分成果：** 只在真實裁定自然提供合法 check／branches 並實際選到該結果時判定。比較原候選、保存的 selectedResult 及世界效果；失敗消耗與部分成果不能套用成功分支。沒走到的級別仍未驗證；不操控正式骰子或追加無界回合蒐集五段。
- **失敗回饋：** 保存 Vera／Kris 的實際提案及世界回饋。區分 unsupported、權限不足、供應耗盡與重試條件，檢視角色可知回饋是否持續存在；不把觀察者操作證據送進角色上下文。
- **保存故障：** 正式站不主動注入故障。若自然發生，只查原 ID 定案與用量，不新建 ID 重做；本機保存前／後故障證據需另列 fixture。

上述矩陣未在上限內完成時，列出具體已達階段及缺口，停止新增付費呼叫，保持自動暫停。結束前保存經篩選證據，依使用者當次安排選擇留在獨立場景或正常返回原世界。

## 報告結論

按「正式站真實模型通過／正式站未驗證／本機 fixture 通過／場景準備不足／具體 runtime 失敗」分列。任何失敗附原操作與 request、部署、精簡候選、已知 usage 及保存／回滾結果；沒有取得原始欄位就保持未驗證。不要關閉 #104、#106。
