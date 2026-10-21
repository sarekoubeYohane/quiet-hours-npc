# 日常核准與杯子承接：#122／#123 整合驗證

基準：main `583e6cb87cc60c5f1c4a9f7bf2bdf7f161aa6253`。本次納入已確認的 `routine-object-grill-2026-10-21.md` 與詞彙更新，沿用 #108、#115。runtime 與 review 修正完成後在同一整合工作樹驗證；以下為實際執行結果，沒有合併或部署正式站。

## 診斷與修正

- #122：通用提示原本要求所有 accepted 都有效果、完成目標都有數字 completionMinutes，與日常解析契約衝突。現在提示及供應商 schema 欄位描述明確區分：日常核准 accepted、check=null、effects/stages 空、completionMinutes=null，完整 routine.timings 是唯一耗時來源。保留 OpenAI 支援的根 object 輸出格式，由既有本機驗證嚴格處理跨欄位條件；未放寬守衛或加入修復呼叫。
- #123：原容器篩選強制 ID 等於工具 target，隨後因已有 targetObject 而否決。現在依物件的 contents 能力區分指定容器與工具；先沿用合法空杯，必要時按已確認背景具體化，保留原髒杯。明確指定杯子、有限供應、材料、位置、知情、持有及權限仍約束執行。
- 新增 clean=no 與 available=no 的檢查；工具資格在活動開始及後續階段一致，工具失效取消未來效果並保留已提交的水與杯子。
- review 另重現空杯 clean=no 清洗時的 empty→empty 無效效果（API 502）；現僅輸出有變化的欄位，按實際效果遞增版本。維持原有效果驗證，不接受 no-op。

## API／SQLite 與回歸

模型僅在 transport 邊界替身；世界 GET／POST handler、活動、效果、序列化、操作 journal 與 SQLite SQL 實際執行。可拋棄測試資料庫使用 D1 相容 adapter；帳號／模型金鑰與 migration 測試另包含真實 Workers/D1 測試。不是正式帳號世界或正式站驗收。

| 驗證 | 實際結果 |
| --- | --- |
| 捕獲候選 completionMinutes=5 加整組 timings | 502；turn／時間／物件／規則不變；診斷與已知 usage 可重讀；同操作重送不再派送 |
| 日常合法 null、完整六項時間 5／6／10／8／3／1 | 一次核准；六項各向上對齊 15；茶實際完成、杯子與飲品保存重讀 |
| 缺項、零／非法時間、衝突時間或非空效果／check | 嚴格拒絕、無半套世界變更；原一般效果及開放式時間契約的測試保留 |
| 指定工具，已有杯子／無杯子／杯子髒 | 分別沿用 ID／具體化／具體化另一只並保留舊杯；亦涵蓋 empty 加 clean=no |
| 指定髒杯、占用、不可知、移走、無使用權 | 不暗中換杯；不因背景給予額外權限或搬回物件 |
| 明確杯子耗盡、器具供應不適合、材料耗盡、工具損壞／available=no | 不補貨、不假完成；受阻仍為正常結果 |
| 跨回合工具被移走、損壞、停止可用、撤權或被他人持有 | 取消後續階段，已提交的水與物件身份保留 |
| 喝完→洗杯→新泡茶 | 同一杯 ID；消耗舊飲品、洗淨後再用；裁定維持 1；clean=no 兩種洗杯起點均通過 |
| 明確上限不足、取消、重送、保存衝突／失敗 | 未啟動不生杯／成品；取消保留已提交效果；不重播／重複產物；原子與已知用量契約維持 |

維護測試：`tests/routine-contract-api.test.cjs`、`tests/routine-objects-api.test.cjs`，已納入預設 runner；時間、一般效果、保存與重送亦由既有回歸覆蓋。

最終執行：

- `pnpm test`：358 活動／世界 API 測試、32 auth 測試、10 Workers／migration 測試，共 **400 pass、0 fail、0 skipped**。預設 no-network preload 保持啟用。
- `pnpm typecheck`：通過。
- 變更程式／測試／runner 的 ESLint：0 errors、0 warnings。完整 `pnpm lint`：0 errors，4 項既有警告（character-profile／pixel-world 的 img、world-app 的 Hook dependency），未修改這些檔案。
- `pnpm build`：成功；`git diff --check`：通過。

## 真實應用瀏覽器

Runner：`tooling/verification/browser122-123.mjs`。實際 Chromium 153、WorldApp、世界 API 與 SQLite，使用明示 NPC／裁定 transport fixture。原始提案 target 一直是 `acceptance-tea-kit`，內容為「我想用這套共用茶具取熱水和茶包，替自己泡一杯普通的茶」。沒有改指向杯子，也沒有 runtime 驗收 ID 特判。

| 情境 | 畫面與持久化核對 | 派送／fixture 用量 |
| --- | --- | --- |
| contradictory | 原矛盾候選拒絕，世界回復，重載可展開失敗診斷，重送不加呼叫 | 1 NPC＋1 裁定，80 tokens |
| existing | 原驗收杯裝有茶、飲品實際生成、計畫完成；同 ID 保存／重載／重送 | 1＋1，80 tokens |
| unrecorded | 沒有預建杯子，具體化持續 ID 的杯子並完成茶；重載一致 | 1＋1，80 tokens |
| dirty | 舊髒杯完整保留，另一只杯有茶；重送及重載不多生杯 | 1＋1，80 tokens |
| lifecycle | 喝茶→清洗→再次指定同茶具、使用已知規則的「泡一杯茶」表述；同一洗好杯 ID 再有茶，分析顯示免費重用 | 4＋1，200 tokens |

原驗收杯只宣告 empty／water／tea，無 dirty 轉換。因此 lifecycle 是獨立 fixture，明示加入普通飲用／清洗所需的 dirty 能力；前三個成功情境保留原驗收杯的能力。這是測試輸入能力界線，沒有為 runtime 任意擴充狀態轉換。免費重用沿用既有模板選擇器，後續新泡茶內容為「泡一杯茶」，target 仍是茶具；重複原始自由長句仍需既有有界解讀（試跑觀察到第二次裁定），本輪未擴充自由語句辨識或新增分類模型。原始長句的首次核准與完整茶成果已獨立驗收。所有數字為 transport 固定回報，並非真實付費模型帳單。

截圖：

- [原候選拒絕診斷](assets/routine-object/contradictory-diagnostic.png)
- [沿用現有杯完成](assets/routine-object/existing-completed-reloaded.png)
- [背景具體化完成](assets/routine-object/unrecorded-completed-reloaded.png)
- [保留髒杯與新杯成果](assets/routine-object/dirty-completed-reloaded.png)
- [洗淨後同杯再用](assets/routine-object/washed-cup-reused.png)

重現環境變數與啟動方式沿 `tooling/verification/README.md`；設定 PLAYWRIGHT_MODULE、CHROMIUM_EXECUTABLE、必要時 CHROMIUM_MODULE 與 BROWSER_FONT_DIR 後執行上述 runner。須逐一看到全部情境 PASS 及最終 captured requests 訊息，不能只按 exit 0 判定。

## Code review

- [Standards 軸](routine-object-standards-review-2026-10-21.md)：初查 0 硬性違反、1 個重複工具資格判斷建議；已共用 helper，複查無未處理事項。
- [Spec 軸](routine-object-spec-review-2026-10-21.md)：初查 1 個 P1 洗杯 no-op；實際 red 502、green 通過且補入維護測試，複查無剩餘阻擋。

## 未驗證與部署後待辦

**本輪未呼叫真實付費模型、未重置正式世界、未部署。** 正式站尚未包含本次修正，不能宣稱新版正式站通過。待使用者合併與部署後，以新世界／獨立驗收場景有界執行：

1. 記錄部署 SHA、NPC／裁定模型及起點；用原提案取得合法首次核准，檢查實際候選、六項時間與完整茶成果。
2. 核對實際杯子 ID、位置、所有／持有、狀態；重載後一致，再執行後續合法活動確認規則重用與實際用量。
3. 檢查真實模型是否遵守一致提示／schema；fixture 不能保證模型永遠產生合法候選。格式故障仍應拒絕並保留診斷／用量。

本 PR 僅連結及修正 #122、#123；#104、#106 不隨本輪關閉。合併保留由使用者操作。
