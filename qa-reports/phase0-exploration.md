# 翻翻吧 v1.9.9 Phase 0 探察紀錄

- 日期：2026-07-24（Asia/Taipei）
- 測試基準：`master` `b90900a`
- WS-E 範圍：`f9ecbf7` 合併的 `ws-e-execution` 9 commits
- 打包來源：`dist/pkg/`
- 測試瀏覽器：Microsoft Edge（Chromium）
- 測試頁面：<https://example.com/>

## 實際看到的頁面與功能

### F1 網頁注入與選字工具列

- URL：`https://example.com/`
- 已確認 content script 注入成功。
- 選取 `Example Domain` 後，實際看到翻譯、解釋、優化 3 個操作。
- 浮球可見，展開後實際看到收藏／紀錄、全文翻譯 Beta、設定、在此網站停用。
- 證據：`screenshots/20260724-phase0-selection-toolbar.jpg`

### F2 收藏／紀錄入口

- 從浮球展開選單後點擊「收藏／紀錄」。
- DOM 實際建立結果卡、模型選單、單字本、最近查詢、Obsidian 等控制項。
- 畫面沒有顯示結果卡；`#gemini-result-card` 實測 `display:flex`、`visibility:visible`、`opacity:0`。
- 停用 Read Frog、重新載入測試頁後再次重現；可排除另一個擴充功能造成的視覺遮擋。
- 證據：`screenshots/20260724-p1-library-panel-invisible.jpg`、
  `screenshots/20260724-p1-library-panel-invisible-clean.jpg`

### B1 設定頁：模型與金鑰

- 由浮球的「設定」按鈕開啟翻翻吧 v1.9.9 設定頁。
- 左側實際看到模型與金鑰、語言與朗讀、Obsidian、備份還原、雲端同步、隱私與說明 6 個分類。
- 模型與金鑰頁實際看到預設模型、全文翻譯模型、Groq、Gemini、OpenRouter，以及儲存設定與測試連線。
- API Key 欄位只顯示格式提示，截圖未暴露真實金鑰。
- 1920 × 1080 桌面版畫面未見明顯截斷、重疊或水平捲動。
- 證據：`screenshots/20260724-phase0-options-models.png`

### B2 設定頁：語言與朗讀

- 實際看到翻譯目標語言、解釋語言、朗讀語音、單字高亮與 Google Cloud TTS API Key。
- 本機顯示值依序為繁體中文、跟隨翻譯語言、自動偵測、關閉；TTS Key 欄未暴露真實值。
- 證據：`screenshots/20260724-phase0-options-language.png`

### B3 設定頁：Obsidian

- 實際看到 Vault 名稱、預設存入資料夾與 Advanced URI 寫入方式說明。
- 兩個選填欄位目前只顯示 placeholder，未暴露實際 Vault 或私人路徑。
- 證據：`screenshots/20260724-phase0-options-obsidian.jpg`

### B4 設定頁：備份還原

- 實際看到設定 JSON 匯出／匯入、API Key 加密備份密碼、單字本 JSON／XLSX 匯出與單字本匯入。
- 本輪沒有勾選 API Keys、輸入密碼或執行任何匯出／匯入。
- 證據：`screenshots/20260724-phase0-options-backup.jpg`

### B5 設定頁：雲端同步

- 實際看到 v1.9.9、Google Drive `appDataFolder`、同步範圍與上傳／下載方向。
- 本機狀態為尚未登入、尚未開始同步；Native Client 已設定，Web Auth Client 未設定。
- 本輪沒有登入 Google，也沒有上傳、下載或登出。
- 證據：`screenshots/20260724-phase0-options-cloud.jpg`

### B6 設定頁：隱私與說明

- 實際看到本機儲存、翻譯／解釋／優化用途、本機診斷摘要與隱私邊界。
- 頁面顯示擴充功能版本 v1.9.9，診斷資料沒有選取文字、網址或內容。
- 本機自檢顯示 2 項需要處理：單段翻譯與全文翻譯都缺 Groq API Key；屬測試環境 readiness gate，本輪未填入或顯示任何 Key。
- 本輪沒有按下清除診斷資料。
- 證據：`screenshots/20260724-phase0-options-privacy.jpg`

### E1 Popup

- 從 Edge 工具列實際開啟 Popup，並以 `popup.html` 整頁模式補截圖。
- 實際看到目前狀態、3 個模型選項、API Key／TTS／Obsidian 摘要與完整設定入口。
- 目前狀態清楚顯示「缺少 Groq Key」，沒有誤導成可正常呼叫。
- 證據：`screenshots/20260724-phase0-popup.jpg`

### E2 Welcome

- 實際開啟 `welcome.html`，看到 API Key、選字操作與結果／Obsidian 的 3 步驟說明。
- 前往設定與稍後再說按鈕都存在；本輪未開啟外部申請連結。
- 證據：`screenshots/20260724-phase0-welcome.jpg`

### E3 擴充功能與 Service Worker

- Edge 擴充功能頁顯示 v1.9.9 已啟用；另有一份同版號、不同 ID 的翻翻吧已停用。
- 啟用版本的 Service Worker 顯示非使用中；開啟 DevTools 後主控台為 0 則訊息，沒有發現 Service Worker runtime error。
- Edge 的擴充功能錯誤頁另記錄 1 個 Options runtime error，見 QA-P2-002。

## 初步模組切分

| ID | 模組 | Phase 0 狀態 |
| --- | --- | --- |
| F1 | 網頁注入、選字工具列與結果卡 | 已探察 |
| F2 | 浮球、全文翻譯與站點控制 | 部分探察 |
| F3 | 收藏、單字本、最近查詢與 Obsidian 入口 | 發現 QA-P1-001 |
| B1 | 模型與金鑰 | 已取得實機截圖 |
| B2 | 語言與朗讀 | 已取得實機截圖 |
| B3 | Obsidian | 已取得整頁截圖 |
| B4 | 備份還原 | 已取得整頁截圖 |
| B5 | 雲端同步 | 已取得整頁截圖；登入／同步待人工 gate |
| B6 | 隱私與說明 | 已取得整頁截圖；API Key readiness 未通過 |
| E1 | Popup 與設定狀態摘要 | 已探察 |
| E2 | Welcome 與首次使用導引 | 已探察 |
| E3 | Service Worker、Options 啟動與跨元件訊息 | 發現 QA-P2-002；Service Worker console 0 訊息 |

## 初步缺陷

### QA-P1-001 收藏／紀錄面板建立後保持透明

- 重現率：本輪 2/2；第 2 次已停用 Read Frog 並重新載入頁面。
- 觸發：浮球 → 收藏／紀錄。
- 預期：顯示收藏／紀錄入口卡。
- 實際：卡片 DOM 已建立，但透明不可見。
- 程式證據：`content/floating-ball.js` 的 `showFloatingLibraryPanel()` 只呼叫
  `positionResultCardNearFloatingBall()`，未像 `showFloatingHistoryPanel()` 與
  `showFloatingVocabularyPanel()` 一樣加入 `resultCard.classList.add('g-show')`。
- 影響：使用者無法從浮球進入單字本與最近查詢主流程。

### QA-P2-002 Options 啟動時發生 TDZ 未捕捉錯誤

- 重現率：Edge 擴充功能錯誤頁 1/1。
- 實際錯誤：`Uncaught (in promise) ReferenceError: Cannot access 'LAST_VOCAB_BACKUP_KEY' before initialization`。
- 程式證據：`options.js:37` 先呼叫 `initVocabularyBackup()`，但
  `LAST_VOCAB_BACKUP_KEY` 到 `options.js:45` 才初始化；
  `renderVocabularyBackupStaleness()` 在 `options.js:60` 先讀取該常數。
- 影響：單字本「上次備份多久前」提醒無法完成初始渲染，Edge 也會留下擴充功能錯誤紀錄；其餘設定頁功能本輪仍可載入。
- 畫面證據：`screenshots/20260724-p2-options-tdz-error.jpg`

## 測試環境干擾

- 同一頁另有 Read Frog 擴充功能，選字時會出現第二組工具列，浮球也位於右下角附近。
- 2026-07-24 使用者已停用 Read Frog；後續重測以無擴充功能干擾的環境為準。
- Edge 內另有一份不同 ID 的翻翻吧 v1.9.9，但處於停用狀態；本輪操作與錯誤證據均來自
  `kopoiadnhecbcjemoeggmaoekjkpecgo`。

## Phase 0 邊界與待人工 gate

- 已改用 macOS Computer Use 操作 Edge Beta；設定頁 B1 至 B6、Popup、Welcome 與 Service Worker console 均已探察。
- 未填入或顯示真實 API Key，因此翻譯、解釋、優化、全文翻譯與測試連線尚未做 runtime 驗證。
- 未登入 Google，因此雲端上傳／下載與 OAuth 流程保留為人工 gate。
- Phase 0 探察完成；依 `playwright-qa-extreme`，需先確認模組切分，再進 Phase 0-B 測試規格。
