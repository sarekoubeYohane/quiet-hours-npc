# PR #60 衝突解決

同步 main `a2501be`（已合併 PR #63），保留本 PR 功能。

每日額度派送前扣款與記憶／認知輸入並存，測試入口包含 daily-usage、memory、cognition。

- `npm test`：180 項通過，0 失敗。
- `npm run typecheck`、受影響 TS／測試檔 ESLint、`npm run build`、`git diff --check` 通過。
- 未合併 PR、未部署、未執行雲端 migration 或付費請求。
- 驗證範圍為本 PR 與目前 main；其他開放 PR 合併後仍需檢查共有檔案。

## 第二輪：PR #58 合併後

同步 main `e31d763`，保留重置世界功能與本 PR 變更。`npm test` 188 項通過；typecheck、受影響 server／測試 ESLint、建置與 diff check 通過。每日額度專項 9 項另跑通過；144 次耗盡後透過真實 reset API 及 operationId 重放，帳本仍為 144／144，下一次模型請求仍拒絕。未合併或部署。

## 第三輪：PR #59、#64 合併後

同步 main `4611284`。完整測試 215 項通過，typecheck、變更程式／測試 lint、build 與 diff check 通過。保留每日帳本派送前扣款，加入摘要 prompt 與維護測試入口。未合併、未部署或執行付費請求。

## 第四輪：PR #68 合併後

同步 main `e74c6f6`。每日帳本與回想派送整合：啟用回想時每名自主角色保守預留兩次聊天，首次與續接都在序列化後、fetch 前持久扣款，共用 lease-minus-10s 截止時間；未用份額釋放。回想的服務預算維持獨立。

完整測試 245 項通過；新增每日帳本＋回想兩次聊天、精確操作重播、單次直接決策釋放餘額，以及剩餘一次額度拒絕兩次回合且零 provider dispatch 的整合驗證。typecheck、受影響程式與測試 lint、build、diff check 通過。仍為 Draft，雲端帳本與部署守門配置待完成；未合併或部署。
