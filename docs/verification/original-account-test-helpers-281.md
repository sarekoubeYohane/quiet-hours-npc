# #281 原帳號識別的既有驗證請求接合

本次僅遷移既有 CJS／auth 的普通 Request 初始化資料，不修改產品、核心斷言、新的 missing/wrong-scope 反例、既有世界／帳號用量或退役 reset 行為。獨立分支 `test/original-account-helpers-281` 起自 integration `fa0af83`，依序合 `1a3ea10`、guard checkpoint `55ddc00` 及 receipt／UI 修正版 `f9d2345`；T7 主工作樹沒有被此協作修改。

純 helper 變更為 `e467dd9` 與 `3c1f79e`。`original-scope-fixture.cjs` 只把呼叫處提供的原 scope 放進普通輸入；不讀 cookie、不呼叫後來的 GET、不包裝或攔截產品 `POST`。它保留呼叫處原有的 scope（包括刻意的 wrong／undefined）與非物件輸入。新的 raw scope 反例不使用此 helper。

- 原有 legacy CJS 世界 fixture 明示 `test-owner`；資產請求明示 `account-operations:test-owner`。少數其他帳號自己的普通操作在其建立處明示該帳號原識別，沒有根據當下 cookie 修補。
- Auth／Key／reset fixture 在原 sign-in 成功時記下 cookie 對應的 GitHub 身分；後續普通 Request 沿該記錄，即使登入名稱、環境或登入狀態改變，也不取得新帳號作為替代。
- 世界存檔 fixture 在真產品 API 建立後的首次 GET 記下各份完整 binding；切檔後的操作及 receipt GET 使用原存檔的記錄，不以目前選檔決定來源。source API 的 accountScope 與 opening／T9 的 raw owner operationScope 保持不同責任。
- Receipt GET 加入原 binding query。刻意查另一帳號自己空 journal 的舊相容測試明示另一帳號原 fixture scope，仍驗證原本隔離結果；沒有把原斷言改成 scope 拒絕來迴避下游行為。
- 形成卡／開局的共用 CJS driver 只補原 workspace Key setup 的 scope；仍走形成／完成卡／開局確認 API，保留形成模型呼叫、骰果、帳號費用、時間窗口與原 ID。

在合 `f9d2345` 的固定來源上執行：

| 命令／範圍 | 結果 |
| --- | --- |
| `node tests/run-auth.mjs` | 40／40；原 assert 不變，含授權、Key、期限、原 receipt 與 reset 退役 |
| `node tests/run-activities.mjs tests/world-saves-api.test.cjs tests/save-management-api.test.cjs` | 16／16；在 `3c1f79e` 再跑固定來源 |
| `run-activities.mjs` 指定 operations、costs、character-generation、recall、flexible-life-integration、world-physical、city-creation、city-access、city-activity-hints、city-phone-map、city-travel、initial-memory-capacity、character-attributes、formal-mental-enable 14 檔 | 123／123；包含舊城市 44 項及明示其他原帳號的真正下游檢查 |
| 全部 `tests/*.cjs` 語法檢查、`eslint tests/*.cjs`、`git diff --check` | 通過；lint 0 errors／3 原有未使用 import warnings |

保留原紅燈與修正紀錄：`/tmp/scope-{auth,saves,representative}-final*.log`、`/tmp/scope-lint-final.log`、`/tmp/scope-syntax-final.log`。這是普通驗證初始化的相容接合，不另新增只測 helper 實作的測試。沒有跑完整 20 分鐘套件或 source-pin；整合後由 root 以最終固定來源及順序執行。

`budgets-api.test.cjs` 原本仍把新 reset 當成功，這與退役規格衝突；本協作只補其普通 Request scope，沒有改該核心 assert，已交唯一修復者另按退役契約處理。不能把本窄組通過宣稱為整份 #281 完成。新 scope 反例、真頁、完整產品 code-review、正式／真模型語義均由相應交付另行記錄；沒有付費或正式操作。
