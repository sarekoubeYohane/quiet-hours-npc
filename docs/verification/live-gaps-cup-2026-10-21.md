# PR #143 缺口：新驗收場景杯子能力

日期：2026-10-21（台北）。基準 `5e172d5`；對照 #104、#106、#123、#128 及 PR #131／#143。這是本機模型 transport fixture，不是新一輪正式模型驗收，沒有呼叫付費模型或修改正式世界。

## 最小重現與診斷

新增 `tests/live-acceptance-cup-api.test.cjs`，從真實 `POST enter-acceptance` 建立場景，走真實世界 API 及 SQLite 保存／GET 重讀。模型 transport 使用既有 `routine-program-fixture.cjs` 的 v2 核准：泡茶 30 分鐘兩個階段，喝茶與洗杯各 15 分鐘；其他 NPC 回覆休息 90 分鐘。模型回覆是明示 fixture，沒有改寫世界執行或持久化。

先執行：

```sh
node tests/run-activities.mjs tests/live-acceptance-cup-api.test.cjs
```

基準結果：第一項測試在喝茶時 **0/1 通過**，`502 !== 200`，錯誤為「物件不支援這個狀態轉換。」已完成的泡茶可保存，原杯有茶；失敗恰好發生於後續 drink 程序寫入 `contents=dirty`。

在 probe 前列出的假說及結果：

| 順序 | 可否證預測 | 結果 |
| --- | --- | --- |
| 1 | 若新場景種子缺少 dirty 是直接原因，只新增該場景能力即可讓相同 API 流程通過 | 成立；僅改 seed 一處，原測試 1/1 green |
| 2 | 若程序重綁完全沒有能力驗證，舊杯可能先消耗飲品才失敗或保存半套結果 | 排除；`bindRoutineProgram` 已在世界副本上使用既有 `commitActivityPhase` 預驗全部階段，原子失敗回復由既有 API 負責 |
| 3 | 若綁錯杯子或版本才是原因，只新增 dirty 仍會失敗 | 排除；杯子 ID、飲品 vessel、revision 連續，未修改綁定或版本計算即可通過 |

## 修改理由與界線

`lib/acceptance-scene.ts` 的新驗收杯 `contents` 原本只有 `empty／water／tea`，與 #123、#128 已有喝→洗→重用契約及 drink 程序不相容。只在**新進入的驗收場景**加入 `dirty`，保持所有權、持有、使用權及 clean 能力不變。

沒有修改全域效果驗證器、程序、保存格式或舊世界。既有杯子不自動加能力；既有日常規則保存整組程序也不保證每件物件能執行每一項程序，執行時仍須依該物件能力重綁並驗證。保留舊不相容程序的原子拒絕與既有 502 分類，不另將契約失敗改成自動成功或改寫程序。

舊正式驗收場景仍不能拿缺 dirty 的杯子驗喝→洗。部署後先保存舊證據，再透過正常退出／重新進入建立新場景；不得直接修正式物件，也不得追補舊候選。此為已確認場景契約的修正，不引入新產品決策，因此不新增 ADR 或重開已存在的工作票。

## 驗證結果

新增兩個 API 回歸：

- 新場景：原長句／茶具 target 首次核准 → water → tea → drink 消耗原飲品且杯變 dirty → wash 同杯 empty → 再泡茶同杯 tea。僅一只杯、兩份歷史飲品、其中一份仍 active；保存重讀及原 ID 重送沒有重複成果。6 回合共 **7 次 NPC、1 次裁定**；已知規則重用只免裁定，不把 NPC 決策稱為免費。
- 舊能力 fixture：分別使用 v1、v2 規則，保留 `empty／water／tea` 能力。喝茶原子拒絕，時間、回合、物件、供應、規則不變，飲品仍 active；新增一次 NPC 的已知用量保留，沒有新裁定。同 ID 重送保持同一失敗及世界，沒有重複派送或補能力。

相關回歸命令：

```sh
node tests/run-activities.mjs tests/live-acceptance-cup-api.test.cjs tests/acceptance-scene-api.test.cjs tests/routine-program-api.test.cjs tests/routine-objects-api.test.cjs
```

結果：**31/31 通過，0 fail／skip**。包含既有真正授權、攜帶／歸還、餐點取得消耗、跨回合中斷、工具前提變更、時間上限、保存失敗及冪等回放。

真實應用 UI 的整合驗證與整合分支完整回歸另見本輪綜合報告；本紀錄不以 API fixture 替代正式站或瀏覽器驗收，也不關閉 #104、#106。
