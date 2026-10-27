# PR #169 正式站有限重驗：三回合提交，店主承接泡茶成果（2026-10-27）

**三個真實四角色回合均 HTTP 200、完整提交。店主收到已提交泡茶完成回饋後，先提出喝現有茶，再承接飲用失敗回饋改以杯子為目標，第三輪實際消耗原茶飲。這兩次成果後正常決策沒有重複泡茶，但不宣稱所有 loop 已修復，不關閉 #85／#106。**

本輪共 3 advance、24 次聊天派送、335,510 已知 tokens、0 次新增未知用量；沒有第四輪。另觀察到「以茶飲為目標的飲用候選 accepted，但機械綁定 denied」的具體差異，與原泡茶重複問題分開記錄。

## 來源與唯讀預檢

接續 [10/26 無有效 Key 的預檢停止報告 PR #170](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/170)。使用者表示已加 Key 並要求再試，沿原授權繼續，沒有擴大付費上限。

- 最新 main 仍為 `e445cfd4beda2dca6ad1085b65923ebf838ba0a3`，即 [PR #169](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/169) merge commit。正式站 UI 與 `/api/environment` 直接核對 production `e445cfd`、builtAt=`2026-10-25T06:59:50.744Z`（台北 10/25 14:59）；不是只看 GitHub 已合併。
- 沿前輪已讀 AGENTS、Matt Pocock、GLOSSARY、ADR 0001–0005、[#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)、[#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168)、#169 內容與留言；本輪再次核對 main、AGENTS、diagnosing-bugs／pr 原文。工程依據為[時間政策](../design/round-time-budget.md)、[操作／私有實錄契約](../design/operation-evidence.md)、[隔離場景](../design/minimal-acceptance-scene.md)及[操作恢復流程](operation-evidence-live-runbook.md)。本輪為受限正式觀察，不進入修改產品或注入故障的診斷階段。
- 歷史對照：[10/24 報告](pr162-live-observation-2026-10-24.md)、[#165 固定版報告](https://github.com/sarekoubeYohane/quiet-hours-npc/blob/067ee67d1c05be5f35ae1e608a151b624e2b439e/docs/verification/loop-followup-2026-10-25.md)、[截止診斷](round-deadline-diagnosis-2026-10-25.md)及[#168 本地驗證](round-time-budget-168-2026-10-25.md)。#165 文件不在 main，沿先前已取得的固定提交讀取結果，不把缺檔當作無歷史。
- 起點 version 331、minute 750（D1 12:30）、turn 2，`daily-life-v1`、四角色在前台。與 10/26 私人終點排除 aiUsage 後完整故事深度相等；原日常世界仍暫存，沒有進出／重建／重置。API 不暴露暫存原世界，本輪沒有匯出或還原它。
- 原 ID `1792903190773:9d9c6634-d693-4389-b32d-3a483aff124d` GET 為 settled／保存的 HTTP 502／rolled-back。沒有 pending／uncertain 待恢復；沒有重送這個舊操作。UI 自動運行為「開始自動」，沒有進行中回合，之後全程手動。未讀 DB 鎖列，不宣稱排除所有外部裝置的操作者。
- OpenAI `configured=true`，有未到期 Key，儲存服務可用；只讀狀態，不讀憑證。新分頁原為規則試玩，為執行本次已授權真實測試，沿正常 UI 恢復原 OpenAI 直連；模型選項仍為 GPT-6 Luna，裁定仍為 OpenAI／gpt-6.1-sol。24 筆實際 request 再核對 NPC=gpt-6-luna、裁定=gpt-6.1-sol，沒有換模型。
- 回想 `enabled=false`，與原隔離場景一致；每輪最多 4 NPC＋4 裁定。預算仍每小時 240 calls／5,000,000 tokens，起點本小時用量 0，沒有調高。新載入前端版本為 e445cfd；首輪實錄的 `round-v1`／clientMs=445000 與受理成功支持新版政策已接通，但未另捕獲 request header 或刻意等待到 445 秒。

付費前先私人保存當前世界與原操作實錄。整批限制仍為最多 4 advance／32 派送／已知 500,000 tokens／首次付費起 30 分鐘。沿歷史預檢的 **250,000 tokens 作下一完整回合保守開輪餘量**；這是成本停止判斷，不是 provider 硬上限或精確預約。第 2 輪前餘 391,964，第 3 輪前餘 279,671，均可開輪；第 3 輪後餘 164,490，不開第 4 輪。

## 三次操作與原子提交

受理時間以下均為台北；提交耗時由 `acceptedAt → world-commit-confirmed` 量測，不是整段瀏覽器操作或純 CAS SQL 時間。

| 輪 | 原 operationId | 受理時間 | 版本／故事 | 派送 | input／output | 提交耗時 |
| --- | --- | --- | --- | ---: | --- | ---: |
| 1 | `1793071081730:fe42e9c4-dd31-46a5-9717-ec622153ac94` | 10/27 11:18:04.791 | 331→332；turn 2→3；750→765 | 8 | 104,685／3,351 | 119.682 秒 |
| 2 | `1793071261957:061f7988-d9a8-4f18-ada2-d4975befd801` | 10/27 11:21:04.833 | 332→333；turn 3→4；765→780 | 8 | 108,974／3,319 | 95.218 秒 |
| 3 | `1793071391876:4b39bd6f-fa21-40b1-9f76-c11ca6eae134` | 10/27 11:23:14.081 | 333→334；turn 4→5；780→795 | 8 | 111,960／3,221 | 94.457 秒 |

三次均 settled、原 HTTP status=200、trace outcome=committed，UI 顯示「回合已儲存」，原 ID GET 回讀版本／時間／物件一致。每輪 `commit-start → world-commit-confirmed` 分別 2.903／1.664／2.702 秒；這個窗口包含提交前保存等成本，不稱作 D1 單筆 SQL 延遲。

每個 slot 正常依 turn 輪轉：第一輪 Kris→店主→Cass→Vera，第二輪店主→Cass→Vera→Kris，第三輪 Cass→Vera→Kris→店主。每人一次 NPC 與一次裁定，無回想、重抽、重試或非預期派送。這與 `activities` 的既有 turn offset 順序一致，不以角色陣列原始排序誤判亂序。

逐人檢查實際 NPC 回覆的 intents 與 durable 世界相同；各 `npc-feedback` 保存當時的短期記憶逐 ID／內容仍存在於該輪 durable 世界。後面 slot 的新觀察可繼續附加，因此不要求早一 slot 的整份 shortTerm 陣列與輪末完全相等。店主第一輪完成回饋與新杯／茶出現在後續實際 NPC request，不以觀察者實錄代替 NPC 真正收到的資料。首輪後一角色的權威派送快照也保有前面形成的新杯／茶。

## 安全時間證據

三輪 `timePolicy` 皆 round-v1，`workDeadline − leaseCreatedAt=400000`、`leaseDeadline − leaseCreatedAt=430000`、`clientMs=445000`。租約建立時間分別為 11:18:03.820、11:21:03.917、11:23:13.607；acceptedAt 在建立後約 0.97／0.92／0.47 秒，不把兩者當同一時間。全部 24 個模型 signal 的期限均為自身 createdAt＋25 秒，限制來源為 model，沒有被整輪剩餘期限裁短。

下表秒數相對各輪 acceptedAt。P=prepared 建立紀錄，F=實際 fetch 開始，H=headers 事件，B=body 已讀完；usageKnownAt 在本批皆等於 B。**P 不等於 F**；H／B 為應用事件時間，不是 provider 內部時間或其 checkpoint 寫完時間。

| 輪／slot | 任務 | P | F | H | B／usage |
| --- | --- | ---: | ---: | ---: | ---: |
| 1／1 | Kris NPC | 1.827 | 2.399 | 7.707 | 8.266 |
| 1／2 | Kris 裁定 | 11.277 | 13.135 | 19.218 | 20.382 |
| 1／3 | 店主 NPC | 25.901 | 27.531 | 32.203 | 33.280 |
| 1／4 | 店主 裁定 | 38.580 | 39.913 | 52.829 | 54.142 |
| 1／5 | Cass NPC | 60.427 | 61.392 | 65.748 | 66.611 |
| 1／6 | Cass 裁定 | 72.303 | 73.865 | 78.873 | 80.287 |
| 1／7 | Vera NPC | 85.825 | 86.660 | 90.820 | 92.216 |
| 1／8 | Vera 裁定 | 99.229 | 102.035 | 110.426 | 112.239 |
| 2／1 | 店主 NPC | 1.844 | 2.399 | 5.824 | 6.437 |
| 2／2 | 店主 裁定 | 8.903 | 9.778 | 23.593 | 24.676 |
| 2／3 | Cass NPC | 27.702 | 28.321 | 32.140 | 33.080 |
| 2／4 | Cass 裁定 | 36.790 | 38.531 | 43.907 | 44.591 |
| 2／5 | Vera NPC | 48.488 | 49.806 | 54.680 | 55.393 |
| 2／6 | Vera 裁定 | 59.129 | 60.166 | 67.947 | 69.291 |
| 2／7 | Kris NPC | 72.887 | 74.315 | 78.599 | 79.519 |
| 2／8 | Kris 裁定 | 83.511 | 85.024 | 88.886 | 89.894 |
| 3／1 | Cass NPC | 1.842 | 2.233 | 5.969 | 6.347 |
| 3／2 | Cass 裁定 | 8.677 | 9.249 | 12.742 | 13.353 |
| 3／3 | Vera NPC | 16.027 | 17.307 | 20.774 | 21.515 |
| 3／4 | Vera 裁定 | 24.564 | 25.653 | 32.715 | 34.329 |
| 3／5 | Kris NPC | 38.086 | 39.304 | 43.531 | 44.258 |
| 3／6 | Kris 裁定 | 47.987 | 48.894 | 54.904 | 56.233 |
| 3／7 | 店主 NPC | 60.521 | 61.416 | 65.512 | 66.430 |
| 3／8 | 店主 裁定 | 70.703 | 72.122 | 86.557 | 87.390 |

每輪實錄均保存 51 個 checkpoint 開始時間、其中 50 個有 completedAt，最後一個完成時間未記錄。已完成窗口各輪範圍為 0.363–2.806／0.369–1.741／0.375–2.144 秒。這些是 snapshot／queue／保存 callback 等整體窗口；dispatch 保存可與網路重疊，不能把總和與網路耗時直接相加，也不能全部歸為 D1。

首輪第八次 body 在 +112.239 秒才可得、故事在 +119.682 秒確認，已跨過舊版約 110 秒失敗窗口，且真的提交。這是正式成功證據，不代表模型／D1 變快或任意慢服務都能完成。沒有刻意測 400／430／445 秒邊界、斷線、競爭或 CAS 故障；精確 SQL 執行／HTTP 抵達瀏覽器／最後 checkpoint 完成時刻仍未知。三輪沒有技術錯誤、租約／版本衝突、uncertain 或異常派送。

## 杯茶成果、可知回饋與後續選擇

為避免公開完整私有 payload，以下以 C 表示本輪新「日常茶杯」、T 表示其獨立「一份茶」；私有原件保留實際 ID，所有跨輪關聯逐 ID 檢查。原驗收杯是另一件物品，原本已 tea／revision 2，沒有拿它冒充新成果。

| 輪 | 店主實際輸入／選擇（摘要） | 裁定與機械結果 | durable 成果 |
| --- | --- | --- | --- |
| 1 | 原 make-tea 意圖；看到原驗收杯 tea，但自己尚未完成。提出使用共用茶具替自己泡茶 | 原始裁定 accepted，v2 tea 程序；bound-candidate accepted，生成並完成 | C active／holder=owner／contents=tea；T active／holder=owner／beverage=tea、vessel=C；完成回饋進本人短期 |
| 2：成果後決策 1 | 真實 request 已含完成短期記憶與 C／T。回覆承認泡茶完成、intents=[]，選以 T 為 target 飲用現有茶 | 原始裁定 accepted／drink；程式最終 bound-candidate denied，blockedReason 為「目前沒有可使用的指定工具」；回合正常提交否決回饋 | C 仍 tea，T 仍 active，沒有新茶。不能把 accepted 候選當作喝完 |
| 3：成果後決策 2 | 真實 request 同時含泡茶完成與上一輪飲用失敗回饋、C／T。回覆承認上次失敗，改以 C 為 target 飲用其茶 | 原始裁定 accepted／drink，bound-candidate accepted；本人完成回饋保存 | 同一 T consumed，C contents=dirty；沒有重新泡茶或生成替代飲品 |

店主第二輪選留了原泡茶完成記憶；第三輪輸入仍讀得到它，另讀得到上一輪飲用失敗的本人短期回饋。沒有把裁定 explanation、blockedReason 或觀察者 trace 填入 NPC；本人收到的是既有可知失敗描述與已知杯茶狀態。第三輪模型自述「改從杯子提出」與真實 target 變更一致，是本輪實際適應的證據，不是維護者代寫的因果。

兩次成果後正常決策分別為「喝現有茶」及「失敗後改用杯子喝茶」，不是同樣泡茶方法重複。**有限樣本內未重現原泡茶 loop**，並已取得承接完成／失敗回饋與實際變更方法的正向證據；只有兩次而非三次後續樣本，不能宣稱全域修復、之後不再重複或其他角色無 loop。第三輪 intent 仍寫喝茶，是決策時尚未完成的意圖；未觀察喝完後下一次決策，不據此判新 loop。

## 停止、用量與私人保存

- 首次按 advance 約台北 11:18:01.691，第三輪故事確認約 11:24:48.538；停止後唯讀保存點約 11:25:31.368，約 7 分 30 秒。沒有為湊 30 分鐘繼續重試。前兩輪不明示 HTTP 200 前均只 GET 原 ID 等待，沒有新 ID 重做；正常執行中的 pending 沒有被當失聯或重派理由。
- 本輪 24 派送全有已知 usage：input=325,619、output=9,891，合計 **335,510**。cached input 已含在 input，不再加算。未知用量新增 0；歷史累計未知 5 維持，沒有填零。
- 累計 calls 611→635；input 7,705,814→8,031,433；output 177,733→187,624。逐筆 usage 加總與 durable 差額一致。本地價格不完整，未宣稱完整供應商帳單或精確費用。
- 第三輪後剩餘 164,490 tokens 小於沿用的 250,000 開輪餘量，故停止於 **3／4 advance、24／32 派送**；時間與 calls 尚有餘額，不因此硬開下一輪。此保守餘量約為歷史單輪觀察量的兩倍以上，不是下一輪不可能超越的證明。
- 終點仍在原隔離場景，version 334、turn 5、minute 795（13:15），自動暫停。沒有新提醒／介入、要求喝茶或換方法、灌回候選杯茶、改記憶、改模型／預算／時間上限、重置、合併或部署。
- 起點、部署資訊、各輪原 ID 進度／定案、終點與觀察時間私有保存；完整 JSON 解析、bytes／SHA-256 清單及重讀核對。三輪 trace gaps=[]，沒有容量省略，request／response／世界快照可讀；最後 checkpoint 的 completedAt 缺失仍如實保留。
- 最後再 GET 第三輪原 ID，operation／version／物件及總 calls 與定案相等，沒有新增派送或重套效果；沒有執行同 ID POST 重送驗證。私人畫面、完整 transcript、記憶正文、世界備份、operationScope 與憑證不納入公開 repo。

## 分項結論與下一步

| 項目 | 本輪結論 |
| --- | --- |
| 正式部署包含 #169 | 通過，UI／environment／GitHub commit 一致 |
| 完整四角色提交 | 三輪通過，首輪跨舊 110 秒窗口後仍提交；順序、派送數、記憶／意圖／回饋與 durable 結果一致 |
| 新杯與獨立茶飲 | 首輪真正提交；第三輪仍沿同身份消耗，非只 grant 或 accepted 文案 |
| 可知完成／失敗回饋 | 下一次實際 NPC request 均讀到相應本人短期及可知物件 |
| 原泡茶 loop | 兩次成果後決策內未重現，正向承接與改方法已有證據；不宣稱全面修復，不關閉 #85／#106 |
| 飲品 target 的飲用路徑 | 有具體差異：第 2 輪原始 accepted→機械 denied，第 3 輪改杯 target 成功；需要獨立窄範圍診斷 |

本地 **648／648** 仍是 #169 既有受控 transport／SQLite／UI／workerd 的歷史驗證，本輪沒有重跑；它不量測正式 provider／遠端 D1。上面三輪才是本次正式真實模型證據；沒有在線上覆蓋回想鏈、故障注入或時間邊界，不能把本地故障矩陣全部升格為正式通過。

原泡茶問題目前沒有足夠證據支持直接改 Playbook、意圖或回饋政策。飲用 target 的具體拒絕則已有原始輸入、accepted 候選、機械原因與下一輪成功對照，足以另立窄範圍診斷／修正票；下一步應先查 target→vessel／drink 的實際重綁契約，確認是否為引擎錯拒及其最小測試，再決定修正，不將這個對照直接當作已證明根因，也不必重開自主性設計 Grill。本輪不實作或建立額外票務。

文件交付檢查：逐派送用量與 durable 差額、slot 輪轉、原始 intents 與保存、本人回饋記憶保留、杯／飲品身份與生命週期、原 ID 唯讀重查、私人原件雜湊、公開敏感內容邊界、Markdown 連結及 whitespace。只有本報告新增。
