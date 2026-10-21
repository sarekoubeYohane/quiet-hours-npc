# #151：通用日常程序與整合驗證

本票基於本機整合 `83a7a36`（#147／#149／#150 已整合），交付前承接文件 tip `49eb8e7`。main 仍以整合報告所列 `5e172d5` 為基線；PR #144 的未合併 head `53f4298` 與已批准設計 `de0d7d0` 是明示整合來源，不能當作 main。沒有正式付費模型呼叫、正式世界變更、PR 合併或部署。正式站既有 #143 結論保持，#104／#106 不關閉。

## 實作與具體重現

第一次擦桌方法使用不同於舊六動詞的長提案；原流程不能承接 v3 候選，API／真 UI 皆先得到502。新增的 v3 由模型在既有同一次裁定明示方法、角色、必要狀態／來源／份量、背景、時間、階段及結果分支；不從固定 drink／wash 後果反推角色。擦桌 tracer 接通後，再逐 slice 接形成與來源、同杯循環、自然與身體、分拆、五段及故障。

另外先重現並修正：第8個已核准方法被原句擠掉、generic 木料缺貨被改名背景補回、hidden-only revision／方法有無洩漏、缺必填欄位及歷史身份通過候選解析、完整 generic 程序被舊證據 shape 丟棄，以及第一個舊 subset 永遠擋住同句第二個已確認 subset。每個重現均經公開世界 API，拒絕候選不提交狀態或規則。

v1／v2 保留既有候選、狹窄 selector、固定後果與舊活動語義。v3 方法按確認的 content＋purpose 精確正規化匹配，不呼叫額外分類模型；未匹配的新措辭仍可經一次有界新裁定。模型最多確認8個方法，server另保留首次原句，最多9個，不丟已核准別名。同一句有多個已確認 scope 時在私有世界副本逐一驗證，選擇當前相容者，不覆寫舊規則。

## 可重跑的正式 API／SQLite 驗證

`tests/routine-world-changes-api.test.cjs` 的22項測試使用正式 GET／POST、活動、效果、序列化、提交及 SQLite 重讀；只替換模型 transport、受控 D20 和故障邊界。

- 新方法原長句與8+1別名、新物件重綁；相符新活動0新增裁定，NPC仍另計。
- 背景原料形成真實新來源，hidden初態曝光保持；最後一份／明示缺貨木料不能靠改label補回；food來源以模型明示sourceSubject對照現有label／material／category，蛋糕缺貨不改普通蛋糕補回，茶原料與餐點分開。
- 同杯泡茶→喝茶→洗杯→再次泡茶：4 NPC／1裁定，杯身份保持，舊飲品消耗、新飲品與原料 fresh ID、僅一份活動中飲品。
- 餐點partition→按需separate→再次separate：總量4不重複，原完整物終止，child保留直接aggregate來源，後次細分免費。
- body／environment／自然安排一起保存；自然到期零新增裁定；無關狀態版本改變不阻止後段，必要條件不合走有界例外。
- 同方法兩個subset各核准一次，兩個新對象均免費重用：4 NPC／2裁定。失敗後無關hidden變化不取得新骰。
- 五段D20皆經正式選分支：完整、部分成果及失敗消耗；原ID重送0新增骰／派送／效果。中斷、物件離場及失去許可停止未來，保留先前已提交成果。
- before-save、after-save遺失回覆、CAS與過期租約：規則、背景、fresh成果與整回合原子保存；原ID不重派送。
- NPC投影不含權威revision、hidden值／理由；學過的方法不因hidden-only條件改變加入或移除。候選不接受server-only綁定資料、歷史revision或literal物件／供應／身體身份，vessel與holder也須角色引用。
- 17條既存規則不擠掉本次新增／重用規則的程序證據；六程序中文fixture為8191字／8605 UTF-8 bytes，完整captured，receipt仍≤64KiB。舊證據不追補、敏感資料遮蔽及淘汰沿既有回歸。

單獨重跑必須保留no-network preload：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tests/run-activities.mjs tests/routine-world-changes-api.test.cjs
pnpm test
pnpm typecheck
pnpm lint
pnpm build:production
```

完整回歸與獨立code review由[整合報告](world-changes-integration-2026-10-21.md)記錄最終提交。lint沿既有4個warning，沒有新error；production build只建置，沒有部署。

## 真 WorldApp＋API＋SQLite

`browser151.mjs` 與 `browser151-world.mjs` 在Chromium操作正式「下一回合」，讀世界 API、實際 SQLite、重載及重送原ID。回覆與骰子皆fixture；活動、效果與提交未被替代。每組獨立世界，沒有正式資料。

| 情境 | NPC | 裁定 | 結果 |
| --- | ---: | ---: | --- |
| 新桌面長方法、另一張桌免費重用 | 2 | 1 | 原長句保存、新物件綁定、重載及重送 |
| 六程序同杯泡→喝→洗→再泡 | 4 | 1 | 6次推進、來源和新飲品保存、杯身份不變 |
| 同事件環境、主觀身體與自然乾燥 | 2 | 1 | 安排保存、到期執行、無額外裁定 |
| 未許可拿杯與意外損傷 | 1 | 1 | 物主／allowedTo不變、實際holder／缺角及未許可歷史保存 |
| 餐點partition與兩次separate | 3 | 2 | 完整原物終止、總量4、後次細分免費 |
| 物主自主grant→借用攜帶→洗淨→歸還 | 6 | 2 | 兩角色4回合、2次免費續做，原杯／物主保持；沒有把對話當授權 |
| 提交後回覆遺失 | 1 | 1 | SQLite已保存、原ID重送不新增活動／派送 |

合計19次NPC、9次裁定fixture dispatch；正常UI各組成功後的原ID重送新增皆0。機器可讀完整世界及截圖見 [assets/world-routine-151](assets/world-routine-151/)。這些計數不含API參數化回歸，不等同付費呼叫。

重跑：先沿 `tooling/verification/README.md` 設好Playwright／Chromium／字型，再跑：

```sh
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tooling/verification/browser151.mjs
BROWSER151_SCENARIO=cafe NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" node tooling/verification/browser151-world.mjs
```

第二個runner的scenario亦可為`natural`、`physical`、`meal`、`borrow`、`save-after`。UI擷取已人工檢視中文方法、世界結果、來源及份量；receipt遮蔽與歷史不可追補由公開API回歸確認。

## 容量、預算及正式站限制

v3候選最多32768 UTF-8 bytes，舊自由／v1／v2仍8192字；證據capture使用相同32KiB bytes界線，巢狀必要效果投影深度由11增至14，receipt仍64KiB。診斷snapshot仍9k input／8k candidate／24k整體，不複製巨大schema。新v3最多8程序、每程序8角色、4階段、每階段4效果、5分支及原90分鐘上限。這些是有界表示，未承諾所有上限的笛卡兒積可同時塞入一次候選。

只有server已提供routineOffer的裁定request把maxOutputTokens從原OpenAI 2048／4096或OpenRouter2048提高到12000；NPC不變，JSON不能自行放大。這是單次輸出容量，不增加模型呼叫。既有預算在dispatch前檢查已知累計usage，沒有預約未來tokens／費用；單call超出剩餘門檻的幅度可因較大上限增加，未知usage仍照原政策。32KiB候選限制另行驗證，不承諾12000 tokens必能產生任何理論最大程序。

正式站尚未到達本輪v3。部署後沿[有界驗收流程](world-changes-live-runbook.md)：先確認交付tree／部署commit、保持現有玩家預算，再套60新增派送／120000已回報tokens／US$1、24次新advance／30分鐘的先到停止線。近門檻須保守預留單call容量；未知用量、版本不符、技術錯誤、提交不明或身份／來源／資訊異常即停。自主行為未到達如實列出，不強制換方法、成功或重骰。
