# Code Review - fan-fan-ba

審查前提：目前工作樹沒有未提交 diff，`master...origin/master` 未顯示本機差異；以下以現有專案狀態做整體 code review。已執行 `npm.cmd test -- --runInBand`，結果 14 個 test suites / 97 個 tests 全數通過，但 coverage 顯示關鍵模組仍偏低。

## Findings

### 1. P1 / 軟體工程師 / 使用者

- 位置：`options.js:158-191`
- 問題：儲存設定流程沒有 loading / disabled / try-catch。`btnSave` 點擊後直接 `Promise.all([chrome.storage.sync.set(...), Storage.setSecrets(...)])`，成功才顯示「設定已儲存」，但任何一邊失敗時沒有可見錯誤訊息，也沒有防止使用者連點。
- 影響：使用者可能以為設定沒有反應；更嚴重的是 sync 設定和 API Key 儲存可能只成功其中一邊，造成「模型已切換但 key 沒存到」或「key 存了但模型沒更新」的半套狀態。這會直接影響主要工作流程：選模型、存 key、開始翻譯。
- 建議：將儲存流程包成 `try/catch/finally`，儲存中禁用 `btnSave` 並顯示「儲存中...」。失敗時用 `showStatus('err', '儲存失敗：...')` 告知可行動訊息；若要避免部分成功，可先寫入 secrets，再寫 sync settings，或在失敗時重新 `loadSettings()` 讓畫面回到實際狀態。

### 2. P1 / 使用者 / 軟體工程師

- 位置：`manifest.json:4`、`package.json:3`、`README.md:4`
- 問題：版本號不一致。manifest 是 `1.7.5`，package 和 README badge 仍是 `1.7.2`。
- 影響：發布 Chrome / Edge extension 時，商店、文件、測試報告、使用者回報會對不上版本。當使用者回報 bug 或工程師追 release regression 時，很容易定位錯誤版本。
- 建議：統一版本來源。至少同步更新 `package.json`、`manifest.json`、README badge；更好是加一個 release script 或測試檢查，CI 在三者版本不一致時 fail。

### 3. P2 / 使用者 / UI/UX

- 位置：`options.html:664-685`、`options.js:116-133`
- 問題：設定頁分類看起來是 tabs，但只有 `aria-selected`，沒有 `role="tablist"` / `role="tab"` / `aria-controls`，也沒有左右方向鍵或 Home / End 的鍵盤操作。
- 影響：滑鼠使用者可用，但鍵盤與螢幕閱讀器使用者難以理解目前在哪個分類，也不能用標準 tab pattern 快速切換。這會影響設定 API Key、匯入匯出、雲端同步等核心設定流程的 accessibility。
- 建議：把 `nav.settings-nav` 設為 `role="tablist"`，每個 `.settings-tab` 設 `role="tab"`、`aria-controls`、受控 panel 設 `role="tabpanel"` 與 `aria-labelledby`。在 `initSettingsTabs()` 加上 roving tabindex 和 ArrowLeft / ArrowRight / Home / End 鍵盤切換。

### 4. P2 / 軟體工程師 / 使用者

- 位置：`manifest.json:29-52`、`manifest.json:75-82`
- 問題：content script 對 `<all_urls>` 且 `all_frames: true` 注入，web accessible resources 也允許 `<all_urls>`。以翻譯工具來說這很方便，但目前看不到對敏感頁面、內嵌 iframe、或非必要站點的更細緻限制。
- 影響：產品品質風險包含效能負擔、與第三方頁面 CSS / DOM 衝突、在複雜 iframe 頁面重複注入 UI，以及隱私審查時被要求解釋過寬權限。使用者遇到網站版面被浮球或樣式干擾時，會把問題歸因於 extension。
- 建議：評估是否真的需要 `all_frames: true`；若只需要主頁選字翻譯，先限制主 frame。若保留全域注入，建議加上 per-site enable / disable 的早期 guard、敏感 scheme / domain denylist、以及一個針對 iframe 重複注入的測試。

### 5. P2 / UI/UX / 使用者

- 位置：`popup.js:28-45`、`popup.html:433`
- 問題：popup 的模型清單用 `div.model-item` 加 click handler 實作選取，沒有 button / radio semantics，也沒有鍵盤選取、`aria-pressed` 或 `aria-current`。
- 影響：使用者只能用滑鼠切換模型；鍵盤使用者 tab 到清單時不會得到可操作控制。對 screen reader 來說也不容易知道目前選取哪個模型。
- 建議：將每個模型項目改成 `<button type="button">` 或 radio group。若保留自訂 div，至少加 `role="radio"` / `aria-checked`、`tabindex`、Enter / Space 鍵處理和清楚的 focus style。

### 6. P3 / UI/UX / 使用者

- 位置：`options.html:536-562`、`options.js:195-252`
- 問題：測試連線按鈕有 disabled 行為，但 CSS 沒有專門的 disabled 視覺狀態；儲存按鈕則完全沒有 disabled / loading 狀態。
- 影響：在網路慢、API timeout、或重複點擊時，使用者不容易判斷目前是否正在處理。這類「按了但不知道有沒有動」會降低設定頁信任感。
- 建議：補上 `.btn-save:disabled`、`.btn-test:disabled` 的樣式，例如降低 opacity、`cursor: not-allowed`，並讓按鈕文字短暫變成「儲存中...」「測試中...」。

## 測試缺口

- 現有測試全數通過：14 suites、97 tests。
- Coverage 偏低：整體 statements 約 46.79%，`background.js` statements 約 29.92%，`content/page-translator.js` 約 24.79%。這兩個剛好是 API 呼叫、串流、全文翻譯、DOM 注入等高風險區。
- 建議補測：
  - 設定儲存失敗、部分成功、連點儲存的情境。
  - popup 模型切換的鍵盤操作與可及性屬性。
  - content script 在 iframe / 複雜頁面 / 禁用站點的注入行為。
  - 全文翻譯的錯誤、重試、取消、長頁面與大量節點情境。

## 可維護性建議

- 建立版本一致性檢查，避免 `manifest.json`、`package.json`、README 分岔。
- 將 options 的「讀取 / 驗證 / 儲存 / UI 狀態」拆成更明確的小流程，尤其是 API Key 和一般設定的交易邊界。
- 對 extension 權限與注入策略寫成文件：為什麼需要 `<all_urls>`、`all_frames`、各 host permission 的使用點在哪裡。

## UI/UX 改善建議

- 設定頁 tabs 改成標準可及性 tab pattern。
- popup 模型選擇改成原生 button / radio group，讓滑鼠、鍵盤、screen reader 都有一致體驗。
- 對所有長時間操作補齊 loading、disabled、success、error 四種狀態，尤其是儲存設定、測試連線、雲端上傳/下載。

## 上線前檢查清單

- [ ] 同步 `manifest.json`、`package.json`、README 版本號。
- [ ] 手動驗證首次安裝：未設定 API Key、設定 key、測試連線、選字翻譯。
- [ ] 手動驗證錯誤流程：錯誤 API Key、網路中斷、quota / 401 / 429。
- [ ] 手動驗證小螢幕：popup、options、結果卡、全文翻譯 panel。
- [ ] 手動驗證 accessibility：鍵盤操作、focus visible、screen reader tab / model selector 語意。
- [ ] 驗證高風險網站：Google Docs / Notion / LMS / iframe-heavy 頁面。
- [ ] 跑 `npm.cmd test -- --runInBand` 並確認 coverage 沒有下降。
