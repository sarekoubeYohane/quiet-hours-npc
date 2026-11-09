## Standards 修復覆核

固定提交：`25c790ff899c2b1ced6f6739c8fbed0047939f91`；窄查 `59d2955...25c790f`，只讀提交快照及 `docs/verification/spec-271-review-fixes.md`。

**Resolved：原 P3 已修復。** `lib/action-checks.ts` 的 schema 與 parser 均引用 `adjudicationLimits.difficulties/maxValueLength`，不再重寫 difficulty／ability 長度。符合 ADR 0003「共同限制集中定義，提示與回覆格式盡量由此產生」；相關 Duplicated Code heuristic 同時解除。

新增 trace 省略路徑僅保留一筆 `source=program` 的 `time-policy`，未知憑證仍清空 steps；沿私有 archive、既有遮蔽與容量限制，不把診斷放入故事。時間修復集中既有活動生命週期，沒有新增平行執行器；測試沿實際 API／SQLite、恢復 UI 與受控 transport，未以 internal mocks 代替行為。

**Remaining：0。** 本次差異未發現新增可行動明文規範違反或 baseline smell。未覆核 Spec 語義，未重跑測試，未修改 repo；不代表尚未合入的 #263 或最終完整 main 差異已通過。
