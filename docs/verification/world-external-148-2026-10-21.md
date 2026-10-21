# #148 外在環境／身體：fixture 驗證

整合基線為 main `5e172d5`、未合併 PR #144 `53f4298`、設計 `de0d7d0`，承接 #137–#139 與 #146。#147 的物件物理操作與本票並行，最終整合時沿其已完成 helper；沒有合併或部署遠端 PR。

先以正式世界 API／SQLite 及真實 WorldApp advance 重現 body／environment 不在候選契約而回502；並非只有未接線型別測試。API、UI red 記錄在本輪工作環境 context。逐個 red→green 補入三類外在後果、自己的身體感知、相關條件失效、推拉五段及 hidden 投影。模型 transport 與骰子為明示 fixture；活動、效果、提交、序列化、原 ID 重送及 SQLite 重讀均走正式流程。

- `tests/world-external-api.test.cjs`：11項場景測試，包含物件／環境／身體同批、public／subject／hidden、觸覺與自主續做、相關與無關子集條件、五段推拉與攜物、不可達／跨區域／門關閉／心理欄位拒絕、保存前故障／提交後確認／版本衝突、相同ID重送、嘗試指紋及必要前後證據。
- 代表性的第一回合為3 NPC＋1裁定 fixture、0骰；五段推拉各3 NPC＋1裁定＋1 D20。自然事件本票尚未實作，由 #150 承接。
- 同區 hidden 環境與本人 hidden 身體條件可供正式後續活動檢查，但全部 NPC 輸入與觀察線索均不含隱藏鍵／值；subject 只本人有直接觸覺，公眾沒有內情。理由只在觀察者證據。
- [真實 WorldApp／API／SQLite JSON](assets/world-external/browser148.json)、[外在狀態](assets/world-external/external-states.png)、[人物身體頁](assets/world-external/body-profile.png)。瀏覽器走實際下一回合、分析、人物檔案、重載及原 ID UI 重送。
- 驗證不新增測試 UI、不修改正式世界、不呼叫正式付費模型，不把 fixture 當正式站驗收。

有界限制沿 #146：每效果最多4鍵、每袋最多16鍵／4096 UTF-8 bytes、key最多60字、value最多100字、reason最多300字，候選8192字與既有分支／階段／效果上限保持。只可寫外在狀態，不可改心理欄位、身份、所有權或帳號隔離。既有單純 reload 不補狀態／事件／證據。此票無 HP、新對抗骰或完整戰鬥；自然變化與新日常程序由後續 #150／#151 交付。

後續資訊隔離回歸補入同區隱藏物件狀態：新change-state每個target皆須明示exposure，物件stateExposure保留每鍵public/hidden，舊缺欄位state維持原可知；權威條件與觀察者證據仍可讀hidden。此格式尚未部署，146/147的新候選fixture同步明示曝光，不重寫舊世界。

最終整合核對：已合入 #147 整合點 `0aa4322`，保留 physical 操作、事前許可歷史、診斷遮蔽及中性持有敘述。相關裁定／世界 API／感知／記憶／操作證據回歸 **109/109** 通過；本票11項場景全綠。typecheck、變更檔 ESLint、diff check 通過（人物檔案既有 img 提示1項，無 errors）。Chromium 同輪重跑實際 PASS，截圖已目視檢查。第一個準備階段使用「已進行這個步驟」，不提前宣稱活動完成／結束，完成由生命週期處理。新版物件hidden測試保留舊完整state投影時確實red，恢復有界曝光投影後green；同區可知的舊volume維持，hidden配方只在權威與觀察者證據。
