## Spec

複審基準 `47229d8` → `4e107ac`，並逐項追讀 `7fc9ae7...4e107ac` 修正。**原 2 項 findings 均已修復，本次未發現新 blocker 或額外 scope creep。**

- **保存用量修復通過。** `route.ts` 在保存拋例外後先讀持久 journal：已提交 receipt 直接返回，不再次加用量；仍是本 lease 的 pending 才補存付費差額。這符合 #93「當前回合一致回復、已知付費用量保留」及 #100「保存故障仍一致回復並保留已知用量」。實跑 before-save、after-save、同 operationId 重送均維持精確 2 calls／60 input／20 output，前者世界回復、後者成功成果留存，重送不再派送。

- **到期階段修復通過。** `activities.ts` 已取消 `afterMinutes <= minutes` 的拒絕條件，建置原始時鐘／cursor 後立即呼叫同一 `advanceFreePhases`；本回合已到期階段依序提交，後續階段保留。符合 #100「沿既有世界時間與活動計畫推進」、「續做／重載不重頭套用舊效果」。15／30 分鐘首回合、後續續做及原先延後階段案例通過。

另追查 closed wire schema 的 state entries 正規化、ownership 不洩漏未知供應、hidden grant 拒絕、空 accepted 拒絕、purpose 傳遞、stage targets 分離試骰鍵，以及相同方法換句話不重擲；未見不符原規格的新增行為。

驗證：`node tests/run-activities.mjs /workspace/scratch/9a5e0189c990/spec-final-probes.cjs tests/free-actions-api.test.cjs tests/model-contract-api.test.cjs`，**34／34 通過**。獨立探針沿前輪案例補齊既有 owner fixture（避免 normalizeWorld 自動加入另一自主角色而多派送），未修改 repository。完整輸出：`/workspace/scratch/9a5e0189c990/spec-final-probes.log`。

本報告限 Spec 軸及上述受控模型／儲存驗證，不宣稱已連接真實付費服務或部署。
