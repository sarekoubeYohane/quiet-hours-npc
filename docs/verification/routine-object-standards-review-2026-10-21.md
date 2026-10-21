# 日常物件修正：Standards 審查

比較基準：`583e6cb`；審查提交：`ae9ba4d`。命令：`git diff main...ae9ba4d`、`git log main..ae9ba4d --oneline`。

來源：`AGENTS.md`、`docs/agents/matt-pocock.md`、`docs/agents/domain.md`、`docs/agents/issue-tracker.md`、`GLOSSARY.md`、感知 ADR，以及 code-review skill 的 smell baseline。未找到額外的 CONTRIBUTING／CODING_STANDARDS。

## 硬性規範

未發現已記載規範的違反。測試經世界 API 觀察保存結果，模型替身位於 transport 邊界；新增中文詞彙與既有日常供應／物件具體化定義一致。沒有看到觀察者診斷或未知世界真相回灌 NPC 的新增路徑。

## 判斷性建議

1. **可能的 Duplicated Code，低風險。** `lib/world-effects.ts` 的 `checkPhase` 新增 `tool.lifecycle!=='active'||tool.state.condition==='broken'||tool.state.available==='no'` 及 holder／owner／allowedTo 判斷，與 `lib/routine-materials.ts` 的 `usableRoutineObject` 重複。兩處這次都同步新增 available 檢查，之後若只改其中一處，開始活動與執行階段可能採用不同的使用條件。建議讓階段檢查重用既有資格 helper，只在當地另檢查位置與知情。這是 skill baseline 的可維護性建議，不是專案硬性規範違反。

Standards：0 項硬性違反、1 項判斷性建議；最高風險為工具資格檢查未集中。

## 修正後複查

已複查 `e4ac69b`、瀏覽器追加 `e0662a8`，整合 HEAD `dfb5155`。工具資格檢查已改為共用 `usableRoutineObject`，原判斷性建議已處理。`routine-materials.ts` 對 `world-effects` 僅有 `import type`；以 TypeScript CommonJS 轉譯確認反向 require 不存在，沒有新增 runtime 循環依賴。

瀏覽器 runner 維持真實 UI→世界 API→SQLite 路徑，追加飲用、清洗、新泡茶、重載及裁定次數驗證；截圖改為直接擷取狀態 panel，未改動應用 UI 或以成功文字代替物件斷言。沒有新增 Standards 殘餘項目。

最終 Standards：0 項硬性違反、0 項未處理建議。
