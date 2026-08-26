# e2e：真實 Chrome ＋ 真實擴充的常駐回歸

`npm test`（Jest）驗的是 mock 之上的純函式與訊息契約。這裡驗的是**真的 chrome.storage、真的按鈕、
真的 service worker**——資料遺失路徑、面板可見性、版面溢出、匯入硬化這些只有真瀏覽器才驗得了的東西。

出處：2026-08-13 把 `MANUAL-QA.md` 裡「人要做、但其實機器做得更準」的項目自動化後收進來。
**這不是要取代人工 QA**——見下方〈這裡驗不到什麼〉。

## 一次性前置（每台機器做一次）

1. **開一個拋棄式 Chrome profile 資料夾**，例如 `C:\tmp\ffb-qa\p2`（Mac 用 `~/tmp/ffb-qa/p2`）。
   **絕對不要用你日常在用的 profile**：測試會反覆改寫該 profile 的單字本、快照與設定。
2. 用那個 profile 開 Chrome：
   ```
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir="C:\tmp\ffb-qa\p2"
   ```
3. `npm run package` 產出 `dist/pkg/`，到 `chrome://extensions` 開開發人員模式 →
   **「載入未封裝項目」指向 `dist/pkg`**。
   > 品牌版 Chrome 137 起封鎖 `--load-extension`，這步只能人工點。
   > **自動化替代路**：設 `FFB_E2E_EXECUTABLE` 指向 Chrome for Testing（或任何未封鎖該參數的
   > Chromium），harness 會以 `--load-extension` 自動安裝擴充，免掉步驟 2-4 的整個人工前置。
4. 記下擴充 ID（預設值 `cegcbfkgfobpoiaobdedldlabbddbghk`；不同就用 `FFB_E2E_EXT_ID` 覆寫）。

## 跑

```bash
npm run package                      # ⚠️ 必做：profile 載入的是 dist/pkg，不是工作區
FFB_E2E_PROFILE="C:/tmp/ffb-qa/p2" npm run e2e
```

只跑某幾個 suite：

```bash
FFB_E2E_PROFILE="C:/tmp/ffb-qa/p2" node e2e/run.js vocab-import hostile-data
node e2e/run.js --list
```

> **最常見的假結果來源**：改完 code 沒有重新 `npm run package`，於是驗到的還是舊版擴充。
> 版本號相同不代表內容相同（2026-08-10 踩過一次）。

### 環境變數

| 變數 | 預設 | 說明 |
| :-- | :-- | :-- |
| `FFB_E2E_PROFILE` | **必填** | 拋棄式 profile 路徑（已裝好 `dist/pkg`）|
| `FFB_E2E_EXT_ID` | `cegcbfkg…bkcf` | 擴充 ID |
| `FFB_E2E_CHANNEL` | `chrome` | playwright-core 的 browser channel（用系統 Chrome，不下載瀏覽器）|
| `FFB_E2E_PORT` | `4801` | fixture 站起點，會用到 `PORT` 與 `PORT+1` 兩個（造跨來源 iframe）|
| `FFB_E2E_ALLOW_NET` | 未設 | 設 `1` 才會跑「敏感頁 `accounts.google.com` 不啟用」那案（唯一會連外的案）|
| `FFB_E2E_ARTIFACTS` | `e2e/.artifacts` | 截圖與下載暫存（已 gitignore）|

## Suites

| Suite | 案數 | 內容 |
| :-- | --: | :-- |
| `vocab-import` | 7 | 跨裝置合併勝負、零收穫匯入不得吃掉救援快照、誤刪光後還原救回 |
| `ui-panels` | 14 | 收藏面板可見性、歷史回看＋SRS、options 無初始化錯誤、375 版面與拖曳、高亮開關與記憶、Obsidian 未設定不謊報、全文翻譯的嵌入提示 |
| `hostile-data` | 5 | 5,000 筆＋emoji／RTL／公式／HTML／超長字串：不卡死、不執行內容、並發不爆增、高亮不污染互動元件、CSV 公式前綴防護 |
| `legacy-regression` | 19 | §1–§7 legacy 回歸的可自動化部分（frame-split、品牌字型、單段翻譯 UI、診斷自檢、SRS、匯入硬化、綜合回歸）|

## 這裡驗不到什麼（**別把全綠當成可以送審**）

- **任何需要 API key 的路徑**：翻譯／解釋／優化／串流／Alt+T 單段／本頁學習摘要。
  沒有 key 時全文翻譯必然失敗，我們反而利用這點驗「失敗態 UI」。
  > **⛔ 2026-08-14 KAKA 裁決：測試 profile 不配 API key**（計費＋外連）。
  > 這類項目**永久不在本 e2e 範圍內**，要驗只能人工拿真 key 跑。不要再提「配一顆 key 就能自動化」。
- **需要外部 App／帳號**：Obsidian 週記落檔（`obsidian://`）、Excel 開 XLSX、Cloud Sync 登入。
- **人眼觀感**：版面美醜、譯文品質、字型是否「好看」。這裡只驗客觀值（載入狀態、溢出像素、DOM 結構）。
- **真正的移除擴充再重裝**：`legacy-regression` 只用「清空 `storage.local`」模擬。

逐項對照與尚未涵蓋的清單見 `MANUAL-QA.md`。

## 本機環境會製造的假訊號

- **Kaspersky 對每個網頁注入** `gc.kis.v2.scr.kaspersky-labs.com` 的請求。`§5-4 無非預期外連`
  已把它分類成「防毒注入」而非外連；人工用 DevTools 做同一檢查時也會看到，別誤判成擴充在偷傳資料。
- **MV3 service worker 閒置就會停**，所以啟動檢查用「options 頁讀得到 manifest」而不是「SW 是否存在」。

## 寫新 suite

`e2e/suites/<name>.js` 匯出 `{ name, description, run(session, rec) }`，再把名字加進 `e2e/run.js` 的 `SUITES`。
`session` 提供 `ctx`／`opt`（options 頁）／`newPage(route, viewport)`／`shot(page, name)`／
`relaunch()`（重啟瀏覽器，重置 SW 記憶體狀態）／`openOptions()`／`closeOptions()`；
共用操作在 `e2e/lib/harness.js`。

**寫斷言時記著這些已知陷阱**（都是實際踩過的假紅／假綠）：

1. 連續兩案的狀態列訊息可能**字字相同**，別拿「文字有沒有變」當完成訊號 → 先清空再等非空。
2. `#vocabularyBackupStatus` 沒字時零尺寸，Playwright 判 hidden，不能當分頁就緒探針。
3. 單字本面板**預設分頁是「今日複習」**（複習佇列順序），驗 `lastSeenAt` 排序要切「全部」。
4. 今日複習分頁的狀態鈕是 `[data-vocab-review][data-review-status]`，其他分頁才是 `[data-vocab-status]`。
5. 高亮案要**先歸零** `vocabularyHighlightMode`，否則第一次點是「關閉」。
6. 品牌字型只套 `#gemini-result-card *`（浮球刻意用系統字型），且字型用到才載入；
   比對 FontFace 狀態要**精確等於 `loaded`**——`/loaded/` 會 match `unloaded`。
7. `waitForEvent('page')` 回來時分頁還是空白，要 `waitForURL` 之後再讀 `url()`。
8. 浮球容器固定在右緣，與整寬段落**必然幾何重疊**，判「有沒有遮住原文」要先排除它。
9. 存 API Key 的 dummy 值要符合 provider 前綴（Groq 是 `gsk_`），否則被格式驗證擋下；
   而**清空欄位存檔會被必填驗證擋下**，要回到無 key 只能繞過 UI 刪 storage。
10. 快照輪替 24 小時一次且 `snapshotCheckedAt` 存在 SW 記憶體 → 要驗輪替得先 `relaunch()`。
