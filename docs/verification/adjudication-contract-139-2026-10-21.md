# #139 結果分支契約接入與前置整合

基於 #138 `b844910`，承接 main `5e172d5` 已合併 #125/#129（PR #131）的活動引擎與結果分支，不重做引擎。PR #144 `53f4298` 仍是明示本地整合來源，本報告不宣稱它已合併。

## 契約責任

- `adjudication-limits` 集中種類、status、DC、五段結果、時間粒度、分支／階段／效果／條件與候選容量限制；一般效果與日常程序的實送提示、schema及解析使用共同來源。
- `adjudication-contract` 提供一般效果及日常核准的公開純解析；合法與非法解析都不綁定物件、不擲骰、不修改規則、供應、活動或世界。日常僅接收本次允許的operation列表作為唯讀scope，完整timings與互斥候選在此驗證。
- `resolveRoutineCandidate` 才進入世界綁定及audit。開始／階段執行仍檢查當前世界，不把格式合法當作活動完成。無新增模型派送、分類、修復或重試。
- 保留一般舊versionless/branches=null、日常v1空效果及v2模型程序；不補造舊世界分支或核准、不重置、不追補舊證據。NPC決策與回想契約保持獨立。

## 重現、修正與回歸

公開候選界面的red→green另捕獲三項既有提示/schema與純解析差異：denied/unsupported仍可帶check、ability101字元仍可通過、確認15分鐘卻最後階段30分鐘未在解析拒絕。已按既有契約拒絕；沒有擲骰或更改世界。獨立字面預期驗證90分鐘上限、15分鐘對齊、合法／非法status/effect、效果容量及scope，未以同一生成器自我比對充當證據。

最終 `tests/run-activities.mjs` **426/426**，0 fail/skip。新增6項公開契約/API測試；既有420項活動／世界API保持通過。真實SQLite保存重讀包括五段結果、多級共用後果、失敗消耗、部分成果、選定分支／未選分支、純續做／中斷、免費重綁、舊規則、原ID重送、保存前故障、提交不明、版本／租約衝突、用量及資訊隔離。typecheck、變更檔ESLint與diff檢查通過。

真實WorldApp Chromium採明示模型transport及骰子fixture，UI→世界API→SQLite，不替換活動／效果／保存：

| Runner | 實際結果 | 呼叫／骰子 |
| --- | --- | --- |
| browser127（7組） | 自由五段、共用分支、失敗消耗、部分成果、續做／中斷；SQLite/API/UI重載與重送 | 每五段組1 NPC＋1裁定＋1骰；續做2＋1＋1；中斷1＋1＋1 |
| browser129（6組） | 日常五段、免費重綁、選定結果、控制、重送與同條件不洗骰 | 每五段組1 NPC＋1裁定＋1骰；flow4 NPC＋1裁定＋3次獨立嘗試骰 |
| browser128（#138） | 首次完整核准、跨回合完成、換杯免費綁定、接管／交還、喝／洗／還 | 5 NPC＋1裁定＋0骰 |

代表畫面：[自由部分成果](assets/adjudication-contract/free-mixed.png)、[失敗消耗](assets/adjudication-contract/free-failure.png)、[中斷保留先前成果](assets/adjudication-contract/free-interrupted.png)。完整runner保留在tooling/verification，可按其README直接重跑。

本輪僅本機fixture，**不等於正式站或真實模型驗收**。未呼叫付費模型、修改正式世界、合併或部署。主規格 #145 的新增狀態、許可／物理、環境／身體、來源／分拆、自然變化與新日常程序仍依 #146–#151完成，不能由本前置報告冒稱已交付。#104/#106保持。
