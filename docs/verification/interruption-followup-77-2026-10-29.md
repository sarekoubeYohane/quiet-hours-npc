# 2026-10-29 中斷後續補證（#77）

本輪與 #92 的用量恢復實作分開。**本次最初中斷根因無法追回：現有原件沒有原失敗 HTTP 與平台 invocation 證據，本執行環境也沒有可用的歷史 Workers Logs 入口。** 這是可取得來源的限制，並非證明平台沒有留存，或已排除平台／D1 故障。沒有為補證新增正式 POST、模型呼叫、世界推進、重置或遠端資料庫修改。

## 查證來源與結果

- 最新 main `da6b0c22430e560923d99520e65c9bc62c2d5805`，PR #217／#218 已合併；兩 PR 全文、留言及 #77／#92／#91／#153／#166／#168／#82 全文與留言已讀。#77 的 10 月 16 日 CPU 證據不屬本次事故。
- 重新取得指定私人 ZIP，解析所有 JSON，核對原 JSON SHA-256 `bf4c9d2a76e497cd894b9c6ea1f43731a99cfee7027af753b03c19d4c5caa3fb`，與原報告一致。公開只保存本頁的去識別結論。
- 私人 JSON 是 `start`、`worldReadback`、`operationReadback` 與觀測時間；沒有 HAR、原失敗 POST／GET 的 response headers／body、平台 Ray 關聯、Worker invocation outcome、CPU／wall time、D1 服務端錯誤或 raw journal SQL rows。trace 的單筆 `httpStatus=200` 是模型回應，不能代替世界 API 的原 HTTP。
- 可確認原讀回仍為 version 354、turn 18、minute 1140，原操作 uncertain／status 502／evidence null；trace unknown／candidate-received、一筆正常 usage 21,813 input／526 output。這些是已有讀回，不冒稱本輪新增正式讀取。
- 工具能力核對：現有 GitHub 日誌入口限建置 workflow；Sites 日誌限其管理的 Site，不能拿 repository 或 Worker 名稱猜 Site ID。本輪 Cloudflare 整合搜尋未找到可用入口，執行環境亦沒有 Cloudflare 憑證。未登入其他帳號或推定有權讀取任何 Cloudflare 資源。

## 可重跑的對照與判讀

親自重新執行 PR #218 的兩個中斷命令及五組對照，封鎖模型外連，Node 24.22.1／TypeScript 5.9.3、真實隔離 SQLite。

| 對照 | 修正前結果 | 對 #77 的意義 |
| --- | --- | --- |
| durable candidate 後程序退出 | 用量斷言 RED：trace 40 tokens、世界 calls 0；uncertain／零 redispatch／故事版本不變先通過 | 確認 #92 缺口；不證明正式 Worker 真的被終止 |
| 已驗證、下一次保存前程序退出 | 相同 RED，parsedInMemory=true，durable 仍 candidate-received | 最後保存點不能定位 parser 或保存故障 |
| 正常、malformed candidate、candidate 保存延遲 26 秒、獨立 trace read 故障、trace write 故障 | 5/5 PASS；已知用量保留 | 普通拒絕／可捕捉逾時單獨不足以解釋完整症狀；讀取失敗可與提交中斷獨立 |

沒有正式症狀的穩定回饋迴圈，因此不繼續猜測某一產品熱點或實作推測修法。可捕捉錯誤與缺少 completedAt 的對照只反駁特定推論，不能排除複合故障、平台終止、不可取消 SQL 或其他崩潰窗口。命令及前輪假說／單一變因詳見[原診斷](interrupted-round-diagnosis-2026-10-29.md)。

## 最小觀測範圍與後續驗收（本 PR 不實作）

目前 `observeWorldRequest` 已將安全 requestId／operationId、lease、version、stage、outcome、status、durationMs 寫入 allowlist 日誌，正常回應有 `X-World-Request-Id`。設定也已啟用 invocation logs；**設定開啟不是本次歷史日誌已取得的證據**。`world-read-failed` 與 `operation-error` 仍只有粗分類，不能區分 D1 statement 失敗、guard、取消或服務端 CAS 結果；HTTP 外層截止回應也可能不經正常 response 記錄。

下一輪要縮小原因，最小工作包為：

1. **先取既有平台證據**：由有權限入口以私人原 request／operation 關聯，查台北 12:03:35–12:11:14 的 invocation outcome、exception／取消／資源限制、CPU／wall time，並對照既有安全 stages。若歷史已不存在，記錄查詢時間、來源、保存限制與無結果；不把無結果當成功。
2. **隔離環境的 SQL 邊界觀測**：只對 lease／guard／最終 CAS／journal readback 增加有界機械種類、開始／完成／失敗／未知及 changes 結果；錯誤採明列 allowlist 的服務代碼，不記錄 exception message、stack、SQL 本文／bind、owner、世界或模型正文。資料庫回應遺失時保留 unknown，不能標成未寫入。CPU／wall time取平台值，不能由 checkpoint 差額補算。
3. **HTTP 最小故障取樣**：在既有請求邊界保留方法、時間、status、Content-Type、`X-World-Request-Id` 與可得平台關聯；識別碼只進私人診斷，不存 auth、cookie、Key 或完整 response。缺欄位明示未知，不為取樣重送不明操作。
4. **可驗收條件**：用公開合成資料在世界 API → transport 替身 → SQLite 覆蓋 guard 失敗、CAS changes=0、CAS 寫入後回應遺失、journal 不可讀、trace 讀取獨立失敗、HTTP 非 JSON／取消；每案可分辨最後確定邊界與未知範圍、原 ID 零重新派送／世界效果，並檢查日誌無私人資料。平台 CPU／資源終止必須另外在受授權隔離部署核對 invocation，Node fixture 無法證明。

以上是 #77 的具體待辦與驗收範圍，不是對猜測根因的修法，也不在本輪 #92 授權內擴張產品觀測。歷史原因無法追回時仍保留 #77 開啟；不能因 #92 GREEN 結案。#91／#92 的較廣驗收及依賴亦保持。

## 部署及恢復觀察前

#92 修正須完成獨立冪等、費率／窗口與故障回歸；經使用者另行授權部署後，以原 ID 確認原操作及用量狀態，不能從 uncertain 重新套效果或換 ID 繞過。缺歷史去重依據的記錄須明示待核對，不能自動以全部 archive 補算。

若 #77 仍無可驗證根因，先完成上述最小觀測的隔離驗收及正式觀測取樣準備，再另行授權有限真實模型測試。原 ID 不明且仍不允許新回合時保持停止。半小時行為驗收必須另取得成功提交與後續真實輸入；本地 fixture 通過不表示正式中斷已解決或 NPC loop 已改善。
