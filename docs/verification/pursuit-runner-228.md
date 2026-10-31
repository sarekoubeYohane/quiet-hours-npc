# #228 可執行隔離 runner 與受控整合

runner 使用真實世界 GET／POST、原 NPC／裁定 adapter、活動／感知／效果與 SQL migrations；D1 host adapter 用 private file SQLite，僅替換環境與 auth 邊界。受控驗證會真的走同一 live forwarding 支線，再於 provider fetch 外部邊界提供合成回覆；不等於真實 NPC 自主行為。#211 原 checker 未修改。

## 執行入口

從 repository 根目錄執行預檢，預設不讀 Key、不派送：

```sh
node tooling/experiments/pursuit-runner-228.mjs
node --test tooling/experiments/pursuit-runner-228.test.mjs
```

指定測試已接入預設 `pnpm test`，先載入 no-network preload；受控 provider fetch 不轉送外網。重建公開合成材料必須明示跑 `node --import ./tooling/verification/no-network.mjs tooling/experiments/export-pursuits-220.mjs`，它不是 runner 自動步驟，不能覆寫舊 #211 批次。

只有日後取得有限授權與封存材料才使用下列入口；**本輪沒有執行**：

```sh
node tooling/experiments/pursuit-runner-228.mjs --live --plan /private/sealed-plan.json --authorization /private/authorization.json --prices /private/official-prices.json --credential-env EXPLICIT_PROVIDER_KEY --output /private/new-run
node tooling/experiments/pursuit-runner-228.mjs --readback /private/new-run
```

preflight 核對完整產品 commit／工作樹、runner digest、模型與參數、兩種場景 hash、十組順序、固定窗口與有限方案；授權綁 plan hash、price hash、payer、isolated scope、run ID、到期與各有限餘額。官方價目須有來源、日期及保存原件 SHA256，不用測試合成單價冒充正式價目。預設 manifest 故意保留尚未封存的 commit/digest 與授權／價目缺口，不能 paidReady。

runDirectory 必須在 repository 外，只保存本批證據。live 的 payer 權威固定在使用者 private `~/.quiet-hours-npc/pursuit-220/account.sqlite`，不能透過output換位置；CLI不提供更換account位置的參數。SQLite原子claim唯一runId與payer/授權reference，並限制同payer一個active／未明批次。同授權或runId換output也拒絕，沒有讀Key或新派送；已用授權不自動重發餘額。真正不同的新授權仍共用原payer世界、用量、小時窗口與限制；未明派送未核對前會停止新的grant。有效claim最多256筆，僅清理已到期且非active的claim，滿載拒絕新增，不清除尚有效的grant。

run-state以temp→fsync→rename保存，控制狀態也持久化到獨立output的同一account SQLite；output內RUN.lock不是唯一守門。同一SQLite內trial間先封存證據，再真reset，再只於初始邊界套入scene；帳務、限制、keys與journal不重建。Date.now使用實際時鐘，沒有每輪人造15分鐘。原有pending／uncertain／unknown決不切下一組。測試可在受控transport模式注入暫存account儲存位置，live模式禁止此override。

每個 runtime 使用隨機32-byte加密秘密，只保留在process記憶體binding，不採公共browser fixture的固定秘密、不寫秘密到生成module。Key只經原 set-model-key API加密保存；header／Authorization不進原件。原body原樣forward；副本保存前沿共用redaction遮蔽literal／JSON escape／Bearer echo。停止後新runtime只GET，沒有加密秘密、不讀取或探測Key。

## 保守成本界線

全批方案／授權在每次真正prepared body派送前，以完整UTF-8 bytes作保守input token上界，加上原max output，預留tokens及USD；body含schema/system/messages，不削欄位。玩家仍沿原本「已知累計」的每派送guard，不新增最大合法body乘全輪slot的拒絕前提。單次回覆可能跨過玩家token門檻，這是原政策的限制；回覆後已知用量照記並在下一派送前停止，不能冒稱供應商逐token硬切斷。全批有限方案／授權的額外硬預留與原玩家政策分開呈現。

正向測試另外明示建立**合成既有payer**（100calls／1,000,000tokens）以測試完整80次advance與跨trial帳務，不把這個fixture設定冒稱原預設能跑完。另有原預設12calls／30000tokens成功forward後到限停止、授權call/token/USD更低及elapsed的測試；原預設不呼叫set-budget、不刷新小時窗口。合成價目僅測守門，不是官方價格證據或派送授權。

## 證據與失敗

每輪先持久保存pending operationId，再advance；只有GET確認同ID settled／committed、trace完整及成本已知才進下一輪。每筆真正requestBody與prepared trace逐byte比對，保存before／after、原body／response、候選／選擇、追求版本、活動／物件／可知結果與後續真正input。每輪1MiB、每trial16MiB，超界明示停並保留不足，不截斷成完整證據。完整原件在private run directory；公開只有摘要、必要hash及合成畫面。

第一組受控旅程為：同次候選／共享承接 → 真詢問及Cass可知答覆 → 等待 → 原裁定探索 → 已知替代備餐方法 → 真實材料消耗與一份餐點 → 後續input依可知結果分層滿足／暫時足夠 → 自主退出額外方向。共享追求身份與一份活動進度保留；未選候選不變待辦。其餘組驗證runner窗口／clean story／同payer連續性，**不是十次真實行為成功**。

受控旅程只在測試端固定必要感知骰 `.675`；先前未固定時，新來源雖存在但可能未察覺，下一次真輸入斷言會合理失敗。固定外部骰後通過，不修改live的骰子或Date.now，不把合法未察覺樣本當作追求功能失效。獨立預檢、版本／來源指紋、原預設到限、三種授權最小上限、unknown usage、STOP、elapsed、Key echo、transport error、pending SQLite及原ID重開／拒絕重啟、證據超界與正向完整旅程共15項；typecheck與本輪eslint通過。完整既有1074項回歸另見整合報告，最終code review由整合PR記錄。

`readback.json`、SQLite及首組只讀副本支援重新開檔查原ID；HTTP WorldApp只讀入口拒絕POST，重載不派送。圖、scope、本人滿足與實際物件分開顯示。C1–C30完整對照見[整合驗證](pursuits-220-integration.md)，真實試驗責任見[新版預登記](pursuits-220-preregistration.md)。

L5以外部controller的明確人工證據確認判定相關承接，不以任意active工作或餐點keyword推論。確認須帶runId、trial、真正已提交operationId、pursuitId、version、相同scope、relatedMealCommitment=true與人工review reference；只能在該已提交世界中核對有效非direction追求，不寫入焦點角色追求／記憶。沒有確認維持not-reached，不消耗唯一變化機會。程式API `confirmMealCommitment` 可等待外部人工判讀（仍受原45分鐘／授權期限約束）；CLI可用`--confirmations-dir /private/confirmations`讀取`L5-1.json`／`L5-2.json`，每次已提交回合後只核對當下匹配的有界原件。過期／不符操作、版本或scope不觸發；人工相關性判讀本身不是程式已驗證語義或真實行為成功。
