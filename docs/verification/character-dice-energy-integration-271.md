# #271 人物、擲骰與精神電量整合驗證

實作入口為 [PR #280](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/280)，單一分支 `integration/character-dice-energy-271`，main 基準 `a9a0ef545d4f233def30ecde3d0816e9ddd93b8e`。原工作區未提交變更保留。2026-11-09 使用者批准 A–D 整包，正式契約與相容決定見[確認紀錄](../design/character-dice-energy-recommendation-2026-11-09.md)及[ADR0012](../adr/0012-stable-characters-and-versioned-life-policies.md)。

## 工作票與驗收

| 工作票 | 狀態與證據 |
|---|---|
| #272 人物／d100規則 | 契約與有限枚舉已確認並結案；不是執行期功能驗收。 |
| #273 時間相容契約 | 契約與受控時間軸已確認並結案。 |
| #274 身體需求政策 | 三項特性、初值、時間擾動、自然醒與相容契約已確認並結案；不新增跨支線前置。 |
| #275 穩定人物 | 已完成並合入 `f7e31ff`；[逐票證據](character-attributes-275.md)。新城市、明示導入、背景與條件抽樣、實體SQLite重開、故障及重送；Chromium完整新城市正常生活1次受控模型、0付費。 |
| #276 五分鐘推進 | 已合入 `14d95e3`；[逐票證據](five-minute-time-276.md)。審查找到的branches完整成果提前提交及demo60分鐘縮短，已於`25c790f`修復並追加9項API／SQLite反例；獨立Spec覆核45/45通過，兩項resolved，重新結案。[修復證據](spec-271-review-fixes.md)。 |
| #277 d100行動／感知 | 已完成並合入 `59d2955`；[逐票證據](checks-277.md)。17項專票、128項相關回歸與合入後64項API及1項UI通過（有重疊）；Chromium兩輪、實體SQLite重開與下一次真正模型請求隔離已驗，已結案。 |
| #278 個人需求／自然醒 | 已完成並合入 `54d9c4`；[逐票證據](personal-body-needs-278.md)。12項新API、94項相關回歸與合入後51項共同回歸通過（數字有重疊）；兩輪Chromium與SQLite重讀／原ID重送通過，0付費。 |
| #256 正式精神政策 | 已完成並合入 `366b781`；[正式基線](formal-mental-energy-256.md)。19項正式基線、116項心理／需求／時間相關回歸、合入後41項共同回歸通過（有重疊）；已結案。沒有代替#263的實際啟用驗收。 |
| #263 正式啟用 | 原生前置#256/#259/#261/#262重新核對皆closed後開始；已合入`dfdd426`，[正式旅程與T1–T14](formal-mental-enable-263.md)。13項初始API、125項心理相關、108項合後回歸及merger80項通過（有重疊）；兩輪正式Chromium及真正新城市65/3→首次正常5分鐘生活通過。`30a9c94`再補2項API邊界，正式套件34/34。 |

## 驗收介面與限制

沿已確認的世界API讀取／推進／介入／控制、真正活動與來源處理、序列化及SQLite保存重讀，再以既有WorldApp核對人物、需求、收支、控制權與重載。只在時間、骰源與外部模型transport邊界控制輸入；沒有新增測試專用產品畫面或付費語義裁判。

接手前的1238項既有main回歸與兩個Workers沙箱監聽失敗／重跑界線保留於[接手報告](character-dice-energy-handoff-2026-11-09.md)，不作為本次新增功能已完成證據。每票的RED→GREEN、適當回歸、畫面與失敗保留見各票報告；本次最終執行結果如下，與歷史基線分開。

本次未呼叫付費模型、未合併main、未部署、未推進正式世界。受控回覆證明應用契約、資訊界線與記帳一致性，沒有宣稱真實模型主觀評價或自主生活品質已驗收。

### 正式啟用前的完整回歸與中途審查

`59d2955` 的首輪 `npm test` 活動核心為1224項：1221 pass／3 fail，後續組別因runner遇錯停止而尚未執行。失敗為恢復UI的舊十五分鐘待重試fixture與新版時間契約互動，以及兩項完整回想鏈超出有界逐字診斷後缺少`time-policy` step；世界提交、模型次數及用量斷言未失敗。單一修復實作者已獨立重現三項，正在保留原恢復／時限斷言下修正；不把首輪exit1記為成功。

並行Standards／Spec中途審查以main `a9a0ef5...59d2955`為固定差異；Standards找到一項ADR0003共同限制重複定義。Spec另以獨立提交快照、真正API及SQLite重現兩項時間生命週期錯誤：十五分鐘branches成果提前提交，以及規則模式60分鐘縮成15分鐘；#276因此重新開啟，原測試通過不代替這兩個反例。全部交同一修復實作者處理。#263合入後仍須完整回歸及兩軸最終覆核。

以上修復已合入`25c790f`。原三失敗組22/22通過，時間反例最終9/9、相關回歸103/103、合入後55/55通過（計數有重疊）；獨立Spec以原反例及相關案例45/45覆核，P1／P2均resolved。Standards集中限制P3 resolved，兩軸此階段remaining均0。#276恢復結案；完整最終回歸仍待#263合入，首輪1224項的exit1如上保留。

## 最終整合結果

最終runtime為`dfdd426c553e89ddb01e319cb86250f43b09cb6f`。實測前再次fetch main仍為`a9a0ef545d4f233def30ecde3d0816e9ddd93b8e`。完整`npm test`以允許本機Workers監聽的環境執行，runner將no-network預載傳給所有子程序；**exit0，1325/1325，0 fail／skip**：活動核心1246、auth37、templates6、Workers／migration15、pinned runner21。最後來源固定測試已完成還原；其80次受控推進等均為隔離測試世界，不是正式世界。

之後`30a9c94f772aea69799d3adf6ef97afd6b4cc329`只新增兩項外部API邊界表及驗證文件，runtime沒有變更；合入後正式啟用／政策套件**34/34**（其中32項已包含於完整回歸，2項為新增），typecheck／diffcheck通過。沒有把不同命令的重複案例相加成完整npm test計數。五階門檻及可支付旗標以真正enable→provider request→SQLite核對，5點明示付到0、4點拒絕且共同回退，不選擇可保留，原ID不再派送。

最終`30a9c94`：`npm run typecheck`、`npm run lint`、`npm run build:test`、`npm run build:production`、`git diff --check`均exit0；lint為0 errors／4既有warnings（3個img及1個既有effect dependency），沒有宣稱warnings為0。build僅產生本機產物，未部署。

兩軸最終固定差異為main至`dfdd426`，並窄覆核`30a9c94`的純測試增量：**Standards remaining0；Spec remaining0**，原P3及P1/P2維持resolved；Spec reviewer另於獨立固定快照執行109/109真正API／SQLite驗證。詳見[審查彙整](character-dice-energy-review-271.md)。

本地原始輸出在`/private/tmp/npc-handoff-20261109/`：`integration-final-test.log`、`integration-final-{typecheck,lint,build-test,build-production}.log`、`merge-boundaries-{targeted,typecheck,diffcheck}.log`；[摘要原始結果](character-dice-energy-271/final-check-results.txt)隨提交保存。逐票Chromium PNG／JSON與可重跑runner均已入庫。原始工作區的未提交變更、ADR0010／0011及其他未追蹤文件仍保留，不被本次工作擅自提交或重置。

## #271 最終驗收對照

| 主規格測試項 | 主要證據／狀態 |
|---|---|
| 1 容量與初始化 | #256公式36骰對與初始化基線、文件55中點枚舉；#263真正新城／舊世界入口、明示65/3、原ID及實體SQLite重開。數學枚舉與執行期證據分別記錄。 |
| 2 五階與支付 | #263補充API表核對容量10的0..10、五階門檻／前後及可支付旗標；5付至0、4拒絕；#256另驗容量1及MAX_SAFE精確比例。 |
| 3 自然消耗 | #256每完整清醒格d6僅1扣1、休息／睡眠／混合格、分段coverage與同格取樣保存；#263GET／重載不變。 |
| 4 固定睡眠回電 | #256對齊55+5、跨次11→12單位固定+1、混合格不冒充、legacy與個人化真正醒點；時間組先裁切。 |
| 5 效果幅度 | 已批准三級正負骰表；#256真normal／controlled schema及骰證據、無影響零值；#263畫面分開原始幅度、整組實際變化與裁切。 |
| 6 主觀／成敗分開 | #277技能與他人意願不由極端骰突破；#263真實成果與主觀成就分開、負面過程與保留電量；#255原行為契約回歸。 |
| 7 同格／跨格 | #256同格自然−1／過程+3合計、下格−1；同刻+1／−4反序不同骰仍同結果；已知較早+3再較晚−4保留先後。 |
| 8 生效與來源 | #256部分格／真格內修訂不補成整格；#263真活動15分鐘、獨立成果、來源收據、過程向後修改及已付費用保留。 |
| 9 防洗骰 | #275建角、#277全部d100路徑、#278需求及#256／#263精神各有原ID、同條件、分段或重讀證據；實體SQLite重開保持來源／骰。 |
| 10 付款順序 | #256時間+1先裁切65→消息−4到61→付5剩56；#263同輪真成果收入後自主支付、不足共同回退、不選保留、原ID不多付。 |
| 11 自主／控制權 | #263低電續做、純續做無新模型、takeover／direct／新感受／新陪伴與既已付費共存，不換使用者行動或自主扣費；原預算守住。 |
| 12 投影／畫面 | #275／#276／#278／#277／#263真正畫面、SQLite重載與下次實際request；NPC只得定性及可支付，觀察者可核對raw／actual、來源與獨立心情。 |
| 13 故障／啟用 | #263跨角色／來源／過期物件／lease／保存前後／CAS／原ID故障矩陣，共同回退或保存並保留known用量；test不轉formal、其他gate不重置。 |
| 14 支線 | #275穩定人物、#277自由／日常／感知／內建d100、#276五分鐘與兩審查時間反例、#278四種需求／自然醒均獨立驗收。 |
| 15 語義界線 | #263實際provider request核對至少小幅緩和、能承受就停止、優先考慮但自主；全程0真實付費，受控回覆只證明契約承接與記帳。 |
