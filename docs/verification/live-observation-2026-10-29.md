# 2026-10-29 正式站有限觀察：首輪提交中斷

本次原定觀察約半小時；第一個新回合即出現結果不明，約 7 分 47 秒確認到期後仍為 `uncertain／HTTP 502`。**沒有新完整回合成功提交，無法判定 NPC 的重複行為是否改善。** 這是正式站真實模型觀察，不是 fixture 通過報告，也不是修復完成證據。

## 版本、場景與授權範圍

| 項目 | 本輪紀錄 |
| --- | --- |
| 日期 | 2026-10-29，Asia/Taipei |
| 正式站版本 | `c3ce5af6f0e4ba0ac2bcc238b60179b9cb01cd08`，UI 顯示 `c3ce5af`；建置於台北 11:38 |
| 場景 | 沿用原獨立日常驗收；原世界仍暫存，沒有重置、重建、介入或指定 NPC 行動 |
| 起點／最後讀回 | world version 354、turn 18、minute 1140（D1 19:00） |
| NPC／世界裁定模型 | OpenAI `gpt-6-luna`／`gpt-6.1-sol` |
| 回想 | 未啟用 |
| 原玩家預算 | 每小時 240 calls／5,000,000 tokens，未提高 |
| 本批停止線 | 首次推進起 30 分鐘、8 advance、64 次派送、1,500,000 已知 tokens 或既有餘量，先到即停；技術故障、pending／uncertain 停止新回合 |

使用者要求近期 PR 後的半小時行為測試，並補存有效 Key 後要求接續。沿用[有限驗收交接](autonomous-life-live-runbook.md)與[手機／安排驗收交接](flexible-life-live-runbook.md)的隔離、資訊邊界及故障恢復原則。恢復真實 AI 觀察時，將該分頁的規則試玩切回原 OpenAI 模型；沒有更換模型、調整期限、修改產品、合併或部署。

本輪是原故事的自然續測，**不是** [#211 固定多情境方案](autonomous-demand-211-preregistration.md)的正式執行；沒有建立其六個獨立試驗，也不併入其成功率。

## 原操作時間線與提交結果

| 時點／階段 | 已確認的證據 |
| --- | --- |
| 12:03:24 左右 | 只啟動一個新 advance；原 operationId 與 requestId 保存在私有原件 |
| 12:03:35.528 | round-v1 固定租約建立；工作截止 12:10:15.528、租約截止 12:10:45.528，前端政策 445 秒 |
| 首筆模型回覆 | 保存一筆 Kris 的真實 NPC 候選及 usage；trace 最後階段為 `candidate-received` |
| 前端讀取 | 顯示「上次操作的結果無法確認」；分析追溯也一度讀取失敗。其後原 ID GET 可取得 pending 及私有實錄 |
| 期限內恢復 | 僅唯讀查詢／重新載入；沒有建立新 ID 重試 |
| 租約到期後 | 使用既有「重試未完成操作」沿同 ID 恢復，再以 GET 確認 `state=uncertain`、`status=502`、`evidence=null` |
| 最後讀回 | version 354／turn 18／minute 1140；trace 仍只有一筆已保存派送，沒有世界提交確認 |

同 ID 的到期恢復依當版程式只處理原 journal，不重新執行模型決策；沒有以新 ID 重抽、清 journal 或重置。兩次完整讀回比較，除 `aiUsage` 小時窗口正規化外，故事相等。這不等於證明所有外部工作已取消、完整回復或未知費用為零。

最後整頁重新載入令前端回到預設規則試玩；原操作 trace 與模型回覆證明本次受理的是 OpenAI 模型操作，沒有執行規則模式 advance。終點自動運行保持停止，未完成操作保留。

## 用量與證據缺口

| 項目 | 結果 |
| --- | ---: |
| 新 advance | 1 次嘗試，0 次已確認提交 |
| 已保存 NPC 派送 | 1 |
| 已保存世界裁定／回想派送 | 0／0 |
| 首筆已知 input／output tokens | 21,813／526 |
| 首筆已知 cached input tokens | 0 |
| 已保存的新增已知 tokens | 22,339 |
| durable 世界累計 calls | 讀回仍為 726 |

22,339 tokens 來自私有 trace 的 provider usage。世界用量未增加不能當成零花費；沒有第二筆派送紀錄，也不能由缺失推論其他派送絕對未發生。完整新增費用及用量定案仍未確認。

沒有足夠證據把中斷歸因於模型速度、D1、Workers、網路、候選驗證或 trace 保存中的任何一項。HTTP 502、`candidate-received` 與不明 journal 是已觀察斷點，不是已查明根因。

## 規格與 NPC 行為判讀

| 規格／觀察目的 | 本輪結果 |
| --- | --- |
| [#186](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/186)：受阻後方法評估與可靠承接 | 真實候選包含方法評估；沒有提交與下一輪輸入，行為改善無法判定 |
| [#205](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/205)：自主探索、普通供應與需求處理 | 未到達新查找、準備、取得或交付；不替代 #211 |
| [#172](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/172)：自主生活 | 沒有新完整回合，不宣稱需求閉環、睡眠或習慣通過 |
| [#185](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/185)：手機及柔性安排 | 未到達新手機操作／安排；既有四部手機只是起點 |
| [#166](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/166)／[#168](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/168)：完整回合與恢復 | 原期限未調高；到期後 uncertain，完整提交未驗收通過 |

首筆候選自述從休息改成回應他人、暫不反覆取餐；同時出現對話指向的疑似誤解。它仍是**未提交的主觀候選**，不能當作已成功換方法、已取得許可或確定根因。私人台詞、記憶及完整 request 不公開。

起點畫面中的取餐重複與「不知道還有沒有其他餐點」來自舊歷史，不能算成本次版本的新行為樣本。沒有確認新的食物／茶攝取、探索或交付成果；不宣稱 loop 已修復，也不宣稱新版本已再次重現同一 loop。

## 保存、檢查與後續

私人完整讀回及原 trace 另存，不進公開 repository；原件可用於下輪唯讀比對。最終私有 JSON SHA-256：

`bf4c9d2a76e497cd894b9c6ea1f43731a99cfee7027af753b03c19d4c5caa3fb`

本報告整理時已重新解析私有 JSON，機械核對 uncertain、version 354、單筆已保存派送、用量加總及排除 aiUsage 後故事相等；檢查本地 Markdown 引用與公開內容邊界。沒有重跑產品 suite，不把過去的本地測試數字當作本次正式驗收。

下一步先以私有原操作及當版程式診斷「首筆候選保存後至提交／回復」的中斷，補出可驗證的原因及用量保存結果。確認原操作狀態後，再依有限授權接續同一隔離故事；不以新 ID 繞過 uncertain。不關閉 #85／#104／#106／#211。

附註：使用者反映 Key 每天重貼不便；當版 `lib/model-keys.ts` 固定加密保存 24 小時。這是本站保存到期，通常不需重新產生供應商 Key。本輪沒有修改保存政策；與此次提交中斷分開處理。
