# Chrome Web Store 送審指南（Phase A）

> 文案內容在 `store-listing.md`（gitignored）。本檔是**流程 + 過審自檢**。

## 1. 打包

```bash
npm run package
```

產出 `dist/fan-fan-ba-v<version>.zip`（白名單制，只含執行期檔案；自動排除 tests / coverage / node_modules / 文件 / 預覽頁 / icons 原始美術檔）。
Windows 用 .NET ZipArchive 產生 forward-slash 路徑（Compress-Archive 的反斜線會讓 Chrome 載巢狀檔失敗，已避開）。

## 2. 本機驗證（上傳前必做）

1. `chrome://extensions` → 開「開發人員模式」→「載入未封裝」選 **`dist/pkg/`**（不是專案根目錄）。
2. 確認版本號正確、無錯誤紅字、背景 Service Worker 無載入錯誤。
3. 跑一輪 [README / 測試 plan] 的核心功能（選取翻譯、字典、串流、單段翻譯、整頁翻譯、設定儲存）。
4. 都正常 → 才上傳同版號的 zip。

## 3. 過審自檢（Chrome 常見退件點，先逐項對）

- [ ] **單一用途敘述**：商店「單一用途」欄要寫清楚 = AI 輔助的網頁文字翻譯 / 解釋 / 優化。
- [ ] **權限正當性**：每個權限都要能在送審表單說明用途，且與 `privacy-policy.html` 權限表一致：
  - `storage`（存設定 / API Key / 歷史，本機）
  - `identity`（**選用** Google Drive 同步登入）← v1.9.6 已補進隱私表，別漏填
  - `<all_urls>` content script（任意網頁注入工具列、偵測選取）
  - host permissions（直連 Gemini / Groq / OpenRouter / TTS / Google Drive API；Google API host 已收斂到 Drive / upload path）
- [ ] **資料用途揭露**：填「處理的使用者資料」= 網站內容（選取文字），用途=提供功能；勾選「不販售/不轉移」「僅供宣告用途」。
- [ ] **遠端程式碼**：宣告「不使用遠端程式碼」（所有 JS 都打包在內，無 eval / 動態載入外部 script）。
- [ ] **隱私政策 URL**：`https://unomae.github.io/fan-fan-ba/privacy-policy.html` 可正常開啟、內容與實際行為一致（無 telemetry、API Key 僅本機）。
- [ ] **OAuth client_id**：確認 `manifest.json` 的 `oauth2.client_id` 是**正式**憑證（非測試 placeholder），且 Google Cloud OAuth 同意畫面已設定、Edge redirect 已加白名單（若要支援 Edge）。
- [ ] **截圖**：至少 1 張 1280×800（建議 5–7 張，見 `store-listing.md` 清單）。

## 4. 送審

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)（首次需 $5 USD 註冊）。
2. 新項目 → 上傳 `dist/fan-fan-ba-v<version>.zip`。
3. 填入 `store-listing.md` 的名稱 / 簡短說明 / 完整說明 / 類別（Productivity）/ 語言。
4. 上傳截圖、填隱私揭露與權限說明（對照第 3 節）。
5. 送出審查。首次審查通常 1–3 個工作天。

## 5. 上架後

- 退件 → 看理由對照第 3 節修正後重送（多半是權限說明或單一用途敘述不清）。
- 通過 → 進 Phase B（單字本深化），依真實回饋修 bug。
