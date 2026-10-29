# #222 同次候選發散與自主收斂驗證

這是受控模型 transport 的程式契約驗證，真實付費派送為 **0**。沒有操作正式世界、合併 main、部署，亦未執行 #229 的 L1–L5。候選數、合法拒絕或 fixture 成功不能證明真實 NPC 自主追求已改善。

產品先由 #221 整合 `7108d2c` 起步，#222 實作為 `4093f82`，再同步共享圖及回歸整合為 `b94707e`。契約與工程容量見[同次發散收斂](../design/pursuit-selection.md)。

## 程式及回歸

沿真正世界 GET／POST、活動與感知、效果、SQLite 保存重讀、下一次真正 provider request/messages 驗證。僅 auth／Worker runtime／SQLite D1 adapter 與模型 transport、必要時間邊界為測試配置；意外外網由原 no-network preload 封鎖。沒有把追求 helper 當驗收介面。

```powershell
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/pursuits-api.test.cjs tests/pursuit-selection-api.test.cjs
```

候選工程上限定稿為4，與原同次最多4項明示新增對齊；完整候選仍最多2KiB、收斂1KiB、共同心理8KiB，沒有提高模型輸出、派送、預算或期限。**#221 的24項與 #222 的25項合計49/49通過**，0失敗／略過／取消。第一條 API tracer 在舊 parser 實際回502為 red，實作後同次1呼叫列2候選、只承接1且修訂範圍，再由下一次真正請求繼續為 green。

| 驗收 | 本票實際證據 |
| --- | --- |
| C25 同次發散／收斂 | 候選集合、承接映射、焦點、正式增量、方法與 action 共用原一次派送；SQLite 只新增所承接節點，原候選／最終範圍在私有 trace 可對照 |
| C26 未選／既有延續 | 未選候選不進世界、經歷、安排、長期記憶或下一次真正輸入；空集合／空焦點、選既有、明示拒絕、等待和續做合法；純活動推進0新增派送 |
| C27 結構反例 | 缺候選／收斂、重複／外角色身份、未知映射、重複承接、既有／新焦點混淆、過期來源／版本、未承接焦點、同時承接與拒絕等16組反例；整輪回復且重送不派送／不付費修復 |
| C29 知情／成本 | 隱藏來源 A/B 的實際 messages 深度相等；4角色各4個短候選仍只有原4次 NPC 決策，實際 request 的 max_completion_tokens 仍2048，無候選評分／各層呼叫 |
| C17 候選局部容量 | 第5候選拒絕；候選 JSON精確2048可接受／2049拒絕，收斂精確1024可接受／1025拒絕；同次4候選形成4新追求仍合法，不截斷選項 |
| C16 來源局部 | 當次真正可見、先由世界 API 選留的長期記憶可作候選來源；未承接可能性不因引用記憶就變成新記憶。完整遺忘／回想／最大圖投影由 #227 整合 |
| C30 可觀察性 | 私有 `npc-pursuit-selection` 與原始真正回覆並存，正式世界不存候選庫；原候選／承接範圍、空集合、未通過驗證、未提交與未決策分開，沒有自動成果或滿足 |

T1 原生回覆 fixture 明示新增候選／承接及既有焦點版本；沒有在 transport 攔截器偷偷修復非法契約。T1 舊版本拒絕、較後角色失敗、保存故障、接管／交還、同 ID、舊世界與既有驗收場景回歸一併保留。全 repository 舊 fixture 遷移、完整最大圖／四角色壓力、兩軸 code review 由整合分支接續，不以本票局部49項冒稱全 repo 通過。

合併 T3 與當時回歸整合後，T2的25項再跑 **25/25** 通過，typecheck／變更ESLint／diffcheck亦通過。四角色代表實際input為3734–4520 bytes、完整request（含system/schema）50210–51363 bytes；每人4個短候選635–639 bytes、收斂116–117 bytes、完整回覆1533–1540 bytes。這是代表短候選量測，不能當最大圖量測；候選／收斂上界另由精確bytes反例驗證，完整圖與記憶滿載由 #227 負責。

## 畫面重載

本機 Chromium 相容 Edge 跑真正 WorldApp／世界 API／SQLite：

```powershell
node --import ./tooling/verification/no-network.mjs tooling/verification/browser-pursuit-selection-222.mjs
node --import ./tooling/verification/no-network.mjs tooling/verification/browser-pursuits-221.mjs
```

使用 repository `browser-runtime.mjs` 的既有 PLAYWRIGHT_MODULE／CHROMIUM_EXECUTABLE 環境設定。第一支完成4個已提交回合、1次保存前故障，總4個固定回覆派送；純活動進度沒有新模型。原ID重放與畫面重載沒有新派送。既有分析在重載後可對照原候選／正式範圍，390px無水平溢出，0 pageerror；保存故障顯示未提交候選，純進度的未決策記錄不冒稱明示空集合。第二支T1人物檔案／分析兩輪及下一實際請求亦通過。

合成截圖已逐張目視：

- [候選、收斂及承接差異](assets/pursuits-222/candidate-convergence.png)
- [390px既有分析](assets/pursuits-222/mobile-analysis.png)
- [尚未提交的空候選](assets/pursuits-222/uncommitted-candidate.png)
- [篩選後機械結果](assets/pursuits-222/summary.json)

Typecheck、變更檔 ESLint、`git diff --check` 通過。獨立整合審查及 #229 真實行為仍有各自責任；未記錄的心理因果保持未知，程式不以合法引用冒稱理解正確。
