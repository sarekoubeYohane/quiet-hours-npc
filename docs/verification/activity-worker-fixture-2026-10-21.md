# 活動整合的真實 Workers 驗證載入修正

本輪 #126 將活動生命週期抽成獨立模組後，活動 API／SQLite runner 已通過，但完整測試中的 `model-keys-workerd.test.mjs` 維持另一份手寫模組清單，沒有提供 `activity-lifecycle.js`，導致真實 Workers 啟動失敗。這是測試載入缺漏，不是世界 API 成功，也不能以活動 runner 通過代替完整測試。

- **Red：** 在修正前整合分支 `bd3a5b4` 執行 `node --test tests/model-keys-workerd.test.mjs`，0/1 通過；Miniflare 報 `No such module "activity-lifecycle.js"`，由 `world-api.js` 引入。
- **修正：** 與既有瀏覽器 fixture 一致，發現頂層 `lib/*.ts` 並轉譯提供給 Miniflare，仍直接載入正式世界 handler；不再維護第二份手寫依賴圖。未替換世界執行、D1、加密或保存驗證，亦未移除 outbound network 阻斷。
- **Green：** `node --test tests/model-keys-workerd.test.mjs tests/auth-workerd.test.mjs` 為 2/2 通過；包含真實 Workers／D1 的 Key 加密、損毀拒絕、大型隔離場景備份及 API 保存重讀，以及 OAuth redirect 防護。
- 變更檔 ESLint、`git diff --check` 通過。

此修正僅處理本機／CI 驗證載入，未部署、未使用真實模型或正式世界；完整整合後的全部測試與 build 結果另列整合紀錄。
