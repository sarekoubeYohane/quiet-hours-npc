# #55 主動回想驗證（2026-10-15）

基準 main `26cfc8a`；獨立分支 `feat/55-active-recall`。不混入 #53／#54 或其他未合併 PR。沿 #50 已批准 GET／POST 世界 API seam，Node SQLite 真實 SQL、外部聊天／Embedding／Vectorize binding 及時鐘替身。沒有部署、正式 migration、正式世界重置或付費服務呼叫。

## Red → Green

第一切片先加入 `requested recall waits for committed indexed version then completes only one action and operation replay`，執行 `node tests/run-activities.mjs tests/recall-api.test.cjs`：1 test、0 pass、1 fail，POST 實際502而預期200。加入一輪回想及最終續接後，同指令1／1通過。

第二切片改寫／遺忘清理先失敗：第二次POST502而預期200。加入upsert前派生manifest與過期向量清理後7／7通過。已知Embedding用量切片先出現 `undefined !== 7`，補provider回報持久保存後10／10通過。其餘已存在行為以回歸案例擴充；不把事後新增的通過案例當成原先Red證據。

目前 focused API 23／23通過。涵蓋成功重放、空結果、第二輪拒絕、跨帳號／NPC／過期版本／已忘ID、三次未就緒、一次延遲後精確版本可查、刪除與改寫、unknown upsert追蹤、已知tokens及保守units失敗保留、跨帳號併發共享預算、租約失效、D1搜尋中改寫、10秒回想期限、110秒共享工作期限、CAS回復、預設關閉、superseded排除及64筆watermark／8筆傳輸上限。

## 滾動一小時邊界修正的實際 Red → Green

補充回歸先證明跨視窗的總tokens與重放原本即正常，不能把未重現的計數分裂當缺陷。真正缺陷是guard呼叫currentUsage取得剛清零的臨時視圖：本回合開始已有985 tokens，第一聊天再用15 tokens，同回合跨過視窗邊界後仍意外允許回想。實際Red為POST200而預期429，22項中21通過、1失敗（`55-window-red.log`）。guard改用advanceActivities持有的本回合usage後22／22通過（`55-window-green.log`），禁止任何Embedding dispatch；下一回合仍可正常更新視窗。時鐘只前進30ms，沒有跨越租約。

## 所有世界操作的中介資料容量修正

接管期間合法500字介入原本200，但角色記憶加64筆已持久化索引manifest超過208 KiB；實際API Red為23項中22通過、1失敗（`55-metadata-red.log`）。所有世界狀態提交前共用metadata-aware短期FIFO，正常容量壓力保留最新經歷、移除最舊短期並同步相容投影；長期64筆完整保留、0模型或Embedding請求，23／23轉綠（`55-metadata-green.log`）。關閉回想不額外查新表；無短期可釋放且仍超限時回復整次操作，保留已知付費用量。

## 執行結果

- `node tests/run-activities.mjs tests/recall-api.test.cjs`：23 tests passed，0 failed。
- `pnpm test`：178通過（世界／活動API152、登入／Key API24、Workers／D1整合2），0失敗。最初曾因測試harness未列入recall模組而失敗，補齊run-auth及workerd模組清單後完整重跑成功。
- `pnpm typecheck`：通過。
- scoped ESLint：本票lib／route／tests／env型別通過；未把完整repo既有lint問題當成本票通過證據。
- `pnpm build:production`：成功，沒有部署。

## 尚未驗收

正式OpenAI與Vectorize資源未設定；metadata indexes、1536維cosine、queryById版本就緒證據、真實費率及持續儲存費、取消後供應商用量仍待有界正式smoke test。已選供應商不等於啟用授權；設定交接見 `../design/recall-service-configuration.md`。本分支只提供API結果，沒有#56 UI；不能以畫面宣稱摘要／遺忘或記憶檢視可用。

## 可重現操作

1. 本機執行 focused API 指令，應23項全部通過；測試名稱指出每項驗收證據。
2. 一般站點未啟用回想時，照常推進15分鐘；Network中的GET回應 `recallUsage.enabled=false`，無新binding需求。
3. 在經授權、啟用模擬服務的本機fixture執行成功重放案例：同operationId回覆完全相同、聊天請求維持兩次。
4. 執行 `second recall round` 案例：502、turn不變、已付兩次聊天保留；不能由畫面直接要求模型一定觸發此情況。
5. 執行 `foreign account` 案例：502、沒有續接模型輸入、原角色狀態不變。
6. 執行 `concurrent accounts` 案例：兩請求只有一個200及一個付費聊天，另一個502。
7. 執行 `ten-second total wait` 與 `lease-minus-ten-second deadline` 案例：不送超時後索引請求、turn不變。
8. 執行 `uncertain upsert` 案例：第一次失敗後，後續已提交改寫會移除舊向量，只留下版本3。

上列3–8以API fixture提供可控證據，正式網站沒有專用UI或任意植入測試世界的入口。
