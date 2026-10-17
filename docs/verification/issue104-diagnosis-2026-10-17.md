# Issue #104 本機診斷

此為修正前的歷史診斷。以下探針結果以原始 `6ba5b7e` 為基準；臨時探針已由 `tests/adjudication-failure-api.test.cjs` 的正式 API 回歸測試取代。修正與最新驗證見同目錄 `issue104-fix-2026-10-17.md`。

日期：2026-10-17（Asia/Taipei）。基準：`6ba5b7ed40f90247b75981b5b06d3f586c476d75`，核對 GitHub 最新 main，與 Issue 所述正式站版本一致。

## 結論與證據界線

問題位於裁定模型候選與世界效果執行契約的交界。模型回傳的 accepted 候選未通過語義驗證，例外上傳至世界 API，使該回合回復並回傳 502；已發生的用量另行保存。

已確認模型可見契約不足：`lib/adjudication.ts` 只提供兩項通用 rules 與通用 system prompt；`authorityForProposal` 補入物件、供應及 JSON Schema。派送內容沒有說明：

- `materialize` 產生 `${supply.id}:${supply.remaining}`，初始 revision=1，持有人為執行角色；供應 ID 本身不是實體物件 ID。
- 效果依陣列順序執行。state/transfer/consume/destroy 每次使 revision 加一；後續同物件效果及階段需要引用前一步產生的版本。
- consume 僅可用於 food 且必須由當前角色持有；杯中液體不能藉 consume 杯子表示。
- 需要同意的提案應由模型產生適當否決，而不是先標 accepted 再附越權效果。

JSON Schema 對欄位和型別的限制不能表達以上跨效果及世界狀態規則。這是確實存在的契約缺口，但不能據此宣稱已找出兩筆正式候選的確切錯誤。

Issue、其空留言串及工作區原始實測紀錄均沒有當時模型回覆。回應與既有 world_api 日誌也沒有失敗 actor/effect/object/expected-vs-actual；原始回覆未保存於世界操作結果。**本次沒有取得正式站原始候選，以下全為明示人工候選，不是真實模型重播。**

## 已執行驗證

既有 API 測試：

```sh
NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tests/free-actions-api.test.cjs tests/acceptance-scene-api.test.cjs
```

結果：35 tests / 35 pass / 0 fail。

新增受控診斷：

```sh
NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tooling/verification/debug/issue104-diagnostic.test.cjs
```

結果：9 tests / 9 pass / 0 fail。使用實際世界 API、驗收場景、模型解析器及 SQLite 儲存 fixture，替換模型傳輸；外部網路預載封鎖。這些測試確認既有行為，**不是已修復的回歸測試**。

| 受控候選／前提 | API 結果 |
| --- | --- |
| 店主 consume 自己可用、無人持有的杯子 | 502：不能食用這件物品。 |
| Cass consume 供應 ID `acceptance-meal` | 502：裁定物件前提無效。 |
| materialize 後仍以供應 ID consume | 同上，先前具體化也回滾 |
| materialize → consume 正確新 ID `acceptance-meal:1` / revision=1 | 200；同回合取得及消耗，供應歸零 |
| Cass consume 桌上、尚未拿取的合法食物 | 502：不能食用這件物品。 |
| transfer 拿取 revision=1 → consume 仍填 revision=1 | 502：裁定物件前提無效。 |
| 上例只改 consume expectedRevision=2 | 200；同一食物 consumed，revision=3 |
| 按第一回合報告建立 Cass 持有、food、revision=1 的餐點，正確 consume | 200；不能據原錯誤認定這份合法餐點吃不了 |
| Vera 未獲准拿杯 | 502：裁定物件前提無效。 |
| 只補入 allowedTo 中的 Vera，再執行相同拿杯候選 | 200；owner 保留店主，holder 為 Vera；這是權限差分 fixture，不是假裝完成真實同意對話 |

所有拒絕案例均比對時間、回合、角色、事件、供應、物件不變，並驗證保留兩次已付呼叫／已回報用量。同 operationId 重送返回相同失敗結果，總派送及用量均未增加。

另執行診斷缺口探針：

```sh
ISSUE104_REQUIRE_DIAGNOSTIC=1 NODE_OPTIONS='--import=./tooling/verification/no-network.mjs' node tests/run-activities.mjs tooling/verification/debug/issue104-diagnostic.test.cjs
```

前兩項測試在確認相同錯誤、回滾、用量及重送後，要求 actor/effect 診斷的斷言失敗：`502 response has no actor/effect/object/precondition diagnostic`。這只是診斷介面缺失的 Red，不冒充已取得正式站根因。未修改 runtime 將其轉 Green。

## 為何已有測試全過仍會正式站失敗

原測試由測試作者填寫正確的新物件 ID、遞增版本號及合法權限，沒有驗證裁定模型能否從實際派送內容得知這些規則。原測試也明確接受無效候選回傳 502。因此既有綠燈證明預設候選可執行及非法效果被拒絕，不能證明真實模型的候選可靠。

## 建議修正順序

1. 在 parse/validate/apply 的故障邊界保留有界、遮蔽後的診斷：operation/request/actor、NPC 提案、裁定候選、階段／效果索引、物件 ID、expected/actual revision、種類、位置、持有及授權檢查結果。不得保存 Key／授權標頭，不把原世界備份或完整私人記憶混入。診斷要在回滾後仍可追溯，不能寫成角色感知。
2. 補全模型可見的效果語義與組合例子，讓模型取得可引用的生成物件 ID，明確順序版本及 consume 前提。保留執行器全部種類、權限、持有及同意限制。
3. 明確區分模型正常 denied/unsupported、候選契約違反及服務／保存故障。現有 accepted 非法候選是契約失敗，不能一律吞錯當成 NPC 合法否決，也不能部分提交其餘角色來通過驗收。
4. 根據真正捕獲的失敗候選加入世界 API 回歸測試；部署後再進行有界真實模型複測，遇故障停下取證。沒有批准增加付費修復呼叫或無限重試。

最初排查時未修改執行器、未發出真實模型請求、未操作正式站或部署。後續使用者已授權修正；修正紀錄另外記載，不把本文件的歷史結果當成修正後正式站驗收。
