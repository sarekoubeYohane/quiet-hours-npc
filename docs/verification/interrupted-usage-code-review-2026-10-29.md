# 中斷用量恢復：兩軸 code review

依 repository `code-review` skill，兩個獨立 reviewer 平行審查，固定點 main `da6b0c22430e560923d99520e65c9bc62c2d5805`，初審整合 `1987550`。規格來源為 #92 頂端 2026-10-29 切片與 #77 補證；標準沿 AGENTS、Matt Pocock、domain／issue-tracker、GLOSSARY、ADR 0004 及追溯／期限工程契約。下列保留各軸結論，不合併排名。

## Standards

未發現文件明定規則的違反；diff whitespace 通過。兩項低優先可維護性判斷：

- `usageFromTrace` 重建 `beginCost` 的 cohort key，恢復模組依賴成本模組內部索引。建議集中 key 與派送時間責任。
- `recoveryStatus` 將不可讀、缺 trace、pending、空 marker 與 legacy 塞進巢狀三元式，難以直接核對帳務安全條件。建議具名分支。

`fa668ba` 複核：兩項均解決。派送時間改由 `beginCost` 的實際時間參數承接，狀態改為具名條件與分支。沒有新增相關問題。工具強制的型別／lint 問題不列為此軸 finding。

Standards：原 0 項硬性違反、2 項低優先判斷；最重要為跨模組 key 重複依賴，已解決。

## Spec

兩項 High：

1. **受理與帳務恢復競爭覆蓋已恢復用量。** 新請求若先載入舊 world，恢復隨後不增加 version，再讀新 journal，原租約 CAS 便可能接受舊 world／新 journal。違反「只計一次，不覆蓋較新世界」。永久 API 交錯測試先 RED（200，預期 409），修正以原始 state／version 核對與取得租約的 state CAS 阻止舊快照。
2. **原 worker 收尾時重複保留 unknown-price cohort。** 原恢復只遍歷 desired cohorts；先以未知價格暫記，原 worker 晚到帶確切價格時，可能加入 priced cohort 而未扣除原 unknown 貢獻。違反「calls、tokens、費率與成本資料一致」及「原 worker 晚到只計一次」。世界 API／transport／SQLite 重現 totalCalls 1、cohort calls 2，並有重複 tokens。修正對 prior／desired key 聯集作差額核對，僅扣回原操作貢獻；永久測試另保留同 cohort 的三筆其他歷史。

`fa668ba` 複核：兩項 High 均解決。Reviewer 親自重跑原 API 重現 **1/1 PASS**（totalCalls 1、cohort calls 1、unknown 0、USD 0.00005），永久矩陣 **15/15 PASS**。未見範圍擴張或需要新產品決策。`costSummary.complete` 描述已入帳呼叫，額外不可見窗口由 `unknownRange` 與 UI 明示，未另列缺陷。

最後 `2af5258`／`ea41491` 差異複核：finalized orphan marker 清理同時作用於恢復寫入及原 trim；#211 素材測試於 pinned checkout 驗證，修改產品仍被 gate 拒絕，checker／註冊未改。無新增阻擋性問題。

Spec：原 2 項 High，均已解決；無未解 finding。#77 的正式中斷原因仍未知，沒有以帳務 fixture 宣稱正式可靠性或 NPC 行為通過。
