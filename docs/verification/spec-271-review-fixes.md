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

## Spec P1／P2 時間反例（同一修復 implementer）

獨立審查發現自由結果分支15分鐘完整成果在選擇當刻提交，並無計畫；另 demo 未提供 `timeIntent` 的60分鐘休息被縮為15分鐘。兩者都以真正 POST／GET 與 SQLite 保存讀回先寫正確期望得到 RED：杯子 `clean=yes`（應仍 `no`）；Cass 計畫 `until=1280`（應 `1325`）。

P1 窄修只適用新五分鐘契約：自由分支的頂層完整成果在選分支之前排入原階段引擎的確認完成時間，骰與分支仍於第一次合法選擇保存一次；沿既有 phase 到期驗證、提交、取消與故障恢復。可信日常 binder 的明示起始準備／階段分割保持原義，不增加平行引擎，也不更改舊時間模式或既已開始的計畫。開始與中途只有正在進行／現況，未提交物件未來成果。P2 只對無 `timeIntent` 的既有持續活動沿用 `durationMinutes`；明示完成目標仍保持短動作契約。

新增 `tests/time-policy-review-api.test.cjs` 已進預設 runner，最終 **9/9 PASS**：

- 真正人物導入後 d100 分支：選擇當刻0分鐘、5／10分鐘杯子仍未完成，15分鐘才改一次；原 ID 回放／SQLite 讀回不另取骰、不另問模型。
- 原活動前提變更時不交付完成結果，不回退無關世界變更，原骰保留。
- 開始與到期兩個提交點各驗保存前故障／CAS／保存後遺失回覆：計畫及成果共同提交或回退，原ID回放、已知用量及一次性結果保持。
- demo Cass 的60分鐘休息保留到期時間，55分鐘仍持續，60分鐘才結束。

相關活動分支／日常結果與通用世界／d100／五分鐘／個人需求回歸命令 **103/103 PASS**（執行時新票含前6案例，之後另跑完整9案例，不將兩次數字相加）：

```sh
node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/time-policy-review-api.test.cjs tests/five-minute-time-api.test.cjs tests/activity-results-api.test.cjs tests/routine-results-api.test.cjs tests/d100-api.test.cjs tests/routine-world-changes-api.test.cjs tests/personal-needs-api.test.cjs
npm run typecheck
git diff --check
```

Typecheck／diff check通過。交接證據：`timed-branch-red.log`、`timed-branch-green.log`、`demo-duration-red.log`、`time-review-final.log`、`time-review-atomic.log`、`time-review-typecheck.log`。最終整合與全套回歸仍由根代理執行，不以本票局部通過取代。
