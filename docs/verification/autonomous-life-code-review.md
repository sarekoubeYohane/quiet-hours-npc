# 自主生活循環 code review

初審固定點：`271495c...10bd45b`；兩個獨立子代理分別執行 Standards／Spec，未互相共用審查結論。完整來源為 #172–#181、AGENTS、GLOSSARY、相關 ADR 與各工程基線；以下保留兩軸原始發現，再記修復及複查，不把不同軸合併排名。

## Standards

硬違反：1 項。

- `lib/paused-activities.ts:18`：暫停快照僅識別 `objectId`、`supplyId` 和 `target.id`，漏掉合法 `displace-body.targetId`。可恢復活動若後續階段涉及非 `action.target` 的另一角色，其位置／身體版本改變仍可通過復工檢查，隨即清除暫停槽；直到後續階段才因過期條件失敗。違反 `docs/design/life-activities-baseline.md`「復工採保守的原條件重驗」，也使原本可保留的暫停進度過早失去。建議以明示型別遍歷階段前提及效果，復用既有引用責任並識別引用類型，在復工前保存、核對完整必要引用。

判斷性建議：1 項。

- `lib/habits.ts:142–144`：可能的 **Duplicated Code**。事件型習慣重新手寫 `days/6`、七日半衰期、三日且強度≥0.2形成、七日未出現標淡等政策，與同檔 `habitStrength`／`habitViews` 重複。基線明定兩類習慣共用形成規則；日後調整平衡值容易只改其中一處。建議抽出共用的證據天數／強度／形成狀態計算，保留兩種標籤與排序方式。

## Spec

1 項 Spec 缺陷；未發現可確認的未要求擴張。

- **P2：復工未重驗必要工具。** `lib/paused-activities.ts:14–25、55`：參照掃描忽略 `ActivityPhase.requiredTools` 的字串 ID。違反 #176：「恢復前依當前身份、份量、位置、可達性、許可與相關狀態重新驗證；工具被移走……不能執行過期候選。」初審以暫存轉譯的計畫重現：可暫停計畫含 `requiredTools:['tool']`，暫停後未保存工具參照；工具移至別區、版本增加，復工仍清除暫停槽並宣稱恢復，未來階段才失敗。建議在復工前重驗所有必要引用，失效則保留暫停資料與當前活動；亦檢查 `routineBindings`。

Spec 初審的工具展示是輔助轉譯案例，不能代替世界 API 的完整啟動／提交驗收。修復階段另要求真正 API／SQLite 的可達活動回歸，包含 Standards 找到的身體引用。

初審合計：Standards 2 項（最嚴重為漏掉身體引用的復工前提），Spec 1 項 P2（必要工具未在復工前重驗）。

## 修復與複查

同一 implementer 於 `f6f7b5a`、`452d95a`、`b8aa914` 處理兩軸及補查，整合至固定 `fd8b422`。真正 API 案例先重現未以角色為 action.target 的 displace-body 漏驗；工具／routine metadata 另作明示 trusted metadata 相容測試，不冒充新模型能寫這些內部欄位。補查亦修復無效pause延遲到期工序，以及關門後不可達仍宣稱復工；自然冷卻在暫停期間照常執行。復工預檢使用完整副本、既有phase/effect驗證器，不提交未來成果，不派送模型、感知或骰子。詳見[修復回歸](autonomous-life-review-fixes.md)。

### Standards 複查

原兩項已修妥：型別化引用掃描涵蓋身體、工具與routine metadata；`habitEvidenceState`集中維護兩類習慣的證據窗、強度及形成規則。副本不改真世界或已保存階段；正式提交、時間及容量維持原契約。**剩餘硬違反0、判斷性建議0。**

### Spec 複查

拒絕復工保留暫停進度與當前活動，回饋不洩漏隱藏原因；無效暫停仍結算實際到期工序，預檢不預支或重擲。**剩餘可確認缺陷0、partial 0、scope creep 0。**

最後獨立複查固定 `fd8b422`：Standards 0、Spec 0，兩軸皆無剩餘實質發現；不是正式站或真實模型行為驗收。
