# #275 背景約束下的穩定人物建角與查看

基底 `6cf338f`，獨立分支 `feat/character-275`；依 [已批准A方案](../design/character-dice-energy-recommendation-2026-11-09.md)、ADR 0012 與 [工程契約](../design/character-attributes.md) 交付。未開始 #277 的行動／感知換制，既有精神電量不啟用、不重抽容量。

## 真正流程與驗收

既有城市編輯器可設定背景允許範圍、指定值與分開的領域／感官修正，先核對自由文字背景再開始世界。預覽不抽骰；成功開始時四屬性共同保存。既有缺值人物從人物檔案明示導入一次；同頁查看已保存數字、範圍、專長／感官及適用界線。GET／重載／原ID重送不形成第二份人物，已形成者不能重抽。

普通人物列舉兩顆d3九組結果，受限區間按原分布條件抽樣（力量1–2時機率1:2）；明示值不抽骰。非法小數、超出背景、空範圍、重複專長及非法修正皆拒絕並保留原設定。原人物背景、能力標籤與控制身分保持；精神電量資料保持原保存權威。

## TDD 與可重現檢查

- 首條世界API反例先 RED：`adopt-character-attributes` 尚不存在，400「無效操作」；實作後 GREEN，經SQLite讀回及同ID回放保持相同數字。
- Chromium新城市發現原人物分析把「沒有任何追求」誤認舊版本。WorldApp空追求反例先RED，再修正僅對真正有舊節點者顯示舊版提示，空集合顯示中性尚無方向；城市本身原已有 `pursuitVersion:1` 與 `pursuitContext`，沒有透過重置回避。
- `node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/character-attributes-api.test.cjs tests/character-attributes-ui.test.cjs`：7/7。世界API涵蓋九組普通骰、條件抽樣邊界、拒絕矛盾／過期設定、保存前故障／提交後遺失回覆／CAS、原ID重送、成功新城市正常推進、精神容量保留，以及實際檔案SQLite關閉／重開後再讀與回放。
- 與 city-creation、city-access、character-generation、mental-energy、owner-control、initial-memory-capacity 的同runner適當回歸：40/40，無fail/skip。UI反例修正後另重跑上述7項。
- `npm run typecheck`：exit0。`npm run lint`：exit0，僅4個既有warnings。`git diff --check`：通過。

所有模型transport均受控，測試runner有no-network preload；API／UI／保存走產品流程。SQLite檔案案例沿既有 `pursuit-runtime-228` host adapter，不以私有 helper 或直接查資料庫當驗收。

## Chromium畫面與限制

旅程：[browser-character-275.mjs](../../tooling/verification/browser-character-275.mjs)。沿既有隔離browser fixture；新舊人物都操作真正WorldApp、世界API與SQLite，無測試專用UI。首輪本機listen因沙箱EPERM，由整合代理在允許loopback的隔離環境代跑；首個browser執行在preview等待逾時，修正runner開始按鈕文案、加15秒deadline及診斷後第二輪通過開局／重載。新增正常推進驗證時第三輪發現runner未帶時間政策header，回426；補header及每次mutation前推進受控時鐘後重跑。第四輪完整通過，含新城市真正正常推進：1次受控模型transport、0次付費派送。這些runner失敗不算產品通過或隱去。

畫面：[舊人物導入](character-attributes-275/character-275-profile.png)、[新城市人物](character-attributes-275/character-275-city.png)；機械證據：[browser摘要](character-attributes-275/character-275-browser.json)。既有畫面確認衝突保留輸入、已確認專長／感官、SQLite重載、新城市編輯器預覽／開始及新城市正常受控模型推進，零付費派送。

沒有呼叫付費模型、部署、推進正式世界或自行合併main。受控模型只證明流程與保存，沒有宣稱真實模型語義品質。後續 #277 仍須獨立完成骰制接入與防洗骰驗收；目前畫面明說新資料尚未影響行動／感知判定。
