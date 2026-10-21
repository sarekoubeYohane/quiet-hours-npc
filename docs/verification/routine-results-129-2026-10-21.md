# #129 日常判定、重用與控制驗證

依 [#125](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/125) 與 [#129](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/129)，基於本機整合 `1657e13`，承接 #126–#128 與獨立 #122／#123 成果。未使用真實付費模型、未部署、未合併 PR 或重置正式世界。

## 新契約與外部行為

v2 日常 program 可保存必要 `check` 與 1–5 組共用 `branches`，互斥的 program 頂層 effects／stages 為空。五段結果唯一覆蓋，由既有 D20 計算；模型不能指定骰值。分支使用 #128 符號角色與相同 compiler，編譯為 #127 共用結果分支及既有 Effect，沒有第二套判定或效果引擎。所有分支在擲骰前驗證，成功須有合法成果，部分／失敗只執行其確認的消耗與有限成果；空失敗仍花確認時間。

規則只保存 check／分支，當次結果隨活動計畫保存；後續活動重新綁定杯子、工具、原料與飲品。重試身份排除 pending 成品隨機 ID、模型措辭、DC、能力描述及分支排列；只有受信任綁定的實際物理前提改變可形成新嘗試。不同飲品單位即使在同一杯子內也可取得新骰。沒有擲骰後、純續做或每階段追加裁定。

選定分支後，只清理本候選未選且未具體化的 pending 成品，保留實物、已提交消耗、他人候選與早先成果。杯子／原料取得順序須可安全重綁，不能靠當前已有杯子掩蓋錯誤。成功分支不能新增他人同意或擴權。

v1 仍沿舊語義；缺少 check／branches 的確定 v2 程序保留既有行為，不補造歷史分支。新 transport schema 明列 nested check／branches，確定程序填 null；日常頂層 check=null 與 program 內必要判定清楚區分。其餘裁定契約集中化仍屬 #136–#139，未被本票宣稱完成。

## API／SQLite 與 red-green

以正式 GET／POST handler、實際 SQLite adapter 保存及 API 重讀驗收；模型只替換 transport，Math.random 只控制骰子。沒有測私有 helper 順序或新增測試 UI。

- 第一個五段日常分支測試先回 502（日常程序格式不支援），實作後五段均通過，保存模型分支與所選結果；大成功／成功同組，失敗／大失敗同組。
- 可選杯子取得順序反例先錯誤接受 HTTP 200；新增靜態順序防守後 502，無規則／物件／骰子副作用。
- 同一杯子換成真正的新飲品單位，測試先錯誤沿用一骰；將受信任實際飲品身份納入前提後為兩骰。同一飲品及同前提仍一骰。
- 本票最終 **13/13**；完整活動 runner 在新增最後 transport 斷言前 **392/392**，0 fail／skip。最後本票＋#128＋#122／#123 針對性回歸 **34/34**。整合流程另跑最終完整 test／build。
- typecheck、變更檔 ESLint、diff-check 通過。

| API 情境 | 可觀察結果 |
| --- | --- |
| 五段及共用分支 | 每例 1 NPC／1 裁定／1 骰；成功茶、部分 water、失敗杯子 empty；實際 raw 單位 consumed，未選成品不存在且無 pending |
| 同前提、措辭／DC／分支重排、重送及重讀 | 保持首次結果與一骰；換合法 cup-b 得新骰，無新增裁定 |
| 不同原料／飲品、免費規則重用 | 每次綁當前單位，不把首次歷史結果當永久結果 |
| 明確上限不足 | 保存完整合法規則；物件／供應不變、零骰；後續合法安排免費執行 |
| 新消息 continue／換事／接管 | continue 保留起點、完成時間及結果；換事／接管停止未來成果，保留已消耗 raw 與 water |
| 工具移走或失權 | 停止後續效果；不洩漏 hidden holder／region、不回復早先材料 |
| 既有直接指定及 demo 規則模式 | work/tea 重用同規則及 D20，零額外模型；直接 propose 仍 400，未擴大輸入 |
| 已知障礙、恢復及新方法 | 已知 broken tool 零新增裁定／骰；條件恢復後可行；未涵蓋方法僅既有例外 slot，不新增日常規則 |
| 無效／矛盾／越權未選分支 | 擲骰前 502，無半套世界／規則；已知兩次派送用量保留 |
| save-before、save-after、版本衝突及租約過期 | 當回合候選一起回復或確認既有提交；用量保留，重送不再派送／重骰／重做 |
| 實際 transport | schema difficulty 8/12/16、最多五組、與提示分支語意一致；沿用 4096 輸出額度，無修復呼叫 |

## 真實應用 Chromium

`node tooling/verification/browser129.mjs` 以真實 Chromium、WorldApp、既有操作、正式 world handler 及 SQLite 執行六組。僅模型 transport／骰子為 fixture；每組正常按下一回合、UI 重載、API 重讀及同 operationId 重送，核對實物與保存結果。

| 情境 | NPC／裁定／骰子 | 實際結果 |
| --- | --- | --- |
| 大成功／成功（各一組） | 各 1／1／1 | cup-a 茶、飲品存在、raw consumed |
| 部分成功 | 1／1／1 | cup-a water，沒有完整茶／飲品，raw consumed |
| 失敗／大失敗（各一組） | 各 1／1／1 | cup-a empty，沒有成品，raw consumed |
| 部分→免費新活動→continue→新杯接管取消／交還 | 4／1／3 | cup-a 保留部分 water、cup-b 茶；背景 cup-c 保留 water、未來茶取消；三份 raw consumed，無 pending |

完整流程正常加入新消息，NPC 選 continue；重載後沿既有腳本重選 OpenAI 決策模式。最後接管／交還、重送及重讀沒有新增模型或骰子。已人工檢視 [重用](assets/routine-results-129/reused.png)、[最終物件](assets/routine-results-129/flow.png)，另附 [部分](assets/routine-results-129/mixed.png) 與 [失敗](assets/routine-results-129/failure.png)。環境配置沿 `tooling/verification/README.md`。

## 容量及未驗事項

六項程序含一次不確定分支的 fixture 為 **2,992 字元**，低於 8,192 候選界線；未提高既有輸出額度或追加模型呼叫。未用 fixture 的字符／usage 推論真實 tokenizer 或成功率。

本報告是本機 transport fixture＋實際 SQLite＋真實應用瀏覽器證據，**不是真實模型／正式站驗收**。未聲稱任意自然語言新方法皆能可靠辨識，泛用方法仍沿 #127 已記錄的保守重試身份；未新增分類器、任意 patch、食譜／庫存模擬或 NPC 契約重構。完整整合仍須獨立雙軸 code review 及最終 test／build。


## 與最新 main 操作證據的整合

本機實作提交 `f9783f4`，再合併整合分支 `3707b2b`（含 main 的 PR #140／操作證據修正），本機合併提交 `612a632`。test runner 清單衝突保留新操作證據及本票全部測試，未覆寫 #140。

合併後本票、#128、#122／#123 及 operation-evidence API／SQLite **48/48** 通過；真實 Chromium 再跑完整 flow，仍為 **4 NPC／1 裁定／3 骰**，物件、重送與重載一致，最終兩張流程截圖取自這次合併後執行。合併後 typecheck、變更檔 lint、diff-check 通過。整合父流程負責最終完整 test／build 與 code review。

PR #140 的保存證據投影目前未完整涵蓋新 branches／programs，會如實標示 `truncated`，不能把這些摘要當成完整成功候選。上述新契約證據來自明示 transport fixture 所捕獲的請求／候選及 API 保存狀態，未冒充正式站成功 transport；後續若擴充投影，仍須保持原有敏感資料排除及容量界線。
