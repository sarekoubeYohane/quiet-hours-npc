## Standards

複審基準：`47229d8...4e107ac`；新增差異以 `git diff 7fc9ae7...4e107ac` 核對。沿用初審指定規範與 Fowler baseline，未重跑 root 負責的 tooling。

**硬性規範違反：0。未解決的 smell findings：0。**

原先兩項建議均已處理：

- `app/api/world/route.ts` 抽出 `restoreWorld(world,snapshot)`，兩個失敗路徑共用「清除當前世界欄位、恢復快照、保留付費用量並恢復 savedDecisions」邏輯；原 Possible Duplicated Code 已消除。
- `lib/models.ts` 移除未使用的 digest／binding 欄位，直接傳遞實際 requestId；註解與 `docs/design/free-action-effects.md` 清楚描述 promise closure 與 route version／lease／期限檢查的分工，原 Possible Speculative Generality / Mysterious Name 已消除。

新增差異未見需回報的規範問題：wire state entries 在模型邊界解析並轉成既有內部 map，避免把傳輸格式散布至活動執行；已到期活動階段沿用 `advanceFreePhases`，沒有新增平行引擎；save 異常讀取 durable receipt 後再決定回傳或保留用量，延續既有 journal／版本機制。相關文件明確區分可保證的行為與資料庫完全不可用的限制，符合 AGENTS.md「區分已確認的設計與已實作的功能」。

TDD seam 仍符合 `.agents/skills/tdd/SKILL.md` 的「Tests verify behavior through public interfaces」與 `mocking.md` 的「Mock at system boundaries only」：新增案例經 `POST`／`GET` 驗證前／後提交拋錯、同一操作重送、到期階段、角色同意及物件生命週期；closed-schema 檢查觀察實際外送模型請求。`browser100.mjs` 操作真實 app／API，包含中斷、保存失敗、另一 NPC 接觸中間狀態與可知資訊。未見用內部 effect helper 測試替代這些 public seam。

本報告為 Standards 軸結論；功能正確性及完整驗收由獨立 Spec 審查與實際測試確認。
