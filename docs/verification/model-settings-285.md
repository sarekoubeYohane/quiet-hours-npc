# #285 原流程模型設定與生效來源

原生依賴開始前已重新讀取：#283、#284 均 closed。實作基準為整合分支 `5b8abcb`；完成前合入 T1／T2／T3 與最新領域決策至 runtime **`42ec76b`**。未關票、合併 main、部署或正式遷移。

## 驗收矩陣

| 條件 | 結果及證據 |
| --- | --- |
| 帳號預設、獨立建角使用同一預設 | `/api/model-settings` 及設定頁保存 NPC／天上意志各用途；真正人物頁補完 HTTP transport 採已保存帳號天上意志 `heaven-account-A` |
| 存檔沿用或自訂，明示來源 | 偏好以帳號＋公開 saveId 分開，來源顯示帳號預設／存檔自訂／既有模型設定／尚未設定；custom 世界在 account default 改動後仍採 custom |
| 新操作採最新 default，進行中固定兩角色 | 真正建立 API 形成世界後，保留舊瀏覽器讀取的 payload，改帳號 default 再推進：server 採新 NPC `gpt-6.1-sol`；其 HTTP 邊界內再次改 default，同操作天上意志仍採已固定 `heaven-B`。原 ID 回放不新增模型呼叫 |
| 舊存檔明示設定不被 default 取代 | 未有偏好 row、原 world.adjudication=A 時，新增帳號 default=B 仍沿用 A，NPC 未保存維持未知；存檔明示 inherit 才改採帳號 default。沒有 GET 遷移或覆寫故事 |
| effective 設定不變成冒造 legacy 設定 | 新派送局部套用兩角色設定，提交前還原原故事配置。呼叫後改 default，產品 API 仍讀到 source=account 及新 default，沒有被前次 effective 值誤認成 legacy |
| 缺 default 的明示 inherit | 舊故事保留 A，client projection 顯示 source=missing／effective={}，不把 A 顯示為生效值；重複 GET 的故事版本及回合保持不變 |
| 缺設定在原頁補齊 | 人物頁按 AI 原頁開面板，取消／故障／保存後姓名與概念保留；觀察頁亦原頁開面板，取消保留介入文字與所選世界 |
| 保存不呼叫模型或推進 | 真頁實測設定保存及 Key 保存後 modelCalls=0，返回原流程仍 0；只有明示再按補完才呼叫 1 次。自訂／帳號預設變更後觀察世界仍 turn=0 |
| 規則推進免 AI | 另一隔離帳號沒有模型與 Key，取消面板後選規則模式，真正「下一回合」提交 turn=1，沒有新增模型呼叫 |
| Key 邊界 | 沿原加密 store，按真帳號／本站／供應商保存，固定 14 天。讀取及修改偏好不延長已存 Key 到期時間。偏好、世界、草稿不含 Key 原文；另存由 #290 接合偏好引用，不複製 Key |
| 同步、去重與隔離 | 真 SQLite 提交前故障不保存、提交後回覆遺失用相同 version／內容恢復、不同內容 stale version 回 409，保留輸入；外帳號查另一 save 設定回 404。save 偏好寫入同 statement 驗證世界仍存在，避免刪除後晚到保存復活設定 |

## 執行結果

- `node --test tests/character-templates.test.mjs tests/character-drafts.test.mjs tests/model-settings.test.mjs`：**9/9**。
- `node tests/run-activities.mjs tests/character-generation-api.test.cjs tests/free-actions-api.test.cjs tests/world-saves-api.test.cjs tests/operations-api.test.cjs`：**49/49**。
- `npm run typecheck`：通過。
- `npm run lint`：**0 errors／4 既有 warnings**。
- `npm run build`：通過，含 `/api/model-settings`、人物、觀察及設定路由。
- `git diff --check`：通過。
- 真 App Router／磁碟 SQLite／Chromium：**runtime `42ec76b` 通過**。命令：`PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t4-browser-final node tooling/verification/browser-model-settings-285.mjs`。

[原草稿返回畫面](assets/model-settings-285/returned-draft.png) · [存檔自訂來源畫面](assets/model-settings-285/custom-source.png) · [origin／版本／登入條件及完整結果](assets/model-settings-285/evidence.json)。

真頁旅程不安裝世界 fixture：人物草稿沿真正 UI 保存；觀察用世界先經人物／場景／存檔產品 API 建立並保存，再從真正存檔頁點續玩。這不代替 #288 的五步 UI 驗收。模型僅在最後 HTTP 邊界回受控資料，真實付費 **0 次**、正式世界操作 **0 次**；受控通過不代表真實模型語義品質已驗收。身分使用本機 cookie 替身，未測正式 OAuth。

## 遷移與回退

新增 `0016_model_preferences.sql`，只建立帳號／存檔模型偏好表；世界、Key、已存活動及既有骰果不遷移。只在隔離資料庫套用。新程式讀設定需此表，正式發版前須依正常流程套 migration，本次沒有執行。回退可保留新表，但舊程式不會理解新偏好；不能將刪表視為無資料損失的回退。舊人物／場景來源及建角草稿不因設定改動重做；進行中操作與既存原 ID 結果沿原 journal，偏好不充當操作恢復紀錄。

## 有效 Key 跨裝置變動補證

以整合 runtime **`7634552`** 重跑新增反例；結果為**既有保護已通過，沒有產品 RED**，因此本次沒有修改 runtime，也不宣稱修復原本不存在的缺口。

- 真觀察頁先讀有效模型與 Key；另一同帳號瀏覽器透過產品 API 清除 Key。原頁仍帶先前已讀設定，明示按下一回合時收到 **400／`modelSettingsRequired:true`**，在原頁打開模型設定面板。
- 原 save URL、介入文字、回合及世界時間保留；此失敗操作沒有派送模型，沒有自動重試。關閉面板再按 AI 模式也會直接回到面板。
- API 另以受控時間越過 Key 到期時點，確認與清除 Key 相同：400 保持原狀態碼、已有 flag 保留、零模型 dispatch，世界 version／turn／minute 不變。
- 原版 `modelRoleReady` 已檢查有效到期時間；原版 `ModelKeyError` 回應與 `WorldApp` 也已有對應開面板行為。本次只加入測試及證據。

新增後 API 組合 **10/10**（模型設定 5 項＋人物範本／建角草稿 5 項）；新增兩個測試檔案範圍 lint 與 diffcheck 通過。同 runtime 原有 typecheck／build／49 項核心回歸仍有效，沒有無變化的重跑。

命令：`node --test tests/character-templates.test.mjs tests/character-drafts.test.mjs tests/model-settings.test.mjs`；`PLAYWRIGHT_MODULE=/tmp/quiet-hours-browser/node_modules/playwright CHROMIUM_EXECUTABLE=/tmp/chromium BROWSER_ARTIFACT_DIR=/tmp/t4-key-recovery node tooling/verification/browser-model-settings-285.mjs`。真頁完整旅程含新增跨裝置清 Key 反例 **通過**，全旅程受控模型仍 **1 次**、真實付費 **0 次**。畫面與 evidence 已更新：[原頁缺 Key 面板與保留輸入](assets/model-settings-285/key-cleared-return.png)。
