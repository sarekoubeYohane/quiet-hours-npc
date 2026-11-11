# 專案代理指南

## 協作方式

使用繁體中文。需求釐清一次只問一題。
區分已確認的設計與已實作的功能，避免把設計當成現有行為。

## 找檔案與驗證

- 找檔案、了解模組分工與容易誤導的檔名：先讀根目錄 `ARCHITECTURE.md`。原始碼單行很長，用符號名搜尋，不要依賴行號。
- 跑測試、新增測試或 migration：見 `docs/testing.md`。測試與 migration 都要手動登記到 runner，沒登記不會被執行。
- `docs/` 多數文件是有日期的快照，先看 `docs/README.md` 分辨現行契約與歷史紀錄；搜尋程式用法時排除 `docs/verification/`。
- 結構有變動（新增模組、route、資料表、版本開關）時，同步更新 `ARCHITECTURE.md`。

## Agent skills

### Matt Pocock 工作流程

本專案使用 `.agents/skills/` 的 Matt Pocock 工程技能。開始任務時讀取 `docs/agents/matt-pocock.md`，依任務與使用者選定的流程載入相關 `SKILL.md` 及其相依文件。

### Issue tracker

工作事項與規格使用 sarekoubeYohane/quiet-hours-npc 的 GitHub Issues。見 `docs/agents/issue-tracker.md`。
開 issue 時盡量附 Gherkin 驗收條件；預期行為未定的部分列為待釐清，不自行編造。

### Domain docs

採 single-context：根目錄的 `GLOSSARY.md` 與 `docs/adr/`。見 `docs/agents/domain.md`。
