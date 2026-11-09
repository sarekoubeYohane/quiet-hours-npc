# #288 費用驗收旅程接合完成卡與原始開局

兩支既有真頁驗收工具改用 T7 的合法產品建立契約；沒有修改產品程式、原有停止／費用／名稱恢復斷言或新增測試產品入口。基準為 integration `c326ca3`，接入 T7 `c159a0e`，再合 T7 UI `cff3707`；初輪固定來源為 `3c8e7d0`；接合完整帳號 scope guard `55ddc00` 後，最新固定來源為 **`cee4947`**（見下列協定補證）。只替換原本使用文字範本直接 POST `/api/saves` 的建立 helper。

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
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t7-review-account-scope-fixed node tooling/verification/browser-review-account-281.mjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t7-review-forecast-scope-fixed node tooling/verification/browser-review-forecast-281.mjs
node --check tooling/verification/opening-journey.mjs
node --check tooling/verification/browser-review-account-281.mjs
node --check tooling/verification/browser-review-forecast-281.mjs
pnpm exec eslint tooling/verification/opening-journey.mjs tooling/verification/browser-review-account-281.mjs tooling/verification/browser-review-forecast-281.mjs
git diff --check
```

兩條固定來源真 Chromium／App Router／磁碟 SQLite 旅程及上述語法、限定 ESLint、diff 檢查全部通過。共享 runner 預載 no-network，只允許 loopback；模型在最終 HTTP 邊界回受控資料。本機 cookie 身分替身不是正式 OAuth，沒有驗證真實模型語義、正式站或正式資料回退；本報告不替代 T7 五步完整 UI 的獨立驗收，不宣稱 #281 已完成。沒有關票、推送或部署。

## 完整帳號 scope 協定補證

此輪只升級上述兩支 verification client 的 setup，沒有修改產品 guard、sticky UI、共用 journey driver 或新增的負向反例。先接合 integration `fa0af83`、固定修復 `1a3ea10` 與 server guard **`55ddc00`**，不合入唯一修復者當時尚未提交的 UI 工作。原 setup 在新 guard 上先 red：缺少初始 accountScope 的模型設定回 **409**，不是產品拒絕合法資料的 finding；原 log `/tmp/quiet-hours-context/t7-review-forecast-scope-red.log` 保留。

- 模型及場景 POST 使用第一次合法 GET 回傳的 `accountScope`；Key POST 使用第一次帳號操作空間 GET 回傳的完整 `operationScope`，沒有從 cookie 拼出或補成目前帳號。
- 存檔建立後捕捉原 full binding／worldContext。後續操作與重開後恢復使用該原值，GET 帶原 scope 並檢查回應一致；不在重送時改讀目前帳號來更新 scope。
- 另存／刪除使用原存檔清單 GET 回傳的 raw-owner scope。第二個歷史帳號是明示開始的新旅程，另行捕捉自己的初始 metadata；第一帳號的舊 scope 不被覆寫。
- 原有形成費用與角色次數斷言均保留。固定 **`cee4947`** 兩條真 Chromium／App Router／磁碟 SQLite 旅程再次通過；帳號費用 2 次與原小時持續保存，歷史缺口兩處明示；Forecast 仍為帳號 USD **10.000036**／前景 USD **0.00002**／一小時預估 USD **0.0012**，形成 USD **0.000006** 未清掉。各旅程受控 transport 均 **3 次**、實付 **0 次**。

畫面及兩份機器證據已更新至 `cee4947`；語法、限定 ESLint、diffcheck 通過。這只證明兩支原有費用旅程已遵守新協定，不能替代唯一修復者的新 account-surface 負向反例或完整 T7 驗收；沒有先合入 integration、推送、關票、正式操作或付費。
