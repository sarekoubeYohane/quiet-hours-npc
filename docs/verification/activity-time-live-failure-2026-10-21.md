# NPC觀察室正式站真實模型驗收：2026-10-21

結果：未通過。首回合發生候選契約錯誤，停止新增付費呼叫，保留獨立驗收世界與診斷；原世界仍暫存。

## 基準

- 正式站：https://quiet-hours-npc.houmengkou.workers.dev
- 實際 UI 版本 a9cfe6e，建置時間 2026-10-21 14:30 台北。PR #120 已合併。
- NPC：OpenAI gpt-6-luna；天上意志：OpenAI gpt-6.1-sol。Key 狀態已設定，未讀取或匯出 Key。
- 獨立最小驗收場景，新世界 D1 12:00、第0回合；用量起點本小時0次。
- 先前工程驗證390/390與瀏覽器場景使用明示模型替身，不能算正式站真實模型通過。

## 重現操作與結果

1. 設定→決策方式 OpenAI 直連；進入最小驗收場景，原世界暫存。
2. 只對店主加入事件：「今晚若方便，想請你先替自己泡一杯普通的茶。先只泡茶，喝茶和清洗可以之後再決定。你可以按自己的想法決定。」
3. 按下一回合一次，等候回覆；沒有重複推進或重試。
4. 顯示「裁定候選不合法：日常耗時須由整組規則確認。」角色owner，候選格式階段，reason=candidate_format。
5. 整回合回復：D1 12:00，第0回合；餐點仍1份，杯子空且乾淨、版本1；沒有保存活動或日常規則。
6. 重新載入確認失敗診斷、用量、驗收世界仍在；沒有新模型派送。重載後決策模式顯示規則試玩，未重新切換或推進。

## 失敗的具體動作

失敗角色為店主（owner）。NPC 實際提出：「我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶。」目標為 acceptance-tea-kit。天上意志回覆 accepted，但程式在候選格式驗證時拒絕，因此尚未開始活動，也不是泡茶進行到一半失敗。

## 實際候選

```json
{"completionMinutes":5,"stages":[],"status":"accepted","effects":[],"check":null,"routine":{"family":"cafe-service","version":1,"operation":"tea","subject":"茶","timings":[{"operation":"tea","minutes":5},{"operation":"coffee","minutes":6},{"operation":"food","minutes":10},{"operation":"drink","minutes":8},{"operation":"wash","minutes":3},{"operation":"return","minutes":1}]}}
```

NPC 一般估時15，timeIntent為completion、maxMinutes=null。天上意志已提供六項時間；同時提供頂層completionMinutes=5而遭拒。觀察者診斷中的通用effectRules要求有完成目標且accepted時提供completionMinutes；日常規則另要求整組timings。這是疑似提示／候選驗證契約不一致，尚未對照原始碼確認根因，不能稱已修復。

操作：1792565037375:cb66b4d9-223e-44b0-a013-1ffa4645f746

請求：6c7b920e-7cad-48ff-bb1f-5db8a179073a

診斷標記達長度上限，輸入末段截短；候選本身可見。

## 用量

本輪8次AI呼叫，輸入44,461、輸出1,518，合計45,979 tokens。UI部分估算USD0.00198727，4次價格或用量資訊不完整，不能當總費用。尚未取得逐請求NPC／裁定分類，不能把8次全算裁定。

## 驗收矩陣

| 項目 | 結果 |
|---|---|
| 新版部署、登入、Key狀態 | 通過 |
| 獨立場景進入與原世界暫存 | 通過 |
| 首次日常核准→開始活動 | 失敗：候選格式 |
| 正常完成、另一活動重用、規則重載重用 | 未到達 |
| 明確上限不足及自主重新安排 | 未到達 |
| 開放式到期、長活動續做／中斷、物件移走 | 未到達 |
| 技術失敗回滾、保留用量、重載診斷 | 通過本次可見UI檢查 |
| 食物消耗與借杯→攜帶→洗淨→歸還 | 未到達 |

現場維持暫停。沒有修改 runtime、部署、重置原世界或建立 GitHub Issue。本文件依使用者要求上傳 repository；與同輪擷取的 UI 文字證據對應。
