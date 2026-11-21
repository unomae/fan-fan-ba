# PLAN.md — 翻翻吧施工計劃（活文件）

> 排版：主題分組＋目的／現況／接續／詳情四欄；原優先序、核准與待驗狀態不變，本輪未重驗產品。維護時保留四欄，舊紀錄以各指標核對。

> 建立於 2026-08-25，由 Ox Alpha 接手輪整理。事實來源以 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史為準；本檔只放「現在與下一步」；**完成項一律搬 `CHANGELOG.md`**，更早的歷史脈絡留在上述正本。

## 現況快照

| 項目 | 狀態 |
|------|------|
| 版本 | v1.11.1（package.json；尚未發布到 Chrome Web Store） |
| 自動化單元測試 | 全綠，數字以 `npm test` 輸出為準、文件不記（涵蓋設定頁總覽與未儲存提示、模型清冊完整性鎖、錯誤碼型別回歸、字典例句加粗、快捷鍵／右鍵選單分派、結果卡單次模型與自訂端點、自訂動作資料層與內建 prompt 逐字比對、自訂動作三種版面與串流、設定頁動作編輯器、工具列更多動作選單、各功能模型對照表、長難句分析、寫作批改、設定頁搜尋與新功能標籤、術語表（含多分頁同步）、模型比較、單字卡四級評分） |
| e2e | `npm run e2e`：Playwright 驅動真 Chrome ＋ 真擴充，45 案＝41 PASS / 0 FAIL / 4 PARTIAL（2026-10-23，首次確認測到現行 service worker；改 code 先 `npm run package`，啟動時自動比對建置指紋） |
| 手動 QA | 全表 71/78（2026-11-20 補驗後）；剩 7 項＝Tier 3／4 的 4 格（都需 KAKA）加 Tier 5 送審 3 項（見 `MANUAL-QA.md` 執行順序節） |
| 上架 | **2026-09-20 裁決：暫緩送審，先做功能**，告一段落再回頭走上架流程。Chrome Web Store 仍是 release checkpoint |
| 2026-08-26 全面審查 | 四路平行審查完成：code（30+ 項）、UI/UX（30 項）、流程（A1-A6＋B1-B5）；總評＝工程底子前段班，上架 blocker 集中在安全 P1×2、a11y、上架材料 |

## 下一步（依序）— 2026-08-26 審查後重排

### 上架準備與驗收

- **1. Sprint 1 上架 blocker**

  - **目的**：補齊擴充功能上架前的阻塞項。
  - **現況**：只剩 1280×800 截圖產出（Tier 5 gating，需人工）。**2026-09-20 裁決：暫緩**——KAKA 要先做功能，等告一段落再回頭。
  - **接續**：暫緩中，不主動推進也不列為阻塞；KAKA 說回頭做上架時再補商店截圖及剩餘人工驗收。商店小圖 `screenshots/promo-small.png` 已於 2026-11-19 把「・」改成頓號，上架時要重新上傳（大圖不用）。
  - **詳情**：`MANUAL-QA.md`；`TESTING.md`；`CHANGELOG.md`

### 翻譯與資料可靠性

- **3. 清 Tier 3／4 剩餘項**

  - **目的**：補上自動測試無法代替的真實情境。
  - **現況**：2026-11-20 Claude 用模擬 provider、本機 Excel 與臨時 Obsidian 測試 vault 補驗，Tier 3 18/19、Tier 4 28/31（全表 71/78）。剩 4 格都要 KAKA：譯文語境、中日文生字裁決、Cloud Sync，以及存入 Obsidian 後切回原分頁。補驗時發現的 Alt+T 疑點已於同日修掉（見 `CHANGELOG.md`）。
  - **接續**：
    - **§4 譯文合不合上下文**：需真模型；已確認請求帶前後段。
    - **Tier 3 中日文頁生字候選只抓英文**：實測抓 backlog／dashboard／inventory、日文不抓，請裁決可否接受。
    - **§7 Cloud Sync 登入同步**：「hover 設定」那半已於 `5f4c193` 隨按鈕移除，只剩這半。
    - **§2 存入 Obsidian 後切回原分頁**：擴充送出的 URI 已確認 Obsidian 寫得進去；Chrome 把 `obsidian://` 交給系統、再切回原分頁，只能在日常 Chrome 實際按一次「開啟 Obsidian」確認。
    - **Alt+T 後的 popup 按鈕**（`a986292`）：單元測試已過；測試用 Chrome 拿不到真 popup 畫面。日常 Chrome 用 Alt+T 翻一段後開 popup，確認按鈕是「翻譯這一頁」、按下去翻整頁。
    - 全過才搬 `CHANGELOG.md`；證據等級與每格結果見 `MANUAL-QA.md`〈2026-11-20 Tier 3／4 補驗〉。
  - **詳情**：`MANUAL-QA.md`；`scripts/check-models.js`

### 上架準備與驗收（續 2）

- **4. Tier 5 送審前 gating**

  - **目的**：達到送審前的 OAuth 與商店條件。
  - **現況**：**Tier 5 送審前 gating**：正式 OAuth client_id 確認（T7，需人工進 Google Cloud Console）、依 `STORE-SUBMISSION.md` 打包送審。
  - **接續**：**2026-09-20 裁決暫緩**，與 Sprint 1 上架 blocker 同步；回頭做上架時才由 KAKA 處理 client ID 與 console／商店人工項，再核對 Tier 5。
  - **詳情**：`STORE-SUBMISSION.md`

### 內建翻譯 provider

- [ ] **7. 內建翻譯 provider｜真實網頁端到端人驗**〔待KAKA操作〕（2026-09-21）

  - **目的**：讓沒有金鑰的人也能用全文翻譯，有金鑰者這條路徑改走本機；詞典與 optimize 不動。
  - **現況**：主體與自動接續已完成，仍保留真人驗收。2026-10-27 全新 Chrome 155 profile、真 storage／真內建模型已驗無 API key 儲存重開、18 段捲動接續、動態追加、停止與還原；首次下載超過 30 秒的情境仍只有單元測試。模型下載受測試啟動參數影響，細節見 CHANGELOG 同日紀錄；腳本實測不代替人眼譯文品質與日常瀏覽器驗收。
  - **接續**：KAKA 實機人驗（不需 API key）：①`npm run package` 後用全新測試 profile 載入 `dist/pkg` ②設定頁「全文翻譯」選「瀏覽器內建翻譯」並儲存，重開確認 ③英文長文啟動全文翻譯後捲動，譯文須自動接續、不需再點；首次下載檢查進度條 ④確認譯文品質與順序，再驗停止／還原。人驗通過才勾掉本項並搬 CHANGELOG。
  - **詳情**：`background.js` 的 `resolveRoute`／`handleOpenAICompatRequest`（引用符號不引行號）；`models.js` 的 `PROVIDERS`；可行性實測見 `CHANGELOG.md` 2026-10-22「PLAN 第 6 項結案」與 memory `reference_chrome_builtin_ai_probe`

## 缺資料／風險處置待決

### 已知風險／技術債（有證據）

### 翻譯與資料可靠性（續 2）

- **cutover｜舊 DB 佔用情境未驗**

  - **目的**：釐清舊 DB 被佔用時的清理風險。
  - **現況**：風險：cutover 刪庫的 `onblocked` 路徑從未驗證（舊 DB 被佔住時 fire-and-forget，靠下次啟動補刪） | 證據：`vocabulary-store.js:229`、`MANUAL-QA.md`〈還沒驗到的〉段 | 處置建議：低機率；可補一條多 context 的 e2e 或接受現狀並記錄
  - **接續**：先補 onblocked 自然情境證據，再決定處置；不直接刪庫。
  - **詳情**：`vocabulary-store.js:229`；`MANUAL-QA.md`

### 介面與操作體驗（續 2）

- **content.css 整理（2708 行）deferred**

  - **目的**：保留 CSS 整理的延後決策。
  - **現況**：風險：`content.css` 整理（2708 行）deferred | 證據：`MANUAL-QA.md` 末節 | 處置建議：維持 deferred，動它前先讀更新規則
  - **接續**：維持 deferred，等明確核准再整理。
  - **詳情**：`MANUAL-QA.md`

### 介面與操作體驗（續 3）

- **設定頁、popup、網頁浮層與歡迎頁改版：KAKA 日常 Chrome 實機看觀感**

  - **目的**：設定頁「總覽首頁＋卡片」、說明文字精簡，以及 popup／設定頁改用 Radix 色票並刪掉重複元素後，確認日常用起來順手、深色模式好讀。
  - **現況**：2026-10-23 完成總覽卡片、網址直達、未儲存提示、深色模式與說明文字精簡三階段；同晚 popup 與設定頁改用 `ui-tokens.css`（Radix Colors），刪掉重複的狀態卡、數字列、裝飾標籤與「·」分隔，視覺依 KAKA 選擇保留上一版（光暈背景、毛玻璃外框、圓角、hover 上浮），PR #2 已合進 master（見 `CHANGELOG.md` 同日兩條）。KAKA 看過預覽截圖認可；Jest、e2e 41/0/4 已過，真擴充只有自動截圖。
  - **接續**：KAKA 用日常 Chrome 載入 `dist/pkg`，看 popup（缺金鑰提醒、「填寫金鑰」直達模型分類、logo 光暈）、設定頁總覽、進出 3～4 個分類、改欄位後回總覽看提示，再切系統深色看一遍；另看金鑰狀態標籤、ⓘ 說明、備份勾選加密才出現密碼欄、總覽頁尾快捷鍵是否等於 chrome://extensions/shortcuts 實際綁的鍵。2026-11-18 起浮層與歡迎頁也換成 Radix（見 `CHANGELOG.md` 同日條目），一併看：選字跳出的工具列、結果卡（含錯誤卡、收藏與 Obsidian 標籤）、浮球選單、全文翻譯面板，各在白色、深色、彩色圖片多的網站上看毛玻璃是否看得清楚；歡迎頁（`chrome-extension://<ID>/welcome.html`）亮暗各一遍。有要調的直接記在這項，沒有就搬 `CHANGELOG.md`。
  - **2026-11-21 進度**：客觀 5 項已在 ego lite＋`dist/pkg`（build d090f51ee51f）實機驗過、全過：填寫金鑰直達 `options.html#model`；改語言欄位沒存→回總覽出現「有未儲存的變更／回去儲存」；勾加密才出現密碼欄；頁尾 ⌃⇧S／⌃⇧A＝`chrome.commands.getAll()`＝快捷鍵頁；金鑰狀態標籤與 ⓘ 有內容。另做 17 組亮暗截圖集（擴充 4 頁＋浮層 5 種 × 白／深／圖片多的網站，沒填 key 只看得到錯誤狀態），**剩觀感由 KAKA 看截圖集判斷**（每張 OK／要調），回饋貼回後再決定調整或結案。
  - **詳情**：`ui-tokens.css`；`content.css`；`welcome.html`；`design.md` 1.5 節與第 2 節；`options.html`；`popup.html`；`options.js` 的 `buildSettingsOverview`／`activateSettingsPanel`、`popup.js` 的 `renderKeyAlert`（**引用符號不引行號**）

### 整版 review 遺留（2026-10-19）

- **模型下架後，自訂動作的模型默默改成跟隨主模型**〔待裁決〕

  - **目的**：決定要不要讓使用者知道動作的模型被換掉。
  - **現況**：2026-10-19 修正後動作保留、模型退回 `default`，之後存檔就固定寫回 `default`；沒有任何提示。
  - **接續**：KAKA 裁決要不要在設定頁或結果卡提示；要做再定提示位置與文案。
  - **詳情**：`custom-actions.js` 的 `normalizeActionList`

## 驗證指令速查

```bash
npm test                                  # Jest 30 + jsdom（要覆蓋率加 --coverage）
npx jest --testPathIgnorePatterns '<rootDir>/\.claude/'   # 主樹取值用（要錨定 <rootDir>，Git Bash 會把 / 開頭的參數改寫成路徑）
npm run package                           # 產 dist/pkg + zip（e2e / 載入前必跑）
npm run e2e                               # Playwright 真 Chrome 45 案
npm run check-models                      # OpenRouter 模型下架對賬（免 key；0=通過 1=有下架 2=未檢）
node scripts/check-models.js --selftest    # 對賬邏輯自測，期望 SELFTEST 7/7 PASS
```

> 更新規則：完成一個 slice 就把它從「下一步」移進 `CHANGELOG.md`，本檔不留完成紀錄。
