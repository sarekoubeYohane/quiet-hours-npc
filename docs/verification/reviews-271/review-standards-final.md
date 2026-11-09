## Standards

finaldiffSHA：`a9a0ef545d4f233def30ecde3d0816e9ddd93b8e...dfdd426c553e89ddb01e319cb86250f43b09cb6f`（105 files）。已讀完整 commit／file 清單，依提交快照覆核；本輪納入 #263 API、城市初始化、UI、正式 core 及測試調整。

**無可行動 finding。** AGENTS／domain／GLOSSARY、ADR 0001／0002／0003／0004／0007／0012 與 TDD 規範未見新增違反；12項 baseline smell 依 repo 優先作 heuristic 檢查，無須另提修正。

原 P3 維持 resolved：`lib/action-checks.ts:9,14` 的 schema／parser 均引用 `adjudicationLimits`，符合 ADR 0003「共同限制集中定義」。正式啟用沿既有工廠、只讀 validator 與交易；測試沿 API／SQLite／UI 及外部 transport，未用內部 mock 代替主行為。診斷維持私有與有界。

remaining：**0**（明文違反0、smell0）。未審 Spec；未重跑測試／修改 repo，tooling 驗證由整合代理統一記錄。受審已提交分支未含 ADR 0011；原始 dirty WT 未提交文件不在本輪差異。

追加窄覆核：`dfdd426...30a9c94` 僅新增正式啟用 API 表測與驗證紀錄；0–100%五階投影及5／4支付沿既定 API／provider transport／SQLite seam，預期為獨立 literals，未 mock 內部協作者。無 runtime 變更，未新增規範問題。更新受審 final SHA：`30a9c94`；remaining **0**。未重跑全審或測試。
