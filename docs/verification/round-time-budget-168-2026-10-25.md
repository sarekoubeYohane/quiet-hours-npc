# #168 完整回合有界時間：本地驗證（2026-10-25）

承接主規格 [#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)、唯一工作票 [#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168)及 [PR #167](https://github.com/sarekoubeYohane/quiet-hours-npc/pull/167)。程式基準為 main `4c54b156fa2e247aac1ec9b039d8d2e94a1138ed`。#167 未合併，因此本分支攜入其文件與合成診斷資產；沒有將文件 PR 合併當作前置。

## RED → GREEN

依使用者指定的世界 POST → transport 替身 → 真實解析／序列化與測試 SQLite → 原 ID GET／POST，不呼叫付費模型或正式世界。

原始 RED 命令：

```bash
NODE_OPTIONS="--import=$PWD/tooling/verification/no-network.mjs" DEADLINE_EXPECT_COMPLETE=1 \
  node tests/run-activities.mjs --test-name-pattern=cumulative-body \
  docs/verification/assets/round-deadline-2026-10-25/repro.cjs
```

修正前失敗為 `502 !== 200`：四角色第八次派送於98秒開始，signal僅剩12秒；HTTP200 headers可得，body未完成，110秒整輪回復。已知280 tokens、1次未知、8次派送；同ID不新增派送。依賴尚未安裝時的 `typescript` 缺失沒有被計為本案RED。

修正後相同完成案例在虛擬112秒提交、HTTP200、8次派送。新的政策與完整成本算式見[工程契約](../design/round-time-budget.md)：400秒工作、30秒收尾、430秒固定租約、445秒前端；單次完整聊天25秒、完整回想10秒，有限完成包絡至少涵蓋現有四角色。原診斷 harness 的六項歷史對照保留當時預期，不能把其餘「應失敗」斷言當作新版驗收。

## 回歸與審查

原版 operations、conflict、decision-trace-faults 三組52項基準先通過，避免把既有保護當作本輪新增能力。新版持續測試與審查結果於交付時補記。

## 範圍與限制

所有模型回覆與世界均為合成資料，外網由 no-network preload 阻擋；SQLite adapter執行真實JSON、schema、migration、journal與CAS，但不是遠端D1。受控時鐘只證明截止邏輯與有限延遲包絡，不量測Cloudflare CPU、網路、序列化效能或正式provider。必要checkpoint仍在原queue等待保存，底層不能取消時不宣稱已取消；Worker終止或D1持續不可用仍可能失去未持久化證據，結果必須保持unknown／uncertain。

沒有真實付費呼叫、正式世界推進／重置、合併或部署。#85／#106不因本地替身成功而結案。

## 部署後有限重驗：另行取得授權

1. 核對正式部署包含本修正，保存目前隔離世界與原operationId；維持NPC／裁定模型、歷史、預算，暫停自動運行，不重置世界。
2. 先只一個新advance，原隔離場景最多8次派送；真正提交後才觀察店主後續最多三次正常決策。
3. 若沿主規格額度，總計至多4 advance／32派送／已知500,000 tokens／30分鐘，任一先到即停；token為事後已知用量，不能當作精確預約，額度不足不開下一輪。
4. 任一技術故障、pending或uncertain立即停，只查原ID並保存證據，不重抽、不補提醒、不灌回候選杯茶。
5. 技術提交、杯與獨立茶飲成果、完成回饋及本人後續反應各自判定；樣本不足仍是證據不足，不自動關閉泡茶loop票。
