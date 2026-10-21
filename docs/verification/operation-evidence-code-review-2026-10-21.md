# 操作驗收證據 code review（2026-10-21）

依 repository code-review skill，由獨立 reviewer 平行審查 Standards 與 Spec；固定點 main `9a5365a`，初版 `7d57f8d`，修正覆核 `0a594b8`。以下保留兩軸各自報告，不合併重排 findings。

## Standards

固定點 `9a5365af0c0f0fc2d07b91be74ae48d9ac4eee85`，審查 `git diff 9a5365af0c0f0fc2d07b91be74ae48d9ac4eee85...7d57f8d`。

未發現需要修正的文件規範違反或 Fowler baseline smell。

- 證據保留在操作 journal，沒有進入 World、NPC transcript 或記憶，符合 `context.md`、ADR 0001／0004 的資訊邊界。
- `app/api/world/route.ts` 沿用原 ID、原子世界提交與精確回放；失敗保存新增 observed-journal CAS 與既有淘汰水位，符合 `docs/design/world-operations.md` 的遲到寫入及保留契約。
- 新的模型 observer 只被動接收 dispatch／usage／candidate，捕獲錯誤不改模型結果，沒有額外派送、預算或世界效果責任；符合 `docs/design/model-task-contract.md` 的轉接／驗證／提交分工。
- 維護測試及 Chromium runner 使用已授權的真實 API／SQLite／WorldApp seam，fixture 留在外部模型、認證及平台邊界，符合 TDD skill 的公開介面與 mock 邊界要求。
- 設計、ADR 與 runbook 明確區分候選、已保存結果、本機 fixture、正式站未驗證及場景準備不足，符合 AGENTS.md 與 GLOSSARY.md。

未重跑完整測試；root 正在整合驗證。root 已報告並指派處理的 legacy diagnostic `truncated` 回歸屬執行驗證事項，未重複列為本軸發現。

本軸：0 項 findings；無最高嚴重項目。

### 修正覆核

定向覆核 `7d57f8d..0a594b8b54e46979675dd448e7e8c22cfe30eb42`：未產生新的規範問題。legacy 診斷在 JSON 解析後逐欄位遮蔽，避免全文 regex 損壞序列化結構；新增 Basic、完整 Cookie 值及含空格的 quoted assignment 遮蔽符合 ADR 0004。depth 上限 32 保留正常 schema，同時維持病態結構的截短標記及原有輸出上限。新增測試仍從 API／保存重讀驗證外部可觀測的隱私保障；沒有新增模型呼叫或修改候選本體。本次未另跑測試，定向 19 項通過由實作者提供，完整回歸由 root 驗證。

## Spec

固定點：`9a5365af0c0f0fc2d07b91be74ae48d9ac4eee85`；審查 `git diff <固定點>...7d57f8d`，對照 #133、#134、使用者要求及正式站驗收流程。

- **需修正：認證資訊遮蔽不完整**（`lib/diagnostic-redaction.ts` 最後一個非 JSON credential regex，連帶 `lib/operation-evidence.ts` 的 proposal/content 與 legacy failure 路徑）。#133 要求「不保存金鑰、認證、完整私人上下文或原世界備份」，#134 要求「排除 Key/認證」。目前僅遮蔽第一個空白或分號之前的 token：`Authorization: Basic Zm9vOmJhcg==` 變成 `Authorization: <REDACTED> Zm9vOmJhcg==`，`Cookie: session=first-secret; auth=second-secret` 仍留下 `auth=second-secret`，`api_key="first secret second"` 仍留下後兩個詞。這些均可出現在保留的 NPC `content` 字串，因此不能滿足敏感資料邊界。已直接執行現有 `redactDiagnosticText` 證實。應遮蔽完整 authorization/header、cookie 多值及引號包住的 credential，並由真實 API/SQLite 測試證明 journal／重讀與既有失敗診斷均不外洩。

其餘要求未發現新增缺漏或越界：沿用原 journal／同 ID POST，捕獲 raw 必要欄位與派送／usage，與保存結果分離，保留原子提交和失敗恢復，不改模型預算、物件或杯能力；正式站流程明確區分 fixture、未驗證及場景準備不足。硬中斷／資料庫不可寫的未知結果有明示，未虛構可恢復的候選。

Spec：1 項 finding；最嚴重為認證內容可能進入持久化證據。

### 修正覆核

已獨立覆核 `7d57f8d..0a594b8b54e46979675dd448e7e8c22cfe30eb42`，上述 finding **resolved**。非 JSON 路徑現在遮蔽完整 header／assignment 值，包含 Basic／Bearer、Cookie 多 pair 與帶空白的引號字串；結構化 legacy 診斷在解析後逐欄遮蔽，避免把已序列化的後續欄位吞掉。直接重跑四種憑證案例均不再含原 token 或殘餘片段。最高 seam API/SQLite 新增回歸先 red（`Zm9vOmJhcg==` 外洩），修正後連同其他診斷測試 19/19 通過；新測試同時涵蓋證據、legacy failure 及保存重讀。

覆核後 Spec：初次 1 項，已解決 1 項，未解決 0 項。

最終：Standards 0 項；Spec 初始 1 項、已解決 1 項、未解決 0 項。
