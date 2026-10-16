# 天上意志／自由行動整合驗證

日期：2026-10-16（Asia/Taipei）。PR：[#101](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/101)。基準 main：`47229d8fffcee57e4d0b62a3330f4d1a443c3e29`；最終執行驗證 runtime：`4e107ac`，之後僅整理驗證文件與空白。未合併、部署、啟用真實付費模型或重置玩家世界。

## 範圍與實際成果

| 工作票 | 已執行驗證的成果 |
| --- | --- |
| #69 | 主觀上下文與傳輸分離、單一版本化候選驗證；顯式相容版及舊候選均可讀回，未知版本整回合拒絕 |
| #73 | 系統 requestId 與封閉的實際請求上下文、回覆後再查版本／租約／截止；錯配、遲到、重送及已知用量 |
| #74 | 獨立裁定輸入、服務與 transcript；既有確定動作不增加裁定請求，fixture 走真正世界執行／保存 |
| #93 | 裁定配置、必要啟動門檻、加密 Key、共用玩家預算、分任務費用；有限供應取得／食用、否決／unsupported、無效與故障 |
| #94 | 所有者自主 grant、接收者自主 consent、借用／攜帶／洗淨／歸還同一物件；持有與所有權分離、消耗／損毀 tombstone |
| #100 | 逐階段生效、原始時鐘與 cursor、明示續做／中斷、他人接觸中間杯子、前提失效不覆寫且不洩去向 |

[已批准拆票與實際連結](../plans/heavenly-will-tickets-2026-10-16.md)。沿用 #93／#94，新增 #100；票面與留言核對後發布及讀回，父規格 #87 沒有修改或關閉。上述是本輪分支成果，票由 PR 合併時關閉，不能把 ready-for-agent 當成已合併。

## 測試結果

| 檢查 | 實際結果 |
| --- | --- |
| 起始 main `pnpm test` | 258／258 |
| 最終 `pnpm test` | **290／290**：世界／活動 API 248，登入／Key／重置 32，Workers／D1／migration 10 |
| 新增 API 測試 | 契約／請求 6，自由效果／物件／階段 26；均註冊在預設 runner |
| `pnpm typecheck` | 通過 |
| `pnpm build:production` | 通過；僅本機 build，沒有 deployment |
| 變更 JS／TS 檔 ESLint | 0 errors，1 項原有 `act` effect dependency warning |
| 全 repo lint | 仍有原有 `tests/d20-api.test.cjs` 4 個 require-import errors；沒有宣稱全域 lint 通過 |
| `git diff 47229d8...HEAD --check` | 通過 |

模型、OAuth、時間、骰值、服務錯誤與保存故障使用可控系統邊界替身。Node 測試預載 no-network；真實 Workers 測試禁止所有 outbound。瀏覽器執行真正 WorldApp、GET／POST handler、序列化與 SQLite，不是靜態頁或角色固定台詞驗收。

### 真實 Chromium

最終修正版重跑 `browser93.mjs`、`browser94.mjs`、`browser100.mjs`，全部 exit 0、無 pageerror：

- #93：11 組 PASS。缺設定手動／自動零派送；保存／重載／不洩 Key；取得→食用→讀回；兩次 NPC＋兩次裁定；任務費用分列、操作重放；Key 替換；denied、invalid、budget、save conflict、stale 回覆。
- #94：跨五個已保存回合借用→帶到咖啡館→洗淨→帶回→歸還；同一 ID／owner／holder／region／revision，5 次 NPC＋3 次裁定。重新載入保持成果。
- #100：四組完整情境：不中斷完成（含 reload／continue／重送）、自主中斷保留水、後回合保存衝突仍保留先前水、另一 NPC 看見中間杯子→拿走→帶到別區→舊階段取消。角色後續輸入不含隱藏新位置／持有人。

既有 `browser81.mjs`、`browser82.mjs`、`browser83.mjs`、`browser89.mjs` 亦重跑通過：付費方／停止原因、已發生費用與不完整價格、費用推估及共用導航／運行控制。它們的 AI fixture 現在明示裁定配置，不以測試預設繞過必要條件。

截圖：[設定](assets/heavenly-will/browser93-settings.png)、[窄版設定](assets/heavenly-will/browser93-settings-narrow.png)、[歸還同一物件](assets/heavenly-will/browser94-returned.png)、[階段完成](assets/heavenly-will/browser100-completed.png)。截圖已以 CJK 字型檢視，窄版無橫向溢出。

## TDD 與兩軸審查

前置契約及每個垂直切片先執行失敗案例，再最小實作通過。世界 API 測試經 GET 重讀持久狀態、檢查操作重送與費用，不用私有 executor 或指定台詞代替驗收。

[Standards 初審](heavenly-will-standards-initial.md)：0 硬性違規、2 項建議，已抽共用回復並移除沒有作用的 binding 欄位。[Spec 初審](heavenly-will-spec-initial.md) 的兩個實跑失敗已修復：

| Red 證據 | Green |
| --- | --- |
| 保存前拋錯，已發 2 次模型／60 input／20 output，讀回用量卻是 0 | 保存前例外補留已知用量；保存後回覆遺失先讀 durable receipt，不重計；同 operationId 重送無派送 |
| schema 合法的 15 分鐘首階段，advance15 卻 502 且已付 2 calls | 計畫沿回合開始時間，建立後立即依 cursor 套用到期階段；15／30 分鐘皆通過，未來階段不提前完成 |

同輪再補 strict structured-output 封閉 state schema、owner 不自動知情、hidden grant 拒絕、空 accepted 拒絕、purpose 傳遞、stage target 的判定指紋，以及換句話不重擲。

獨立複審：[Standards 0 硬性／0 未解決建議](heavenly-will-standards-final.md)；[Spec 0 未解決](heavenly-will-spec-final.md)，另以獨立探針＋定向 API **34／34** 通過。兩軸沒有混合排序。

## 工程定稿與限制

- 每個 NPC slot 至多既有 2 次 NPC 聊天（含一輪回想續答）＋1 次自由提案裁定；每個 advance 至多 3N 次，逐次查同一玩家預算及操作權限。既有確定動作／純階段續做裁定 0 次，無格式修復重試、背景事件或靜默轉服務。這是工程方案，不是撤回 Grill Q3 的批准。
- 目前自由效果為有限供應具體化、消耗／損毀、同場景轉移、確認狀態變化、本人 grant／consent。每份候選最多 8 KiB、4 個 immediate effects、4 個階段，每階段最多 4 effects。跨場景、新方法或新同意交回 NPC。
- 正式種子不新增菜單或茶具，供應及可變狀態須來自明示確認的場景；本輪不新增供應配置 UI 或自動世界生成。完整泡茶情境是可重現 fixture，沒有擅改角色正史或住宅。
- 相同物理效果與權威條件保守視為同方法，尚不細分文字不同但物理效果相同的新技巧；`freeTrials` 上限 128 組，滿時明示技術限制而不丟舊結果洗骰。
- D1 完全無法讀寫時無法保證立即存入用量；維持持久 pending／uncertain 與禁止盲目重送。可確認保存前／後例外的分支已驗證精確保留及不重計。
- 未測真實付費供應商的人設／語意品質、真實本機模型或正式站配置；未啟用服務、合併、部署或重置世界。#91／#92 診斷 UI 並非本輪完成票，僅沿共用派送邊界保留接點。

## 重現

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build:production
PLAYWRIGHT_MODULE=/absolute/path/to/playwright \
CHROMIUM_EXECUTABLE=/absolute/path/to/chromium \
BROWSER_FONT_DIR=/absolute/path/to/@fontsource/noto-sans-tc \
node tooling/verification/browser93.mjs
```

以同樣環境依序執行 `browser94.mjs`、`browser100.mjs`、`browser81.mjs`、`browser82.mjs`、`browser83.mjs`、`browser89.mjs`。全部只操作可拋棄的本機 fixture，不連玩家正式世界。
