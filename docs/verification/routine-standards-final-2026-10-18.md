# Standards 最終複審（2026-10-18）

審查目標 `e21badf817685d9f026bff374944f2e144b98c92`，原固定點 `cab08092ac5204d997742ae7210225d59dad8018`；本次詳查 `9edcd27...e21badf` 修正差異及 `docs/verification/routine-review-fixes-2026-10-18.md`，沿用初審已讀標準。本報告只審 Standards，不評 Spec；未讀取另一軸報告，未修改整合分支。

**硬性標準違反：0。未解決判斷性發現：0。**

初審的 Possible Duplicated Code 已解決。實際共用檔案是 `lib/routine-materials.ts`（不是 routine-resources.ts）：`rawRoutineMaterial`／`routineIngredient` 統一原材料分類，`supportsRoutineDrink` 統一器具轉換支援，`usableRoutineObject` 統一生命週期、損壞、持有及使用權檢查。`routine-rules.ts` 的 localRight／localComplete／bindRoutine／knownRoutineMethods 與 `routine-obstacles.ts` 均改用對應 predicate，且保留呼叫端的當地、知情、有限庫存與 pending 條件，沒有用抽象層隱藏差異。

新增測試仍從世界 API GET／POST 驗證可觀察結果；fixtures 明示修改權威場景，外部模型 transport 透過 fetch 替身，沒有新增私有函式測試或內部 collaborator mock。物件批次一致性檢查落在既有權威效果執行邊界，沒有隱含 transfer 或他人同意。NPC 方法 projection 仍依知情過濾，未加入 observer 稽核資料。

`tests/d20-api.test.cjs` 只新增與其他 CJS suite 一致的 no-require-imports directive，沒有移除測試或改變 D20 行為。工具結果引用整合驗證紀錄：303 個 API 測試、Workers/D1 1 個測試、typecheck 及 lint 已通過；lint 為 0 errors／4 項既有 warnings。本審查未另行重跑測試。

總計：硬性違反 0；未解決 heuristic 0；初審 1 項維護性發現已修正。

複審補記：已讀 `e21badf...4dcabb6390de08788d64bb47016fdcb158f0f8f6`；只有 browser112 fixture 與相應驗證文件變動。替身從真實裁定輸入取得杯子及 linked 成品的身份／revision／region，分別明示 transfer，並從 API 結果確認兩者留在咖啡館；新增 13 calls／520 tokens 斷言。這符合外部模型邊界替身及公開 API seam，未放寬 runtime 或加入內部 mock。沒有新增標準違反或未解決 heuristic；最終目標更新為 `4dcabb6`。Chromium 通過由主代理實際驗證，本審查未重跑。
