# 翻翻吧 — Session 上下文摘要

> 最後更新：2026-04-21（UTC+8）
> 目錄：`C:\Users\oskar.cheng\OneDrive\KAKA-agent-w11\gemini-helper`
> 目前版本：**v1.1.9**（manifest.json）
> GitHub：https://github.com/unomae/fan-fan-ba（master 分支）

---

## 1. 專案目標與核心邏輯

**翻翻吧**是一個 Chrome / Edge Manifest V3 瀏覽器擴充功能。使用者在任意網頁選取文字後，自動出現懸浮工具列，可一鍵觸發翻譯 / 解釋 / 優化，結果顯示於浮動結果卡。支援多個 AI Provider（Gemini、Groq、OpenRouter）並可存入 Obsidian。

**核心流程：**
```
使用者選字 → mouseup 事件 → showToolbar()
→ 點擊功能按鈕 → triggerAction() → chrome.runtime.connect('ai-stream')
→ background.js streaming handler → SSE/stream 回傳
→ content/main.js startStreaming → 即時渲染結果卡
→（字典模式）msg.done → parseJSON → buildDictHTML
→（選填）點寶石按鈕 → saveToObsidian() → sendMessage(OBSIDIAN_URI)
→ background.js → chrome.tabs.create(active:true) → OS URI handler → Obsidian
```

**Provider 分流邏輯（background.js）：**
- 模型 ID 以 `groq:` 開頭 → Groq API（`https://api.groq.com/openai/v1`）
- 模型 ID 以 `openrouter:` 開頭 → OpenRouter API（`https://openrouter.ai/api/v1`）
- 其他 → Gemini API（`https://generativelanguage.googleapis.com/v1beta/models`）
- Groq / OpenRouter 共用 `handleOpenAICompatRequest()`（OpenAI chat completions 格式）

---

## 2. 已完成功能清單

| 功能 | 說明 |
|------|------|
| 懸浮工具列 | 選字後自動出現，含翻譯/解釋/優化按鈕，毛玻璃 pill 樣式，可拖曳 |
| 翻譯（字典模式） | 單字（≤20字）→ JSON 字典卡，欄位：word、phonetic、pos、definition、translations、synonym（近義詞＋差異）、examples（通用＋語境各 1 例句）、usage |
| 翻譯（段落模式） | 直接翻成繁體中文，streaming 顯示 |
| 解釋 | 依文字長度給不同格式；支援 `{{延伸詞}}` clickable tag，點擊後自動查詢 |
| 優化 | 原文（灰底）→ 優化後（綠底）→ 改動說明（繁中），語言與原文相同 |
| 朗讀 TTS | 優先 Google Cloud Chirp HD；無 Key 則 fallback 瀏覽器 Web Speech API |
| 存入 Obsidian | sendMessage → background → chrome.tabs.create(active:true) → Advanced URI append 到週記（`YYYY-WXX.md`）；100ms 後自動關閉分頁並拉回 Chrome 焦點 |
| Pin 釘住 | 釘住後選新字不關閉結果卡，頂部藍線顯示狀態 |
| 吸附邊緣 | 拖曳至螢幕左右邊緣 40px 內自動吸附，有 snap 動畫 |
| Exponential Backoff+Jitter | API 429/503 自動重試，最多 3 次，delay = `Math.random() * min(8s, 2^n * 1s)` |
| Obsidian 自動存入提示列 | 寶石按鈕有記錄資料夾時直接存，toast 顯示「✓ 已存入：路徑」4.5 秒 |
| Clickable Tags（解釋模式） | `{{term}}` → 藍色 pill，點擊觸發 explain 查詢 |
| 多 Provider | Gemini、Groq（Llama 4 Scout）、OpenRouter（DeepSeek V3 / Qwen3 30B / Mistral Small 3.1） |
| Popup 快選 | 6 個模型可切換，API 狀態燈依選擇的模型判斷對應 Key |
| Options 設定頁 | 三個 Provider Key 獨立欄位、顯示/隱藏 toggle、測試連線、Obsidian Vault 設定 |
| Glassmorphism UI | 工具列 + 結果卡毛玻璃效果，品牌色 #A3D179 綠 / #F9D423 黃 |
| 載入動畫 | 灰色 shimmer 骨架屏（三行不同寬度） |
| POS badge | 字典模式詞性標籤，n/v/adj/adv/prep 各有不同顏色 |

---

## 3. 待辦事項（To-do）

- [ ] Gmail / Notion 相容性優化（部分網站 content script 注入問題）
- [ ] 解釋功能語言偵測（目前固定以繁中回覆，應偵測選取文字語言）
- [ ] Chrome Web Store 上架（manifest 已符合 MV3 規範）

---

## 4. 特殊約定與開發偏好

- 所有 content script CSS 必須加 `!important`（防止宿主頁樣式干擾）
- CSS 變數定義在 `#gemini-ai-toolbar, #gemini-result-card` 而非 `:root`，避免污染宿主頁
- toolbar 不可設 `overflow: hidden`，否則 tooltip `::after` 會被截斷
- WAAPI 動畫使用 `fill: 'none'`，持久狀態由 CSS class 控制
- 工具列置中由 JS 計算（`centerX - tw/2`），不用 CSS `translateX(-50%)`
- HTTP header 只能放 ASCII，中文字會觸發 ISO-8859-1 錯誤（`X-Title` 用 `'Fan Fan Ba'`）
- 模型前綴慣例：`groq:<modelId>`、`openrouter:<modelId>`，無前綴 = Gemini
- Storage key：`apiKey`（Gemini）、`groqApiKey`（Groq）、`openrouterApiKey`（OpenRouter）、`ttsApiKey`、`model`、`obsidianVault`
- Local storage key：`obsidianFolders`（最近 5 個 Obsidian 資料夾，用 `chrome.storage.local`）
- RPD 功能已於 v1.1.1 移除，不需重新加入
- screenshots/ 資料夾僅為 README 展示用，`mockup.html` 是截圖用的本地 HTML mockup
- Obsidian URI 必須透過 background `chrome.tabs.create({ active: true })` 觸發，不可在 content script 用 `<a>.click()`（click 事件冒泡會關閉結果卡）
- `===DEEP===` 標記已廢棄（v1.1.7+），解釋模式直接全部顯示，不再有折疊層
- `buildOptimizeHTML` 解析格式：`**優化後版本：**` 區塊 + `**改動說明：**` 區塊
- `.g-rc-body` 不設 max-height（v1.1.8+），讓結果卡自然撐高，無捲動列

---

## 5. 檔案架構（v1.1.9）

```
gemini-helper/
├── manifest.json       — MV3 設定，v1.1.9，host_permissions 含 4 個 API 域名
├── background.js       — Service Worker：API 分流 + Streaming + TTS + OBSIDIAN_URI handler
│                          Backoff+Jitter: withRetry + checkedFetch
│                          OBSIDIAN_URI: chrome.tabs.create(active:true) + 100ms refocus
├── content/
│   ├── state.js        — 共用狀態變數（isPinned, userDragged, savedSel, lastRawResult, lastDictData 等）
│   ├── utils.js        — escapeHtml / formatMarkdown（{{tag}} 轉換）/ parseJSON / renderDiff（LCS）
│   ├── obsidian.js     — Obsidian 存入（sendMessage to background）+ 最近資料夾 + buildObsidianBlock
│   ├── toolbar.js      — 懸浮工具列 UI + 定位 + document.body.contains 保護
│   ├── result-card.js  — 結果卡 UI + buildDictHTML / buildExplainHTML / buildOptimizeHTML + renderResult
│   └── main.js         — mouseup / drag / snapToEdge / triggerAction / startStreaming
├── content.css         — Glassmorphism 樣式（14 個 section，全部 !important）
├── popup.html/js       — 6 個模型快選 Popup
├── options.html/js     — 完整設定頁
└── icons/              — icon16 / icon48 / icon64 / icon128.png
```

---

## 6. 結果卡各模式渲染邏輯

### 翻譯 — 字典模式（selectedText.length ≤ 20）
```javascript
// renderResult → parseJSON → buildDictHTML(data)
// 顯示順序（v1.1.9）：
// 1. 單字說明區塊：word + speak + phonetic + pos + definition
// 2. 詞彙涵義與用法：translations + usage
// 3. 近義詞：synonym.word + synonym.diff
// 4. 例句：examples（通用 badge / 語境 badge）
```

### 翻譯 — 段落模式（selectedText.length > 20）
```javascript
// renderResult → formatMarkdown(rawResult) → g-text-body
```

### 解釋模式（全模式）
```javascript
// buildExplainHTML(raw) → formatMarkdown(raw) 直接渲染
// {{延伸詞}} → <span class="g-tag"> → initTagHandlers → triggerAction('explain')
```

### 優化模式
```javascript
// buildOptimizeHTML(raw, original)
// 解析：**優化後版本：** ... **改動說明：** ...
// HTML 結構：
// .g-optimize-block > .g-optimize-label "原文" + .g-optimize-original（灰底，原文）
// .g-optimize-block > .g-optimize-label "優化後" + .g-optimize-result（綠底）
// .g-optimize-reasons > .g-optimize-label "改動說明" + .g-text-body（formatMarkdown）
```

---

## 7. Obsidian 存入流程（v1.1.9）

```
saveToObsidian(folder)
→ buildObsidianBlock({ tag, hm, date, preview })
  ├─ lastDictData 有值（字典模式）→ 結構化 markdown
  │   順序：單字＋音標 → 詞性＋釋義 → 涵義 → 近義詞 → 例句（含通用/語境標籤）
  └─ 一般模式 → lastRawResult（去除 {{}} 和 ===DEEP=== 標記）
→ chrome.runtime.sendMessage({ type: 'OBSIDIAN_URI', url })
→ background: chrome.tabs.create({ active: true })
   ↓ 100ms 後
   chrome.tabs.remove(newTab.id) + chrome.windows.update(winId, { focused: true })
```

---

## 8. Storage / API / 外部服務整合

| 服務／Storage | 用途 | Key 格式 / 備註 |
|--------------|------|----------------|
| `chrome.storage.sync` | 儲存所有設定 | `apiKey`, `groqApiKey`, `openrouterApiKey`, `ttsApiKey`, `model`, `obsidianVault` |
| `chrome.storage.local` | 最近 Obsidian 資料夾 | `obsidianFolders`（陣列，最多 5 個） |
| Google Gemini API | Gemini 模型推論 | `AIza...`，pay as you go |
| Groq API | Llama 4 Scout 推論 | `gsk_...`，免費 |
| OpenRouter API | DeepSeek/Qwen/Mistral 推論 | `sk-or-...`，有免費額度 |
| Google Cloud TTS | Chirp HD 高品質朗讀 | `AIza...`，選填 |
| Obsidian Advanced URI | 存入週記筆記 | Vault 名稱，需安裝 Advanced URI 插件 |

---

## 9. 關鍵 CSS Section 索引（content.css）

| Section | 內容 |
|---------|------|
| 1 | CSS 初始化 + 工具列基礎樣式 |
| 2 | 結果卡基礎樣式（`#gemini-result-card`） |
| 3 | 拖曳（grab cursor、g-dragging、g-snapping） |
| 4 | Markdown 段落 + 清單樣式（g-text-body） |
| 5 | RPD 上限警告卡 |
| 6 | Obsidian 儲存面板（g-obs-panel、g-obs-input 等） |
| 7 | Pin 按鈕 + 釘住狀態（g-pinned 藍色頂線） |
| 8 | Obsidian 自動存入提示列（g-autosave-bar） |
| 9 | Streaming 游標閃爍效果 |
| 10 | 快看 / 深讀折疊層（g-deep-section，保留但不主動使用） |
| 11 | Diff View（g-diff-ins / g-diff-del，保留但不主動使用） |
| 12 | Clickable Tags（g-tag，解釋模式延伸術語） |
| 13 | 例句徽章 + 近義詞（g-ex-badge、g-synonym-row 等） |
| 14 | 優化模式版面（g-optimize-original 灰底 / g-optimize-result 綠底） |

---

## 10. Git Commit 歷程（完整）

| Commit | 日期 | 說明 |
|--------|------|------|
| *(此次)* | 2026-04-21 | feat: v1.1.9 — Obsidian 觸發修正、字典卡順序調整、捲動列移除 |
| *(前一次)* | 2026-04-21 | feat: v1.1.7 — 解釋/優化結果卡大改版（移除折疊層、新增優化綠底版面） |
| *(前一次)* | 2026-04-21 | feat: v1.1.6 — UI/UX 大改版（快看/深讀、Diff View、Clickable Tags） |
| *(前一次)* | 2026-04-21 | feat: v1.1.5 — Backoff+Jitter、Snap-to-edge、Pin 修正 |
| `c71a0a2` | 2026-04-21 | docs: Obsidian 筆記截圖改為白底 Light Mode |
| `ea96fb3` | 2026-04-21 | docs: 截圖升級 1.5× 高畫質 + HTML table 排版 |
| `226e644` | 2026-04-20 | docs: 介面預覽區塊移至技術架構後 |
| `4faf330` | 2026-04-20 | feat: 新增 4 張 UI 截圖，版本升至 v1.1.2 |
| `8362eb3` | 2026-04-20 | ui: popup 副標題改為 generic AI 描述 |
| `9befba3` | 2026-04-20 | docs: 副標題加入 Obsidian 亮點描述 |
| `1caa5b1` | 2026-04-20 | docs: Gemini 取得方式「免費」→「pay as you go」 |
| `279bed0` | 2026-04-20 | docs: 新增版本徽章 v1.1.1 |
| `84aa1e6` | 2026-04-20 | chore: 版本升至 v1.1.1 |
| `ba83aaa` | 2026-04-20 | fix: Codex review — bug fix、安全性、效能改善 |
| `937e55b` | 2026-04-20 | docs: 修正 README 圖示說明符合實際 SVG |
| `0db9ca6` | 2026-04-20 | docs: 新增完整 README |
| `2a176c6` | 2026-04-20 | feat: Initial release v1.1.0 |
