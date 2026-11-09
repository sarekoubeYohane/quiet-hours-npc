窄覆核：integration 25c790ff899c2b1ced6f6739c8fbed0047939f91（修復5683c7e），只覆核原P1/P2。

- P1 resolved。自由結果分支在選骰前排入確認完成階段；原實際API/SQLite反例改為正確期望後通過：t1265選擇，t1270/t1275杯子仍clean=no，t1280才clean=yes、revision=2且plan清除。原ID、失敗恢復與到期條件改變亦通過新測試。可信routine的trialBinding排除於此轉換，準備效果維持既有分割；既有legacy模式及計畫不改寫，NPC未提前收到未完成成果。
- P2 resolved。原demo Cass反例現在startedAt=1265、until=1325，保留60分鐘；新案例也驗到55分鐘仍持續、60分鐘才結束。明示completion仍依原短動作契約。

以git archive固定提交建立獨立/tmp快照，重跑兩個原反例（正確期望）、新time-policy-review及activity-results/routine-results/five-minute-time API：45/45 PASS，0 fail/skip。日誌：/private/tmp/npc-handoff-20261109/spec-fixes-recheck.log；重現：/private/tmp/npc-spec-fixes-snapshot/tests/spec-review-fixed.cjs。未改repo、未擴審#263。兩項無剩餘實質問題。
