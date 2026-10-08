# Matt Pocock 工作流程

## 技能來源

原始來源：https://github.com/mattpocock/skills
固定版本：`f3fc5632f401156837ee3872f14fe33ccf1024ea`（2026-10-07）。
專案副本位於 `.agents/skills/<技能名稱>/`，保留原始 SKILL.md、Codex metadata 與相依參考檔。授權見 `.agents/matt-pocock-LICENSE`；完整來源對照見 `.agents/matt-pocock-source.json`。

只讀取目前任務需要的技能與參考檔。更新版本時明確比較上游差異，再更新固定版本與來源對照。

## 載入與執行

1. 使用者點名技能時，先讀取對應 SKILL.md，再執行其流程。技能規定呼叫另一技能時，也讀取並遵循相依技能。
2. 有 Skill 工具時使用該工具。只有檔案讀取能力時，讀取本 repo 的技能副本；GitHub 連接器可用 fetch_file 讀取相同路徑。這是載入方式的調整，流程仍以原文為準。
3. 保留上游 user-invoked / model-invoked 分別。user-invoked 技能由使用者點名後執行；model-invoked 技能可依任務需要使用。尚未選定工作流程時，提供相關技能選項。
4. 本專案的「繁體中文、需求釐清一次只問一題」優先於 grilling 的整批提問格式；其設計樹、推薦答案、查證事實與記錄決定的原則保留。
5. 測試介面、規格與任務拆分依技能規定先供使用者檢視；已有明確決定或授權的項目直接沿用。依任務驗證，設定與文件變更以內容、路徑及引用檢查為主。
6. 技能要求子代理時，遵循該技能的分工方式；僅安裝或閱讀技能不會啟動子代理。

## 工作入口

| 使用者選定的工作 | 讀取技能 | 相依或後續紀律 |
| --- | --- | --- |
| 判斷哪個流程適合 | ask-matt | 推薦前讀取該技能原文 |
| 釐清新設計 | grill-with-docs | grilling、domain-modeling |
| 整理已談好的規格 | to-spec | 指定測試介面，發布 GitHub Issue |
| 將規格拆成可驗證的工作 | to-tickets | 完整垂直切片、阻擋關係與驗收條件 |
| 實作一項工作 | implement | tdd、code-review |
| 依任務圖實作整份規格 | implement-spec | tdd、code-review、pr |
| 交接至另一個工作環境 | handoff | 指向已有文件與提交 |
| 回顧本次工作環境 | retro | 提出有證據的改善 |

依任務需要可使用的紀律：domain-modeling、codebase-design、tdd、code-review、diagnosing-bugs、prototype、pr、writing-for-agents。執行前讀取原文與相關參考檔。

## 專案設定

既有 setup 選擇沿用：AGENTS.md、GitHub Issues、single-context（根目錄 GLOSSARY.md 與 docs/adr/）。操作規則見 issue-tracker.md 與 domain.md。

本次收錄常用工程流程及其相依技能，未安裝 triage；不建立整套 triage labels。to-spec 與 to-tickets 使用的 ready-for-agent 標籤，在首次發布工作時確認／建立。

上游其他技能可在使用者點名時按固定版本補入，包括 triage、wayfinder、research、improve-codebase-architecture、wizard。需要新增設定時再處理相應 setup 分支。

## 目前工作

NPC 意圖與行動已完成 grill-with-docs、to-spec 與 to-tickets；使用者已授權按 implement-spec 實作。正式規格為 [Issue #1](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/1)，四張工作票 #2–#5 已在 [整合 PR #6](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/6) 實作，尚未合併或部署。

世界 API 的意圖保存、活動續做與切換、店主指定與接管、交還上下文、錯誤回復及用量衝突已有自動驗證。店主介面的瀏覽器操作檢查仍待完成：本工作環境的 CUA 檔案 URL 存取被政策阻擋，沒有繞過或宣稱完成。未發出付費模型請求；實際性格與敘事表現需另以決策紀錄檢視。功能與上下文限制見 README.md 及 docs/design/npc-action-model.md。
