# 手動 QA 檢查表（需在真實 Chrome / Edge 執行）

> 這份是「**人要做**」的手動驗收，與 `npm test`（275 個自動化單元測試）互補。
> 自動測試涵蓋純函式邏輯；以下這些只有在真實瀏覽器載入擴充功能才驗得了。
> 涵蓋版本：v1.9.6（注入面收斂）→ v1.9.9（security hardening）+ Phase A–D review 修正。
> 最後更新：2026-07-28。

---

## 0. 前置
- [x] `npm test` 全綠（2026-07-28 接線輪：26 suites / 275 tests，0 failed、0 skipped）
- [x] `npm run package` 成功產出 `dist/fan-fan-ba-v1.9.9.zip`（2026-07-24：3027.1 KB），並以 `dist/pkg/` 載入測試
- [x] 擴充功能顯示 v1.9.9；背景 Service Worker console 本輪 0 error（Options TDZ 另列 `QA-P2-002`）

---

## 2026-07-24 Phase 0-C～4-B 稽核結果

- 結果：60 TC｜32 PASS｜4 FAIL｜24 SKIP。
- 2 個 P1：`QA-P1-001` 收藏／紀錄面板透明；`QA-P1-003` 375px 浮球展開仍被右側裁切。
- 1 個 P2：`QA-P2-002` Options 啟動時發生 `LAST_VOCAB_BACKUP_KEY` TDZ。
- SKIP 不算通過：真實 AI / TTS API Key、Google OAuth / Drive、Obsidian 與 install/update 事件仍待人工。
- 主整合報告：[`qa-reports/fan-fan-ba-qa-report-20260724.html`](qa-reports/fan-fan-ba-qa-report-20260724.html)
- 原始結果：[`qa-reports/phase1-2-results.json`](qa-reports/phase1-2-results.json)

---

## 2026-07-28 三缺陷修補與待人工回歸

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

## 2026-07-28 半接線 6 條接線完工 — 待人工驗

六個原本零 production caller 的函式已接上呼叫端，`npm test` 249 → 275（26 suites 全綠、0 skipped）。
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

### 全文翻譯：Shadow DOM / iframe / SVG 收集
- [ ] 開含 open Shadow DOM 的網頁（web component 內文，如部分文件站）→ 全文翻譯 →
      **web component 內的段落也長出譯文**；按「還原」時 shadow 內的譯文節點也一起消失
- [ ] **已知限制待確認影響**：shadow root 內的譯文節點吃不到 `content.css`（樣式隔離），
      文字讀得到但沒有雙語卡片樣式；「只看譯文 / 只看原文」模式對 shadow 內段落也不生效。
      請判斷這個降級版是否可接受，或要不要改成只在面板提示「本頁有 N 段在 web component 內」
- [ ] 開含跨來源 iframe ＋ SVG 圖表的頁 → 全文翻譯 → 面板嵌入提示顯示
      「嵌入框架 N 個（M 個讀不到）、圖表文字 K 段」，數字與頁面實際情況相符
- [ ] 沒有嵌入內容的純文字頁 → 該提示列**不出現**（不多嘴）

### 全文翻譯：本頁學習摘要
- [ ] 全文翻譯跑完 → 面板下方出現「本頁重點 · 已譯 N 段」，含 ≤3 條關鍵句與生字候選，
      **實心可見可捲動**（不是透明死區塊）
- [ ] 翻譯進行中不先亮摘要；按「還原」後摘要跟著消失
- [ ] 中日文為主的頁面：生字候選只抓英文字（現行實作），確認這個行為可接受

---

## 1. v1.9.6 — frame-split（最高風險，重點測）
- [ ] 開含**跨來源 iframe** 的長文頁（嵌 YouTube / 廣告 / Disqus 的新聞）：浮球**只在主頁面一顆**，iframe 內不長球
- [ ] 在 **iframe 內選取文字** → 工具列仍跳出、能翻譯（frame-split 不該弄壞這條）
- [ ] 主頁選取文字 → 工具列 / 結果卡正常
- [ ] 敏感頁（accounts.google.com 登入頁）→ 整支不啟用、無浮球

## 2. v1.9.6 — 訊息硬化
- [ ] 設定 Obsidian Vault → 結果卡存入 Obsidian → 正常開啟、存入後切回原分頁（只允許 `obsidian://`）
- [ ] 浮球「設定」→ 正常開設定頁

## 3. v1.9.6 — web_accessible_resources（`use_dynamic_url`）
- [ ] 結果卡 / 浮球品牌字型（jf-openhuninn）正常載入、浮球 icon 正常（沒變系統預設醜字）

## 4. v1.9.7 / Phase C — 單段翻譯
- [ ] 滑過一般段落時不會出現浮動翻譯鈕，也不會遮住原文
- [ ] 游標放在某段（或選取該段）→ 按 **Alt+T** → 翻譯該段
- [ ] 對**已翻譯過**的段落再觸發 → 應「定位」而非重複請求
- [ ] **context 調優驗證**：翻譯長文中間某段，譯文用詞符合前後文語境（不是孤立直譯）
- [ ] **局部重試**（Phase C）：段落翻譯失敗時出現「重試此段」→ 點擊可重翻、失敗計數正確扣回
- [ ] 與整頁翻譯混用：雙語 / 譯文 / 原文模式切換、複製譯文 / 雙語、定位原文都正常

## 5. v1.9.8 — 本機診斷 / 自檢表
- [ ] 做幾次翻譯 / 解釋 / 優化 / 整頁翻譯 → 設定頁「隱私與功能說明」分頁 →「本機診斷摘要」數字有累加，並顯示版本、模型 API Key、高亮設定、使用紀錄與隱私邊界自檢
- [ ] 刻意清空目前模型 API Key → 自檢表顯示需要處理；補回 API Key 後顯示正常
- [ ] 按「清除診斷資料」→ 歸零
- [ ] DevTools Network：操作時**只有對 AI API 的請求**，無其他上傳（確認真的無 telemetry）

## 6. Phase B — 單字本 IndexedDB / SRS / 備份
- [ ] 從舊版 local storage 單字本升級後，單字本面板仍看得到既有單字
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

## 7. 回歸（確認沒弄壞既有功能）
- [ ] **選取長段落 → 翻譯 / 解釋 / 優化（streaming）正常逐字顯示，不再報「請求 ID格式不正確」**（2026-06-20 修正：requestId 數字→字串 correlation id 容錯）
- [ ] 字典卡（選短單字）、段落串流翻譯、解釋、優化、朗讀
- [ ] 釘住結果卡、最近查詢、單字本面板、單字高亮
- [ ] 設定儲存 / 匯出 / 匯入、Cloud Sync 登入同步（含上面新增的 hover 設定有被一起備份 / 還原）

---

## 8. 送審前 gating（非 code，需你確認）
- [ ] 確認 manifest `oauth2.client_id` 是**正式**的 Google OAuth Client ID（非 placeholder）
- [ ] 1280×800 截圖（至少 1 張）
- [ ] 依 `STORE-SUBMISSION.md` 打包 → 上傳 Developer Dashboard → 填文案 → 送審

---

## 已知 deferred（非本批次範圍）
- `content.css` 整理（2708 行，純樣式重排，風險高、低價值）
- Phase C「續翻體驗打磨」：現有續翻流程已完整，無具體缺陷待修
