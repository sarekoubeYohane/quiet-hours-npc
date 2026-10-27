# PR #169 部署後重驗：無有效 Key，付費前停止（2026-10-26）

**正式部署版本已確認，但本輪沒有執行新 advance。** 登入後設定頁顯示 OpenAI 尚無有效 Key，世界 API 也回傳兩個服務均 `configured=false`。依使用者「配置不同先記錄、不擅自改配置或推進」的要求停止。這是正式站唯讀預檢結果，不是完整回合或泡茶行為驗收通過，也不是 #169 runtime 失敗。

## 範圍、來源與部署

本輪授權上限為 4 advance、32 次聊天派送、已知累計 500,000 tokens、首次付費操作起 30 分鐘，任一先到即停；預算不足容納完整下一輪及收尾則不開輪。已知 token 是事後量測，不是精確費用預約。只有首輪真正提交才可繼續取得店主最多三次後續正常決策。

- 最新 main 完整提交為 `e445cfd4beda2dca6ad1085b65923ebf838ba0a3`，即 [PR #169](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/169) 的 merge commit。
- 正式站登入頁、登入後 UI 與唯讀 `/api/environment` 一致：production、commit=`e445cfd`、builtAt=`2026-10-25T06:59:50.744Z`，台北 10/25 14:59。這是直接讀正式部署的證據，並非只見 GitHub merged。
- 已讀 AGENTS、Matt Pocock 流程、GLOSSARY、ADR 0001–0005（含兩份 0002）、diagnosing-bugs／pr、[#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)、[#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168) 與 #169 票面／留言；三者留言皆空。
- 工程來源：[時間政策](../design/round-time-budget.md)、[#168 本地驗證](round-time-budget-168-2026-10-25.md)、[截止診斷](round-deadline-diagnosis-2026-10-25.md)、[隔離場景](../design/minimal-acceptance-scene.md)、[操作／私有實錄契約](../design/operation-evidence.md)及[驗收恢復流程](operation-evidence-live-runbook.md)。
- 歷史來源：[#164 報告](pr162-live-observation-2026-10-24.md)與 [#165 固定提交報告](https://github.com/sarekoubeYohane/quiet-hours-npc/blob/067ee67d1c05be5f35ae1e608a151b624e2b439e/docs/verification/loop-followup-2026-10-25.md)。後者不在目前 main，直接讀該 PR head，不補建同名歷史文件。

## 正式站唯讀預檢

瀏覽器原本未登入；沿網站 GitHub OAuth 完成登入後，以畫面「已登入」及 owner 世界 API 讀回確認成功。登入流程沒有呼叫模型。沒有讀出或匯出登入憑證、模型 Key 或授權 header。

| 項目 | 本輪直接觀察 | 判定／限制 |
| --- | --- | --- |
| 隔離場景 | `daily-life-v1`；UI 顯示原世界已暫存 | 未進出、重建或重置場景；暫存原世界未另行匯出／還原測試 |
| 故事起點 | version 331、minute 750（D1 12:30）、turn 2；四角色仍在咖啡館前台 | 與 #165 終點一致；未推進 |
| 自動運行 | UI 為「開始自動」，分析顯示已暫停 | 未啟動；目前頁面沒有執行中／恢復中提示。未直接讀 DB 鎖列，不能宣稱跨裝置完整排除其他操作者 |
| 原操作 | `1792903190773:9d9c6634-d693-4389-b32d-3a483aff124d` | 原 ID GET 明示 settled、status 502、rolled-back、resultVersion 331；不是 pending／uncertain |
| 前端當前模式 | 規則試玩 | 與原真實測試的 OpenAI 直連不同；本輪沒有切換 |
| 原 NPC 模型 | 原操作 replay 與私有實錄為 OpenAI／gpt-6-luna | 這是舊操作歷史模型，不冒充當前已選 AI 模型 |
| 裁定配置 | OpenAI／gpt-6.1-sol | 與原配置一致，沒有保存變更 |
| 回想 | API `recallUsage.enabled=false`，UI 場景說明只用本地記憶 | 與原最多八次聊天的隔離場景相符 |
| Key | OpenAI 與 OpenRouter 均 `configured=false`、`expiresAt=null`；`modelKeyStorageAvailable=true` | **停止原因**。不能辨別是自然過期、清除或其他歷史原因；沒有送 provider 請求測試 Key |
| 玩家預算 | 240 calls／5,000,000 tokens 每小時；本小時 calls／input／output／unknown 均 0 | 沒有修改；本站配置有餘量，不代表 provider 可用餘額已驗證 |
| 前端等待 | 新載入頁面顯示 e445cfd；對應工程契約為 400 秒工作、430 秒固定租約、445 秒 POST | 沒有新 POST，未量測實際前端等待、政策 header 或後端租約生效；版本一致不等於計時實測通過 |

原 ID GET 只讀取既有結果與私有實錄，沒有按「重送同一操作」、沒有新 ID，也沒有 POST advance。最新近期操作列表仍以同一舊 ID 為首，沒有新操作。其 HTTP 502 是舊操作保存的結果，**不是本輪 GET 的新模型失敗或 #169 新回合結果**。

起點杯子 active、revision 2、holder=null、contents=tea、clean=yes，使用許可包含 owner／vera；共用茶具可用，原餐點已消耗且有限供應剩 0。只有原三件物件，沒有獨立茶飲成果，沒有保存日常規則。原杯已有 tea 不代表店主上一個候選回合的新杯／獨立茶飲已提交。

## 時間線、保存與用量

以下時間為台北本輪私人檔案保存時間，不冒充伺服器 HTTP、fetch、SQL 或 CAS 時戳：

| 時間／階段 | 行動 | 新付費派送 |
| --- | --- | ---: |
| 登入前 | UI 核對部署 e445cfd | 0 |
| 登入後 | 設定頁發現無有效 Key、當前規則試玩；停止新 advance | 0 |
| 12:23:21 私人原操作保存 | 原 ID GET 保存目前世界、原 journal／trace 與必要診斷 | 0 |
| 12:23:26 私人部署保存 | GET environment 交叉核對 UI 版本 | 0 |
| 12:23:56 私人終點保存 | 再 GET 世界，比較故事、用量與近期操作 | 0 |

完整 JSON 原件只保存在公開 repo 外的私人工作位置；保存包含目前世界與原操作實錄，不包含 API 不暴露的暫存原世界。首次整段 DOM 讀取受長度限制，JSON 解析未通過；改為分段完整讀取後解析成功，再落檔，沒有把截短內容當備份。三份 JSON 均重新解析、記錄 bytes／SHA-256 並重讀核對。

前後 version 均 331。完整 world 比較只有 `aiUsage.windowStartedAt` 不同，這是 GET 正常化小時窗口的時間；排除 aiUsage 後故事深度相等，累計用量及近期操作列表相等。不能宣稱未排除任何欄位時整份 JSON 完全相同。

| 數量 | 本輪新增 | 起終累計 |
| --- | ---: | --- |
| advance／成功故事提交 | 0／0 | turn 2 不變 |
| 聊天派送 | 0 | 611 calls 不變 |
| 已知 input／output tokens | 0／0 | 7,705,814／177,733 不變 |
| 未知用量派送 | 0 | 5 不變，沒有補成零 |
| 店主成果後正常決策 | 0 | 本輪無樣本 |

首次付費操作沒有發生，30 分鐘付費觀察時鐘未啟動；沒有為用滿時間而重試。沒有新增提醒、介入、灌回候選成果、要求喝茶／換方法、改模型／預算／時間上限或直接改資料庫。公開只保存本去識別摘要，不附完整 transcript、記憶正文、世界備份、operationScope、憑證或私人畫面。

## 分項驗收及未知

| 驗收 | 本輪結論 |
| --- | --- |
| #169 正式部署 | **已確認**：正式 UI 與 environment 一致對上 merge commit |
| 完整四角色回合提交 | **未執行**：Key 前置不成立，不能報成功或 runtime 失敗 |
| slot 順序／八次上限／HTTP 與 durable journal 一致提交 | **未驗證**：沒有新回合；原操作是修正前的已回復歷史 |
| 400／430／445 秒及 fetch／headers／body／usage／checkpoint／CAS 時間 | **未驗證**：只讀政策及部署，沒有新執行時間線；不把 prepared 當 fetch，不推測 provider／D1 延遲 |
| 杯子與獨立茶飲新成果 | **未驗證**：當前只有原杯 tea，沒有獨立茶飲 |
| 新完成／失敗可知回饋提交 | **未驗證**：沒有新回合或本人後續 request |
| 後續承接／泡茶 loop | **證據不足**：沒有成果後正常決策，不判重現、未重現或修復 |

本地 **648／648** 是 #169 既有受控 transport／SQLite／UI／workerd 測試紀錄，本輪未重跑。它不量測正式 provider、遠端 D1 或 Workers 的實際回合效能；本輪版本確認也不能把它升格為正式完整提交或行為通過。#85／#106 不關閉。

## 下一步

目前已足以處理的是測試前置：由使用者透過既有安全入口補上有效 OpenAI Key；本輪不代填新憑證或改配置。恢復真實觀察前再次核對原 ID 已定案、部署、場景、原 NPC／裁定模型與預算，依使用者許可恢復原 OpenAI 模式，先只一個完整回合，再依原總上限取得最多三次店主後續決策。保留既有歷史，不重建起點。

**沒有新增 runtime 或行為證據足以直接開修正。** 也無需為 Key 不存在重新 Grill 泡茶設計；先恢復可測前置，若新回合再失敗，才依原 ID 新時間證據分析具體邊界。若技術提交成功但後續仍重複，再分辨新需求、缺少可知資訊與有證據的行為 loop。

本輪交付只新增本報告；完成私人 JSON 解析／雜湊、起終故事與用量／近期操作比較、公開敏感內容邊界、Markdown 連結及 whitespace 檢查。未修改產品、合併、部署或關閉 Issue。
