# PLAN.md — 翻翻吧施工計劃（活文件）

> 建立於 2026-08-25，由 Ox Alpha 接手輪整理。事實來源以 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史為準；本檔只放「現在與下一步」，歷史脈絡留在上述正本。

## 現況快照

| 項目 | 狀態 |
|------|------|
| 版本 | v1.11.1（package.json；尚未發布到 Chrome Web Store） |
| 自動化單元測試 | 27 suites / 318 tests 全綠（2026-08-26，含 Obsidian 匯出失敗路徑回歸） |
| e2e | `npm run e2e`：Playwright 驅動真 Chrome ＋ 真擴充，45 案＝41 PASS / 0 FAIL / 4 PARTIAL（2026-08-26；改 code 先 `npm run package`） |
| 手動 QA | 全表 55/78；剩 23 項幾乎全卡「無 API key」或「需外部 App／帳號」（見 `MANUAL-QA.md` 執行順序節） |
| 上架 | 決策＝打磨完再送審；Chrome Web Store 為 release checkpoint |
| 2026-08-26 全面審查 | 四路平行審查完成：code（30+ 項）、UI/UX（30 項）、流程（A1-A6＋B1-B5）；總評＝工程底子前段班，上架 blocker 集中在安全 P1×2、a11y、上架材料 |

## 最近完成

- 2026-08-26：Sprint 1 上架 blocker 完工（5/6，截圖待人工）＋e2e 全綠 41 PASS / 0 FAIL / 4 PARTIAL；單元測試 318 全綠。commit 待 KAKA 指示。

- 2026-08-26：Ox Alpha 四路全面審查（code review／UI/UX／使用者與開發流程），產出 Sprint 1-3 優化路線圖，發現已併入下方「下一步」與風險表。

- 2026-08-25：修掉「UI 清不掉目前模型 API Key」（`options.js` 清空欄位＋confirm 即移除），3 條回歸測試＋反向驗；e2e legacy §5-2 改鎖新契約。commit `c20639f`。
- v1.10.x：WS-E mirror-only cutover（Tier 1 六案 6/6 PASS）、CSV 公式注入防護（v1.10.1）、半接線 6 條接線完工。

## 下一步（依序）— 2026-08-26 審查後重排

1. ~~**真瀏覽器跑 e2e 一輪**~~ ✅ 2026-08-26：41 PASS / 0 FAIL / 4 PARTIAL（PARTIAL 皆為無 key／外部帳號項）。§5-2 新契約驗過。
   ⚠️ 踩雷記錄：舊拋棄式 profile（p2）載入的未封裝擴充指向**舊 checkout** `C:\dev\0xKAKA-dev\fan-fan-ba\dist\pkg`，會驗到舊版程式（§5-2 假 FAIL）。全自動替代路：`FFB_E2E_EXECUTABLE` 指向 Playwright chromium＋乾淨 profile＋`FFB_E2E_EXT_ID=aniccnioenbpamjknkmeafcgdodpedma`（--load-extension 的 ID 由路徑雜湊產生，與預設不同）。
2. **Sprint 1 上架 blocker**：
   - [x] API key 改 header 傳送（Gemini/TTS 三處＋options.js 測試連線，e2e §5-3 同步驗證通過）
   - [x] Obsidian 匯出假成功修正（vocabulary.js 失敗不蓋 obsidianExportedAt，含回歸測試）
   - [x] popup 模型清單 a11y（div→button role=radio）＋工具列按鈕 aria-label
   - [x] privacy-policy.html 權限表補 unlimitedStorage；store-listing.md 版號改佔位符
   - [x] 文件校正輪：README badge／權限敘述、TESTING.md 測試數、e2e README `--load-extension` 描述
   - [ ] 1280×800 截圖產出（Tier 5 gating，需人工）
3. **Sprint 2 結構債**：抽 `resolveRoute()` 消 AI 路由雙軌、migrationPromise 可重試、XLSX 公式防護、onboarding 閉環、CI 加 workflow_dispatch e2e job＋release 打 tag。
4. **清 Tier 3／4 剩餘項**（原第 2 項）：需要 KAKA 決定是否配真實 API key（2026-08-14 裁決：QA profile 不配 key，這些項不會被自動化涵蓋）；Obsidian 落檔需真 App。
5. **Tier 5 送審前 gating**（原第 3 項，截圖已提前至 Sprint 1）：正式 OAuth client_id 確認（T7，需人工進 Google Cloud Console）、依 `STORE-SUBMISSION.md` 打包送審。
6. **Sprint 3 中期**：dom.js innerHTML 遷移完成、高亮／全文翻譯接 DOM 變更感知層、dark mode 第一階段、design token 收斂（error/focus 色、glass 參數）＋術語表。

## 已知風險／技術債（有證據）

| 風險 | 證據 | 處置建議 |
|------|------|----------|
| cutover 刪庫的 `onblocked` 路徑從未驗證（舊 DB 被佔住時 fire-and-forget，靠下次啟動補刪） | `vocabulary-store.js:229`、`MANUAL-QA.md`〈還沒驗到的〉段 | 低機率；可補一條多 context 的 e2e 或接受現狀並記錄 |
| `replaceAll({clearing:true})` 無 production 觸發者，handleMessage 不轉發 clearing | `vocabulary-store.js:304`、`:375` | 未來加「清空單字本」鈕時必須一起接線＋補驗，否則快照刪除語意靜默失效 |
| `content.css` 整理（2708 行）deferred | `MANUAL-QA.md` 末節 | 維持 deferred，動它前先讀更新規則 |
| 文件版號滯後：overview/TESTING.md 多處停在 v1.10.x／249 tests | 各檔標頭 | 下次文件輪一併校正，避免誤導接手者 |
| storage.js `migrationPromise` reject 後永久快取，一次暫時 IO 錯誤掛掉全部翻譯 | storage.js:36-55 | `.catch` 後清 null 允許下次重試 |
| body 級錯誤的 string `code` 塞進 `err.status`，429 重試／404 fallback 失效 | background.js:479-481 | `Number()` 轉換並分欄保存原始 code |
| 浮球三面板假 `savedSel` 會把面板名當原文存進 Obsidian 週記 | floating-ball.js:329-410 | 加面板模式旗標，非翻譯模式擋存入或隱藏寶石鈕 |
| innerHTML 主流路徑遇 Trusted Types 頁面（Google 系）UI 全滅 | content/*.js 多處；dom.js 安全 builder 遷移不到一半 | 完成 ffbEl 遷移，過渡期包 createPolicy fallback |
| 文件版號系統性腐化：README badge v1.10.0＋權限敘述過期、TESTING.md 249 tests、e2e README 誤載 --load-extension 限制、jest.setup mock 版本 1.7.2 | 各檔標頭與內文 | release checklist 加「grep 舊版號」；數字類資訊考慮由 CI 生成 |
| Gemini/TTS API key 走 query string，會進 proxy/server 日誌 | background.js:415/559/674（Sprint 1 修正中） | 改 `x-goog-api-key` header |

## 驗證指令速查

```bash
npm test                                  # Jest 30 + jsdom（覆蓋率預設開）
npx jest --testPathIgnorePatterns '/\.claude/'   # 主樹取值用
npm run package                           # 產 dist/pkg + zip（e2e / 載入前必跑）
npm run e2e                               # Playwright 真 Chrome 45 案
```

> 更新規則：完成一個 slice 就回寫本檔「最近完成／下一步」；測試數字異動時同步 `TESTING.md` 標頭與 `MANUAL-QA.md` 頂部計數。
