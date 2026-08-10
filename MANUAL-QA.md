# 手動 QA 檢查表（需在真實 Chrome / Edge 執行）

> 這份是「**人要做**」的手動驗收，與 `npm test`（304 個自動化單元測試）互補。
> 自動測試涵蓋純函式邏輯；以下這些只有在真實瀏覽器載入擴充功能才驗得了。
> 涵蓋版本：v1.9.6（注入面收斂）→ v1.9.9（security hardening）→ **v1.10.0（WS-E 資料層 migration）** + Phase A–D review 修正。
> 最後更新：2026-08-10（補 Tier 排序與 §1 cutover 區塊）。

---

## ⚠️ 執行順序（2026-08-10 排定，先讀這段再開工）

全表 **78 項未勾**（2026-08-10 重數：原 71 項 ＋ 新增 cutover 6 項與 Tier 0 前置 2 項，
− §6 那條被 TC-CUT-001 取代的舊遷移項）。**順序不是建議、是約束**——Tier 1 一旦錯過就補不回來：

| Tier | 章節 | 項數 | 估時 | 為什麼排這裡 |
| :-- | :-- | --: | :-- | :-- |
| **0** | §0 前置 | 2 | 15 分 | 舊 zip 是 v1.9.9，不重打包後面全部白測 |
| **1** | ⭐〈cutover 一次性資料層遷移〉 | 6 | 40 分 | **單向不可逆、每個 profile 只發生一次**，必須最先且用專用 profile |
| **2** | 〈2026-07-30 單字本資料層〉 | 17 | 60 分 | 資料遺失類 |
| **3** | 〈2026-07-28 三缺陷回歸〉4 ＋〈半接線 6 條〉15 | 19 | 90 分 | 功能面送審阻塞；Obsidian 那節要外部 App 配合 |
| **4** | §1–§7 legacy 回歸 | 31 | 90 分 | 廣度回歸，風險最低 |
| **5** | §8 送審前 gating | 3 | 另計 | 非 code，最後做 |

> 章節編號沿用舊有 §1–§8 未動（qa-reports 與藍圖有引用）；cutover 區塊改用不編號的 ⭐ 標題插在 §0 之後。

> **Tier 1 的專用 profile 規則**：cutover 只在「偵測到舊 IDB 存在」時跑一次，跑完就 `deleteDatabase`。
> 若先做 Tier 2 的匯入／還原測試，同一 profile 的 IDB 早被清掉，Tier 1 就再也測不到。
> → 開一個乾淨的 Chrome 使用者設定檔專跑 Tier 1，其餘 Tier 用另一個 profile。

建議切三次做：**第一次 Tier 0+1（約 55 分）** → 第二次 Tier 2+3（約 2.5 小時）→ 第三次 Tier 4+5。

---

## 0. 前置（Tier 0）
- [x] `npm test` 全綠（2026-08-10 複驗：**27 suites / 304 tests**，0 failed、0 skipped，exit 0）
- [ ] `npm run package` 重新產出 **`dist/fan-fan-ba-v1.10.0.zip`**，並以 `dist/pkg/` 載入測試
      （舊紀錄：2026-07-24 的 `v1.9.9.zip` / 3027.1 KB —— **版本已 bump 到 1.10.0，那包不可再用**）
- [ ] 擴充功能顯示 **v1.10.0**；背景 Service Worker console 0 error

---

## ⭐ Tier 1 — cutover 一次性資料層遷移（v1.10.0，**不可逆**）

> 2026-08-10 新增。WS-E 的 T-A1 把單字本從「IndexedDB ＋ storage.local 鏡像」雙存放收斂成
> **mirror-only**，升級後第一次啟動 Service Worker 會把舊 IDB 併進鏡像然後 `deleteDatabase`。
> 這是整個 v1.10.0 唯一**弄錯就真的丟使用者單字本**的路徑，而先前的 QA 輪完全沒有覆蓋它。
>
> **實作對照**（`vocabulary-store.js`，寫這節時逐行核對過）：
> - IDB：DB `fan-fan-ba-vocabulary` / object store `items`（keyPath `id`）
> - 鏡像鍵 `fanFanBaVocabularyItems`／舊 marker `fanFanBaVocabularyIndexedDbMigratedAt`
> - 合併前快照 `fanFanBaVocabularyItemsPreCutoverBackup`（**write-if-absent**，30 天 TTL）
> - 勝負規則：`effectiveTimestamp = max(lastSeenAt, reviewedAt)`，**嚴格較新才勝**（平手鏡像勝）
> - 守門：寫回後比對 key 集合相等 ＋ IDB 勝出條目時戳相符，**通過才刪庫**；不過則不刪、下次啟動重試

### 造舊 IDB 狀態（背景 Service Worker 的 DevTools console）

```js
// 造一顆「升級前」的舊 IDB：一筆兩邊都有（IDB 較新）、一筆只有 IDB
const db = await new Promise(res => {
  const r = indexedDB.open('fan-fan-ba-vocabulary');
  r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
});
const tx = db.transaction('items', 'readwrite').objectStore('items');
tx.put({ id: 'en:shared', word: 'shared', lastSeenAt: '2026-08-01T00:00:00.000Z' });  // 較新，應勝出
tx.put({ id: 'en:idbonly', word: 'idbonly', lastSeenAt: '2026-01-01T00:00:00.000Z' }); // 只有 IDB，應併入
db.close();
// 鏡像端放同 id 的較舊版本
chrome.storage.local.set({ fanFanBaVocabularyItems: {
  'en:shared':  { id: 'en:shared',  word: 'shared-OLD', lastSeenAt: '2026-07-01T00:00:00.000Z' },
  'en:mirroronly': { id: 'en:mirroronly', word: 'mirroronly', lastSeenAt: '2026-07-01T00:00:00.000Z' }
} });
```

造完 **reload extension**（`chrome://extensions` → 重新整理鈕）觸發 SW 啟動掃描。

### 檢查項

- [ ] **TC-CUT-001 合併正確**：reload 後查 `fanFanBaVocabularyItems` → 三筆都在；
      `en:shared` 的 word 是 **`shared`（IDB 較新的那版）**、不是 `shared-OLD`；`en:idbonly` 沒有消失
- [ ] **TC-CUT-002 舊庫已刪**：DevTools → Application → IndexedDB → **`fan-fan-ba-vocabulary` 不存在**；
      且 `fanFanBaVocabularyIndexedDbMigratedAt` 這個 marker 也被清掉
- [ ] **TC-CUT-003 合併前快照有寫**：`fanFanBaVocabularyItemsPreCutoverBackup` 存在，
      `items` 是**合併前的鏡像內容**（只有 `en:shared`(OLD) 與 `en:mirroronly`，**不含** IDB 的兩筆），`savedAt` 是剛才
- [ ] **TC-CUT-004 平手時鏡像勝**：另起乾淨 profile，兩邊放**同 id 且時戳完全相同**的條目（值不同）→ reload
      → 留下來的是**鏡像那版**（嚴格較新才換人，平手不動）
- [ ] **TC-CUT-005 冪等重試**：reload 後 IDB 已刪 → **再 reload 一次** → 不報錯、單字本內容不變、
      不會又生出一份 PreCutover 快照（write-if-absent）
- [ ] **TC-CUT-006 全新安裝不受影響**：全新 profile 直接裝 v1.10.0（沒有舊 IDB）→
      單字本可正常存取，**不會憑空生出** `fan-fan-ba-vocabulary` 這個 DB，也不會寫 PreCutover 快照

> **跑完 Tier 1 才能往下做**——TC-CUT-002 一旦通過，這個 profile 的 IDB 就不存在了，
> 004/005/006 各自需要新的乾淨 profile。

---

## 2026-07-24 Phase 0-C～4-B 稽核結果

- 結果：60 TC｜32 PASS｜4 FAIL｜24 SKIP。
- 2 個 P1：`QA-P1-001` 收藏／紀錄面板透明；`QA-P1-003` 375px 浮球展開仍被右側裁切。
- 1 個 P2：`QA-P2-002` Options 啟動時發生 `LAST_VOCAB_BACKUP_KEY` TDZ。
- SKIP 不算通過：真實 AI / TTS API Key、Google OAuth / Drive、Obsidian 與 install/update 事件仍待人工。
- 主整合報告：[`qa-reports/fan-fan-ba-qa-report-20260724.html`](qa-reports/fan-fan-ba-qa-report-20260724.html)
- 原始結果：[`qa-reports/phase1-2-results.json`](qa-reports/phase1-2-results.json)

---

## 2026-07-28 三缺陷修補與待人工回歸（Tier 3）

三個開放缺陷已修，`npm test` 26 suites / 249 tests 全綠（0 failed、0 skipped）。
自動化能鎖住的部分已進測試，**下列真實瀏覽器回歸只有你能跑**：

- [ ] `TC-F3-001` / `TC-F3-005`：一般 HTTPS 頁 → 浮球 →「收藏 / 紀錄」→ 面板**實心可見且可點**，能進單字本與最近查詢
      （自動化已鎖：`tests/content/floating-ball.test.js` 驗 `.g-show` 有加上；但透明度是 computed style，jsdom 驗不到）
- [ ] `TC-F3-002` / `TC-F3-004`：前置被 QA-P1-001 擋住的兩案（歷史紀錄回看、5,000 筆邊界）現在可以重跑
- [ ] `TC-E3-003`：開 options 頁 → DevTools console **無** `Cannot access 'LAST_VOCAB_BACKUP_KEY' before initialization`，
      且「單字本備份」區塊看得到「尚未匯出過…」或「上次備份：N 天前」提醒
      （自動化已鎖：`tests/options.test.js › vocabulary backup startup`）
- [ ] `TC-F2-005`：375×812 真實裝置 / DevTools 裝置模擬 → 浮球主球與收藏 / **單字高亮** / 全文翻譯 / 設定鈕**完整在畫面內**，
      （2026-07-28 接線輪新增第 4 顆鈕；量測 harness 的控制項清單要一起改成四顆）
      且在 481px 以上的桌機視窗，浮球靜置時仍維持右側半藏（沒被這次修改弄丟）

### QA-P1-003 的量測方式（jsdom 量不到 bounding box，改用瀏覽器實測）

`tests/content/css.test.js` 只能鎖住 CSS 規則沒被刪掉，實際像素位置要這樣量：
把 `content.css` 與 `content/{site-policy,state,dom,floating-ball}.js` 內嵌成一頁 harness，
用 Playwright 設 375×812，讀四個控制項的 `getBoundingClientRect().right - window.innerWidth`。

2026-07-28 實測（修前 → 修後）：

| 控制項 | 修前・靜置 | 修後・靜置 | 修後・展開 |
| --- | --- | --- | --- |
| 主球 `.ffb-ball-main` | 溢出 +24.0px | 0px | 0px |
| 收藏 / 全文翻譯 / 設定 | 各溢出 +15.4px | −8.6px（在畫面內） | −8.0px |

桌機 1280px 對照：靜置仍 `translateX(24px)`（半藏保留）、展開 `translateX(0)` 溢出 0px。

---

## 2026-07-28 半接線 6 條接線完工 — 待人工驗（Tier 3）

六個原本零 production caller 的函式已接上呼叫端，`npm test` 249 → 273（26 suites 全綠、0 skipped）。
**自動化只驗到「有呼叫、狀態有寫入、UI 入口存在且可見」；下面這些只有真實瀏覽器 / 外部 App 驗得了。**

### 收藏 → Obsidian 自動匯出（manual gate，**尚未驗證**）
- [ ] 設定頁填好 Obsidian Vault 與資料夾 → 選字翻譯 → 結果卡按「收藏」
      → 按鈕變「**已收藏並匯出**」，且 Obsidian 週記 `YYYY-W##.md` **真的多出**該單字區塊
      （自動化只鎖到：收藏成功會呼叫匯出、狀態機正確；`obsidian://` URI 有沒有真的被 Obsidian 接走驗不到）
- [ ] 未設定資料夾時按鈕停在「已收藏」，不謊報匯出
- [ ] 同一個字在別的頁面再收藏一次 → **週記不會多出第二份**（已匯出過就不重複 append）
- [ ] 浮球 →「收藏 / 紀錄」→ 單字本，該筆顯示「已匯出」badge

### 浮球單字高亮開關
- [ ] 浮球展開 → 上組出現 🖍 高亮鈕（在「收藏 / 紀錄」下方），點一下頁面內已收藏單字變黃底 `mark`，
      hover 顯示釋義 tooltip；再點一下還原原文
- [ ] 重新整理頁面後高亮狀態被記住（存 `chrome.storage.sync` 的 `vocabularyHighlightMode`）
- [ ] **375×812 回歸**：浮球展開時四顆鈕（收藏 / 高亮 / 全文翻譯 / 設定）**完整在畫面內**，
      沒有重演 QA-P1-003；把浮球拖到畫面最上緣與最下緣，選單也**不被裁掉**

### 全文翻譯：Shadow DOM / iframe / SVG 收集（一律只回報，不就地翻譯）

> 2026-07-28 產品裁決：shadow root 吃不到 `content.css`，塞譯文進去只會是沒樣式的裸文字、
> 且「只看譯文 / 只看原文」模式對它不生效，因此**不注入譯文，只在面板提示**。

- [ ] 開含 open Shadow DOM 內文的網頁（web component 文件站）→ 全文翻譯 →
      **web component 內不出現任何譯文區塊**，面板嵌入提示顯示「web component 內文 N 段」
- [ ] 該提示的 N 與頁面實際可讀段落數相符；用選取翻譯仍能翻 web component 內的文字
- [ ] 只有 shadow root、內容全是按鈕 / 控制項的頁 → 提示列**不出現**（不多嘴）
- [ ] 開含跨來源 iframe ＋ SVG 圖表的頁 → 面板嵌入提示顯示
      「嵌入框架 N 個（M 個讀不到）、圖表文字 K 段」，數字與頁面實際情況相符
- [ ] 沒有嵌入內容的純文字頁 → 該提示列**不出現**

### 全文翻譯：本頁學習摘要
- [ ] 全文翻譯跑完 → 面板下方出現「本頁重點 · 已譯 N 段」，含 ≤3 條關鍵句與生字候選，
      **實心可見可捲動**（不是透明死區塊）
- [ ] 翻譯進行中不先亮摘要；按「還原」後摘要跟著消失
- [ ] 中日文為主的頁面：生字候選只抓英文字（現行實作），確認這個行為可接受

---

## 2026-07-30 單字本資料層三塊 — 待人工驗（Tier 2，資料遺失類）

`mergeEntry` 勝方判定改時間優先、本機兩槽自動快照、options 頁快照還原入口。
`npm test` 273 → 304（27 suites 全綠、0 skipped），且兩輪 red-team 打出來的邊界都有測試鎖住。
**自動化驗的是 mock 之上的邏輯與訊息契約；下面這些要真的 chrome.storage 與真的按鈕才算數。**

> **造狀態的捷徑**：快照 24 小時才輪替一次，等不了就直接在 background service worker 的
> DevTools console 塞。兩個鍵是 `fanFanBaVocabularyItemsSnapshot`（最近）與
> `fanFanBaVocabularyItemsSnapshotPrev`（較舊），格式 `{ savedAt: ISO字串, items: { id: 條目 } }`：
> ```js
> chrome.storage.local.set({ fanFanBaVocabularyItemsSnapshotPrev:
>   { savedAt: new Date(Date.now() - 36e5 * 30).toISOString(), items: { 'en:probe': { id: 'en:probe', word: 'probe' } } } })
> ```
> 塞完重開 options 頁（按鈕在載入時渲染，不會即時更新）。

### 快照還原入口（options → 單字本備份 / 還原）
- [ ] 全新安裝、還沒存過任何字 → **不出現任何還原按鈕**，說明文字也不出現（不對空手的人喊「可以還原」）
- [ ] 存幾個字、隔天再存一個 → 出現「還原最近快照（時間・N 個單字）」，時戳與筆數**與實際相符**
- [ ] 兩槽都有時出現兩顆（最近 / 較舊），較舊那顆的時戳確實比較早
- [ ] **還原採合併**：先刪掉幾個字 → 按還原 → 被刪的字回來了，**而還原後才新增的字沒有消失**
- [ ] 還原後複習進度不倒退：把某字標成「已熟」→ 按還原（快照裡它還是 learning）→ **仍然是已熟**
- [ ] 還原完狀態列顯示「已從快照還原：補回 X、更新 Y，目前共 Z 個單字」，數字合理
- [ ] **還原不吃掉救援槽**（第二輪 F4）：連按兩次還原 → 兩槽內容與時戳**都沒被動過**
      （還原是非破壞性動作，不該拿救援槽去備份它的前態）

### 跨裝置 / 換機匯入（`mergeEntry` 修復）
- [ ] A 機把某字標「已熟」→ B 機同一個字遇到很多次但還是 learning → 把 A 的 JSON 匯進 B
      → 該字在 B **變成已熟**（舊版會因為 B 的 `count` 較高而把 A 較新的複習進度整組蓋掉）
- [ ] 反向也對：把**較舊**的備份匯進已經複習過的機器 → 複習進度**不被回滾**，但遇到次數取兩邊較大值
- [ ] 匯入後單字本排序（最後遇到時間）看起來正常，沒有莫名跳到最舊

### 零收穫匯入不吃掉快照（第二輪 F1，**資料遺失類，重點測**）
- [ ] 造一個空備份檔 `{"app":"fan-fan-ba","schema":"vocabulary","items":{}}` → 匯入
      → 顯示「備份內沒有可匯入的單字」，且**兩槽快照都還在**
- [ ] 條目全都缺 `word` 的舊檔匯入 → 同樣被擋、快照仍在
- [ ] 最惡劣情境走一遍：把單字全部逐一刪掉（本機空了）→ 匯入上面那個空檔
      → **快照沒有被清掉**，接著按還原真的救得回來（這正是快照唯一該發揮作用的時刻）
- [ ] 對照組：匯入**有內容**的正常備份 → 匯入前的狀態仍會被備份一份（匯入帶進外部資料，前態值得留）

### 只能用 DevTools 造狀態的兩條（沒有 UI 路徑，驗不了就註明跳過）
- [ ] **未來時戳會被重錨**（第二輪 F2）：把 `savedAt` 塞成明天 → 重載 extension（觸發 SW 啟動掃描）
      → 該筆的 `savedAt` 變成「現在」、**items 一個都沒少**（採重錨不採刪除：那可能是唯一的救援資料）
- [ ] **30 天保留上限**：把 `savedAt` 塞成 40 天前 → 重載 extension → 該槽**被清掉**；
      另一槽若還在保留期內則不受影響（兩槽各自獨立判斷）
- [ ] **清空連帶刪快照**：**目前沒有「清空單字本」控制項可按**（`replaceAll` 的 `clearing`
      需呼叫端顯式宣告，全 repo 無觸發者），此條在 UI 上無法驗證 → 等真的加了清空鈕再補驗

---

## 1. v1.9.6 — frame-split（Tier 4；legacy 批次內最高風險）
- [ ] 開含**跨來源 iframe** 的長文頁（嵌 YouTube / 廣告 / Disqus 的新聞）：浮球**只在主頁面一顆**，iframe 內不長球
- [ ] 在 **iframe 內選取文字** → 工具列仍跳出、能翻譯（frame-split 不該弄壞這條）
- [ ] 主頁選取文字 → 工具列 / 結果卡正常
- [ ] 敏感頁（accounts.google.com 登入頁）→ 整支不啟用、無浮球

## 2. v1.9.6 — 訊息硬化（Tier 4）
- [ ] 設定 Obsidian Vault → 結果卡存入 Obsidian → 正常開啟、存入後切回原分頁（只允許 `obsidian://`）
- [ ] 浮球「設定」→ 正常開設定頁

## 3. v1.9.6 — web_accessible_resources（`use_dynamic_url`）（Tier 4）
- [ ] 結果卡 / 浮球品牌字型（jf-openhuninn）正常載入、浮球 icon 正常（沒變系統預設醜字）

## 4. v1.9.7 / Phase C — 單段翻譯（Tier 4）
- [ ] 滑過一般段落時不會出現浮動翻譯鈕，也不會遮住原文
- [ ] 游標放在某段（或選取該段）→ 按 **Alt+T** → 翻譯該段
- [ ] 對**已翻譯過**的段落再觸發 → 應「定位」而非重複請求
- [ ] **context 調優驗證**：翻譯長文中間某段，譯文用詞符合前後文語境（不是孤立直譯）
- [ ] **局部重試**（Phase C）：段落翻譯失敗時出現「重試此段」→ 點擊可重翻、失敗計數正確扣回
- [ ] 與整頁翻譯混用：雙語 / 譯文 / 原文模式切換、複製譯文 / 雙語、定位原文都正常

## 5. v1.9.8 — 本機診斷 / 自檢表（Tier 4）
- [ ] 做幾次翻譯 / 解釋 / 優化 / 整頁翻譯 → 設定頁「隱私與功能說明」分頁 →「本機診斷摘要」數字有累加，並顯示版本、模型 API Key、高亮設定、使用紀錄與隱私邊界自檢
- [ ] 刻意清空目前模型 API Key → 自檢表顯示需要處理；補回 API Key 後顯示正常
- [ ] 按「清除診斷資料」→ 歸零
- [ ] DevTools Network：操作時**只有對 AI API 的請求**，無其他上傳（確認真的無 telemetry）

## 6. Phase B — 單字本 SRS / 備份（Tier 4）

> 2026-08-10 更名：原標題寫「IndexedDB」，但 v1.10.0 的 T-A1 已把 IDB 層整個移除、改 mirror-only。
> 遷移本身改由上方〈⭐ Tier 1 — cutover〉負責，本節只留 SRS 與匯出／匯入。

> ~~從舊版 local storage 單字本升級後，單字本面板仍看得到既有單字~~
> → **已由 TC-CUT-001 取代**（v1.10.0 的升級路徑是 IDB → 鏡像，不再是 local storage → IDB）。
> 不列為待辦項，避免與 Tier 1 重複計數。
- [ ] 浮球 → 單字本，預設顯示「今日複習」；到期單字排序合理
- [ ] 在「今日複習」點「記得」→ 狀態變已記得，下一次複習約 7 天後
- [ ] 在「今日複習」點「還不熟」→ 狀態維持還不熟，下一次複習約 1 天後
- [ ] 切到「錯題回看」→ 只看到還不熟 / learning 單字；點「記得」後該單字離開錯題回看清單
- [ ] 收藏幾個單字 → 設定頁「匯出 JSON」→ 得到 `.json` 備份
- [ ] 「匯出 XLSX」→ 得到 `.xlsx`，**用真 Excel / Google Sheets 開得起來**、欄位正確
- [ ] **公式注入防護**：收藏一個以 `=` 開頭的內容（或 word/definition 含 `=cmd`）→ 匯出 XLSX → Excel 開啟時該格顯示為**純文字**，不被當公式執行
- [ ] 移除擴充功能再重裝 → 設定頁「匯入」剛才的 JSON → 單字救回、計數正確
- [ ] **匯入硬化**（review 🔴1/🟡2）：匯入一個內含 `"__proto__"` 當 key 的惡意 JSON → 不崩潰、該筆被忽略、其他單字正常匯入
- [ ] 匯入超過 10MB 的檔 → 顯示「檔案太大」而非卡死

## 7. 回歸（確認沒弄壞既有功能）（Tier 4）
- [ ] **選取長段落 → 翻譯 / 解釋 / 優化（streaming）正常逐字顯示，不再報「請求 ID格式不正確」**（2026-06-20 修正：requestId 數字→字串 correlation id 容錯）
- [ ] 字典卡（選短單字）、段落串流翻譯、解釋、優化、朗讀
- [ ] 釘住結果卡、最近查詢、單字本面板、單字高亮
- [ ] 設定儲存 / 匯出 / 匯入、Cloud Sync 登入同步（含上面新增的 hover 設定有被一起備份 / 還原）

---

## 8. 送審前 gating（Tier 5；非 code，需你確認）
- [ ] 確認 manifest `oauth2.client_id` 是**正式**的 Google OAuth Client ID（非 placeholder）
- [ ] 1280×800 截圖（至少 1 張）
- [ ] 依 `STORE-SUBMISSION.md` 打包 → 上傳 Developer Dashboard → 填文案 → 送審

---

## 已知 deferred（非本批次範圍）
- `content.css` 整理（2708 行，純樣式重排，風險高、低價值）
- Phase C「續翻體驗打磨」：現有續翻流程已完整，無具體缺陷待修
