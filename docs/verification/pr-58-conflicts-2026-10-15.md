# PR #58 衝突解決

同步 main `a2501be`（已合併 PR #63），保留本 PR 功能。

保留 reset 與帶 actorExperience 的事件記錄，CI 保留兩側測試。

- `npm test`：179 項通過，0 失敗。
- `npm run typecheck`、受影響 TS／測試檔 ESLint、`npm run build`、`git diff --check` 通過。
- 未合併 PR、未部署、未執行雲端 migration 或付費請求。
- 驗證範圍為本 PR 與目前 main；其他開放 PR 合併後仍需檢查共有檔案。
