# #196 飲品與容器承接（本地機械驗證）

基準 `148a75d`，規格 #186、工作票 #196。沿世界 API、真實活動／效果、SQLite 世界重讀及下一次實際 request/messages 驗收；使用明示固定 NPC／裁定 transport，測試 preload 禁止外網，沒有真實模型或正式世界操作。

## 修正與反例

- 人工茶／杯最小反例在原契約因新增的明示方向被拒（502）；明示 `link.direction=from-role` 後，茶的 `state.vessel` 指向真正杯子，完整攝取消耗茶、恢復口渴、杯子變空。同名舊杯與舊茶保持原身份。這不是第13輪原件重播。
- `to-role` 指候選物件的 `state[key]` 指向先前已綁定角色；`from-role` 指先前角色的 `state[key]` 指向候選物件。舊資料缺方向維持 `to-role` 原義，新 schema 要求方向明示。缺失、錯誤及多個合法匹配關聯不任選第一件；私有綁定診斷保留 `ambiguous-linked-objects`。
- 人工未宣告角色反例：同階段先檢查新 `$portion`、再 separate 形成它，原先通過解析而落至執行錯誤，修後在純候選邊界拒絕。bindings 依序宣告；階段條件只能引用先前存在的角色，形成後才可供後續效果使用。格式錯誤不新增世界禁令。
- 30分鐘活動在首段15分鐘不消耗、不預付恢復。必要 `vessel` 關聯在綁定後改變的反例原先仍攝取，現在以必要 state key guard 停止未發生效果；無關 state 不加入 guard，舊計畫無新 guard 保持原義。

## 驗收覆蓋

`tests/drink-binding-api.test.cjs`：飲品／容器兩種 target、舊方向相容、同名舊杯、歧義、未宣告角色、長活動尚未完成、必要關聯改變、許可、保存衝突、較後角色錯誤及原操作重送。SQLite 重讀後物件與需求一致；下一次正常決策包含本人飲用經歷。候選 accepted、綁定與提交仍分開，預檢僅操作候選副本。

既有觀察／分析 `RoutineStatus` 與決策實錄已分別顯示核准、活動進度、效果及提交；本票核對其資料責任，不以新 UI 取代既有入口。關聯方向加入 operation evidence 白名單，可對照實際候選與綁定診斷。

歷史證據見 PR #184 的公開報告；未取得其完整私有原件，不以本 fixture 或目前末態還原當時候選。部分攝取由 #197 接續；本地固定回覆不能證明自主 NPC 不再 loop。真實行為須待使用者另行授權有限隔離觀察。

驗證結果：新增8項 API 案例與 `routine-world-changes-api`、`adjudication-contract-api`、`life-needs-api` 合計55項通過；`pnpm exec tsc --noEmit --incremental false`、變更檔案 ESLint、`git diff --check` 通過。自查 Standards：沿集中契約、純解析與副本預檢責任，無新增硬性違反；Spec：已修正必要關聯變更仍攝取的發現，保留舊資料原義。整合分支仍須依技能執行獨立兩軸 review。
