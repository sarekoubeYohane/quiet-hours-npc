# 活動耗時：審查修正後瀏覽器回歸

已整合runtime `505e0f0`、`782dc47`，最終文件整合基準 `238553b`。以下皆實際 Chromium153／WorldApp／世界API／SQLite，明示模型transport替身；不使用正式世界或付費模型。通過以runner實際輸出PASS標記與API斷言判定，不只看程序exit0。

## 已執行與通過標記

| Runner | 實際PASS情境 | 派送 |
| --- | --- | --- |
| browser116 | `estimate 15, confirmed tea 30 -> 30`；`estimate 60, confirmed tea 5 -> 15`；各自重載後咖啡45重用 | 各2NPC＋1裁定 |
| browser117 | `cap15/world30 normal saved shortage`；重載後自主cap30重用完成 | 2NPC＋1裁定 |
| browser118 | `open-ended`；`completion`（餐點45分鐘，無提前成品） | 前者2NPC＋0裁定；後者1NPC＋1裁定 |
| browser119 | `continue60`、`continue90`、`open45`、`switch60`、`controls30`、`moved90` | 依序2＋1、2＋1、3＋0、2＋1、1＋1、9＋2（NPC＋裁定） |
| browser100 標準propose | `complete`、`interrupt`、`save`、`other-npc` | 原有界派送斷言全部通過 |
| browser100 `TEA_ACTION=legacy` | `complete`、`interrupt`、`save`、`other-npc` | 原有界派送斷言全部通過 |
| browser112 | 實際授權杯／材料→共用茶→移動→住宅首次確認→重載重用 | 9NPC＋4裁定 |
| browser110（782dc47後） | 茶→飲用→清洗／歸還→咖啡→飲用／清洗／歸還→有限蛋糕→簡餐→重送 | 11NPC＋1裁定 |

782dc47只追加既有food的提早consume／destroy防護；其後另完整重跑118兩語意及110飲品消耗生命週期，皆有PASS標記。其他表中案例於505e0f0後完整跑過，後續沒有相關runtime變更。

## Fixture調整與限制

- browser119的90分鐘移走杯案例，把原本top-level加水改為明示15分鐘準備階段，90分鐘才完成。這符合審查後「top-level效果是最終結果；部分進展必須以階段表達」的契約。browser100原本就是30分鐘加水／60分鐘茶，保留既有時間，沒有改成另一個固定值。
- browser112現在明確驗證兩筆獨立規則：cafe及vera-home各自維持窄範圍 `['tea']`，沒有擴張住宅。原先「當地日常背景確認」畫面selector逾時，因合法當地裁定現在保存新規則、顯示「首次裁定確認」；更新selector後整串再跑通過，保留4次裁定與全部權限／位置斷言。
- 長矩陣程序曾在exit0時只收集到前段PASS，因此另以單項selector重跑並逐一核對controls／moved及短茶標記，不把部分輸出當全數完成。新增 `BROWSER116_TEA_MINUTES=5|30`、`BROWSER118_CASE=open-ended|completion`，既有 `BROWSER119_CASE` 可單項重現。預設仍執行完整情境。
- 新增／調整runner的ESLint與 `git diff --check` 通過。全部變動為測試替身與驗證文件，沒有runtime修改。

命令與Chromium環境沿 `tooling/verification/README.md`；各票畫面見browser116–119驗證紀錄。最終審查修正新增的非法候選與範圍保存API回歸另見 `activity-time-review-fixes-2026-10-21.md`，沒有宣稱每項非法候選都另在瀏覽器重播。

正式站仍是舊版本7e470ef；新版真實模型、正式保存與實際用量待部署後驗收。本回歸沒有合併或部署。
