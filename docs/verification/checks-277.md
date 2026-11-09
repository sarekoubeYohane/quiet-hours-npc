# #277 人物能力參與 d100 行動與感知

基底 integration `f7e31ff`，獨立 worktree／分支 `feat/checks-277`。前置 #275 已完成並關閉後開始，依 [已批准A](../design/character-dice-energy-recommendation-2026-11-09.md)、ADR 0012 與 [d100工程契約](../design/d100-checks.md)。本報告只記錄本地可控工程驗收，不宣稱 main／正式世界或真實付費模型品質已驗收。

## 完整路徑與可見結果

- 四條判定入口均使用後端 d100：自由效果的受限結果分支／simple check、新確認日常program、主動及被動感知、內建社交表達／髮飾設計。新check保存版本、能力關聯與實際因素；舊D20、舊日常規則、歷史及已開始 deferred action 保留原版。
- 角色能力、已確認專長／感官及關注真正影響T；自由文字不現場賦權，同名屬性／感官不能再疊成專長。多感官按自身條件選最高T、穩定字典序破同分，只揭所選路徑的線索；先沿用舊群組保存結果。
- 初始／城市設定與現有人物檔案可明示感官硬限制。更新只改列表，不抽人物、不改容量；直接可見、入場、被動線索、active probe及不確定判定均尊重硬gate。01及正感官修正不突破失去機會，舊成功快取也不能繞過後來確認的硬限制。
- 成果、來源及骰果隨世界共同保存；原ID、同方法／同實質條件重試、版本切換、重載不洗骰；實際條件改變才產生新機會。下次真正模型請求只含本人主觀經歷，不含骰點、T、結果級別或觀察者診斷。社交大成功不替他人同意，技能結果不自動補電。

## TDD與受控驗證

第一個真正世界API反例 RED：導入人物後指定髮飾挑戰，期望骰05為d100大成功，既有D20未標版本而失敗。加入受控後端新制後GREEN，後續沿同API逐步擴充而非只交helper單測。

`node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/d100-api.test.cjs` 最終 **17/17**，無fail/skip：

1. API後端骰01／05／06／55／56／75／76／95／96／100，以及全部100面枚舉：5／50／20／20／5次五段結果；T10及75、能力2與4在同骰50的差異、已確認專長與未確認文字。
2. 真正模型transport／世界分支及simple check承接，效果與SQLite重讀一致；後續真正NPC request不含骰／門檻。新日常規則保存d100，舊已保存program在新實質對象仍沿D20。
3. D20自由／感知舊結果跨人物導入、DC／能力／版本／措辭更動不重抽；物件實質狀態或干擾改變才有新機會。舊正在執行的deferred髮飾挑戰在中途導入後仍擲D20完成。
4. 受控感知：感知能力／感官／主動關注合成、同機會重試、被動多感官選擇、匿名來源；明示禁用視聽、直接可見與01無機會，有限更新不重抽屬性；後來禁用感官先於成功快取。
5. 相同固定社交結果不再抽骰，大成功後對方拒絕關係仍保留。direct preflight不抽骰；普通直接可見不被強制改成檢定。
6. 保存前故障、提交後遺失回覆、CAS及同ID回放，效果／骰果共同提交或回退，已知模型用量保留；實際檔案SQLite關閉／重開後讀回原骰與回放不再取樣。

適當回歸命令沿同runner涵蓋 d100、d20、activity-results、routine-results、routine-world-changes、perception、active-perception、false-perception、#275 API／WorldApp與#276：**128/128**，無fail/skip。之後增加硬gate先於舊快取的第17項，另重跑上述最終17項；沒有把兩次數字相加成獨立案例數。`npm run typecheck` exit0；`npm run lint` exit0、0 errors／4個既有warnings；`git diff --check`通過。

所有測試預載no-network、transport與骰受控；file SQLite沿既有production-module host adapter，不直接查SQL當產品驗收。無付費模型、無部署、無正式世界推進。

## Chromium真正畫面

[可重跑旅程](../../tooling/verification/browser-checks-277.mjs) 由根代理在允許loopback的隔離環境執行，原環境的listen沙箱限制不以省略瀏覽器驗收處理。首輪PASS，再為可讀局部證據加入單筆結果截圖後第二輪PASS；沒有產品失敗被略去。

- 真正人物檔案確認四屬性與專長 → 原direct API preflight零骰 → UI四次五分鐘步進後 d100 96／T75／大失敗。
- 原方法／條件的髮飾重試不再取骰；下次正常模型請求讀到本人經歷但沒有內部判定。
- 同一人物檔案明示禁用視覺，骰源設01後向直接可見人物主動查看仍無新視覺觀察；重載保持數值及硬限制。

[局部d100結果](checks-277/checks-277-result.png) · [完整分析頁](checks-277/checks-277-d100.png) · [人物硬限制](checks-277/checks-277-limits.png) · [機械摘要](checks-277/checks-277-browser.json)。實測總取骰1、受控模型呼叫2、付費呼叫0、pageerror0。其他畫面有界資訊不靠固定台詞、測試專用UI或外部真假校正。

精神電量正式政策與啟用仍歸 #256／#263，本票沒有擴寫該支線或新增需求依賴。未自行合併main、部署、推送或關閉Issue。
