# #149 形成來源、份量與按需細分

基線：整合 main `5e172d5`、未合併 PR #144 `53f4298`、已批准設計 `de0d7d0`、#137–#139 與 #146；另承接 #147 最終核心／有界物理 history／中性回饋 `ccefe18`。未合併或部署任何 PR，沒有呼叫正式付費模型或修改正式世界。

## 行為與工程界線

- `form` version 1 的 partition 完整承接原物，立即終止原物可用身份並保存一或少數有重要差異的 aggregate 成果；transform 明示扣各當前來源的量。`separate` 只從已有整體扣出部分，不複製完整原物、消耗或個人 history。
- 新結果保存來源鏈、份量、形成時刻、明示可消耗能力與全部來源權利人；不准候選指定 owner／allowedTo／consent，使用權採交集。共同來源不能由其中一位單方 grant。物理模式沿 #147 共同可達／事前許可 history，原杯損毀與食物轉化依模型明示 disposition 分開。
- 沿既有候選／分支／階段與原子保存流程，沒有新付費重試、分類模型或逐動作 handler。新素材／狀態不以 food／utensil 作永久種類上限。舊 GET 不補量、來源、模型確認或證據，舊單件在實際新操作時按 `1 item` 安全承接。
- 上限與機械一致性見 [工程契約](../design/world-changes-framework.md)。跨單位轉化的合理性由模型確認；程式不證明物理化學正確，也不新增完整財產法律。

## Red → green 與證據

1. 實際 API／SQLite 與真 WorldApp 下一回合先重現 partition 候選 502「裁定效果格式無效」，原物與有限供應不變。其後同介面通過蛋糕四份整體→分出一份→食用該份，餘下三份不重複形成。
2. 新 materialize 尚未保存 quantity／sources 的獨立 API 案例先失敗，補保存後通過；舊已保存物件讀取仍缺這些欄位，不補歷史。
3. 有界 receipt 最初截掉 form 輸入／成果，測試先 red；補白名單後可核對理由、來源、份量及必要前後狀態。物理 partition 最初未保存來源事前 history，測試先 red；接 #147 共用 helper 後通過，子件不捏造來源的個人歷史。
4. 受控 D20 fixture 覆蓋五段結果、共用級別分支、完整／部分形成、失敗消耗，只有選定成果保存。非法未選分支在擲骰前拒絕。原 ID 重送不重派送／重擲／重形成。
5. 形成身份碰撞角色／區域 ID 的公開 API 先 red（200），補共同新身份 guard 後 15 API 通過；供應／物件／角色／區域／場所命名空間都不許重用。API 覆蓋同／不同所有者多來源轉化、權利交集／共同授權拒絕、explicit non-consumable 優先、超量／單位／過期／遠端／耗盡／重用身份／保留欄位拒絕、保存前失敗／保存後確認／版本與租約衝突／提交結果讀取失敗及重送。新的泛用飲品不能繞過杯子連續性；同批消耗舊飲品並有真來源的新同款飲品可成立，單杯重複活動中飲品拒絕。

[真 WorldApp／API／SQLite JSON](assets/world-formation-149/evidence.json) 與 [四份分出一份](assets/world-formation-149/cake-separated.png)、[共同來源成果](assets/world-formation-149/shared-source-product.png)、[物理碎片與事前許可](assets/world-formation-149/physical-shards.png) 為本機 fixture。六個新 advance 實際 **7 NPC＋6 裁定** 派送；原 ID UI 重送新增派送為零，UI／API 重載及 SQLite 結果一致。操作後狀態均走正式活動及提交，沒有驗收中直接改世界；fixture 只有初始世界、模型 transport、時間／D20 及保存故障邊界。

執行 `tests/run-activities.mjs tests/world-formation-api.test.cjs` 及 `tooling/verification/browser149.mjs`，沿 tooling/verification/README.md 的 Chromium 環境。本票 15 API 案例通過；承接 #148 `b4d73c3` 後完整 `pnpm test` 為 475 activities/API＋32 auth＋10 Workers（517/517），typecheck、變更檔 ESLint 與真 UI 複驗通過。整合後數字由最終整合報告列出；本文件不把 fixture 當正式站驗收，也不追補 #143 舊原始證據。新日常規則的形成與免費重用由 #151 承接。

補充資訊隔離：新形成狀態逐 key 明示 public／hidden，metadata 隨細分保留；測試先重現後續 NPC prompt 洩漏 hiddenMark，再沿 #148 相同物件投影修正。observer 仍可保存實際 hidden 狀態，來源／共同權利／物理 history 不加入 NPC 物件投影；裁定理由含 fixture credential 時，既有敏感資料防線拒絕該回合（502、原物不變）；有界 receipt 遮蔽 credential 的 API 回歸亦通過。
