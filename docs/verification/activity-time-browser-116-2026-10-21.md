# #116 應用瀏覽器驗證（2026-10-21）

驗證提交基於整合 `af6202c`。真實 Chromium 153、WorldApp、世界 GET/POST、SQLite JSON 保存；模型傳輸為明示替身，無正式世界或付費呼叫。

## Red → Green

`tooling/verification/browser116.mjs` 先以 `FIXTURE_REPO` 指向原 main `7e470ef` 執行，第一回合 HTTP502，世界 turn0，沒有規則／成果；舊 offer 帶有固定 minutes，違反本次要求「首次世界自行確認時間」的 transport 斷言。原始「泡茶至少三十分鐘」故障的 API 重現另見 `activity-time-116-2026-10-21.md`，不將此瀏覽器契約拒絕混稱相同錯誤。

對新實作執行相同 runner，兩情境均通過：

- NPC 估15、世界確認茶30：首回合只有準備中水與剩15分鐘，重送不增加呼叫／物件，下一回合才有茶成品。
- NPC 估60、世界確認茶5→安排15：首回合完成，沒有強制耗滿一般估時。
- 各情境均重新載入後選擇另一活動咖啡45，跨三單位才完成。第二單位重載保留起點；沒有提前咖啡成品，沒有新裁定。完整六項規則時間經保存／重讀仍相同。
- 實際分析畫面顯示各活動分鐘、未完成計畫剩餘時間與「沿用日常規則，無新增裁定」。每個情境 **2次NPC＋1次裁定**，120替身回報tokens；沒有 pageerror。

首次實作 runner 在第一情境後關閉最後一個 Chromium context，Sparticuz single-process browser 隨之結束，導致第二情境無法開頁。已改為每情境獨立啟動 browser，兩情境重跑通過；此為 runner 生命週期修正，未修改產品。

## 命令

依 `tooling/verification/README.md` 的 Playwright／Chromium 環境設定，執行：

```sh
node tooling/verification/browser116.mjs
node tooling/verification/browser109.mjs
node tooling/verification/browser110.mjs
node tooling/verification/browser111.mjs
node tooling/verification/browser112.mjs
pnpm exec eslint tooling/verification/browser109.mjs tooling/verification/browser110.mjs tooling/verification/browser111.mjs tooling/verification/browser112.mjs tooling/verification/browser116.mjs
```

109–112 原有應用回歸全部通過。核准替身現在明示完整 `timings`；111 種子規則加入完整已確認模板，不假裝舊資料已遷移。109：2 NPC＋1裁定；110：11 NPC＋1裁定；111：4 NPC＋1裁定；112：9 NPC＋4裁定。ESLint 無錯誤／警告。

## 畫面證據

- [30分鐘未完成](assets/activity-time/browser116-confirmed30-pending.png)
- [茶30後咖啡45重用](assets/activity-time/browser116-tea30-reused-coffee45.png)
- [茶5對齊15後咖啡45重用](assets/activity-time/browser116-tea5-reused-coffee45.png)

已視覺檢查第一張圖：時間／六項耗時／剩餘時間／準備中物件可讀，世界21:15與API一致。這些結果只涵蓋 #116；#117–#119 須由下游驗證補齊。正式站仍為7e470ef，未驗新版真實模型。
