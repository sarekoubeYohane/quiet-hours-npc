# #286 人物卡形成、配點與保存驗收

狀態：T5 已接合帳號預算並完成兩軸 finding 修正及固定提交驗證；票狀態交由整合者處理，不表示 #281 全部完成。開始時 #285 已關閉，原生 blocked-by 已由整合者重新查核。中途 #283／#284 因獨立審查重開，已承接 integration `17cc67c` 的 AI 血緣修復，仍待共用帳號預算 P1 與 T9 最終整合接合驗證；不啟動 T6、不提前關票。

## 固定來源與執行邊界

- Runtime 提交：`a528d99`、`5eb98a819f13bdc529eb95e40f25c7c32c8227da`；後者為獨立兩軸審查固定點。
- `d920196` 僅承接 T9 的 `bf337cd` 舊檔測試前提修正（明示 `legacySeed:true`），沒有產品變更。
- 真頁面 pin：2026-11-09，`http://127.0.0.1:45597`，提交 `d920196`；登入以本機 cookie 身分邊界代替 OAuth。所有資料為隔離磁碟 SQLite、全套 migration；沒有 fixture 安裝世界。
- 頁面使用真 App Router、人物頁、首頁／觀察頁；世界以真產品範本／場景／存檔 API 建立。只替換 Cloudflare hosting、身分邊界、模型 HTTP transport 與人物骰亂數邊界，禁止外網模型。18 個受控 d6 面皆為 4，多一次抽取會失敗。
- `modelCalls=2`（文字補空一次、形成評估一次）、`paidCalls=0`。受控 transport 證明輸入／輸出契約，不能視為真實模型語義品質已驗收。

## 逐項結果

| 驗收契約 | 外部可觀察證據 | 結果 |
| --- | --- | --- |
| 九項完成後同頁形成、全部文字鎖定 | 真頁填寫→缺模型原頁設定／取消→AI 只補兩個空欄→明示鎖定；形成後 name、concept 與九欄均停用，繞過前端 API 改字亦 409 | 通過 |
| 受限候選、使用者來源與實質修改 | 真模型 transport 只傳候選；user concept 可獎勵，AI 新敏捷不能獎勵。API 覆蓋舊 AI 歷史貼回、清空再貼標點、無關實質修改搭舊 quote、unknown 舊範本及新使用者引文 | 通過 |
| 骰式、容量、下限與上限 | 受控最低／最高 d6 證實一般 3／18、獎勵 8／18；容量 40／90 與 65／90。一般／獎勵抽取數不同且候選重複不疊級。模型不能指定數值或骰 | 通過 |
| 數值不得由文字指定、背景數字可用 | 明示力量／敏捷／容量數字與範圍（含英文）在派送前拒絕；35 歲、175cm、訓練 3 年通過 | 既有數字反例通過；自然語句誤擋 P2 已修，英語明示賦值補驗亦已通過 |
| 初次總分固定、容量不參與配點 | 真頁初次 62 點、容量 80；配至 13／12／13／12／12 仍 62，越界、改總分、改容量與額外 payload 拒絕 | 通過 |
| 一次形成、未完成不洗骰 | 形成成功回覆故意中斷→讀回同一次結果；重載未完成仍同值；同 ID 重送、同草稿第二 ID、進行中改字／慢回覆競爭不重新派送或覆蓋 | 通過 |
| 原子保存、版本與失敗恢復 | 實際 SQLite 覆蓋形成提交前／後故障、完成卡 batch 提交前／後故障。真頁中斷完成卡已提交回覆→讀回單一卡；提交前 503 與另一裝置 CAS 409 保留本機 13／13，重載可見伺服器 12／14 | 通過 |
| 完成卡與草稿區分、實際選用 | 同頁明示保存完成卡後，真場景／存檔 API 選 `card-*` 建世界；首頁續玩→觀察人物檔案顯示版本 2 與外觀。兩世界承接相同穩定值、需求特性及容量，生活需要與目前電量各自初始化 | 通過 |
| 來源不改卡／世界、舊檔不自動升版 | 真文字範本須按「從文字範本明示建角」，標記 unknown；範本導入回覆 lost 後原 ID 恢復同草稿。來源更新不覆寫草稿快照／卡／已建世界；既有版本 1 路徑保留 | 通過 |
| 帳號／原操作隔離與隱藏資料 | 相同 draft UUID／版本跨帳號仍不能配點／完成；原 accountScope 綁定。公開草稿、完成卡與恢復收據不含 private 骰／獎勵對照／引文，形成分析 trace 內容不公開 | 通過 |

已實際重現的 RED：英文能力／通用容量直接數字未攔截；配點 CAS 409 後讀回把未同步 13／13 換成他頁 12／14。修正後各反例與完整旅程 GREEN。首次舊檔 SQLite 38／39 的失敗是 T2 取消隱式種子後的已知 fixture 前提，承接獨立修正後 39／39；沒有更改產品 GET 409。

## 可重跑命令

```sh
node --test tests/character-cards.test.mjs tests/character-drafts.test.mjs tests/character-templates.test.mjs tests/model-settings.test.mjs
node tests/run-activities.mjs tests/character-attributes-api.test.cjs tests/character-attributes-ui.test.cjs tests/character-generation-api.test.cjs tests/city-creation-api.test.cjs tests/world-saves-api.test.cjs tests/operations-api.test.cjs
PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t5-browser-pin node tooling/verification/browser-character-cards-286.mjs
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

T5 API **10／10**；上述相關 API 組合 **22／22**；舊屬性／UI／生成／城市／多存檔／操作接合 **39／39**。Typecheck 通過；lint 0 errors、4 個既有 warnings。`pnpm build` 通過（固定 runtime `5eb98a8`）；`git diff --check` 通過。

## 畫面及機器證據

- [形成後鎖定](assets/character-cards-286/formed-locked.png)
- [完成卡及固定配點](assets/character-cards-286/completed-card.png)
- [真世界人物檔案](assets/character-cards-286/world-card-source.png)
- [明示舊範本與 unknown 來源](assets/character-cards-286/template-origin.png)
- [origin／固定 commit／模型次數與旅程輸出](assets/character-cards-286/evidence.json)

## 遷移、回退與未驗證範圍

`0017_character_cards.sql` 僅新增帳號綁定的私有候選暫存與不可變完成卡表；草稿 body 保存版本化形成結果、初次總分、下限、容量及私有骰證據。已在隔離 SQLite 套用並真實保存重讀，未執行正式資料遷移。回退程式前應備份資料；舊程式不具備新卡選用與版本 2 語義，不能以刪表或重新形成「回退」既存人物。正式資料回退方案未演練。

本票不驗收 T6 的新 d100 判定、T7 五步完整 UI、正式 OAuth、真實模型語義、正式站或跨真實裝置服務。選卡可用產品 API 已完成，完整五步由後續票接續。新人物外觀只保存／配點，不新增社交效果。共用帳號預算最終修正合入後需再驗同一形成 transport／用量責任，不宣稱本分支已完成該 P1。

## 固定點獨立審查新增待修事項

兩軸以 runtime `5eb98a8` 完成審查：Spec 真 API／SQLite 重現「耐力一般」「外觀十分普通」「力量一如往常」被直接數字正則誤擋（P2）；Standards 發現 `formation.normalized` 與 `drafts.meaningfulText` 正規化重複（P3）。原有數字／年齡身高正例與本頁完整旅程通過不排除這個新反例。兩項均由唯一修復者 `t1_navigation` 接手，本工作樹不平行修 runtime；需合入修正並重跑上述自然文字反例才可結案。反例腳本：`/tmp/quiet-hours-t5-spec-repro.mjs`。本次提交是 ready-for-fix，不是 #286 完成。

## 整合審查修正（唯一修復實作者）

合入帳號玩家預算與 T9 後，保留原人物來源、形成鎖定、完成卡及 legacySeed 明示接點。真 API／SQLite 反例先確認 `耐力一般`、`外觀十分普通`、`力量一如往常` 均錯誤回 400；修正後連同 `力量：一如往常` 均可形成並保存重讀原文。數值辨識只在屬性名稱與明示賦值／範圍語法相鄰處判讀；不再任意跨過 16 字尋找數字，也不把一般詞中的單一中文數字當屬性。真正 `力量十八`、`力量：一`、`耐力為十二`、`精神容量八十至九十`、`外觀10–18`、`dexterity is 18` 仍在模型與骰前拒絕；年齡、身高與訓練年數維持合法。

文字來源保存與形成判讀共同使用輕量 `lib/text-equivalence.ts` 的 `meaningfulText`，沿用 NFKC／und 小寫／去標點空白符號及 Cf 的原等價責任，避免兩份規則漂移；沒有引入 server 模型到 client。cards 與 drafts 合計 **16/16**，包含既有 AI 血緣／未知範本與新自然語句案例。獨立反例 log `/tmp/quiet-hours-context/review-t5-natural-{red,green}.log`；固定提交的接合驗證待下列最後證據補入，不以此段宣告票已完成。


固定整合 `2355317` 完成 API 32/32（含 cards／drafts／model-settings／migration）、六回歸與 T9 共 14/14、typecheck／lint／build、fresh 本機 D1 migration 及本頁完整真路由旅程（受控 2 次、實付 0）。中途覆核另指出新精確語法漏了 `strength must be 18`／`endurance between 8 and 18`，再次用同一產品 API／SQLite 先 red200→green400；補入 must be／between／should be／set to／from to／比較符號等明示連接，未恢復跨任意文字掃數字。新增英語與既有自然中文／來源測試仍 **16/16**，獨立英語反例 **1/1**。英語補正後固定 `1645a05` 再通過 typecheck、lint（0 errors／4 原有 warnings）、build 及完整形成真頁（受控 2 次、實付 0）；票狀態由整合者依兩軸覆核處理，這裡不自行關票。


最新畫面與機器證據已更新至 `1645a05`，origin `http://127.0.0.1:39185`；四張畫面依同一固定 runtime 產生。Spec 對最終英語及原自然中文反例獨立覆核 remaining 0，Standards 對共用文字等價規則覆核 remaining 0。最後文件／證據提交不改產品來源。
