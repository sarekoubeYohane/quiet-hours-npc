# #186／#201 本地跨回合整合驗收

整合基準 `148a75d`（PR #182）；#194–#200 切片逐一驗收後，#201 在 `1b407ce` 的整合分支接通同一故事內的來源、方法評估、匹配、實際效果與下次輸入。沒有合併 main、部署、呼叫付費模型或操作正式世界。

**本地機械路徑通過，不等於真實 NPC loop 已解決。** 模型自選方法、同義詞及另一角色回覆均為明示 transport fixture；活動、綁定、形成、攝取、記憶投影、序列化、SQLite 與下一次實際 request/messages 使用正式程式。不是歷史原件重播，也不以固定回合必須吃喝作真實行為標準。

## 實際完成的組合

| 故事 | 實際鏈條 |
| --- | --- |
| 餐點 | 真正取用指定餐點→攝取並耗盡→下次 v2 評估引用本人來源、保留 care 意圖自主重試→已確認 paired alias 免費否決→向 Cass 請求、Cass 自己選擇不製作→場所層級新來源提案→真正麵粉形成薄餅→原攝取方法換合法新對象與別名免費執行→下一次真正輸入保留攝取結果 |
| 茶 | 真正喝完舊茶→下次可知已完成結果→另一份真茶葉泡入新杯→飲品指向當前新杯→同源1 item改追蹤為4等份→攝取1、剩3→確認 quarter 程序再攝取1、剩2→同 quarter 程序的別名免費攝取1、剩1→喝完最後1並清空原杯 |
| 飲水 | 同一 cafe 已知場所提出倒水→實際有限飲用水來源具體化及形成新水飲品→保留新杯關聯→下一次真正攝取及需求緩解→下次可知結果；水源庫存仍0、舊茶沒有復生 |

餐點及茶的實際自主評估均使用 `npc-decision.v2`，不是以舊相容候選跳過新介面。第三次 quarter 飲用明確斷言裁定派送增量0；第一次 item 粒度確認與第一次 quarter 程序確認仍各占原本正常裁定 slot。必要 quarter 綁定量為2：`separate 1` 必須小於整體，3及2都可合法承接，剩1須選完整攝取方法；沒有任意放寬為零量或混單位。

## 本輪測試與量測

- `tests/method-reassessment-integration-api.test.cjs`：**4/4** 通過，含餐點／茶水兩條故事、三種組合故障（CAS、較後角色錯誤、租約到期）、原ID重送、隱藏對照與容量量測。前置測試各自已有報告，不將重疊測試數相加冒稱獨立案例總數。
- `tooling/verification/browser-method-reassessment.mjs`：真 Chromium、既有 WorldApp、**15次既有「下一回合」UI操作**，同一 SQLite 世界中完成上述故事；桌機1280px、手機390px無水平溢出，來源／餘量／物主／方法評估／提交可對照，重載與原ID重送零派送、無 pageerror。
- 瀏覽器全故事 **30 NPC＋10裁定**；fixture 回報已知 input1200／output400 tokens。這些是替身回報值，不代表真實模型 tokenizer 或費用估算。
- 新增檔案 ESLint 及 whitespace 檢查通過。整合前產品回歸為768/768、type/lint/build由整合負責者再記錄最終結果；最後數字以整合 PR／最終測試紀錄為準，不能把本4項當作已納入舊768。

| 量測（UTF-8 bytes） | API故事最大值 | 瀏覽器全故事最大值 |
| --- | ---: | ---: |
| messages user content | 23,844 | 47,536 |
| 完整request含schema及static prompt | 103,926 | 104,466 |
| 已保存routineRules | 18,786 | 23,651 |
| 私有decision trace | 353,369 | 629,370 |
| methodAssessment | 502 | 沿相同2KiB契約 |

來源索引8筆／8KiB、knownMethods16筆、assessment2KiB及其心理預算保持；trace小於既有1MiB，代表故事未出現single-record-limit缺口。這是代表量測，**不是**所有世界／全部request都保證低於88KiB，也不是保證所有歷史永久完整。容量淘汰與隱藏對照另沿單票測試驗證。

測試使用可控 wall clock：每次操作間隔15分鐘、每次世界仍只前進15分鐘，讓故事跨既有正常小時用量視窗，不提高任何上限。所有未知外網被no-network及明示transport邊界阻止，沒有額外反思／分類／摘要／格式修復呼叫。首輪失敗是測試 fixture 把新茶1 serving錯接1 item案例，以及過密操作碰到原有小時預算，已修正fixture；不能稱為產品修復證據。組合後未發現需要另改產品執行器的缺口。

重現：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/method-reassessment-integration-api.test.cjs
PLAYWRIGHT_MODULE=/absolute/path/playwright CHROMIUM_MODULE=/absolute/path/chromium/build/index.js BROWSER_FONT_DIR=/absolute/path/noto-sans-tc node tooling/verification/browser-method-reassessment.mjs
```

瀏覽器輸出白名單[量測及檢查](assets/method-reassessment/evidence.json)、[部分攝取／來源](assets/method-reassessment/partial-alias-sources.png)、[方法評估追溯](assets/method-reassessment/partial-alias-trace.png)、[手機來源與餘量](assets/method-reassessment/mobile-partial-sources.png)、[攝取後分析](assets/method-reassessment/water-ingested-trace.png)。只有人工世界與篩選數據，沒有正式私有原件、Key或帳號憑證。

## #186 全部驗收映射

以下依主規格25項順序。路徑縮寫：L=`last-known-state-api`，M=`method-assessment-api`，B=`drink-binding-api`，P=`partial-drink-api`，A=`alternative-food-api`，R=`routine-world-changes-api`，V=`verified-obstacles-api`，I=`method-reassessment-integration-api`；皆為 `tests/` 下對應 `.test.cjs` 檔案。

| # | 要求 | 證據／邊界 |
| ---: | --- | --- |
| 1 | 目的方法分離及自主取捨 | M 的retry/wait/switch/drop、I餐點care意圖保留與Cass自主回覆 |
| 2 | 無歷史與續做 | M空knownResults、選擇continue與自動階段不新增評估 |
| 3 | 實際輸入有來源 | L本人攝取／目擊／未知、I真正攝取後下一次request |
| 4 | 非全知投影 | L隱藏庫存／許可對照、I相同visible context不同hidden |
| 5 | 時間與主觀性 | L來源時間、聽聞／推測／錯覺不校正，供應availability unknown |
| 6 | 遺忘與容量 | L來源淘汰後索引消失／8KiB、M2KiB及工作量、I代表量測 |
| 7 | 供應與可操作物件 | L耗盡物消失但保留來源經歷；I舊meal／tea不復生 |
| 8 | 分層回饋 | L、V未執行與權威原因分開；B/P核准不當攝取 |
| 9 | 真正替代來源 | A與I麵粉→薄餅→攝取；舊指定餐點remaining0 |
| 10 | 他人自主與權利 | A訪客authorized／physical／拒背景，I實際say請求與Cass自行拒絕 |
| 11 | 關聯最小反例 | B雙方向／新舊杯／歧義／缺關聯／後續guard；I新茶→新杯 |
| 12 | 部分飲用 | P部分→續用／中斷；I 3→2→1→0及需求變化 |
| 13 | 舊份量相容 | P只讀1item不補毫升／同源partition；I實際舊茶及新粒度承接 |
| 14 | 合理表述 | R明示paired aliases；I餐點及quarter alias零新裁定；未知措辭仍例外 |
| 15 | 換對象重綁 | R換杯、I同攝取程序換薄餅；不重播前次成果 |
| 16 | 否決免費 | V相關guard重驗、I同指定餐點耗盡重試零新裁定 |
| 17 | 失效與範圍 | V實際repair/grant/newsource、無關變化不洗障礙，新增來源scope不受舊條件封死 |
| 18 | 技術故障不成禁令 | V link/compiled/unknown unsupported各自仍走例外；格式與期限沿故障診斷 |
| 19 | NPC契約一致 | M實際送出schema及解析對非空propose一致，其餘空purpose合法 |
| 20 | 裁定角色一致 | B未宣告／順序反例共同回復，合法雙方向及I完整鏈 |
| 21 | accepted與執行分開 | B30分到期才攝取、P粒度轉換本身不恢復；I形成與後次攝取分開 |
| 22 | 故障與重送 | 各票E2E，I partial+assessment整輪CAS/later/lease回復及原ID不重派 |
| 23 | 成本與容量 | I派送計數／量測、瀏覽器30+10；既有限制不增加 |
| 24 | 既有UI與追溯 | 同一browser runner桌機／手機、來源／餘量／v2評估／提交、只讀重載零派送 |
| 25 | 交付與未驗證 | 單票報告、兩軸整合review及最終回歸由整合PR記錄；本報告下面有限觀察交接 |

## 歷史、相容與未驗證

公開歷史來源是 [PR #184固定版報告](https://github.com/sarekoubeYohane/quiet-hours-npc/blob/5fcffb9e3a47bfdc8f725d72b4a8451f193e0eac/docs/verification/autonomous-life-live-2026-10-27.md)。本輪取得公開報告、規格與程式，**未取得當時私有完整transcript原件**；第15輪原始本文／steps已有報告明記缺失。不能以本輪fixture或當前世界補造當時輸入，不稱原件重播。

保存與回退見[整合契約](../design/method-reassessment-integration.md)：無DB migration；新metadata寫入後舊binary未必理解方向／別名／來源guard，資料語義回退需保留新版讀取／執行能力。PR #202手機／柔性安排仍獨立，不是本輪前置，未改其分支或把其未合併行為說成已測；共同決策、記憶、活動與保存接點已明列。

## 後續有限真實模型觀察條件

須使用者另行批准部署及有限付費觀察；本輪授權不包含它。部署後固定整合commit、同一隔離故事、NPC及裁定模型／Key／原預算，先記錄版本、起點、已知來源及可知狀態，不重置／倒退正式世界。

建議一次最多30分鐘wall clock、8個完整advance、64次實際派送、1,500,000已知tokens，並取既有剩餘預算更低者；不調高任何現有設定。開始每輪前依當前配置保留完整四角色回合的派送與時間餘裕：回想未啟用時最多8次，已啟用時依3N上界保留最多12次；不為測試擅自關掉既有回想。前端仍使用原445秒等待。遇預算不足、未知用量、租約／提交結果不明、候選或綁定技術錯誤即停新回合，先按原ID查定案；不得用新ID盲重送。

觀察只比較「當時可知來源→方法評估／意圖／實際行動→規則或裁定派送→綁定／真正攝取→提交→下一次回饋」。記錄重試是否有新前提、新方法是否真承接、同範圍是否重複裁定及partial餘量是否續用。可記錄固執、等待或放下，不能要求指定輪次必吃喝。未到達、技術中斷、原件缺失分列；不提前關閉 #85、#104、#106、#153、#183，也不以一次改善保證所有情境永不loop。
