1. **[P1] 十五分鐘結果分支立即完成**：批准B明定「短動作也必須真正經過已定活動時間才取得其後果」。`lib/activity-lifecycle.ts:160–175` 只延後非branches候選；分支被選後的effects卻當場提交。已以59d2955快照、真正POST及SQLite重讀重現：t1265新選15分鐘清潔，杯子當刻已clean=yes、沒有plan，本應t1280才完成。窄修：先將各結果分支的完整成果排入確認耗時階段，再選分支，保留前置準備例外。

2. **[P2] 規則模式長活動縮為十五分鐘**：批准B「既有已確認耗時不縮短」。`lib/activity-lifecycle.ts:193` 未提供timeIntent一律15，但`lib/activities.ts:188` 的demo持續活動仍明定60。真正POST重現Cass在t1265選rest，plan.until=1280，本應1325；工作、思考同受影響。窄修：無timeIntent的既有持續活動沿用durationMinutes。

未見確證scope creep。僅審已交付切片；#263及完整#255不列缺漏。重現檔：`/private/tmp/npc-spec-review-snapshot/tests/spec-review.cjs`；日誌：`/private/tmp/npc-handoff-20261109/spec-repro.log`。未修改repo。
