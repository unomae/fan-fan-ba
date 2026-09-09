# PLAN.md — 翻翻吧施工計劃（活文件）

> 建立於 2026-08-25，由 Ox Alpha 接手輪整理。事實來源以 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史為準；本檔只放「現在與下一步」；**完成項一律搬 `CHANGELOG.md`**，更早的歷史脈絡留在上述正本。

## 現況快照

| 項目 | 狀態 |
|------|------|
| 版本 | v1.11.1（package.json；尚未發布到 Chrome Web Store） |
| 自動化單元測試 | <!-- ffb:suites -->27<!-- /ffb:suites --> suites / <!-- ffb:tests -->324<!-- /ffb:tests --> tests 全綠（2026-09-09，含模型清冊完整性鎖） |
| e2e | `npm run e2e`：Playwright 驅動真 Chrome ＋ 真擴充，45 案＝41 PASS / 0 FAIL / 4 PARTIAL（2026-08-26；改 code 先 `npm run package`） |
| 手動 QA | 全表 55/78；剩 23 項幾乎全卡「無 API key」或「需外部 App／帳號」（見 `MANUAL-QA.md` 執行順序節） |
| 上架 | 決策＝打磨完再送審；Chrome Web Store 為 release checkpoint |
| 2026-08-26 全面審查 | 四路平行審查完成：code（30+ 項）、UI/UX（30 項）、流程（A1-A6＋B1-B5）；總評＝工程底子前段班，上架 blocker 集中在安全 P1×2、a11y、上架材料 |

## 下一步（依序）— 2026-08-26 審查後重排

1. **Sprint 1 上架 blocker**：
   - [ ] 1280×800 截圖產出（Tier 5 gating，需人工）
2. **Sprint 2 結構債**：抽 `resolveRoute()` 消 AI 路由雙軌、migrationPromise 可重試、XLSX 公式防護、onboarding 閉環、CI 加 workflow_dispatch e2e job＋release 打 tag。
3. **清 Tier 3／4 剩餘項**：需要 KAKA 決定是否配真實 API key（2026-08-14 裁決：QA profile 不配 key，這些項不會被自動化涵蓋）；Obsidian 落檔需真 App。
   ⚠️ **根 PLAN P-16 的①預設模型能實際翻譯、③404 備援實跑，兩項卡在同一個裁決上**（②四顆模型清冊已於 2026-09-09 用測試鎖住，見 `CHANGELOG.md` 2026-09-09）。維持不配 key 就只能由 KAKA 本人拿自己的 key 手動跑一次；`check-models.js` 也因此只涵蓋 OpenRouter、蓋不到預設模型。
4. **Tier 5 送審前 gating**：正式 OAuth client_id 確認（T7，需人工進 Google Cloud Console）、依 `STORE-SUBMISSION.md` 打包送審。
5. **Sprint 3 中期**：dom.js innerHTML 遷移完成、高亮／全文翻譯接 DOM 變更感知層、dark mode 第一階段、design token 收斂（error/focus 色、glass 參數）＋術語表。
6. **同類專案調研的兩條待裁線索**（2026-09-09，**皆未評估可行性，不是已排定的工作**）：
   - **Chrome 內建 AI 翻譯**：`kiss-translator` 的引擎清單有 `BuiltinAI`。若可行則**免 API key**，同時打到「23 項手動 QA 卡無 key」與「新使用者要先申請金鑰」兩個結構性痛點。只確認同儕在用，**能力邊界與瀏覽器版本要求全未驗**。
   - **自訂 OpenAI 相容端點**：`kiss-translator`／`MTranServer` 顯示這是本品類標配，加一個欄位即可讓模型下架時使用者自救。與 `check-models.js` 是互補而非重疊（一個偵測、一個逃生）。

## 已知風險／技術債（有證據）

| 風險 | 證據 | 處置建議 |
|------|------|----------|
| cutover 刪庫的 `onblocked` 路徑從未驗證（舊 DB 被佔住時 fire-and-forget，靠下次啟動補刪） | `vocabulary-store.js:229`、`MANUAL-QA.md`〈還沒驗到的〉段 | 低機率；可補一條多 context 的 e2e 或接受現狀並記錄 |
| `replaceAll({clearing:true})` 無 production 觸發者，handleMessage 不轉發 clearing | `vocabulary-store.js:304`、`:375` | 未來加「清空單字本」鈕時必須一起接線＋補驗，否則快照刪除語意靜默失效 |
| `content.css` 整理（2708 行）deferred | `MANUAL-QA.md` 末節 | 維持 deferred，動它前先讀更新規則 |
| storage.js `migrationPromise` reject 後永久快取，一次暫時 IO 錯誤掛掉全部翻譯 | storage.js:36-55 | `.catch` 後清 null 允許下次重試 |
| body 級錯誤的 string `code` 塞進 `err.status`，429 重試／404 fallback 失效 | background.js:479-481 | `Number()` 轉換並分欄保存原始 code |
| 浮球三面板假 `savedSel` 會把面板名當原文存進 Obsidian 週記 | floating-ball.js:329-410 | 加面板模式旗標，非翻譯模式擋存入或隱藏寶石鈕 |
| innerHTML 主流路徑遇 Trusted Types 頁面（Google 系）UI 全滅 | content/*.js 多處；dom.js 安全 builder 遷移不到一半 | 完成 ffbEl 遷移，過渡期包 createPolicy fallback |
| 文件數字腐化（2026-09-09 已加 lint 收斂）：9 處現況數字上標記、`check-docs` 守著；`jest.setup.js` 改讀 `manifest.json`。**殘留缺口**＝lint 未接進任何自動關卡（無 pre-commit／CI），要人記得跑；且新增的現況宣稱若忘了加標記，lint 看不見它 | `scripts/check-doc-numbers.js`；標記見 `FILES` 列的 4 個檔 | 接進 CI（`--verify`）或 pre-commit（預設模式）；歷史數字刻意不管 |

## 驗證指令速查

```bash
npm test                                  # Jest 30 + jsdom（覆蓋率預設開）
npx jest --testPathIgnorePatterns '/\.claude/'   # 主樹取值用
npm run package                           # 產 dist/pkg + zip（e2e / 載入前必跑）
npm run e2e                               # Playwright 真 Chrome 45 案
npm run check-models                      # OpenRouter 模型下架對賬（免 key；0=通過 1=有下架 2=未檢）
node scripts/check-models.js --selftest    # 對賬邏輯自測，期望 SELFTEST 7/7 PASS
npm run check-docs                        # 現況數字一致性（快，不跑 jest；0=一致 1=不一致 2=未檢）
npm run check-docs -- --verify            # 權威版：實跑 jest 對照文件數字（慢，release／CI 用）
node scripts/check-doc-numbers.js --selftest  # 期望 SELFTEST 9/9 PASS
```

> **改測試數時**：現況數字用 `<!-- ffb:tests -->N<!-- /ffb:tests -->`（`N` 換成實際數字）這種標記包住，`check-docs` 只認標記、不碰未標記的歷史數字。新增一處現況宣稱要記得加標記，新增檔案要加進 `scripts/check-doc-numbers.js` 的 `FILES`。此處 `N` 是佔位符、刻意不寫成數字，否則這行說明自己會被當成一處現況宣稱。

> 更新規則：完成一個 slice 就把它從「下一步」移進 `CHANGELOG.md`，本檔不留完成紀錄；測試數字異動時同步 `TESTING.md` 標頭與 `MANUAL-QA.md` 頂部計數。
