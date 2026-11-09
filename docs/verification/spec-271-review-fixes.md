# #271 審查及整合反例修復

獨立 `fix/spec271-review`，基底 integration `59d2955`；只改本 worktree，不改原始工作區或 integration。此紀錄是本地受控驗證，未部署、未呼叫付費模型或推進正式世界。

## 審查與三個回歸反例

Standards P3：`action-checks` 新 schema 與 parser 重複寫死 difficulty／ability 長度。依 ADR 0003 改引用 `adjudicationLimits.difficulties/maxValueLength`，數學映射不變，無額外抽象。

完整測試所報三個反例先於修改獨立重現：recovery UI 與兩個 recall deadline case，共 **22 tests：19 pass／3 fail**。後端世界、用量及重播原已有通過；差異並非付費派送或時間預算失效。

- 新 UI 第一回合已採用 `five-minute-v1`，之後 fixture 手造「未曾受理的新 pending」卻仍要求15分鐘，重試得到合理的確定400並清掉 pending。新 pending 與後續新 uncertain advance 改帶5分鐘及明示契約，保留逾時、HTML／malformed 4xx、未知結果、原payload、不重派與用量 assertions。歷史15分鐘建置與已受理15／30分鐘原ID重播專例不修改。
- d100 候選 schema 增加每次裁定 request 大小；12次聊天／4次回想情境的完整 trace 實測 **1,051,939 bytes** 超過既有1MiB，觸發已設計的全文省略。`timePolicy` 頂層 metadata 本來就保留，但原始 `time-policy` step 一起被清空，使時限證據的既有 assertion 無法讀取。窄修只保留一筆 program 來源的時限 step；全文仍明示 `single-record-limit`，其餘 transcript 仍刪除，憑證來源未知仍不保存 steps，cap 不增加。兩案例省略後均 **12,327 bytes**。既有時限／usage／重播 assertions 保留，另比對 step 與頂層時限一致及 archive 原cap。

## RED → GREEN 與適當回歸

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/recovery-ui.test.cjs tests/round-deadline-api.test.cjs
```

修改前22項19 pass／3 fail；修改後 **22/22 PASS**，0 fail／skip。

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/d100-api.test.cjs tests/adjudication-contract-api.test.cjs tests/routine-contract-api.test.cjs tests/decision-traces-api.test.cjs tests/decision-trace-faults-api.test.cjs tests/five-minute-time-api.test.cjs
npm run typecheck
git diff --check
```

相關 API／檔案 SQLite／trace 故障與舊時間相容 **75/75 PASS**，typecheck、diff check通過。測試使用既有已批准 API／UI／保存重讀 seam，模型 transport、時間與骰受控；未削弱恢復 assertion，也未以私有 helper 單測替代實際流程。

證據命令輸出於本次交接目錄 `/private/tmp/npc-handoff-20261109/`：`review-fix-red.log`、`review-fix-green.log`、`review-fix-targeted.log`、`review-fix-typecheck.log`。完整全套回歸由整合代理統一執行；此報告不宣稱尚未執行的全套或 #263 已驗收。
