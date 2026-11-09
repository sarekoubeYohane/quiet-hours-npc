# #288 費用驗收旅程接合完成卡與原始開局

兩支既有真頁驗收工具改用 T7 的合法產品建立契約；沒有修改產品程式、原有停止／費用／名稱恢復斷言或新增測試產品入口。基準為 integration `c326ca3`，接入 T7 `c159a0e`，再合 T7 UI `cff3707`；最後固定來源 **`3c8e7d0`**。只替換原本使用文字範本直接 POST `/api/saves` 的建立 helper。

共用 `tooling/verification/opening-journey.mjs` 由 T1 提供：真帳號草稿 → 受控模型形成 → 保存完成卡；真場景範本 → 保存第四步開局草稿 → 用同一草稿版本確認存檔。建立及形成的 operationScope 在原 GET 時捕獲，不在重送時改讀目前帳號。兩世界重用同一張完成卡，沒有再次取骰或形成。每次 server 的人物骰邊界只提供 20 顆 d6（全為 4），多一次抽取即失敗。沒有直接安裝世界 fixture。

## 帳號預算與歷史未知費用

- 原工具在舊 API 退役後先 red：`/api/saves` 回 400，原期待 201；log `/tmp/quiet-hours-context/t7-review-account-red.log` 保留。這是驗收工具仍用舊契約，不是產品建立失敗。
- 真設定頁在沒有世界時保存呼叫上限 1 及價格，模型呼叫仍 0。形成完成卡實際派送並入帳 1 次後，明示將呼叫上限改為 2，保留原 tokens 上限、原小時、累計及已形成費用；不清帳或換小時騰額度。
- 第一世界的文字補完再派送 1 次，第二世界回 429、沒有新增呼叫。帳號本小時及累計均為 2（形成 1＋補完 1），另存、刪來源及真正 SQLite 關閉重開後仍維持 2 與原小時。
- 原先未受理的另存 → 重載 → 來源版本衝突 → 名稱可編輯且保留 → 重新確認另存的 UI 斷言全部保留。
- 歷史 unknown 案例使用另一隔離帳號真正形成卡、確認開局建立世界後，只注入「歷史未定案 receipt 及同來源的 migration origin marker」。新形成已初始化中央帳號權威，因此單獨晚加世界 receipt 不等同 migration 前已存在的歷史缺口；補齊同一歷史 metadata，不重設 initialized、不改帳號費用或世界故事。刪除此來源後，另一真正世界的 compact 與 CostPanel 都明示未知範圍，不冒稱 USD 0。
- 整條旅程有兩個帳號各形成一次，加主帳號一次文字補完：受控 transport 共 **3 次**，角色為 `formation / generation / formation`；真實付費 **0 次**。

[固定來源機器紀錄](assets/opening-review-helpers-288/account/evidence.json) · [帳號權威 2 次](assets/opening-review-helpers-288/account/account-authority.png) · [衝突後保留名稱](assets/opening-review-helpers-288/account/copy-conflict-input-retained.png) · [未知費用兩處明示](assets/opening-review-helpers-288/account/account-unknown-both-summaries.png)。

## 前景預估與他檔費用隔離

真形成的帳號費用為 **USD 0.000006**，沒有清除；兩世界共用該卡。前景自動完成 2 回合，期間另一世界用同模型受控文字補完產生約 USD 10。固定來源結果：帳號累計 **USD 10.000036**、前景故事 **USD 0.00002**，一小時預估 **USD 0.0012**（60 秒／2 完成回合樣本）。預估只取本次前景樣本，沒有納入已形成或另一世界費用；新世界本身沒有 `modelPrices`，價格來自帳號。

受控 transport 共 **3 次**，角色為 `formation / foreground / other-world-generation`，真實付費 **0 次**；不是舊旅程的 2 次，也不把形成宣稱為免費。角色次數以實際 request body 分組。

[固定來源機器紀錄](assets/opening-review-helpers-288/forecast/evidence.json) · [前景預估畫面](assets/opening-review-helpers-288/forecast/foreground-only-forecast.png)。上述帳號與前景畫面均已目視核對。

## 命令與限制

```sh
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t7-review-account-fixed node tooling/verification/browser-review-account-281.mjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t7-review-forecast-fixed node tooling/verification/browser-review-forecast-281.mjs
node --check tooling/verification/opening-journey.mjs
node --check tooling/verification/browser-review-account-281.mjs
node --check tooling/verification/browser-review-forecast-281.mjs
pnpm exec eslint tooling/verification/opening-journey.mjs tooling/verification/browser-review-account-281.mjs tooling/verification/browser-review-forecast-281.mjs
git diff --check
```

兩條固定來源真 Chromium／App Router／磁碟 SQLite 旅程及上述語法、限定 ESLint、diff 檢查全部通過。共享 runner 預載 no-network，只允許 loopback；模型在最終 HTTP 邊界回受控資料。本機 cookie 身分替身不是正式 OAuth，沒有驗證真實模型語義、正式站或正式資料回退；本報告不替代 T7 五步完整 UI 的獨立驗收，不宣稱 #281 已完成。沒有關票、推送或部署。
