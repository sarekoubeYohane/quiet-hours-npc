# 日常規則整合審查修正

基準 `9edcd27`，本輪採 repository implement-spec／tdd／code-review 流程。已批准的測試介面沿用世界 API GET／POST（advance／intervene）、真實 SQLite JSON 保存與實際 Chromium React 應用。模型 transport 明示替身，沒有部署、正式世界重置或真實付費模型。

## 審查與修正

- Standards 初審：硬性違反 0、判斷性發現 1。日常原材料分類、飲品器具轉換與可用性抽為 `routine-materials.ts` 純 predicate；呼叫端仍各自負責知情、當地、權限、pending 與有限供應篩選，沒有把這些不同契約合併。
- Spec 初審：2 個 P2。既存簡餐背景 generator 在物件 512 個時繼續新增；已完成英文 coffee 飲品供應被當成原材料。現在所有 materialize 效果（包括階段預驗及執行）在權威效果邊界檢查物件上限，保留 consumed tombstone。原材料 predicate 排除有 vessel 的成品，與障礙／權限／當地條件／製作使用相同分類。
- 整合額外發現：要求喝茶時可能喝掉咖啡，NPC 只有咖啡時卻獲提示「喝茶」。現在依要求的飲品種類選取當地可用成品；指定杯子不能暗換，泛稱「飲品」可喝實際成品。提示選取已知可用飲品與容器內容一致的方法，既有能力及權限檢查保留。

## 實際 Red → Green

1. 世界 API 咖啡完成後（無指定杯／明確指定杯）要求喝茶：原本杯子變 dirty、咖啡 consumed；Red 為 `dirty != coffee`。修正後茶要求受阻、原咖啡 active，0 新裁定；接著泛稱飲品可喝咖啡。projection 提示喝咖啡，沒有隱藏其他區域茶杯或診斷識別碼。相同操作保留 NPC 自主決策呼叫。
2. 512 個歷史 consumed 物件加既存簡餐 generator：Red 保存了第 513 個物件；Green 保留完整 512 個歷史物件與 generator sequence，僅記帳 1 次正常 NPC 決策、0 裁定，重送不增加用量／產物。通用 materialize 檢查亦涵蓋有限供應及階段預驗／執行，沒有淘汰歷史以騰空間。
3. 已耗盡、標籤為 coffee 且含 vessel 的舊成品供應：單獨恢復原 selector 實際 Red（沒有杯子）；共用原材料分類後 Green，新咖啡正常以水→咖啡完成，舊 serving remaining 仍為 0，只有 1 次 NPC 呼叫、0 裁定。

4. 追加整合發現：滿杯單獨 transfer 至現場而成品仍在原持有人，API 原本 HTTP 200（Red 期待 502）。在完整效果批次結束檢查受影響 linked 成品與杯子的 holder／region／active／內容一致，拒絕不完整候選；完整合法雙 transfer 通過。只 transfer／consume 成品卻留下滿杯亦拒絕，明確 consume + 杯 dirty 才成功。沒有隱含物件交付或接收同意。舊 unlinked 杯子的回歸保持通過。

## 已執行結果

- `node tests/run-activities.mjs`：303/303 通過，含 routine API 17、其他日常／障礙／共用、活動、世界保存、冪等、預算及感知等完整既有回歸。
- `node --test tests/model-keys-workerd.test.mjs`：1/1 通過，真實 Workers/D1。新增 runtime module 已加入此 suite 與 run-activities 的明示 inventory。
- `pnpm typecheck` 通過。
- `pnpm lint` 通過（0 errors、4 項既有 warnings）；`git diff --check` 通過，清除 rules 檔尾多餘空白行。
- `tooling/verification/browser110.mjs` 實際 Chromium React 應用通過：茶→喝掉→借來原杯清洗／歸還→reload→咖啡→喝掉／清洗／歸還→有限蛋糕再次受阻→一般簡餐→重送。11 次 NPC + 1 次首次裁定、480 reported tokens、杯子所有者不變。截圖在工作環境外部驗證資料夾；本記錄不把替身 token 數冒稱真實價格。

測試衛生：既有 `tests/d20-api.test.cjs` 的 CJS requires 原觸發四個 ESLint errors，依其他 CJS API suites 既有慣例加入檔案級 no-require-imports directive，D20 測試行為不變。

## 具體邊界

新增修正的四個失敗情境已經由 API 真實保存驗證；此子任務的瀏覽器回歸沿用完整 #110 生命週期，沒有聲稱逐一將容量 512／英文舊成品 fixture 操作成瀏覽器場景。整合分支由主流程重新執行兩軸審查及剩餘驗證。#104／#106 正式站驗收保持獨立。
