# 翻翻吧 Code Review / UX Benchmark

Review 時間：2026-06-18 09:37 +08:00  
專案版本：`fan-fan-ba` v1.8.6  
對應 HTML：`archive/code-review-2026-06-18.html`

## 一句話結論

翻翻吧已經有清楚差異化：即選即用、AI 解釋 / 優化、Obsidian 留存、Google Drive 設定同步。下一階段最值得先做的不是堆更多功能，而是把「安全、可維護、上架審核可信度、日常閱讀不打擾」補強。

## Comments 收斂

- 同意 P0 / P1 / P2 先解。
- 軟體工程師視角的優先改善全數採納。
- UI/UX 的 provider 呈現不做「推薦 / 快速 / 長文 / 免費額度」語意標籤，改成簡潔說明模型特點。
- 使用者指標先用手動 QA / 本機匿名彙總 review，不上傳原文、譯文、URL 全文、API Key 或個人識別資訊。
- Benchmark 方向朝 Immersive Translate，但近期只專注文字翻譯。
- Roadmap 已更新到 `project-overview.html` 的 phase plan。

## 2026-06-18 實作狀態更新

已完成：

- P0：修正 `npm test` 入口，移除 `package.json` 內重複 Jest 設定，預設改由 `jest.config.js` 作為單一設定來源。
- P0：新增 `content/selection-controls.js`，排除 `password`、`email`、`tel`、`number`，以及 OTP、payment、credit card、CVV、billing、phone 等敏感欄位 metadata。
- P0：補 sensitive input regression tests，確認敏感欄位不會被視為可翻譯選取來源。
- P0：補 AI HTML / XSS payload regression test，確認 `<script>`、`<img onerror>` 只能當文字渲染。
- P1 partial：background message handler 已加 action 白名單、selectedText / context / title / TTS 長度限制、sender 檢查與 page translation metadata 正規化。

已完成（2026-06-18 後續補）：

- P0：privacy-policy.html / store-listing.md 已補上第三方 AI provider 資料流與「只傳選取文字、不傳 URL 全文 / 譯文 / API Key」說明。
- P0：對應 review HTML 已把兩項 P0 標為完成。

尚未完成：

- P1：尚未新增站點停用 / allowlist。
- P1：尚未把 `<all_urls>` + `all_frames: true` 常駐注入改成更小範圍、`activeTab` 或 programmatic injection。
- P1：尚未把整頁翻譯模組改成按需初始化。
- P1：尚未收斂 `web_accessible_resources`。
- P1：尚未建立 `dom()` / `text()` / `safeHtml()` render helper，也尚未把結果卡、floating ball、page translator 的 `innerHTML` 面積系統性收斂。
- P1：尚未拆分 `content/page-translator.js`。
- P1：尚未做 Gmail / Notion / Google Docs / 新聞長文 / iframe 頁手動 QA。
- P2 / v1.9.7：尚未實作 hover / shortcut paragraph translation、續翻、定位原文、複製雙語、長文 context digest 等 Text Immersive UX。
- v1.9.8：尚未整理 `content.css`、模型選單特點說明、本機診斷摘要 / 手動 QA 表，也尚未把 coverage 拉到 65% lines。

## Findings

### P0：密碼欄位目前被視為可翻譯文字來源

`isTextSelectionControl` 把 `password` 放進允許清單。若使用者在密碼欄或敏感輸入欄選到文字，content script 可能讀取後送進 AI provider。

建議：

- 立即排除 `input[type=password]`。
- 評估預設排除 OTP、payment、credit card、email、tel 等敏感欄位。
- 必要時只允許使用者按快捷鍵明確觸發。

證據：`content/main.js:167-171`

狀態：已完成。改由 `content/selection-controls.js` 統一判斷可選取輸入欄，並已補 sensitive input regression tests。

### P0：`npm test` 預設失敗，CI 入口不可信

目前同時存在 `jest.config.js` 與 `package.json` 的 `jest` key，Jest 無法隱式選擇設定檔，導致 `npm test` 直接失敗。

建議：

- 保留單一 Jest 設定來源，或把 script 改成 `jest --config jest.config.js`。
- 補 GitHub Actions / PR check。

驗證：

- 舊狀態：`npm.cmd test -- --runInBand` 失敗。
- 舊狀態：`npm.cmd test -- --runInBand --config jest.config.js` 通過：14 suites / 114 tests passed。
- 目前狀態：已完成。`npm.cmd test -- --runInBand` 通過：15 suites / 123 tests passed。

### P1：`<all_urls>` + `all_frames: true` 的常駐注入面積偏大

所有頁面、所有 frame 都載入多個 content scripts 與大型 CSS。這可能在 Google Docs、Notion、內嵌 iframe、企業內部系統或高 DOM 頁面造成干擾，也會放大攻擊面。

建議：

- 短期加入敏感網域 / iframe denylist 與效能 guard。
- 中期改成可選站點啟用、`activeTab` 或 programmatic injection。
- 把 page translation 這種重功能改成按需載入。

證據：`manifest.json` 的 `content_scripts.matches=["<all_urls>"]`、`all_frames=true`

狀態：部分完成（Batch B）。

- 已新增 `content/site-policy.js`：敏感網域 denylist（登入 / 密碼管理高信心網域）→ 整支 content script 不啟用；**子 frame 不再重複生成常駐浮球**（每個 iframe 都長一顆球是最大常駐成本），選取翻譯仍由最上層 frame 透過 `contentDocument` 處理，功能不變。已接進 `content/floating-ball.js` 與 `content/main.js` 的 bootstrap，並補 `tests/content/site-policy.test.js`。
- **page translation 已是按需初始化**（Codex 列為待辦，實際已達成）：所有全域 watcher（navigation / scroll / selection）都綁在 `bindPageTranslation*Watcher()` 內，只由 `startPageTranslationBeta()` 觸發，module load 時不掛任何 listener，僅宣告函式。
- 中期項（使用者自訂 allowlist / per-site 停用、`activeTab` 或 programmatic injection）仍未做，留待 v1.9.6。

### P1：LLM / 使用者資料透過 `innerHTML` 渲染的面積太大

專案已有 `escapeHtml` 與結構化渲染，方向正確；但結果卡、floating ball、page translator 仍大量使用 `innerHTML`。AI 回傳內容、單字本、歷史紀錄、網頁文字都屬於不完全可信輸入。

建議：

- 建立 `dom()` / `text()` / `safeHtml()` 小型 render helper。
- AI markdown 渲染集中在白名單管線。
- 新增 XSS payload regression tests。

證據：`content/result-card.js`、`content/page-translator.js`、`content/floating-ball.js`

狀態：大致完成（Batch C）。

- **Audit 結論**：逐一檢視三檔所有 `innerHTML` 注入點後，確認**不可信內容（AI 回傳、頁面文字、單字本、歷史）目前已一致地經 `escapeHtml` / `formatMarkdown` / `formatPageTranslationText` / `renderDiff` 跳脫**，未發現未跳脫的真 XSS 破口。因此不做「盲目替換 27 處已安全 innerHTML」的高風險重寫（對安全零增益、UI 易回歸），改採根治性做法。
- **`escapeHtml` 防禦性強化**：補上單引號 `'` → `&#39;`，避免未來改用單引號屬性時出現破口（`content/utils.js`）。
- **新增 `content/dom.js` 安全建構 helper**（`ffbText` / `ffbEl` / `ffbClear`）：一律走 `createElement` / `createTextNode`，建構即免疫；已實際採用取代靜態字串 innerHTML 點（result-card / floating-ball 的空狀態與標題），並作為 Batch D 重構時的安全注入管線。
- **新增 XSS 回歸測試**鎖死現有安全行為：`tests/content/dom.test.js`、`tests/content/xss-regression.test.js`（buildDictHTML 各欄位 payload / 屬性跳脫），並擴充 `utils.test.js`（單引號跳脫、`{{tag}}` 屬性 breakout）。未來重構（含 Batch D）若不慎漏掉跳脫會被測試擋下。
- 仍以 `innerHTML` + `escapeHtml` 樣板渲染的安全注入點保留不動（純樣式 / 已跳脫），屬機械式 refactor，列入 Batch D 一併漸進遷移。

### P1：整頁翻譯模組過大

`page-translator.js` 同時處理收集 DOM、狀態機、串流請求、清理結果、面板 UI、導航偵測、滑鼠互動與錯誤狀態。單檔過大會讓 bug 修復與 UX 實驗成本上升。

建議：

- 拆成 `collector`、`translation-client`、`renderer`、`panel`、`state`。
- 先不改行為，只做可測試的機械拆分。

證據：`content/page-translator.js` 約 1,367+ 行；coverage 約 39.2% lines。

狀態：未完成。

### P2：`web_accessible_resources` 對所有網站開放，可再收斂

目前字型與 icon 對 `<all_urls>` 可見。這不是立即漏洞，但會讓 extension 更容易被網站偵測，也增加可利用面。

建議：

- 確認 content script 是否真的需要公開字型。
- 若只 extension pages 使用，移出 web accessible。
- 若 content UI 需要，縮到必要資源與更小 matches。

證據：`manifest.json` 的 `web_accessible_resources`

狀態：暫不收斂（Batch B 評估）。兩個資源都被 content script 在 `<all_urls>` 實際使用——字型由 `content/main.js` 的 `injectBrandFont()` 注入、`icons/icon48.png` 由 `content/floating-ball.js` 當浮球 logo——所以無法在不破壞功能下移出 web accessible 或縮小 `matches`。要真正收斂得先把浮球 icon 改成 inline SVG / data-uri 以拿掉 `icon48.png` 公開，屬獨立小改動，留待後續評估。

## 軟體工程師視角

做得好的地方：

- Manifest V3 service worker 架構已到位，API Key 主要留在 background / storage 層。
- 有 secret migration，把 API Key 從 sync 移到 local，方向正確。
- 有 retry / timeout / AbortController，對 AI provider 不穩定有基本韌性。
- 測試數量不算少，核心 content 元件、options、cloud sync、storage 都已有 coverage。

優先改善：

- [x] 先修 `npm test` 入口，讓所有人一條指令知道專案是否健康。
- [x] 把敏感輸入欄排除，尤其 `password`。
- [x] 為 background message handler 加 request schema validation，避免 content script 傳任意 action / 超長 text。
- 把大型檔案拆成行為不變的小模組，再提高單元測試覆蓋。

建議新增測試：

| 測試 | 目的 | 第一批案例 |
| --- | --- | --- |
| Security regression | 避免敏感資料外送與 XSS | password input 不觸發、AI 回傳 HTML / script 只能當文字、history / vocabulary escape |
| DOM fixture | 降低 content script 對真實網站破壞 | Google Docs fallback、Notion-like contenteditable、nested iframe、長文章頁 |
| Provider contract | AI 串流 / JSON 容錯穩定 | Gemini SSE、OpenRouter fallback、Groq 429 retry、半截 JSON |
| Performance smoke | 避免常駐注入變慢 | 10k nodes 頁面初始化時間、scroll watcher debounce、page translation 批次上限 |

## UI/UX 設計師視角

核心定位：

翻翻吧最強的不是「翻譯一切」，而是閱讀途中遇到字詞 / 段落時，能快速理解、潤稿、留存到 Obsidian。UI 應該服務這個輕量流，不要讓設定與整頁翻譯搶走主體。

建議：

| 目前痛點 | 建議改法 | 理由 |
| --- | --- | --- |
| API Key、模型、語言、Obsidian、雲端同步都在同一個大設定面 | 拆成「快速開始」「模型與金鑰」「閱讀體驗」「留存與同步」「隱私」 | 新手只需完成第一輪設定，進階功能不干擾主流程 |
| 多 provider 對一般使用者很抽象 | 不加語意標籤；在模型選單旁用一句話說明模型特點，例如速度、穩定性、長文表現、是否需自備額度 | 保持介面簡潔，讓使用者理解差異即可 |
| 整頁翻譯 Beta 容易被誤解成成熟功能 | 保留 Beta 標示，加上用量 / 區塊上限 / 可繼續翻譯提示 | 預期管理會減少負評 |

## 使用者視角

新使用者最可能卡住：

- 不知道該選 Groq、Gemini 還是 OpenRouter。
- 不知道 API Key 是否安全、會不會同步到雲端。
- 第一次選字後若沒出現 toolbar，不知道是網站限制、暫停、還是 extension 壞了。
- Obsidian 需要 Advanced URI，這是高價值功能，但 onboarding 要更像 checklist。

高頻使用者想要：

- 更快：常用 action 快捷鍵與最近模型切換。
- 更安靜：特定網站停用、特定輸入框不顯示。
- 更可控：結果卡固定、複製格式、存到 Obsidian 的模板可調。
- 更可查：單字本、最近查詢與 Obsidian 留存之間要有清楚關係。

### 使用者指標怎麼評估

建議預設採「本機、匿名、彙總、可關閉」。

第一階段不要上傳任何使用者內容、原文、譯文、網址全文、API Key 或個人識別資訊。可以先用本機 debug panel / review checklist 人工記錄，等確定需要產品分析時，再設計明確 opt-in 的 telemetry。

| 指標 | 為什麼重要 | 可怎麼量 |
| --- | --- | --- |
| 首次成功翻譯時間 | 決定新使用者是否留下 | 手動 QA 或本機匿名事件：安裝 / 設定完成 / 第一次成功回應，只記時間差與步驟，不記文字內容 |
| 選字後取消率 | 代表 toolbar 是否干擾 | 本機計數 toolbar 顯示、點擊 action、Esc、外部點擊；review 時看彙總數字，不上傳原文或網址 |
| Obsidian save rate | 這是差異化，不只是翻譯工具 | 本機計數結果卡顯示與儲存成功次數；不記筆記內容，只看流程轉換 |
| 敏感欄位防護觸發 | 建立安全信任 | 只做本機統計：略過 password / OTP / payment 欄位的次數；review 重點是防護有沒有生效 |

Review 方式：

- 第一階段用手動 QA 表：測 5 個情境，記錄成功 / 失敗 / 干擾點，不做任何資料上傳。
- 第二階段做本機「診斷摘要」頁：顯示最近 7 天的匿名彙總，使用者可一鍵清除。
- 第三階段若要上傳 telemetry，必須明確 opt-in，隱私政策列出欄位，且只傳事件類型、時間差、狀態碼，不傳原文 / 譯文 / URL 全文。

## Benchmark

| 產品 | 主戰場 | 可借鏡 | 翻翻吧該避開 |
| --- | --- | --- | --- |
| DeepL for Chrome | 選取翻譯、輸入框翻譯、寫作替代表達、Pro 整頁翻譯 | read / write 兩個場景講得非常清楚；寫作修飾有 style / tone 選項 | 不要只比翻譯品質；DeepL 品牌與模型品質護城河太高 |
| Immersive Translate | 雙語網頁、PDF、影片字幕、圖片 / 漫畫、20+ 引擎 | 雙語閱讀 layout、context-aware terminology、hover / shortcut paragraph translation | 不要早期追全媒體功能；容易把 extension 做成沉重平台 |
| Trancy | 語言學習、YouTube / Netflix 雙語字幕、生字收藏、文法分析 | 把翻譯結果轉成學習材料：生字、例句、文法、複習 | 除非轉向語言學習，不然不要把首頁敘事稀釋成泛學習平台 |
| 翻翻吧 | 先專注文字翻譯：選取翻譯、段落 / 全文雙語閱讀、解釋與 Obsidian 留存 | 朝 Immersive Translate 的沉浸式閱讀方向靠近，但近期只做文字層 | 先不追 PDF、影片字幕、圖片 / 漫畫、OCR |

## Phase Plan

### v1.9.5：P0 Review Hardening

目標：先修安全與測試入口。

細項：

- [x] 修 `npm test` 多重 Jest config。
- [x] 排除 `input[type=password]`、OTP、payment 欄位。
- [x] 補 sensitive input、XSS payload、AI HTML escape 測試。
- [x] privacy / store listing 對第三方 AI provider 資料流一致。
- [x] 更新對應 review HTML，將 P0 狀態標為完成。

Done 定義：

- [x] `npm test -- --runInBand` 一條指令可通過。
- [x] 敏感欄位不顯示 toolbar / 不送 request。
- [x] review HTML P0 標為完成。

### v1.9.6：P1 Injection Scope

目標：降低常駐注入面與頁面干擾。

細項：

- [~] 站點停用：已做敏感網域 denylist + 子 frame 不生浮球（`content/site-policy.js`）；使用者自訂 allowlist / per-site 停用仍未做。
- [x] 全文翻譯模組按需初始化（檢視後確認既有實作已是按需，watcher 只在 `startPageTranslationBeta()` 綁定）。
- [~] 收斂 `web_accessible_resources`：評估後暫不收斂，font / icon48 皆為 content script 在 `<all_urls>` 實際使用（詳見 P2 findings 狀態）。
- [x] background message handler 加 schema validation、action 白名單、文字長度限制與 sender 檢查。

Done 定義：

- [ ] Gmail / Notion / Google Docs / 新聞長文 / iframe 頁 QA 通過。
- [~] 無關頁面初始化成本降低（子 frame 不再重複生浮球、敏感網域不啟用；整體 `<all_urls>` 仍常駐）。
- [x] P1 風險有回歸測試（`tests/content/site-policy.test.js`）。

### v1.9.7：Text Immersive UX

目標：朝 Immersive Translate 方向，但只做文字。

細項：

- [ ] 優化雙語段落。
- [ ] hover / shortcut paragraph translation。
- [ ] 續翻、定位原文、複製雙語、長文 context digest。
- [x] 暫不做 PDF / OCR / 圖片 / 影片字幕。

Done 定義：

- [ ] 長文章閱讀流程可連續使用。
- [ ] 全文翻譯失敗可局部重試。
- [ ] 使用者能清楚知道目前只支援文字層。

### v1.9.8：Maintainability + Local Metrics

目標：讓後續迭代更穩。

細項：

- [ ] 拆 `page-translator.js`。
- [ ] 整理 `content.css`。
- [ ] 建立 DOM render helper。
- [ ] 模型選單改為簡潔特點說明。
- [ ] 新增本機診斷摘要 / 手動 QA 表，不上傳內容。

Done 定義：

- [ ] Coverage 先拉到 65% lines。
- [ ] 本機診斷摘要可清除。
- [ ] 隱私政策明確說明沒有 telemetry，或 telemetry 需 opt-in。

## 驗證紀錄

- 2026-06-18 review 原始狀態：`npm.cmd test -- --runInBand` 失敗，原因是 Jest 多重設定。
- 2026-06-18 review 原始狀態：`npm.cmd test -- --runInBand --config jest.config.js` 通過，14 suites / 114 tests passed。
- 2026-06-18 修正後：`npm.cmd test -- --runInBand` 通過，15 suites / 123 tests passed。

## 參考來源

- [Chrome Extensions - Stay secure](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)
- [Chrome Extensions - Declare permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome Extensions - Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [DeepL for Chrome](https://www.deepl.com/en/chrome-extension)
- [Immersive Translate](https://immersivetranslate.com/en/)
- [Trancy](https://www.trancy.org/)
