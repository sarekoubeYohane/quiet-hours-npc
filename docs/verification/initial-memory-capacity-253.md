# 初始記憶 UTF-8 容量一致性修復 #253

日期：2026-11-05（Asia/Taipei）。依專案 diagnosing-bugs 流程先建立紅燈、最小化，再列假設及查證，最後修復。規格來源為 [#238](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/238)，問題為 [#253](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/253)。已核對 PR #252、#240／#242／#251 驗收文件及上一輪本機 PR #252 合併後實測報告。

## 受測版本與隔離

- GitHub `main` 與 PR #252 合併提交均為 `dabcf5a2992b421c6c9cb742e4b1d08f3aaf58f8`；PR head 為 `26f982603a90417934891364600002bb08bb0d55`。該合併提交仍可重現問題。
- 從該提交建立獨立副本，後接回本機 Git 歷史及 `fix/initial-memory-capacity-253` 分支。修復版為本文件隨附提交；未混入原有工作目錄的未提交內容。未推送、合併或部署。
- Node v26.5.0、macOS arm64、本機既有依賴、Chrome 157／Playwright 1.64.1。
- Chromium 掛載正式 React 人物編輯器、CityEditor、WorldApp，經 loopback HTTP 呼叫正式 API handler。Node SQLite 套用 `drizzle/0000`–`0008` 全部 9 個 migrations。無新增 schema，無資料改寫 migration。
- 固定登入身分、時鐘、世界 store 的 SQLite 接線與模型 transport 為 fixture。範本 SQL、API 驗證、世界組裝、回合與提交使用正式程式。只用可拋棄本機資料庫與受控模型，未接觸正式世界。

## 紅燈與根因證據

初始迴圈：`node tests/run-activities.mjs tests/initial-memory-capacity-api.test.cjs`。約一秒完成編譯與整合測試；每案例經正式人物 API 新建、SQLite 保存、GET 完整讀回，再呼叫正式城市預覽。最小化為一人物、一預設場景、有效起始房間；不需初始化生成或模型。

修復前兩次得到相同矩陣：

| 初始記憶 | UTF-8 bytes | 保存／重讀 | 預覽 |
| --- | ---: | --- | --- |
| 憶 × 1,365 | 4,095 | 200／完整一致 | 200 |
| 憶 × 1,366 | 4,098 | 200／完整一致 | 502 |
| 憶 × 1,500 | 4,500 | 200／完整一致 | 502 |
| x × 2,400 | 2,400 | 200／完整一致 | 200 |

斷言預覽 200 明確失敗：`502 !== 200`，錯誤為「短期經歷超過 4096 bytes；保留原資料，未截斷文字。」原始紅燈與查證輸出留在本機 `artifacts/issue253/red.log`、`probes.log`。最終回歸測試另在全新 `dabcf5a` archive 執行，9 項中 5 項失敗、4 項通過，證明會抓到未修版本；修復版本 9 項皆通過。

在看修補點前先列三個可驗證假設：

1. 保存按字元驗證、運行按單筆 bytes 驗證，預測分界取決於 UTF-8 bytes。
2. 保存或重讀改動內容，預測 GET 原文與輸入不一致。
3. 城市額外資料／模型輸入導致超限，預測單筆原文正規化不會單獨重現相同錯誤。

證據：GET 與輸入逐字一致，排除 2；沒有任何模型呼叫仍失敗。改動唯一變數為文字：`憶 × 1365 + a`（4,096 bytes）通過，增加一個 ASCII 字元（4,097 bytes）由 `validateShort → boundShort → normalizeMemory` 拋出相同錯誤，排除 3 並確認 1。

程式路徑隨證據核對：`character-templates.ts` 只檢查 JavaScript 字串長度 2,400；`city-creation.ts` 把整個初始記憶欄位轉為一筆記憶；`normalizeWorld → normalizeMemory` 才套用既有 4,096-byte 單筆上限。編輯器及生成入口同樣缺少該 byte 驗證。

## 修復行為

沿用既有單筆 4,096 UTF-8 bytes 及欄位 2,400 字元上限，採需求允許的欄位驗證方案。沒有切段、截斷、清空、擴大容量或模型輸入預算。

- 人物編輯器顯示容量；超限時指出欄位、實際 bytes、上限及修正步驟，保留完整文字並停用保存與生成。
- 人物保存 API 回 400，包含 `field: initialMemories` 與可採取行動的訊息。拒絕新增或修改均不寫入範本。
- 已保存超限範本繼續完整列出、讀取、開啟。預覽回 200 與具名驗證問題，開始按鈕停用；直接呼叫開始、初始化與關聯整理回 400，在模型派送前停止。未產生替代世界或備份。
- 透過人物編輯器縮短、保存，再重新選用新版範本即可預覽、開始與運行。沒有自動修正舊資料。
- 生成入口在派送前驗證已填內容；模型生成的超限內容也被拒絕，原有設定及故事保留。已發生的模型用量照常保存，同操作重送不再派送。
- 運行單筆短期記憶與人物編輯共用容量常數，數值仍為 4,096。

## 實際驗證

主要回歸測試 `tests/initial-memory-capacity-api.test.cjs` 共 9 項：包含上述四種輸入、精確 4,096／4,097 bytes、ASCII 2,401 字元、歷史範本與生成入口。

| 修復後輸入 | 新保存 | 預覽／開始／受控回合 |
| --- | --- | --- |
| 中文 1,365 字、ASCII 2,400 字、精確 4,096 bytes | 200、原文完整 | 200／200／200，NPC `self.shortTerm` 原文完整 |
| 中文 1,366／1,500 字、4,097 bytes | 400、欄位與容量明確 | 歷史資料可預覽問題；開始／初始化／關聯整理 400、零派送 |
| ASCII 2,401 字元 | 400，沿用字元上限 | 未建立範本 |

真正 Chromium 操作五條旅程：中文 1,365／1,366／1,500 字、ASCII 2,400 字、精確 4,096 bytes。每條皆實際操作人物編輯器、保存、重整重開、修改外觀後再保存重整、城市預覽與開始；兩條超限案例先驗證新保存被阻擋，再安裝舊版已接受的歷史範本，核對完整原文與 UI 提示。兩例均透過同一編輯器縮短成 1,365 中文字，保存重整後重新選用，成功開始與正常回合。共捕捉 5 次真正 NPC 決策請求，每次 `self.shortTerm` 包含完整接受的記憶，用量各 1 次。未把直接安裝世界當成建城驗收。

失敗保護：歷史範本測試以既有非零用量世界為起點，逐項拒絕後深度比對完整世界／版本／用量及範本一致，原世界備份未建立；超限更新保留原範本版本與原文。生成失敗保留人物、世界時間及回合，已知用量保存且重送不重複派送。既有範本測試另涵蓋保存故障、重送及帳號隔離。

證據：[編輯器提示](assets/initial-memory-253/zh1500-editor.png)、[歷史範本城市預覽](assets/initial-memory-253/zh1500-preview.png)、[五條旅程的保存世界與真正 NPC 輸入](assets/initial-memory-253/browser-evidence.json)。模型 key 僅為本機固定假值，不含正式憑證。

重跑：

```sh
node tests/run-activities.mjs tests/initial-memory-capacity-api.test.cjs tests/character-generation-api.test.cjs tests/city-creation-api.test.cjs tests/opening-relationships-api.test.cjs tests/city-initialization-api.test.cjs
node --test tests/character-templates.test.mjs tests/scene-templates.test.mjs
npm run typecheck
./node_modules/.bin/eslint app/api/character-templates/route.ts app/api/world/route.ts components/character-template-editor.tsx lib/memory-limits.ts lib/memory.ts lib/character-templates.ts lib/character-generation.ts lib/city-creation.ts tests/initial-memory-capacity-api.test.cjs
./node_modules/.bin/eslint tests/run-activities.mjs
node tests/run-auth.mjs
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs
npm run build
PLAYWRIGHT_MODULE=/private/tmp/npc-regression-browser/node_modules/playwright CHROMIUM_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node tooling/verification/browser-initial-memory-253.mjs
```

相關 API 19 項（包含新增 9 項）、範本 6 項、認證／操作隔離 37 項、型別檢查、範圍內 ESLint、正式版建置及 Chromium 五條旅程均通過。廣度運行／API 回歸 1,065 項全數通過（306.9 秒、無外部網路）；廣度執行後收尾的受影響路徑另以最終版本重跑相關 API 19 項及新增回歸 9 項。新測試已接入預設 runner。這些計數有重疊，不相加為獨立案例總數；未宣稱完整 npm test／Worker 測試均已執行。

## 未測範圍

沒有驗證正式 Worker／D1／OAuth、程序重啟後重開資料庫、正式供應商帳單、付費模型品質、多帳號併發壓力或所有欄位同時滿載。SQLite 保存重讀與瀏覽器重整使用同一測試程序，不等於跨程序持久化驗收。

受控模型通過只證明產品採納、拒絕、保存、容量與實際輸入路徑；**不能作為 NPC 重複行為已改善、真實模型品質或正式站已驗收的證據**。
