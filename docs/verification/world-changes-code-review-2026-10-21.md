# 通用世界變更：獨立雙軸 code review

固定點：main `5e172d51f999f28ca17f5a207fb109d3f8c305e2`。初審對象：本機整合 `9d0e4a8b05f6ef51bd238dad37a378ac87587a61`，64筆提交、123個變更檔案；命令為 `git diff 5e172d51f999f28ca17f5a207fb109d3f8c305e2...9d0e4a8b05f6ef51bd238dad37a378ac87587a61`。兩位獨立代理平行審查，不共享彼此發現、不修改 runtime；Standards讀文件規範及smell baseline，Spec讀完整 #136／#145、各工作票及留言。

初審前 root 已獨立執行完整552/552（510 API／32 auth／10 Workers）、typecheck、lint、production build與產物環境檢查；另重跑七組v3 UI（19 NPC／9裁定）及既有綜合UI（62 NPC／6裁定）。以下額外反例仍找出缺口，不能以原測試通過取代審查。所有模型 transport／骰子均fixture，沒有付費或正式世界變更。

## Standards

初審 **1項 finding，0項另列 smell**。

- **P2：食用資格的正式裁定指令互相矛盾。** `lib/adjudication-contract.ts` 仍要求「consume：僅 food」，同一提示展開的形成契約與執行器卻以明示 `consumable` 優先、舊缺欄位才按 food 相容。新 kind=meal／drink／pastry 且 consumable=true 的成果會被執行器接受，派送提示卻禁止。違反 ADR0003 的共同語意一致性要求；須更新實送提示及公開API回歸。沒有付費驗證模型是否真的因此拒絕。

獨立 focused public API 回歸28/28通過，使用 no-network preload。

## Spec

初審 **2項實作錯誤，無額外 scope creep**。

- **P2：免費重用拿蛋糕替代茶葉。** `lib/routine-world-programs.ts` 的 object 綁定忽略 sourceRole／sourceSubject；第一次消耗茶葉後，第二次可免費消耗蛋糕形成茶飲，SQLite保存錯誤來源，2 NPC／1裁定。違反 #151「後續相符的新活動重新綁定當前物件／數量／版本」。
- **P1：已耗盡的具體物件由背景補回。** 同模組只以 supply 列與 active 可達物件阻擋背景；舊世界沒有 supply 列的最後一份木料首次消耗後，第二次新增背景製出第二零件，新增裁定零。違反 #145「已明確耗盡、毀壞、移走或消耗的物品不能藉背景重建復生」，以及 #149 的明示稀缺事實保持。

獨立公開API＋實際SQLite重現：既有22案通過，新增兩案均失敗，證明實作缺口。修正須把反例納入正式回歸，並驗證真正來源恢復仍能接續。

## 修正及複審結果

依 implement-spec，三項交同一修正代理，在獨立工作樹以 TDD 完成；修正提交 `75da24a7dfbbfa6a26862d29c8f387de042c57fb`，整合及複審固定點為本機 `44f9a8a9aeddac7d809653e04c1a1cc2d601be9c`／tree `0932b5ca2852a6f7e2c2f6b376f3b37709bbfda8`。後續只更新交付文件。

### Standards 複審

原1項已解決；未解決 **0**、新增 finding **0**、另列 smell **0**。consume 正式提示與 consumable 執行規則一致，實際派送提示及 SQLite 結果有回歸。原 Standards reviewer 獨立重讀修正、ADR及證據，focused public API **36/36** 通過，保持 no-network。

### Spec 複審

原2項已解決；未解決 **0**、新增 **0**。材料主題共用匹配；有限來源的有界 server-only 綁定防止耗盡、毀壞或移走後由背景補回，真正新來源仍可恢復。原 Spec reviewer 獨立重跑原始2項反例及現有30項公開 API／SQLite，**32/32** 通過，保持 no-network。

### 修正擴展與整合驗證

修正回歸另發現並修復無關蛋糕阻擋合法茶葉背景、physical materialize 的編譯佔位未正規化，以及免費受阻被 UI 錯標付費例外。這些不改寫初審的1／2項數目；全域 validator 未放寬。有限來源約束進 observer 的有界證據，不進 NPC，也不追補舊證據。詳見[紅綠證據及 UI](world-changes-review-fixes-2026-10-21.md)。

root 在固定整合點獨立執行 **560/560**（518 API／32 auth／10 Workers/D1），零 fail／skip；typecheck、lint（0 error、4個既有 warning）、production build及產物 `quiet-hours-npc`／`APP_ENV=production` 檢查通過。另重跑有限材料、材料主題、同杯循環、餐點分拆四組真 UI／API／SQLite，合計 **11 NPC／6裁定**，原 ID 重送零新增，reload與保存重讀通過；人工檢查受阻畫面明示「規則受阻，無新增裁定」。模型／骰子仍為 fixture。

初審總數保留：Standards 1（最嚴重P2）、Spec 2（最嚴重P1）；最終兩軸均零未解決，沒有以另一軸通過抵銷缺口。未合併、未部署、未修改正式世界或呼叫正式付費模型。
