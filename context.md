# NPC 觀察室：架構導覽

天上意志是世界主持責任，像 TRPG 的 KP／GM：維持世界、界定角色可知資訊、接收提案、協調裁定並一致保存。它由程式及受約束的模型任務組成，並非世界內的神祇。

NPC 決定想做什麼；世界主持承接嘗試；NPC 依自己得知的結果再作選擇。裁定模型不擲骰、不指定最終級別、不替其他角色決定是否同意。

| 責任 | 程式落點 | 邊界 |
| --- | --- | --- |
| 世界操作與一致提交 | `app/api/world/route.ts` | 帳號隔離、operationId、版本、租約、期限、預算及保存；整個技術回合原子提交 |
| 活動與角色順序 | `lib/activities.ts` | 何時重新決策／續做，保留角色自主性與已提交成果 |
| 主觀上下文與共用驗證 | `lib/world.ts`、`lib/models.ts` | 系統先投影角色所知，再驗證記憶／認知／意圖／行動候選；未展示不代表已遺忘 |
| 供應商轉接 | `lib/model-adapter.ts` | 只收到篩選後 transcript、schema、服務及認證設定，不收到完整 World |
| 世界裁定任務 | `lib/adjudication.ts` | 獨立設定與歷史，只接本次行動及相關權威條件 |
| 受限物件效果 | `lib/world-effects.ts` | 程式檢查供應、身份、權限、位置、生命週期與版本後執行，拒絕任意世界 patch |
| 必要判定 | `lib/d20.ts` | 程式擲骰與計算；同條件重試保留既有結果 |
| 感知與知情 | `lib/perception.ts`、`lib/attention.ts`、`lib/false-perception.ts` | 區分權威世界與角色主觀線索，遵守 ADR 0001 |
| 記憶與認知 | `lib/memory.ts`、`lib/cognition.ts`、`lib/recall.ts` | 角色自己的經歷、看法及有界回想；不回灌觀察者診斷 |

NPC 雲端／本機轉接共用行為指導與輸出語義；目前正式轉接支援既有 OpenAI／OpenRouter，本輪沒有安裝或部署本機服務。契約與請求關聯見 [模型任務契約](docs/design/model-task-contract.md)。

自由提案以 [受限效果契約](docs/design/free-action-effects.md) 承接；正式種子不因測試餐點／茶具 fixture 自動生成菜單、住宅或物品。角色願望與世界建置仍分開，需新方法、他人同意或前往別處時交回角色。

世界 API 的當前回合技術回復與遊戲內活動中斷是兩件事：技術失敗回復當前候選且保留已知費用，早先已提交的事實仍存在。確定動作及已驗證階段的純續做由程式承接，沒有背景模型事件或無限格式修復。

操作驗收證據由既有 journal 保存，僅供觀察者查閱，不進入 World 或 NPC 上下文。成功成果不能反推未保存的提案 target 或原始裁定；原執行與重送的 requestId 亦須區分。最小修正範圍、敏感欄位與原驗收杯能力限制見 [操作證據設計](docs/design/operation-evidence.md)、[ADR 0004](docs/adr/0004-operation-evidence-stays-outside-story.md)。

## 接手閱讀

- `AGENTS.md`、`docs/agents/matt-pocock.md`：工程流程。
- `GLOSSARY.md`、`docs/adr/`：正式用語與知情決策。
- [#67](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/67)：共用介面規格；#69/#73/#74 是本輪實作範圍，其餘票不能因本導覽視為已交付。
- [#87](https://github.com/sarekoubeYohane/quiet-hours-npc/issues/87)、[已發布拆票](docs/plans/heavenly-will-tickets-2026-10-16.md)：#93/#94/#100 的產品與依賴。
- [記憶契約](docs/design/npc-memory-contract.md)、[操作保存契約](docs/design/world-operations.md)：沿用保障。

實際完成程度以對應提交及執行驗證紀錄為準；導覽不代表已合併、部署或通過真實模型品質驗收。
