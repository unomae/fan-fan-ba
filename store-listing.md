# Chrome Web Store 上架文案

## 基本資訊

- **名稱：** 翻翻吧 Fan Fan Ba
- **類別：** Productivity（生產力）
- **語言：** 繁體中文（主）/ English（副）

---

## 簡短說明（132 字元以內）

選取網頁文字，AI 立刻翻譯、解釋、優化——字典卡、串流回應、存入 Obsidian，不打斷閱讀流。

---

## 完整說明

選取任意網頁文字，翻翻吧的懸浮工具列立刻出現，一鍵觸發 AI 翻譯、解釋、優化，結果即時串流顯示，完全不打斷閱讀節奏。右側常駐浮球也提供全文翻譯 Beta、最近查詢、單字本與設定入口，適合長文章閱讀與日常查字。

**三大核心功能**

🔤 翻譯
• 單字模式：字典卡，含音標、詞性、釋義、近義詞、通用例句與語境例句
• 段落模式：直接翻成繁體中文，串流即時顯示

💡 解釋
• 依據網頁上下文解析詞彙或段落含義
• 延伸術語可直接點擊，繼續查詢

✏️ 優化
• 原文（灰底）→ 優化後（綠底）→ 改動說明
• 維持原文語言（中文輸入中文輸出、英文輸入英文輸出）

**其他實用功能**

• 📌 釘住結果卡 — 選取新文字時保留目前結果
• 🔊 朗讀 — 支援 Google Cloud Chirp HD 高品質語音
• 📝 一鍵存入 Obsidian — 自動 append 到使用者指定資料夾的週記（YYYY-W##.md）
• 📚 輕量單字本 — 收藏字典卡、搜尋、今日新增、熟悉度標記與 Markdown / CSV 複製
• 🌐 全文翻譯 Beta — 從右側浮球翻譯目前可見內容，支援原文 / 譯文 / 雙語模式
• 💾 設定備份 / 還原 — 匯出 JSON 設定檔，重新安裝後可匯入
• ☁️ Google Drive 同步 — 可同步一般設定到 Drive appData，不包含 API Key
• 🕐 查詢紀錄 — 最近 5 筆，點擊立即還原
• ↔️ 邊緣吸附 — 拖曳到螢幕邊緣自動吸附
• 🔄 自動重試 — API 錯誤一鍵重送

**支援多家 AI 模型**

⭐ Groq（推薦）— 免費、極速，預設模型
• Google Gemini — Gemini 3.5 Flash（免費基本額度）
• OpenRouter — DeepSeek V4 Flash（免費模型）

**隱私安全**

API Key 僅存於本機 `chrome.storage.local`，不跟 Chrome 帳號同步，不經任何第三方伺服器。Google Drive 同步只同步一般設定，不包含 API Key；只有使用者明確勾選本機 JSON 匯出時，匯出的檔案才會包含 API Key。

送往 AI 服務的資料只有使用者選取的文字（或整頁翻譯擷取的段落）：**不傳送所在網頁的完整網址、不傳送瀏覽歷史、不把 API Key 交給開發者**；AI 回傳的譯文只在本機顯示，不會再回傳給翻翻吧或任何第三方。密碼、OTP、信用卡、Email、電話等敏感輸入欄位會被自動排除，不會被當成可翻譯文字送出。

---

## 隱私政策網址

https://unomae.github.io/fan-fan-ba/privacy-policy.html

---

## 截圖建議（1280×800，至少 1 張）

1. 懸浮工具列 + 字典卡（翻譯單字）
2. 解釋模式（含 Clickable Tags）
3. 優化模式（原文 vs 優化後對比）
4. Popup 模型選擇面板
5. Obsidian 存入面板
6. 右側浮球 + 全文翻譯 Beta
7. 單字本面板

---

## 上架 Checklist

- [ ] Chrome Developer 帳號已註冊（$5 USD 一次性）
- [ ] ZIP 依 manifest 版本重新打包：fan-fan-ba-v1.9.6.zip
- [ ] 隱私政策 URL：https://unomae.github.io/fan-fan-ba/privacy-policy.html（已揭露 storage / identity / &lt;all_urls&gt; / API host）
- [ ] Privacy / README / Store listing 的 API Key local storage 文案一致
- [ ] 若啟用 Cloud Sync，manifest 已換成正式 Google OAuth Client ID，且 Edge redirect URL 已加入 Google Cloud OAuth 設定
- [ ] v1.9.6 實站 QA：frame-split（iframe 頁浮球只在主頁、iframe 內選取仍可翻譯）、Cloud Sync Chrome / Edge、Gmail、Notion、Google Docs、新聞長文、一般文件頁
- [ ] 截圖 1280×800（至少 1 張，待手動截圖）
- [ ] 上傳 ZIP 到 Developer Dashboard
- [ ] 填入商店文案
- [ ] 送審
