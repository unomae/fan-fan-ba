# 手動 QA 檢查表（需在真實 Chrome / Edge 執行）

> 這份是「**人要做**」的手動驗收，與 `npm test`（304 個自動化單元測試）互補。
> 自動測試涵蓋純函式邏輯；以下這些只有在真實瀏覽器載入擴充功能才驗得了。
> 涵蓋版本：v1.9.6（注入面收斂）→ v1.9.9（security hardening）→ **v1.10.0（WS-E 資料層 migration）** + Phase A–D review 修正。
> 最後更新：2026-08-10（補 Tier 排序與 §1 cutover 區塊）。

---

## ⚠️ 執行順序（2026-08-10 排定，先讀這段再開工）

**進度（2026-08-13）：Tier 0、1、2 完成；Tier 3 完成 13/19 → 全表剩 40 項未跑（含 1 格半完成）。**
Tier 3 剩下的 6 格：TC-F3-004 那格**已跑但 4/5**（CSV 公式注入 FAIL，待裁決修不修）；
Obsidian 週記落檔 2 格（要真的 App 接 `obsidian://`）、本頁學習摘要 3 格（要真的譯出結果＝需 API key）**只有你能跑**。
之後是 **Tier 4**（§1–§7 legacy 回歸 31 項）。
Tier 1 那道「一旦錯過就補不回來」的閘已經過了，之後都可隨時中斷再續。

| Tier | 章節 | 項數 | 估時 | 狀態 | 為什麼排這裡 |
| :-- | :-- | --: | :-- | :-- | :-- |
| **0** | §0 前置 | 2 | 15 分 | ✅ 08-10 | 版本號相同不代表內容新，一律重打包 |
| **1** | ⭐〈cutover 一次性資料層遷移〉 | 6 | 40 分 | ✅ 08-10 **6/6 PASS** | **單向不可逆、每個 profile 只發生一次** |
| **2** | 〈2026-07-30 單字本資料層〉 | 17 | 60 分 | ✅ 08-13 **16 PASS＋1 跳過**（快照還原 7・DevTools 2＋1 跳過・匯入 7）| 資料遺失類 |
| **3** | 〈2026-07-28 三缺陷回歸〉4 ＋〈半接線 6 條〉15 | 19 | 90 分 | 🔶 **13/19**（08-13 automation-driven）| 剩 6 格＝TC-F3-004 邊界、Obsidian 落檔 2、摘要 3（需 API key／外部 App）|
| **4** | §1–§7 legacy 回歸 | 31 | 90 分 | ⬜ | 廣度回歸，風險最低 |
| **5** | §8 送審前 gating | 3 | 另計 | ⬜ | 非 code，最後做 |

原始計數 78 ＝ 舊有 71 ＋ 新增 cutover 6 與 Tier 0 前置 2，− §6 那條被 TC-CUT-001 取代的舊遷移項。

> 章節編號沿用舊有 §1–§8 未動（qa-reports 與藍圖有引用）；cutover 區塊改用不編號的 ⭐ 標題插在 §0 之後。

> **Tier 1 的專用 profile 規則**：cutover 只在「偵測到舊 IDB 存在」時跑一次，跑完就 `deleteDatabase`。
> 若先做 Tier 2 的匯入／還原測試，同一 profile 的 IDB 早被清掉，Tier 1 就再也測不到。
> → 開一個乾淨的 Chrome 使用者設定檔專跑 Tier 1，其餘 Tier 用另一個 profile。

建議切三次做：**第一次 Tier 0+1（約 55 分）** → 第二次 Tier 2+3（約 2.5 小時）→ 第三次 Tier 4+5。

---

## 0. 前置（Tier 0）
- [x] `npm test` 全綠（2026-08-10 複驗：**27 suites / 304 tests**，0 failed、0 skipped，exit 0）
- [x] `npm run package` 重新產出 **`dist/fan-fan-ba-v1.10.0.zip`**，並以 `dist/pkg/` 載入測試
      → 2026-08-10 13:24 重打包，3104471 bytes；`diff -rq . dist/pkg` **逐檔與工作區一致**
      ⚠️ **陷阱**：`dist/` 原本就有一顆 2026-07-29 的 `v1.10.0.zip`，manifest 版本號看起來對，
      但 `vocabulary-store.js` / `options.js` 落後 07-30 那輪。**版本號相同不代表內容是新的，一律重打包。**
- [x] 擴充功能顯示 **v1.10.0**；背景 Service Worker console 0 error
      → pkg manifest 為 1.10.0；p1/p2/p3 三個 profile 的 SW console 皆無紅色錯誤（DevTools 顯示 `No Issues`）

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

- [x] **TC-CUT-001 合併正確**：reload 後查 `fanFanBaVocabularyItems` → 三筆都在；
      `en:shared` 的 word 是 **`shared`（IDB 較新的那版）**、不是 `shared-OLD`；`en:idbonly` 沒有消失
- [x] **TC-CUT-002 舊庫已刪**：DevTools → Application → IndexedDB → **`fan-fan-ba-vocabulary` 不存在**；
      且 `fanFanBaVocabularyIndexedDbMigratedAt` 這個 marker 也被清掉
- [x] **TC-CUT-003 合併前快照有寫**：`fanFanBaVocabularyItemsPreCutoverBackup` 存在，
      `items` 是**合併前的鏡像內容**（只有 `en:shared`(OLD) 與 `en:mirroronly`，**不含** IDB 的兩筆），`savedAt` 是剛才
- [x] **TC-CUT-004 平手時鏡像勝**：另起乾淨 profile，兩邊放**同 id 且時戳完全相同**的條目（值不同）→ reload
      → 留下來的是**鏡像那版**（嚴格較新才換人，平手不動）
- [x] **TC-CUT-005 冪等重試**：reload 後 IDB 已刪 → **再 reload 一次** → 不報錯、單字本內容不變、
      不會又生出一份 PreCutover 快照（write-if-absent）
- [x] **TC-CUT-006 全新安裝不受影響**：全新 profile 直接裝 v1.10.0（沒有舊 IDB）→
      單字本可正常存取，**不會憑空生出** `fan-fan-ba-vocabulary` 這個 DB，也不會寫 PreCutover 快照

> **跑完 Tier 1 才能往下做**——TC-CUT-002 一旦通過，這個 profile 的 IDB 就不存在了，
> 004/005/006 各自需要新的乾淨 profile。

### 2026-08-10 執行結果：**6/6 PASS**（真實 Chrome 151.0.7922.77，三個拋棄式 profile）

profile 用 `--user-data-dir="C:\tmp\ffb-qa\p{1,2,3}"` 開，擴充以「載入未封裝項目」指向 `dist/pkg`。
（`--load-extension` 這個 flag **Chrome 151 已不支援**、靜默忽略，只能走 UI 載入。）

| profile | TC | 實測 |
| :-- | :-- | :-- |
| p1 | 001 | 合併後 `en:idbonly,en:mirroronly,en:shared` 三筆齊；`en:shared.word === 'shared'`（IDB 較新版勝出）|
| p1 | 002 | `indexedDB.databases()` 已無 `fan-fan-ba-vocabulary`；marker 為 `undefined` |
| p1 | 003 | 快照存在且內容為合併前鏡像（`en:mirroronly,en:shared` 且 word 是 `shared-OLD`）；`savedAt=2026-08-10T06:11:09.769Z`（UTC，台北 14:11）|
| p1 | 005 | 二次 reload 後 `savedAt` **未變**（write-if-absent 有效）、單字本內容不變、未重建庫 |
| p2 | 004 | 同 id 同時戳 `2026-07-15T00:00:00.000Z`，留下的是 `from-MIRROR` → 比較確為嚴格 `>`；舊庫仍被刪 |
| p3 | 006 | `存在的 DB = []`；PreCutover 與 marker 皆 `undefined`；`upsertItem`→`listItems` 讀寫往返正常 |

**還沒驗到的**：`onblocked`（有其他分頁佔住舊 DB 時 `deleteDatabase` 會卡住）走的是
fire-and-forget 出佇列鏈、下次啟動補刪的路徑——三個 profile 都只有單一 SW context，沒有觸發到。
屬低機率且設計上已不阻塞 CRUD，未另闢 TC。

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

- [x] `TC-F3-001` / `TC-F3-005`：一般 HTTPS 頁 → 浮球 →「收藏 / 紀錄」→ 面板**實心可見且可點**，能進單字本與最近查詢
      （自動化已鎖：`tests/content/floating-ball.test.js` 驗 `.g-show` 有加上；但透明度是 computed style，jsdom 驗不到）
- [ ] `TC-F3-002` **已補驗通過**（2026-08-13，歷史回看＋SRS）；`TC-F3-004` **已跑，4/5 子檢查過、1 條 FAIL**
      （CSV 公式注入，見下方〈2026-08-13 TC-F3-004 執行結果〉）。**這格因 TC-F3-004 未全過而維持未勾**
- [x] `TC-E3-003`：開 options 頁 → DevTools console **無** `Cannot access 'LAST_VOCAB_BACKUP_KEY' before initialization`，
      且「單字本備份」區塊看得到「尚未匯出過…」或「上次備份：N 天前」提醒
      （自動化已鎖：`tests/options.test.js › vocabulary backup startup`）
- [x] `TC-F2-005`：375×812 真實裝置 / DevTools 裝置模擬 → 浮球主球與收藏 / **單字高亮** / 全文翻譯 / 設定鈕**完整在畫面內**，
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
- [x] 未設定資料夾時按鈕停在「已收藏」，不謊報匯出
- [ ] 同一個字在別的頁面再收藏一次 → **週記不會多出第二份**（已匯出過就不重複 append）
- [x] 浮球 →「收藏 / 紀錄」→ 單字本，該筆顯示「已匯出」badge

### 浮球單字高亮開關
- [x] 浮球展開 → 上組出現 🖍 高亮鈕（在「收藏 / 紀錄」下方），點一下頁面內已收藏單字變黃底 `mark`，
      hover 顯示釋義 tooltip；再點一下還原原文
      → **驗這條前先確認 `vocabularyHighlightMode` 是關的**，否則第一次點其實是關閉、會拿到假 FAIL（2026-08-13 踩過）
- [x] 重新整理頁面後高亮狀態被記住（存 `chrome.storage.sync` 的 `vocabularyHighlightMode`）
- [x] **375×812 回歸**：浮球展開時四顆鈕（收藏 / 高亮 / 全文翻譯 / 設定）**完整在畫面內**，
      沒有重演 QA-P1-003；把浮球拖到畫面最上緣與最下緣，選單也**不被裁掉**

### 全文翻譯：Shadow DOM / iframe / SVG 收集（一律只回報，不就地翻譯）

> 2026-07-28 產品裁決：shadow root 吃不到 `content.css`，塞譯文進去只會是沒樣式的裸文字、
> 且「只看譯文 / 只看原文」模式對它不生效，因此**不注入譯文，只在面板提示**。

- [x] 開含 open Shadow DOM 內文的網頁（web component 文件站）→ 全文翻譯 →
      **web component 內不出現任何譯文區塊**，面板嵌入提示顯示「web component 內文 N 段」
- [x] 該提示的 N 與頁面實際可讀段落數相符；~~用選取翻譯仍能翻 web component 內的文字~~
      → **後半句未涵蓋**（選取翻譯要真的打 API），只驗了 N 相符
- [x] 只有 shadow root、內容全是按鈕 / 控制項的頁 → 提示列**不出現**（不多嘴）
- [x] 開含跨來源 iframe ＋ SVG 圖表的頁 → 面板嵌入提示顯示
      「嵌入框架 N 個（M 個讀不到）、圖表文字 K 段」，數字與頁面實際情況相符
      → **「讀不到」只算 `data:`／`about:` 這類 unsupported-scheme**；跨來源 http iframe 被判 `ready`
      （走 frame-script bridge，擴充也注入該 frame），要驗 M>0 得放一個 `data:` iframe
- [x] 沒有嵌入內容的純文字頁 → 該提示列**不出現**

### 2026-08-13 TC-F3-004 執行結果：**4/5 子檢查 PASS，1 條 FAIL（CSV 公式注入）**

環境同下節（automation-driven，p2 profile）。前置＝5,000 筆單字本，含 7 顆惡意樣本：
emoji、RTL override（`‮`）、`=cmd|' /C calc'!A0`、`<img src=x onerror=...>`、`<script>`、5,000 字超長字串、`a,b"c`。

| 子檢查 | 結果 | 實測數字 |
| :-- | :-- | :-- |
| 5,000 筆下 UI 不卡死 | **PASS** | 開「全部」分頁 2,989ms／渲染 5,000 列；搜尋 515ms→1 筆；切複習狀態 917ms |
| UI 不執行惡意內容 | **PASS** | `window.__ffbXss`／`__ffbXss2` 皆 `undefined`；結果卡內注入 `img` 0 個、`script` 0 個；HTML 以字面文字顯示 |
| 快速重複收藏不爆增 | **PASS** | 20 次**並發** upsert 同一 id → 總筆數僅 +1（5000→5001），`count` 依規則合併成 20（序列化佇列有效）|
| 高亮不污染互動元件 | **PASS** | 文章內 2 個；表單 0／`<pre><code>` 0／翻翻吧自身 UI 0；未超過 `maxMarks=80` |
| CSV 公式前綴防護 | **FAIL** | 見下 |

**🔴 已重現的缺陷：「複製今日 CSV」沒有公式注入防護**

- **觸發**：單字本存在 word 為 `=cmd|' /C calc'!A0` 的條目（createdAt 為今日）→ 浮球 → 單字本 → 按「複製今日 CSV」
- **剪貼簿輸出原文**：`=cmd|' /C calc'!A0,,,惡意樣本,,,2026-08-13T07:52:20.141Z,1`
- **根因**：`content/vocabulary.js` 的 `escapeVocabularyCsvCell` 只處理 `"`／`,`／換行，**未對 `=` `+` `-` `@` 開頭的值加 `'` 前綴**
- **界線（別誇大）**：只驗到**輸出層無防護**，**沒有**在 Excel 實際執行那條 DDE，也不打算做；風險路徑是「使用者自己把 CSV 貼進 Excel／Sheets」
- **XLSX 匯出無此問題**：`buildXlsxWorkbook` 以 `t="inlineStr"` 寫格，Excel 一律當字串
- **處置未定**：修不修屬 KAKA 決定（改動會影響匯出內容格式，且與送審時程相關）

### 2026-08-13 執行結果（Tier 3 可自動化部分）：**13 格打勾＋1 格半完成**

**⚠️ 證據等級同 Tier 2 後半：automation-driven（Playwright 驅動 p2 已載入的擴充），不是人眼手動 QA。**
**前提：p2 沒有設定任何 API key／provider／Obsidian vault**（只驗存在、未讀值），所以全文翻譯請求全數失敗
（面板顯示「已完成 0/4 · 失敗 4」）——但嵌入提示是 `startPageTranslationBeta()` 一開頭就跑 collector 產生的，
**在任何 API 呼叫之前**，因此 5 條嵌入提示驗得成立。

| 案 | 對應清單項 | 結果 | 實測證據 |
| :-- | :-- | :-- | :-- |
| T1 | TC-F3-001/005 | **PASS** | 桌機與 375 皆 `opacity=1`（QA-P1-001 當時是 0）；單字本與最近查詢都進得去 |
| T2 | TC-F3-002 | **PASS** | 歷史 3 筆、回開結果卡渲染字典卡；點「已記得」後 `learning→known`、`reviewedAt`／`nextReviewAt`（+7 天）同步更新 |
| T3 | TC-E3-003 | **PASS** | 載入到切分頁全程 console error 0 筆（TDZ 0 筆）；備份提醒文字可見 |
| T4 | TC-F2-005 | **PASS** | 375 靜置主球溢出 0px；展開五控制項 −2〜−8px（全在畫面內）。桌機 1280 靜置主球右緣**超出 24px＝半藏仍在** |
| T5 | 高亮鈕開關 | **PASS** | `mode {}→auto`；mark 2 個、tooltip 出現、再點歸 0；**表單與 `<pre><code>` 內 0 個**（高亮沒污染互動元件）|
| T6 | 高亮狀態記憶 | **PASS** | `storage.sync.vocabularyHighlightMode="auto"`；重整後自動高亮 2 個 |
| T7 | 高亮 375 回歸＋拖曳 | **PASS** | 四鈕溢出 −8.1〜−8.5px；拖到上緣選單 `top=76`（未裁）、拖到下緣底部溢出 −690px（未裁）|
| T8 | Obsidian 不謊報 | **PASS** | vault/folder 皆未設定；按前「收藏」（enabled）→ 按後「**已收藏**」，未出現「已收藏並匯出」，且字確實寫進單字本 |
| T9 | 已匯出 badge | **PASS** | 有 `obsidianExportedAt` 的顯示 badge、沒有的不顯示 |
| B1 | shadow 不注入譯文＋提示 | **PASS** | 提示「web component 內文 3 段」；shadow root 內譯文區塊 **0 個** |
| B2 | N 與實際相符 | **PASS** | N=3＝fixture 實際 3 段（選取翻譯子條未涵蓋）|
| B3 | 只有控制項 → 不多嘴 | **PASS** | 提示未出現 |
| B4 | iframe＋SVG 數字 | **PASS** | 「嵌入框架 2 個（1 個讀不到）、圖表文字 2 段」＝fixture 實際（http iframe 1＋`data:` iframe 1＋SVG 文字 2）|
| B5 | 純文字頁 → 不出現 | **PASS** | 提示未出現 |

**這輪三個假 FAIL 全是 harness 問題，記著別重犯**：①高亮案沒先歸零 `vocabularyHighlightMode`，第一次點變成「關閉」→ mark 0
②Obsidian 案用了**已在單字本裡**的字，字典卡開場就是 disabled 的「已收藏」，按不下去 ③歷史 fixture 沒給可 JSON parse 的
`dictData`，結果卡 fallback 成純文字版面、根本沒有收藏鈕（收藏鈕只在 `action=translate` ＋選字 ≤20 字 ＋ result 可 parse 時才渲染）。

**剩下 5 項（2 格 Obsidian ＋ 3 格摘要）＋ 半格 TC-F3-004 需要你**：Obsidian 那兩條要真的 App 接 `obsidian://`；
摘要三條要真的譯出 N 段＝需要 API key（計費＋外連），屬你的決定。

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

> **多 profile 並行時的前置條件（2026-08-10 教訓）**：貼驗證腳本前先確認這個 DevTools
> 對應的是哪個 profile。同時開著 p1/p2/p3 時很容易在 reload 後點到別人的卡片，
> 而「這個 profile 從來沒有快照」讀出來的值會長得很像缺陷（見本節末〈未重現的觀察〉）。

### 快照還原入口（options → 單字本備份 / 還原）
- [x] 全新安裝、還沒存過任何字 → **不出現任何還原按鈕**，說明文字也不出現（不對空手的人喊「可以還原」）
- [x] 存幾個字、隔天再存一個 → 出現「還原最近快照（時間・N 個單字）」，時戳與筆數**與實際相符**
- [x] 兩槽都有時出現兩顆（最近 / 較舊），較舊那顆的時戳確實比較早
- [x] **還原採合併**：先刪掉幾個字 → 按還原 → 被刪的字回來了，**而還原後才新增的字沒有消失**
- [x] 還原後複習進度不倒退：把某字標成「已熟」→ 按還原（快照裡它還是 learning）→ **仍然是已熟**
- [x] 還原完狀態列顯示「已從快照還原：補回 X、更新 Y，目前共 Z 個單字」，數字合理
- [x] **還原不吃掉救援槽**（第二輪 F4）：連按兩次還原 → 兩槽內容與時戳**都沒被動過**
      （還原是非破壞性動作，不該拿救援槽去備份它的前態）

### 跨裝置 / 換機匯入（`mergeEntry` 修復）
- [x] A 機把某字標「已熟」→ B 機同一個字遇到很多次但還是 learning → 把 A 的 JSON 匯進 B
      → 該字在 B **變成已熟**（舊版會因為 B 的 `count` 較高而把 A 較新的複習進度整組蓋掉）
- [x] 反向也對：把**較舊**的備份匯進已經複習過的機器 → 複習進度**不被回滾**，但遇到次數取兩邊較大值
- [x] 匯入後單字本排序（最後遇到時間）看起來正常，沒有莫名跳到最舊
      → **要看「全部」或「最近遇到」分頁**：面板預設分頁是「今日複習」（`renderFloatingVocabularyPanel`
      的 `filter = 'review'`），走複習佇列順序、本來就不照 `lastSeenAt`，別誤判成排序壞掉（2026-08-13 踩過）

### 零收穫匯入不吃掉快照（第二輪 F1，**資料遺失類，重點測**）
- [x] 造一個空備份檔 `{"app":"fan-fan-ba","schema":"vocabulary","items":{}}` → 匯入
      → 顯示「備份內沒有可匯入的單字」，且**兩槽快照都還在**
      （實際狀態列有前綴：`匯入失敗：備份內沒有可匯入的單字`，是預期不是缺陷）
- [x] 條目全都缺 `word` 的舊檔匯入 → 同樣被擋、快照仍在
- [x] 最惡劣情境走一遍：把單字全部逐一刪掉（本機空了）→ 匯入上面那個空檔
      → **快照沒有被清掉**，接著按還原真的救得回來（這正是快照唯一該發揮作用的時刻）
- [x] 對照組：匯入**有內容**的正常備份 → 匯入前的狀態仍會被備份一份（匯入帶進外部資料，前態值得留）
      → 驗這條**必須先重載擴充**：`snapshotCheckedAt` 是 SW 記憶體變數，前一案看過 fresh 快照後
      24 小時內不會再輪替，不重載會拿到假 FAIL

### 只能用 DevTools 造狀態的兩條（沒有 UI 路徑，驗不了就註明跳過）
- [x] **未來時戳會被重錨**（第二輪 F2）：把 `savedAt` 塞成明天 → 重載 extension（觸發 SW 啟動掃描）
      → 該筆的 `savedAt` 變成「現在」、**items 一個都沒少**（採重錨不採刪除：那可能是唯一的救援資料）
- [x] **30 天保留上限**：把 `savedAt` 塞成 40 天前 → 重載 extension → 該槽**被清掉**；
      另一槽若還在保留期內則不受影響（兩槽各自獨立判斷）
- [~] **清空連帶刪快照**：**目前沒有「清空單字本」控制項可按**（`replaceAll` 的 `clearing`
      需呼叫端顯式宣告，全 repo 無觸發者），此條在 UI 上無法驗證 → 等真的加了清空鈕再補驗
      → 2026-08-10 複驗仍無 production 觸發者：`grep clearing` 只命中 `replaceAll` 定義處、
      一條單元測試（`vocabulary-store-snapshot.test.js:93`），以及 `vocabulary-store.js:375`
      「handleMessage **不轉發** clearing」——訊息路徑也到不了。**維持跳過，不計為通過。**

### 2026-08-13 執行結果（Tier 2 後半，匯入 7 項）：**7/7 PASS**

**⚠️ 證據等級：automation-driven，不是人眼手動 QA。** 用 Playwright 1.61.1（借 `claudio/node_modules`）
`launchPersistentContext` 開 **p2 profile 裡已載入的未封裝擴充**（真 Chrome、真 SW、真 options 頁與真浮球面板）。
真實 UI 路徑：匯入送進真的 `#vocabularyImportFile`（同一個 change handler）、B3 的刪除點真的
`[data-vocab-delete]`、還原點真的 `#vocabularySnapshotActions` 按鈕。**唯一繞過的是 OS 檔案選取對話框**
（`setInputFiles` 直接餵檔）。要人眼簽收的版面觀感不在此輪，跑批腳本在 session scratchpad、未進版控。

| 項 | 內容 | 結果 | 實測證據 |
| :-- | :-- | :-- | :-- |
| A1 | A 機已熟 → 匯進 count 250 的 learning B 機 | **PASS** | 「新增 0、更新 1，共 1」；`status=known`、`count=250`、`reviewedAt=2026-08-09`、`nextReviewAt=2026-08-16`、`createdAt=2026-05-01`（較早）、`lastSeenAt=2026-06-05`（較新）|
| A2 | 較舊備份匯進已複習過的機器 | **PASS** | `status` 仍 `known`、`reviewedAt` 仍 `2026-08-09`（未回滾）；`count` 1→250（取較大）|
| A3 | 匯入後排序正常 | **PASS** | 資料層與面板「全部」分頁皆 `control(08-10) > merge(06-05) > oldest(01-01)`；預設「今日複習」分頁為 `oldest, control, merge`＝複習佇列順序（非缺陷，見上方註記）|
| B1 | 空 items 備份 | **PASS** | 「匯入失敗：備份內沒有可匯入的單字」；兩槽 `savedAt`／筆數逐欄相同（current 2 筆、prev 1 筆）|
| B2 | 條目全缺 `word` | **PASS** | 同上訊息；兩槽未變 |
| B3 | 刪光 → 匯入空檔 → 還原救回 | **PASS** | 浮球面板逐一刪 3/3 → `list=0` → 匯入被擋 → 快照仍 3 筆且 `savedAt` 未動 → 「已從快照還原：補回 3、更新 0，共 3」→ 三字全回 |
| B4 | 對照組：正常備份會備份前態 | **PASS** | 「新增 1、更新 0，共 2」；current 輪替成當下、內容＝匯入前的 `en:before`，原 30 小時前那份擠到 prev 未遺失 |

**跑批自己踩到的兩個量測坑（產品沒問題，記著別重犯）**：①連續兩案的成功訊息**字字相同**，
用「狀態列文字有沒有變」當完成訊號會永遠等不到 → 改成先清空再等非空；②`#vocabularyBackupStatus`
沒字時零尺寸，Playwright 判 hidden，不能拿它當分頁就緒探針 → 改用 `#btnImportVocabulary`。

### 2026-08-10 執行結果（Tier 2 前半）：快照還原 7/7、DevTools 造狀態 2/2 PASS + 1 跳過

環境同 Tier 1（Chrome 151.0.7922.77，`--user-data-dir` 拋棄式 profile）。

| 段落 | 結果 | 實測重點 |
| :-- | :-- | :-- |
| 快照還原入口 7 項 | **7/7 PASS**（p3 跑空手案、p1 跑其餘 6 項）| 造兩槽（最近 2h／3 筆、較舊 30h／1 筆）＋現況 3 筆；還原後狀態列「補回 1、更新 2，共 4」，被刪的 `en:deleted` 回來、還原後新增的 `en:newone` 沒消失、已複習到 `known` 的 `en:progress` 沒被快照回滾成 `learning`；連按兩次還原後兩槽 savedAt 與筆數皆未變 |
| 未來時戳重錨（D-1）| **PASS** | `savedAt` 設 +24h → reload → 重錨成當下、items 仍 3 筆 |
| 30 天上限（D-2）| **PASS** | 另一槽設 40 天前 → reload → 該槽移除，重錨那槽不受影響（兩槽獨立判斷成立）|
| 清空連帶刪快照（D-3）| **跳過** | 無 UI 觸發者，維持原判 |

**未重現的觀察（不列為缺陷）**：D 段首次執行時，驗證腳本回報兩槽皆為 `undefined`。
之後以**乾淨序列重跑 2 次皆正常**（其中一次刻意保持 options 頁開著，用來測試「設定頁污染」假設——
**該假設被推翻**）。回頭比對，那四個布林值與「在一個從未產生過快照的 profile 上執行驗證」的輸出完全一致，
最可能是 reload 後重開 DevTools 時點到了另一個 profile 的卡片；但**無法回溯證明**，故僅記錄、不判缺陷、
不修改任何斷言。前置條件已補在本節開頭。

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
