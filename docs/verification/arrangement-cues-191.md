# #191：安排喚起驗證

本輪以 main `148a75d` 上已整合 #187／#188 為基礎，不呼叫付費模型／回想服務，不操作正式世界。

- 第一個世界時間切片：沒有 self.arrangementCues 的 RED，再接入真正活動／認知／輸入與SQLite提交後 GREEN。先前 fixture 篩選 Cass 會由舊相容規則自動補店主，已更正為只使用店主；測試不把多角色calls錯當重複提醒。
- `node tests/run-activities.mjs tests/arrangement-cues-api.test.cjs tests/phone-memos-api.test.cjs tests/arrangements-api.test.cjs tests/continue-api.test.cjs tests/attention-api.test.cjs tests/life-cognition-integration-api.test.cjs tests/recall-api.test.cjs`：83/83通過，包含新增9項cue案例。補「缺相關線索不等於明示條件失效」及必要cue容量預留後，同組83/83再度通過。最終增加8項到期→缺口4的明示斷言、可選投影預留1 KiB供缺口欄位後，cue專項9/9通過。
- 案例包括：時間到期→continue→重送／GET去重、明示延期 vs 相同條件改字、本人位置離開再返回、真實感知speech vs 隱藏private活動、8項到期僅4項展示／處理、存檔前後／CAS故障與原ID、較後角色無效回覆整輪回復，以及真正確認睡眠不因普通內在提醒醒來。
- 真 Chromium `tooling/verification/browser-arrangement-cues.mjs`：既有WorldApp、真世界API與SQLite建立安排→到期一次正常決策→continue→再推進／重載不增加模型。2次transport fixture，0頁面錯誤；活動起點保持。分析入口能區分尚未喚起、已喚起、已獲決策機會及尚未完成。[建立畫面](assets/arrangement-cues-191/saved.png)、[已處理畫面](assets/arrangement-cues-191/handled.png)、[保存證據](assets/arrangement-cues-191/evidence.json)。第一次瀏覽器只剩店主而UI仍預選Cass，runner已改由既有角色按鈕選店主後重跑；未新增測試專用UI。

TypeScript、變更程式ESLint及git diff --check通過；完整兩軸code-review依整合分支收尾執行。本切片不把自檢當最終獨立審查。既有回想服務回歸涵蓋一次有界回想及故障邊界；#193仍須補手機＋安排＋回想的極限容量與真正跨切片長流程。手機外部提醒由 #192 串接同一條件責任，未把內在提示當裝置通知。fixture不證明真實NPC必然想起或照做。
