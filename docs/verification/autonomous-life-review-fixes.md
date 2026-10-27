# 自主生活雙軸 review 修正（#172–#181）

本輪以 integration `10bd45bf5564faeed77aeb5719f961961d59fc48` 為起點，在獨立 `fix/autonomous-life-review` worktree 單人修復。沿用已確認的世界 API、實際 JSON／SQLite 保存重讀及既有 UI seam；不變更產品需求、成本政策或資料庫 schema。

## Standards：復工原條件重驗

原 `referencedFacts` 遞迴只認部分欄位名稱，漏掉合法 `displace-body.targetId`。新增兩條真正可達 API 路徑：裁定核准 resumable 長工作（action.target 為空、最終階段引用另一角色）→介入後自主暫停→另一個 API 提案移動該角色或變更其 hidden 外在身體 revision→開始另一項長休息→介入後自主復工。

RED：原碼兩例都把 `pausedActivity` 清掉，`assert.deepEqual(pausedActivity, savedPause)` 收到 `undefined`。GREEN：拒絕復工，完整保留原暫停進度與目前另一活動；尚未執行的身體位移不執行，回饋維持一般必要條件失效，不帶隱藏狀態值或內部目的地 ID。裁定只發生於兩個真正提案，暫停／復工不新增裁定。

以型別化 phase／effect 掃描取代無型別欄位遞迴：窮舉 `Effect` union（新增 effect 類型未處理會由 TypeScript 指出）、區分 object／supply／body／environment、涵蓋自然安排條件／後果、formation inputs、typed／legacy preconditions 及原 action 物件目標。重用既有 `effectReferenceIds` 擷取物件效果來源，不把同名 body ID 誤作物件。

## Spec：必要工具與 routine metadata

補上 `requiredTools`、`routineBindings.objects`、`routineBindings.bodies` 的原條件快照。兩個相容測例先真正由 API 啟動長工作，再透過 SQLite fixture 保存合法 trusted plan metadata，接著仍由 API 暫停、提案拿起工具、開始另一活動及選擇復工；不是直接呼叫暫停私有 helper。RED（暫時缺少兩欄掃描）：兩例都清掉暫停槽。GREEN：工具持有條件變更時保留暫停槽與當前活動，原操作 ID 重送也不重派或改變進度。

範圍限制：`requiredTools`／`routineBindings` 是受信任 routine binder 的持久計畫欄位，新的模型 stage JSON 不接受這些欄位；測試明示這個持久計畫相容邊界，沒有宣稱舊 v1/v2 binder 自然產生 resumable 計畫。合法 displace-body 的開始→暫停→變更→復工則全部透過真正 API 與裁定。

## Standards：共用習慣證據狀態

僅抽出 `habitEvidenceState`，供 `habitStrength`、時段習慣及事件習慣 view 共用 21 日證據窗、days/6 強度、7 日半衰、3 日且至少 0.2 成立及 7 日 fading。既有標籤、各自排序、投影及容量保持原義；未增加新習慣行為或無關重構。

## 驗證

- `node tests/run-activities.mjs tests/long-activities-api.test.cjs tests/life-habits-api.test.cjs tests/world-external-api.test.cjs tests/routine-world-changes-api.test.cjs tests/activity-lifecycle-api.test.cjs tests/life-integration-api.test.cjs`：79/79 通過。
- 原長活動回歸包含已執行階段游標、消耗／revision 不重播、成功復工後完成一次、保存故障與操作 replay；外在狀態與 routine 回歸涵蓋資訊邊界及重綁。
- `node tests/run-activities.mjs tests/recovery-ui.test.cjs tests/activity-results-api.test.cjs tests/routine-program-api.test.cjs tests/natural-changes-api.test.cjs tests/world-formation-api.test.cjs`：52/52 通過；包含既有恢復 UI 與結果分支、自然變化、formation 的效果型別回歸。
- `npm run typecheck`：通過。
- `npm run lint`：0 errors；4 個既有 warnings（character-profile/pixel-world 的 img、world-app useEffect dependency），本輪未修改對應檔案。
- `git diff --check`：通過。

UI 產品碼／投影格式未改，保留原可見活動回饋；本輪沒有新增瀏覽器截圖或把 fixture 宣稱為真實模型生活驗收。未部署、未呼叫付費模型、未推進正式世界，沒有碰正在執行全套的 immutable verification checkout。

## 補驗 A12／A13：暫停不凍結自然變化或已到期工序

A12 新增同世界的真 API／SQLite 整條路徑：世界核准 resumable 240 分鐘工作，第一個 15 分鐘階段真正加熱材料、提交 `progress: started`，並確認 45 分鐘後生效的既有 `schedule-natural`；自主暫停後改做長休息，世界推進仍執行已獨立提交的冷卻。重讀確認自然安排 `executed`、材料 revision 增加，暫停槽、階段游標與已投入 30 分鐘保持原值，已提交 `started` 成果保留。復工因原條件過期而拒絕，保留當前休息及暫停進度；同 ID 重送不再執行自然變化／派送。下一次真正 NPC 輸入收到一般失效回饋，整段所有 NPC 輸入均不含 hidden 冷卻值或安排原因 marker。只有首次一個裁定、零骰子；本案原機制正確，無產品修改。

A13 原假設經真 API 證實：未確認 resumable 的長工作，第 15 分鐘水狀態已提交，第 30 分鐘應執行茶狀態；介入後 NPC 提無效 pause，原碼 HTTP 200 卻仍是 water（RED：`water !== tea`），phase 游標未前進。修正將既有 `progressActivity` 結算移至 pause 可行性拒絕之前，讓本輪實際到期工序正常提交，再拒絕新增暫停槽。GREEN 確認 tea、revision 3、cursor 2、原 startedAt 不變、無 paused 槽，重送不重做；沒有改自然安排提交時間、共同 executor 或睡眠醒前 throughMinute。


補驗命令與結果：

- `node tests/run-activities.mjs tests/long-activities-api.test.cjs tests/natural-changes-api.test.cjs tests/sleep-api.test.cjs`：35/35 通過，包含睡眠醒前階段邊界回歸。
- 第一階段額外明示保存 `progress: started` 後，`node tests/run-activities.mjs tests/long-activities-api.test.cjs`：11/11 通過。
- `npm run typecheck` 及 `npx eslint lib/paused-activities.ts tests/long-activities-api.test.cjs`：通過。
- 拒絕暫停文字移除「原活動仍保留」的絕對宣稱，避免實際到期已完成時誤述。

## 復工可達性：身體未變但通路關閉

另補真 API 反例：phase-only `displace-body` 的必要角色仍在原區域且沒有 physical revision，暫停後用正常 `door` 動作關閉 cafe-door；原 snapshot scanner 全部相同，原碼復工仍清 paused（RED）。因此只有參照快照不足以證明目前物理條件成立。

復工現在除了原條件快照，會在完整 world／計畫副本上預檢剩餘階段，沿既有 `checkPhase`／`applyEffects` 同一套 executor 規則逐階段驗證，涵蓋通路、可見性／可達性、工具、許可及有界效果前提；不另外硬編碼門清單。副本按重啟後計畫時間順序承接階段間效果，真世界／保存的 phases 不更動。預檢刻意不呼叫 `commitActivityPhase`，避免其對外感知事件與可能的感知擲骰；不呼叫模型、不擲行動骰、不提交預支成果。

GREEN：門關閉時復工拒絕、暫停與另一項休息完整保留；門重新打開後可以再次選擇復工，未來身體位移仍未發生、階段定義保持原值、零新增骰子／裁定。初始世界可控 transport 的測試預算只對含兩角色的 fixture 明示提高，產品預算未改。

- `node tests/run-activities.mjs tests/long-activities-api.test.cjs tests/routine-world-changes-api.test.cjs tests/activity-results-api.test.cjs tests/sleep-api.test.cjs`：64/64 通過。
- `npm run typecheck`、`npx eslint lib/paused-activities.ts lib/world-effects.ts tests/long-activities-api.test.cjs`：通過。
- 追加重新開門後成功復工檢查：`node tests/run-activities.mjs tests/long-activities-api.test.cjs`，12/12 通過。
