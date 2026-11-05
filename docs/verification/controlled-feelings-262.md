# #262 接管期間的新活動與新經歷感受

範圍為 [工作票 #262](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/262)，承接 #258–#261 的來源、實際活動時間與付款契約。#260 原生阻擋關閉後才開始。本票沒有正式心理點數／骰法預設，不使用付費真實模型，不關閉 #255；#256 仍暫緩，#263 仍待其餘依賴。

## 派送與控制權

`advanceActivities` 在原 actor 行動處理之後，集中處理本輪受控角色的必要感受評估。受控身份由開始本輪時的 `control.pending / active / mode=taken-over` 保存，早於 journey completion 清除 active，因此指定活動、接管續做、待命、旅途中／本輪抵達的本人新經歷都能承接。判斷不使用職業、顯示名稱或角色 id；外部 direct/takeover/return-control API 仍沿既有 preset owner 權限，自訂城市沒有新增控制入口。

必要派送由真正新執行的指定活動、尚未評估的實際 plan 身份，或本次本人可知的有效新來源觸發。瞬間完成的玩家行動也有一次有界評估機會；它不自動成為新的自然補電來源，也不能替已結束活動設定未來過程感受。拒絕／未實際開始的指定提案不假裝已開始活動。純時間續做、slot 抽樣與已處理來源不派模型。

原玩家行動先在同一候選世界執行，評估只回傳自然感受與過程感受；不替換 action、不變更追求、控制權或記憶，不產生自主選擇／習慣學習證據，不呼叫 `applyEmotionRegulation`。新過程感受在本輪決策邊界 `world.minute` 向後生效；已發生區段仍沿 #260 原感受、既有 slot 與持續 seed stream 結算。

這個 post-pass 仍在世界共同保存前。其他 actor 先失敗便不另派感受模型；任一感受候選、預算、deadline、lease、CAS 或保存失敗，都回復整輪玩家結果、心理效果與已處理標記，不留下半套世界。原 operationId 回放不重新派送；已知／未知模型用量沿原保留政策記帳。

## 模型契約與資訊邊界

輸入 `contractVersion=controlled-feelings.v1` 使用本人既有安全 projection、記憶容量與最終 provider bytes 收斂。`controlledActivity` 只描述本輪真正執行的玩家行動；精神電量僅有定性感受及足額感受，既有活動只提供可知行動／進度與主觀過程評價。沒有精確 value、測試 policy、draw、randomState、內部處理收據、觀察者實錄或其他角色的隱藏心理。

嚴格回覆僅有三個必填欄位，schema 與 parser 同時拒絕額外欄位：

```json
{"contractVersion":"controlled-feelings.v1","feelingUpdates":[],"processFeeling":null}
```

`feelingUpdates` 沿 #258 有界來源／方向／等級／理由／自然 mood；`processFeeling` 沿 #260 為 null 或方向／等級／理由。兩者共用四項及 8 KiB 上限。不開 recall，不接受 action、emotionRegulation、pursuitUpdates、habitCandidates、memoryOperations 或回想要求。沒有實際進行中的 plan 時，processFeeling 必須為 null。來源 schema 和後端驗證只採最終實際 request 的可見來源，不能猜保存庫中被省略的根。

每次評估成功且世界共同提交後，把本次實際展示的 roots 和活動機會記到 `mentalEnergy.controlAssessments`。即使選擇沒有變化／只評價部分來源，也視為已評估；之後正常模型投影與後端同樣不能再領取該根，交還控制不補算。被省略的來源不標已處理。來源沿 #258 七世界日窗口，最多 256 有效來源／活動處理記錄；只淘汰過期項，仍被 active/paused plan 引用的活動身份受到保護，容量滿 fail closed。新來源不受最大序號 cursor 誤略。

內部 metadata 放在精神電量狀態而非直接投影的 `OwnerControl`。評估輸入另外明示 allowlist `self.control={mode,active}`，不把新增內部欄位順帶送給角色。

## 用量與觀察

新派送用途是 `task=feelings`，畫面顯示「接管感受評估」。它和 NPC 決策／世界裁定共用原玩家 calls/tokens 預算，但 cost cohort、私有 decision trace、operation evidence 及回復用量仍各自保留用途。舊 evidence 的 counts 無 feelings 欄位仍可讀；新發生時才增加。public operation evidence 只保留契約版本等安全候選資訊，私有 trace 保留真正 request／response。正常 trace actor snapshot 也包含觀察者心理權威狀態，與模型輸入隔離。

派送沿原 beforeDecision 的租約檢查、chat reservation、key 讀取及共用 modelSignal/workDeadline。增加嘗試與 unknown counters 後才呼叫共用 `requestModel`；已報 usage 用同一 captured ledger 結算，沒有新 round clock、保存資料表或獨立 commit。

## 驗證證據

明示 `controlled-feelings-262` API fixture 使用 initial 5、maximum 20、自然耗電 0、regulationCost 4、experience 0/2/5、process seed 7／15 分鐘格／0/4/8／倍率 1。全部都是隔離 local/test 參數，不是產品數值。

TDD 與相關紀錄位於 `/tmp/quiet-hours-255-context`：

- `262-red-1.log` → `262-green-1.log`：實際指定 rest 後一次評估，純續做只按已發生時間累積。
- `262-red-instant.log` → `262-green-instant.log`：瞬間指定行動也有必要評估機會，但不發明補電來源。
- `262-red-handoff-arrival.log` → `262-green-handoff-arrival.log`：無變化來源交還後不能重領，以及單次旅程本輪抵達清 active 仍承接新經歷。
- `262-all-own.log`：本票 **28/28** 通過。涵蓋 pending、active、waiting、traveling、顯示名／職業改變、純續做零呼叫、正負過程向後修正、自然來源／處理去重、handoff／reload／ID replay、七種越權欄位、無 active process、calls/tokens 預算、transport unknown、provider refusal、非法候選、後續 evaluator 失敗、保存前／CAS／uncertain commit、timeout late response、lease expiry 的用途回復、容量與過期，以及最終投影來源省略不誤標已處理。

```sh
NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tests/controlled-feelings-api.test.cjs tests/mental-energy-api.test.cjs tests/mental-experiences-api.test.cjs tests/mental-process-api.test.cjs tests/emotion-regulation-api.test.cjs tests/mental-results-api.test.cjs tests/takeover-api.test.cjs tests/owner-control-api.test.cjs tests/operation-evidence-api.test.cjs tests/costs-api.test.cjs tests/npc-input-equivalence.test.cjs
pnpm typecheck
pnpm lint
git diff --check
```

`262-regression-final.log` 為 **125/125** 通過，0 fail／skip。typecheck 通過；lint 0 errors、4 個既有 warnings；diff check 通過。舊 #258 手機 fixture 明示在新的 controlled boundary 評估實際讀取，#261 fixture 明示此入口無變化並計入新增一次 feelings 用量，沒有把普通決策假裝成 feelings 回覆。整份 suite/build 由 integration 最後執行。

## 既有畫面與應用流程

Root 已執行並目視既有 WorldApp 的 [精神電量面板](assets/controlled-feelings-262/controlled-energy-panel.png) 與 [用量面板](assets/controlled-feelings-262/controlled-usage-panel.png)，實際 request／狀態／用量見 [證據 JSON](assets/controlled-feelings-262/evidence.json)。

Runner：`tooling/verification/browser-controlled-feelings.mjs`。先自主 5→合法新滿足 7→明示調節付 4 留 3，再從 UI 接管並指定 rest；初次評估不追補時間，純續做 3→4.5 不新增模型，取得另一份真實新經歷後按原過程 6＋獨立收入 2＝8。玩家 rest 一直保留，regulation 紀錄仍一筆，沒有新增自主習慣。原 ID 回放、重載與 SQLite 重讀維持結果，交還後正常選擇保留 8。總計 3 個受控普通 NPC calls＋2 個受控 feelings calls，150 input／50 output tokens，0 次真實付費模型。用量畫面明示兩種用途。

以上受控回覆只證明權限、來源、時間、提交與記帳契約；不冒充真實模型對心理語義或調節改善的品質驗收。#256 的數值與骰法仍未由本次決定。
