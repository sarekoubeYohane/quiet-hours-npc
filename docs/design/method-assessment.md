# 同次方法評估（#195）

實際NPC派送使用`npc-decision.v2`。`action`包含`type/target/content/purpose`，其餘時間、意圖與既有心理更新保持根層；內部仍轉成原Action與ActivityDecision執行。巢狀action以`anyOf`分開propose與其他合法動作：propose的content及purpose皆要求非空白字元；其他動作保持空目的合法。沒有root anyOf或不支援的if/then。動作枚舉仍由當次可用的`allowedTypes`建立，continue只在原活動可延續時出現。舊versionless／v1平面回覆仍按原驗證承接；v2回覆要求巢狀action及評估，不補造舊世界評估。

`methodAssessment`在同次正常決策表達purpose、最多4個`knownResults`（當次真正可見short/long的id/version）、choice（new/retry/continue/wait/switch/drop）、method、change（none/source/target/preparation/operation/condition/not-applicable及detail）、reason、selectedAction（本次type/target）、intentIds（本次仍保留的intents）。空歷史合法；評估最多2KiB UTF-8，並納入既有8KiB同次更新預算。沒有新增模型呼叫或提高輸出／時間上限。

程式只驗證結構、引用版本、選中action及意圖ID關聯；不替角色裁判自由文字中的心理矛盾，也不因change自述便認定世界前提已變。purpose可保留目的但換方法，其他角色仍自主，外在可行性與成果須沿世界執行確認。評估不送入規則匹配、不強制換行動、不清意圖、不累計重試懲罰。實際活動完成亦不自動等於目的滿足。

必要保存沿原owner私有決策實錄的`npc-method-assessment`步驟，來源標示model-self-report，並列本次intents與Action供核對。原分析畫面新增此步驟的明示入口；其候選保存可能發生在稍後失敗之前，必須連同整輪outcome判讀。原journal只保存公開提案的巢狀action，不把方法評估與心理引用複製進世界。沒有新增Character永久知識欄位，也不將舊評估灌回下一次NPC。下一次決策仍從合法記憶及lastKnownState開始。

#185／PR #202手機工作尚未合併且不是前置。本輪不操作其分支。未來整合時，新增動作沿同一actionTypes／Action與動態wire分支，新心理欄位沿原actionSchema必要欄位及同次預算；不要另造平行行動選單。這些是明確整合接點，不代表本輪已測試未合併功能。
