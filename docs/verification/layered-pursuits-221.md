# #221 最小分層追求驗證

2026-10-29，基線 main `f9493c7`，隔離分支 `feat/pursuits-221`。本切片使用 repository implement-spec／TDD，先新增世界 API 保存與下一次 request 測試得到 502 RED，再接通新版契約得到 GREEN。受控 provider transport，真實世界 API、活動／感知與 SQLite 保存／重讀；零真實付費模型，沒有推進或重置使用者世界。

`node --import ./tooling/verification/no-network.mjs tests/run-activities.mjs tests/pursuits-api.test.cjs`：24/24。測試覆蓋：

| #220 | 實際可核對結果 |
| --- | --- |
| C1、C3、C8 | 初始只含方向；新子追求、開放終點、單父、空焦點、同批先子後父、空或省略增量；SQLite 重讀與下一次真實 provider request 保持身份／範圍，兩輪四角色共 8 次 fixture 派送 |
| C2 | 方向內容改寫後下一次輸入採當前方向；明示 drop 後不注入 seed goal，性格與原設定文字保存 |
| C5 最小子集 | 自環、循環、重複、外角色、未知／過期端點及來源、錯誤 pursuitContext；尚未實作多父時明拒，不靜默截斷 |
| C18 | 後角色非法、SQLite 保存衝突、保存前故障均不提交追求／活動／世界；已知 2 或 4 次派送的 usage 保留 |
| C19 | 成功／失敗原 operationId 重播零新增派送；GET 零決策、版本不重加 |
| C20 | 接管待命、單次指定保留自主追求；交還後才正常決策，各角色實際 request 不含他人私有方向原文 |
| C23 | 舊世界 GET 可讀，advance 409 且零模型；既有 reset API 建立新版方向，成本與歷史累計保留；既有日常場景原生 v3 推進後可還原舊／新原世界，與 L1–L5 起點分開 |
| C22 最小子集 | 既有 profile／analysis 重載顯示層次、範圍、主觀標準、焦點、版本與有界變更；世界結果與模型短理由分開 |

`pnpm typecheck` 通過。變更的 server／shared／新 UI component／測試及 runner 的 ESLint 通過；既有 character-profile 的 img 警告不屬本次新增。大面積舊 fixture 回覆仍須依整合新版語義遷移，這不是整個 repository regression 已通過的聲明。

`tooling/verification/browser-pursuits-221.mjs` 已以本機 Edge/Chromium、真 WorldApp、世界 API 與 SQLite 執行：兩輪受控模型、保存重載、第二次實際 messages 核對、分析與人物檔案核對通過，沒有 pageerror。合成世界只留焦點店主以精確測 UI，四角色正常回合另由 API 測試覆蓋。畫面截圖及 JSON 摘要位於本機 `outputs/pursuits-221/`，程式可重跑，不含真人私人資料。另有 `pursuits-panel.png` 便於直接檢視追求面板。

第一切片沒有宣稱完成共享排序、滿足／暫時足夠、複雜退出、安排關聯、候選發散或完整滿載維護，對應後續 #222–#228。最終 integration code-review 與適用全回歸仍須在整合 PR 交付前完成。#220／#229 真實行為狀態未完成，fixture 不能代替自主形成與跨行動成果的成功鏈。
