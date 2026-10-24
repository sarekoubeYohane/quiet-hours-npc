# NPC 候選安全驗證原因：本機驗證（2026-10-24）

本輪只交付 #92 頂端 2026-10-24 窄切片；#91 的私有保存／重讀／owner 權限與 0005 migration 基礎已存在並沿用，沒有重做或關閉前置票。#92 更廣故障矩陣及 #85 根因仍保留各自責任。

## 證據與診斷

基準 main `58b8aa9`，與觀察版 `6dfe6c7` 產品程式相同；差異只有 PR #160 的兩份報告。報告記錄長期 ID 被填入短期選留，但正式 trace 只保留泛化 kind／stage；原始私有 transcript 本輪未取得，沒有補造或獨立重播歷史輸入。以下皆為明示合成 fixture。

`node tests/run-activities.mjs tests/candidate-diagnostics-api.test.cjs` 首先 RED：malformed JSON、長期 ID、版本錯配、外來 ID、空理由五種候選的保存重讀 `failure.reason` 全為 undefined，不能區分原因。

可反證假設依邊界排序：

1. NPC 外層 catch 丟棄實際分類；由實際型別帶原因後應可分。
2. capture 只保留 kind／stage；僅新增上游原因但不擴充 capture 仍會在重讀遺失。
3. 單筆超限省略器丟棄新增欄位；一般小型實錄可分，省略骨架仍需另驗。

修正以有界 code 從實際解析／來源驗證邊界傳遞，不比較 exception.message、公開 stack 或取記憶本文作診斷。記憶來源失敗使用專有錯誤型別；欄位形狀錯誤保留不同分類。沒有增加模型重試。

## 實際測試

- 上述 API 命令 GREEN：8／8。真世界 API、共用派送替身、真實序列化、測試 SQLite；較早角色先移動，後一角色候選失敗後完整世界（除已知用量）與起點一致，原操作重送不再派送或新增實錄。
- 同一測試涵蓋 json-parse／memory-selection-reference／field-format、長期／外來／錯版本、超限回條保留安全 code、實錄寫入失敗保留最後已知狀態與 gap、跨帳號不讀到實錄、console 不含私人文字／假憑證、下一次 NPC request 不含新增診斷或失敗候選私人文字。
- 單筆超限時不保留 rawCandidate；寫入失敗時不聲稱最後持久保存點已具有後來的原因。

瀏覽器驗證入口：`tooling/verification/browser-candidate-diagnostics.mjs`。使用真正 WorldApp→世界 API→模型替身→SQLite，核對三類原因與合成舊紀錄未知、分析文字及重載。實際執行通過 5／5：json、reference、format、legacy 缺失與 unknown-code（刻意用 `constructor` 驗證未知代碼不被原型屬性誤認）皆顯示正確分類或未知，且重載無新增操作。執行環境：Playwright runtime＋本機 Chromium 153，`CHROMIUM_EXECUTABLE=/tmp/npc-chromium`；沒有正式站或真實模型請求。`npm run typecheck`、`npm run lint`、`git diff --check` 亦通過。

## 限制

沒有呼叫付費模型、操作正式世界、合併或部署。固定回覆只能證明確定性程式行為，不能證明真實模型不再出錯，亦不能宣稱泡茶 loop 已修復。舊實錄缺少原因時仍未知；新增診斷無法還原原事件未保存內容。這是既有工程契約補齊，沒有新增架構決策或 ADR。
