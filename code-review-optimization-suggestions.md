# 翻翻吧 Code Review 與優化建議

> Review 日期：2026-06-01  
> 專案：`fan-fan-ba`  
> 角度：軟體工程師、使用者、UI/UX 設計師

## 總結

目前專案功能完整度高，核心架構清楚：Chrome Extension Manifest V3、background service worker 負責 AI Provider 與 SSE streaming，content scripts 負責選字工具列、結果卡、全文翻譯與單字本。

主要風險不在單一功能缺失，而在幾個會影響信任、穩定性與後續維護的點：

- API Key 儲存方式與隱私文案不一致。
- 部分 content script 呼叫 extension API 的方式可能在真實瀏覽器情境不穩。
- Streaming / 全文翻譯缺少真正取消請求的機制。
- 結果卡與浮動 UI 在窄視窗、鍵盤操作、可及性上仍有改善空間。
- 測試有通過，但 coverage 偏低，且 Git metadata 目前受 OneDrive / 權限問題影響。

## 高優先級問題

### P1. 隱私聲明與實作不一致

位置：

- `options.js:159`
- `options.html:596`

`options.js` 目前把 API Key 存進 `chrome.storage.sync`，但設定頁文案寫的是「API Key 僅儲存在本機 Chrome Storage」。`sync` 會跟著 Chrome 帳號同步，嚴格來說不等於只存在本機。

影響：

- 使用者信任風險。
- Chrome Web Store 審查時，隱私聲明可能被認為與實作不一致。
- 使用者可能以為 API Key 不會跨裝置同步，但實際上可能會。

建議：

- API Key 改存 `chrome.storage.local`。
- `chrome.storage.sync` 只存偏好設定，例如 model、語言、UI 狀態。
- 若暫時不改實作，至少先修正文案，明確說明 API Key 使用 Chrome Storage sync/local 的實際行為。

推薦做法：

1. 新增 storage helper，例如 `getSecrets()` / `setSecrets()`。
2. 啟動時做 migration：如果舊的 sync 裡有 key，搬到 local，成功後清掉 sync 裡的 key。
3. 調整 options、popup、background 讀取 API Key 的位置。
4. 補 migration 測試。

### P1. 內容頁懸浮球開設定頁可能失效

位置：

- `content/floating-ball.js:91`
- `background.js:73`

`floating-ball.js` 直接呼叫：

```js
chrome.runtime.openOptionsPage?.();
```

content script 可用的 extension API 較有限，這個呼叫在某些 Chrome / Edge 情境可能 undefined 或不穩。專案已經在 background 裡有 `OPEN_OPTIONS` message handler，可以復用。

建議：

```js
chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
```

讓 background 統一負責開設定頁。

影響：

- 使用者從懸浮球點「設定」可能沒反應。
- popup 能開設定，但內容頁入口不穩，會造成體驗不一致。

### P2. Streaming timeout 沒有取消底層 fetch

位置：

- `background.js:107`
- `background.js:296`
- `background.js:321`

目前 streaming 用 `Promise.race` 做 30 秒 timeout，但 timeout 後底層 `fetch` 沒有被 abort。這代表請求可能仍在背景繼續跑。

影響：

- 浪費 token / API 額度。
- 使用者按重試後，舊請求仍可能繼續回傳。
- 若沒有 request id 防護，可能出現舊回應污染新結果卡。

建議：

- 使用 `AbortController`。
- 每次請求產生 `requestId`。
- content script 只接受目前 active request id 的 chunk / done / error。
- retry 或新查詢時 abort 舊請求。

### P2. 結果卡固定 500px，窄視窗容易溢出

位置：

- `content.css:398`
- `content/result-card.js:379`

CSS 固定：

```css
width: 500px;
```

JS 也假設卡片寬度為 500px。當使用者使用分割視窗、窄瀏覽器、側欄模式或小螢幕時，結果卡可能超出畫面。

建議：

CSS：

```css
width: min(500px, calc(100vw - 16px)) !important;
```

JS：

- 使用 `resultCard.offsetWidth` 或 `getBoundingClientRect().width`。
- 不再硬寫 `cardW = 500`。

### P2. 鍵盤可及性不足

位置：

- `content.css:461`
- 多個 `.g-icon-btn`、`.g-speak-btn`、`.g-vocab-save-btn`

許多按鈕設了 `outline: none`，但沒有完整補上 `:focus-visible`。滑鼠使用者體驗不錯，但鍵盤使用者 tab 到按鈕時很難知道焦點在哪。

建議：

- 所有可互動 icon button 補 `:focus-visible`。
- 結果卡 header action、發音、收藏、Obsidian、history、retry 都要能看見焦點。
- 按鈕 icon 有 title，但建議補 `aria-label`，讓 screen reader 更穩。

### P2. 全文翻譯停止鍵不能中止當前 API 請求

位置：

- `content/page-translator.js:178`
- `content/page-translator.js:539`

全文翻譯目前逐段 `await translatePageItem(item)`，停止鍵只改 state。若當前段落正在請求 API，使用者按停止後仍要等它完成或逾時。

影響：

- 使用者覺得停止沒有立即生效。
- 長段落或 API 卡住時體驗差。

建議：

- 全文翻譯也接入 abort controller。
- 停止時立即取消當前 request。
- UI 顯示「正在停止」後應很快進入「已停止」。

## 軟體工程師視角

### 現況優點

- Manifest V3 架構清楚，API key 不暴露在網頁主環境。
- Provider registry 集中在 `models.js`，比散落常數好維護。
- content scripts 已拆成多個檔案，職責大致清楚。
- 有針對 utilities、background、popup、options、page translator、floating ball 的測試。
- SSE streaming、OpenRouter fallback、retry/backoff 都已有基本設計。

### 主要工程風險

- 多檔 content script 透過全域 mutable state 串接，未來功能增加時容易互相影響。
- request lifecycle 缺少 request id / abort / stale response 防護。
- storage key 分散在多處，且 sync/local 的責任邊界不夠清楚。
- `content.css` 很大，且大量 `!important` 雖然符合 extension 防污染需求，但維護成本高。
- `.gitignore` 目前忽略 `package.json`、`package-lock.json`、jest config 等開發關鍵檔案，若這些尚未被追蹤，會影響團隊重建環境。

### 建議工程優化順序

1. 修 storage 隱私一致性。
2. 修 content script 開 options 的 API 邊界。
3. 建立 request lifecycle：`requestId`、abort、stale response guard。
4. 結果卡定位改成 responsive。
5. 補測試，尤其是 storage migration、stream abort、窄視窗定位。
6. 長期再考慮把 content script 的全域狀態整理成小型 service 模組。

## 使用者視角

### 現況優點

- 選字後直接出工具列，符合「讀文章時不打斷」的核心情境。
- 翻譯、解釋、優化三個入口明確。
- 結果卡提供 pin、copy、history、Obsidian，功能很完整。
- 全文翻譯 Beta 放在懸浮球內，和選字工具列分工合理。

### 主要體驗問題

- 若使用者點懸浮球設定沒有反應，會很困惑。
- 全文翻譯按停止後若仍在跑，使用者會覺得失控。
- 窄視窗時結果卡可能超出畫面，尤其使用者邊看文章邊分割螢幕時。
- API Key 儲存描述若不精準，會降低信任。
- 錯誤訊息目前能重試，但可再補「是哪個 provider / 哪個 key / 哪個模型」的判斷資訊。

### 建議使用者體驗優化

- 設定頁入口要保證所有地方都可用。
- 全文翻譯面板顯示目前模型、進度、停止狀態。
- 錯誤訊息分級：缺 API Key、額度不足、網路錯誤、模型忙碌、擴充功能更新。
- 結果卡在小視窗自動縮寬，並避免遮住選取文字。
- 第一次使用 Obsidian 時，增加更明確的 Advanced URI 前置提醒。

## UI/UX 設計師視角

### 現況優點

- 視覺語言有一致性，品牌綠 / 黃明確。
- 結果卡、工具列、懸浮球都有清楚的層級。
- icon-only 操作大多有 title tooltip。
- 結果卡內容結構清楚，字典模式、優化模式、解釋模式都有差異化呈現。

### 主要 UX 風險

- focus state 不完整，鍵盤操作體驗弱。
- 結果卡固定寬度，responsive 邊界不足。
- 動畫與 shimmer 沒看到 `prefers-reduced-motion` 對應處理。
- 設定頁視覺略偏「漂亮面板」，但它是工具型頁面，後續可再提高密度與掃描效率。
- 全文翻譯面板按鈕使用「雙 / 譯 / 原」很省空間，但對新使用者理解成本偏高，tooltip 要穩定，或在初次使用時補微提示。

### 建議 UI/UX 優化

- 補所有互動元件的 `:focus-visible`。
- 補 `prefers-reduced-motion`，關閉 logo glow、shimmer、進場動畫。
- 結果卡 responsive 化，並限制最大高度，在長內容時可內部捲動或提供展開策略。
- 全文翻譯 panel 可增加更明確的狀態文字，例如「翻譯中 3/8」、「已停止」、「有新段落」。
- icon-only button 補 `aria-label`。

## 測試與驗證狀態

已執行：

```bash
npm.cmd test -- --runInBand
```

結果：

- 9 個 test suites passed
- 40 個 tests passed
- Coverage 約 29% statements

觀察：

- 測試全部通過，代表現有核心行為沒有立即 regression。
- Coverage 偏低，尤其 background streaming、page translator、options 儲存流程還有不少未覆蓋區域。
- 一開始用 PowerShell 跑 `npm test` 會被 execution policy 擋住，Windows 上建議用 `npm.cmd test`。

## Git / 環境問題

目前 `git status` 失敗：

```text
error: unable to open loose object 4d765d90bc00292b4b716670638a47c33a9398ea: Permission denied
fatal: bad object HEAD
```

判斷：

- 這不是應用程式碼問題。
- 是 Git metadata 裡的 loose object 讀不到。
- 高機率和 OneDrive Files On-Demand、同步鎖檔、檔案 placeholder 或 Windows 權限有關。

影響：

- 目前不能可靠 commit / push。
- `git status` 都無法解析 HEAD，commit 需要讀 HEAD 當 parent，所以會受影響。

建議：

1. 在檔案總管對 repo 資料夾選「一律保留在此裝置上」。
2. 暫停 OneDrive 同步後再試 `git status`。
3. 若仍失敗，重新 clone 到非 OneDrive 路徑，例如 `C:\dev\fan-fan-ba`。
4. 長期建議不要把 `.git` 放在 OneDrive 同步目錄。

## 建議 Roadmap

### Phase 1：先修信任與穩定性

- API Key 從 `storage.sync` 遷移到 `storage.local`。
- 修正設定頁隱私文案。
- content script 透過 background message 開 options。
- 修 Git / OneDrive 權限問題，恢復正常 commit / push。

### Phase 2：改善 request lifecycle

- Streaming 加 `AbortController`。
- content request 加 `requestId`。
- retry / 新查詢時忽略舊 response。
- 全文翻譯停止鍵能取消當前請求。

### Phase 3：UI/UX 邊界補強

- 結果卡 responsive。
- 補 focus-visible。
- 補 reduced motion。
- 全文翻譯 panel 狀態更明確。

### Phase 4：測試補強

- storage migration tests。
- open options message tests。
- stream timeout / abort tests。
- page translation stop tests。
- result card narrow viewport positioning tests。

## 推薦下一步

最推薦先做：

1. 修 API Key storage 與文案一致性。
2. 修懸浮球設定入口。
3. 修 Git metadata / OneDrive 問題。

理由：這三項分別對應使用者信任、功能入口穩定、開發流程可持續性，都是後續優化的地基。
