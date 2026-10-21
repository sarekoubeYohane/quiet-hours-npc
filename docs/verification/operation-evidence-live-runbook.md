# 合併部署後：PR #124 指定場景的正式站驗收

本流程由使用者合併、部署本輪證據修正後執行。本輪開發不部署、不合併、不呼叫正式付費模型。#132 的舊回合證據缺口無法追補；以下取得的是新操作的證據。

## 起點與一次有界操作

1. 開啟正式站 <https://quiet-hours-npc.houmengkou.workers.dev>，核對 UI 版本及 `/api/environment` 的 commit／builtAt 確實包含本次 PR。記錄 NPC 與裁定服務／模型，沿用玩家預算及已保存 Key；不讀取、匯出或更動 Key。
2. 暫停自動推進。沿既有「最小驗收場景」入口使用新的隔離場景，正常保存原世界。若仍停在 #132 已有規則的場景，先保存其報告，再正常結束並重新進入；不得把已有核准當首次核准。確認 turn 0、杯子空、無 routineRules，記錄茶具／杯 ID 與能力，不直接改資料庫。
3. 觀察頁只對店主加入正常介入：「若你現在想喝茶，可以用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。先只泡茶，喝茶與清洗之後再決定；是否要做由你自行決定。」這是觀察者請求，不能充當 NPC 原提案。
4. 按「下一回合」一次（15 分鐘），等候原操作定案。若未完成則使用既有「重試未完成操作」，不按新的回合冒充重送。出現候選或保存錯誤時先保留證據並停止新增付費操作。
5. 在分析頁「操作驗收證據」讀取該 advance，記錄 operationId、原 API requestId、部署及 resultVersion。以 `GET /api/world?operationId=<原 ID>` 重讀同一證據。若舊版無證據、已淘汰、截短或遮蔽阻礙判定，明記缺口，不推測通過。

## 必須逐項比對

| 證據 | 判定條件 |
| --- | --- |
| NPC 實際候選 | `type=propose`，原文「我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。」（可標明句尾標點差異），`target=acceptance-tea-kit`；一般估時及 timeIntent／maxMinutes 原值均可讀 |
| 裁定原始候選 | accepted、completionMinutes=null、effects=[]、stages=[]、check=null；routine.timings 恰有 tea／coffee／food／drink／wash／return 六項合法原始分鐘數 |
| 保存規則 | 六項以 15 分鐘向上對齊；逐項比較原值，不能由保存值倒推原值 |
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

## 能力允許時再驗生命周期及免費規則重用

先讀實際杯子 stateTransitions。原 `daily-life-v1` 杯的 contents 只有 empty／water／tea；目前飲用流程要求 dirty，故原杯不具備整條喝→洗→重用的驗收能力。此時記「場景準備不足，未執行」，不補 dirty、不改正式物件，也不將此限制當成此次證據修正失敗。

僅在現有世界已合法存在可飲用／清洗的杯子時，以正常介入讓 NPC 自主喝茶→洗杯→再泡茶。逐步核對原飲品被消耗、同杯變髒／洗淨／再裝茶、同一 ID 不變及沒有重複成果。新泡茶的已知普通表述「泡一杯茶」可驗免費規則重用；仍保留茶具 target。這與首次原長句核准是兩個獨立條件，重複自由長句可能仍按既有辨識路徑裁定，不混稱免費。

免費僅指符合已知規則時**不新增裁定派送**，NPC 正常決策仍可能付費。以每次 evidence 的實際 NPC／裁定 counts 驗證，不能用 HTTP 成功或 UI 文案代替。

## 報告結論

按「正式站真實模型通過／正式站未驗證／本機 fixture 通過／場景準備不足／具體 runtime 失敗」分列。任何失敗附原操作與 request、部署、精簡候選、已知 usage 及保存／回滾結果；沒有取得原始欄位就保持未驗證。不要關閉 #104、#106。
