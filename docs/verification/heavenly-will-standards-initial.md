## Standards

審查範圍：`47229d8fffcee57e4d0b62a3330f4d1a443c3e29...7fc9ae7e5a960979983fc28020f6b0fd79e9718f`。已閱讀指定 repo 規範、詞彙、ADR 與 TDD 文件；未重跑 root 負責的工具檢查。

**硬性規範違反：0。**

**可能的 smell（判斷性建議）：2。**

1. **Possible Duplicated Code** — `app/api/world/route.ts:364–377`。兩個 catch 同樣執行 `usage.savedDecisions = snapshot.aiUsage?.savedDecisions || 0`、`for(const key of Object.keys(world))delete ...`、`Object.assign(world, snapshot, { aiUsage: usage })`。這個「完整回復世界但保留付費用量」規則涉及失敗一致性，建議抽成單一回復函式，兩處只提供各自的快照，降低日後只修其中一處的風險。不是既有文件明文違規。

2. **Possible Speculative Generality / Mysterious Name** — `lib/models.ts:81–84`。新增 `inputDigest = ... SHA-256 ...` 及 `binding = {requestId,characterId:c.id,contractVersion:npcContractVersion,inputDigest,...recall?.binding}`，但後續只讀 `binding.requestId`。其餘欄位既未驗證、保存，也未交給 adapter；`binding` 名稱因此容易讓讀者以為已執行比現有 closure／lease 檢查更多的關聯保障。建議移除未用計算及欄位，或讓真正的關聯驗證使用它們。不是硬性規範違規；現有 closure／lease 仍提供實際保護。

**TDD seam 核對：** `.agents/skills/tdd/SKILL.md` 要求「Tests verify behavior through public interfaces」；`mocking.md` 要求「Mock at system boundaries only」。新增 `tests/free-actions-api.test.cjs` 與 `tests/model-contract-api.test.cjs` 實際呼叫 `POST`／`GET`，透過讀回世界檢查持久狀態；模型、時間、隨機與保存故障在系統邊界替代。`tests/run-activities.mjs:61–63` 確實註冊這兩組測試。`browser93.mjs`／`browser94.mjs` 操作真實 app 控制與 API，再讀回世界；未見用直接呼叫內部 effect helper 取代使用者流程。派送次數斷言對應此次明確有限派送驗收，可保留。
