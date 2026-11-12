# CHANGELOG — 翻翻吧

> 已結案的工作紀錄，新的在上。`PLAN.md` 只放「現在與下一步」，完成項搬來這裡。
> 更早的歷史脈絡在 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史。

## 2026-11-11 — 移除文件測試數 gate、修隱私權政策連結、歷史資料移出 repo

KAKA 同日裁決，承接下一條的審核。

- **文件不再記測試數，`check-docs` 整組移除**：刪 `scripts/check-doc-numbers.js`、`npm run check-docs`、CI 的兩個步驟，以及 `TESTING.md`／`MANUAL-QA.md`／`PLAN.md`／`project-overview.html` 的 `ffb:suites`／`ffb:tests` 標記與數字。理由：這組 gate 只保護「文件裡的數字」，數字本身對使用者沒有價值，卻在 11-10 讓 master CI 變紅而產品沒壞；測試有沒有過由 CI 的 Jest 步驟證明。本檔更早條目裡的 `check-docs` 字樣是歷史紀錄，保留原文。
- **隱私權政策連結**：歡迎頁與設定頁原本連到 `privacy-policy.html`，但該檔不在打包白名單、安裝後是壞連結。改連正式網址 `https://unomae.github.io/fan-fan-ba/privacy-policy.html`（實測 HTTP 200）。
- **刪 `replaceAll` 的 `clearing` 參數**與其 1 條測試：從未有呼叫端。「不從資料形狀推論清空意圖」的教訓留在註解；`PLAN.md` 對應技術債項移除，`MANUAL-QA.md` 該條改標不適用（計數不變）。
- **Jest 覆蓋率改為預設不開**：沒有任何工具或 CI 讀它，要量時跑 `npx jest --coverage`。
- **歷史資料移出公開 repo**：`archive/`（10 檔，含兩份決策看板）與 `qa-reports/`（73 檔）搬到知識庫 `40_Todo/archive/fan-fan-ba-repo-history/`，搬前以 `diff -rq` 確認兩邊一致；刪 `screenshots/` 內無引用的 Snipaste 5 張與 `mockups/` 6 張。git 歷史仍保有這些檔。
- 沒動：金鑰 sync→local、IndexedDB cutover、`MODEL_MIGRATIONS` 三組舊資料遷移（刪錯的代價是資料遺失，維持保留）。
- 驗證：Jest 51 suites／865 tests 全過、0 skip；`npm run package` 成功，`dist/pkg` 兩頁連結已是正式網址；`check-models --selftest` 7/7；`ci.yml` 可解析。未跑 e2e，兩個連結未在真瀏覽器點過。

## 2026-11-11 — 刪除零引用程式與孤兒檔、修正打包誤帶字型

- 打包：`fonts/` 內的 LINE Seed TW（兩顆 woff2＋授權檔）只給 GitHub Pages 上的 `privacy-policy.html` 用，擴充本體不載入，卻自 2026-10-28 起被整夾收進 zip。改列入 `PRUNE`，zip 由 10.2 MB 回到 3.2 MB，內含字型只剩 `jf-openhuninn-2.1.ttf`。
- 刪除沒有任何執行期呼叫端的程式：`renderDiff`（`content/utils.js`，優化卡早已不用 diff 檢視）與其測試、`CHEVRON_SVG`（`content/result-card.js`）、單字本的 `mergeItems` 與 `merge` 訊息 action（`vocabulary-store.js`；匯入與還原走的是 `vocabulary-backup.js` 的 `mergeBackup`＋`replaceAll`，不受影響）。
- 刪除沒有任何 JS 會產生的樣式：`.g-diff-*`、`.g-num`、`.g-chevron`、`.ffb-page-translation-mark(-error)`（含深色模式對應規則），`content.css` 少 96 行。
- 刪除孤兒檔：`tests/setup.js`（沒被任何設定或測試引用，生效的是 `jest.setup.js`）、根目錄三個 6 月的一次性預覽頁（`floating-ball-layout-preview.html`、`page-translation-card-color-preview.html`、`generate-icons.html`）；`.gitignore` 移除 Vitest 時代的殘留規則。
- 文件測試數由 864 更正為 866：改動前實跑是 867（文件自 11-10 起過期，master CI 的 `check-docs --verify` 因此是紅的），本次刪掉 `renderDiff` 的 1 條測試後為 866。
- 驗證：Jest 51 suites／866 tests 全過、0 skip；`npm run check-docs -- --verify` exit 0；`npm run package` 成功並核對 zip 清單。未跑 e2e 與真瀏覽器（本次沒有改到任何仍在使用的執行路徑）。

## 2026-11-10 — 修正全文翻譯的原文顯示與舊譯文

- 「只看譯文」模式下，等待中和失敗的段落會保留原文，成功後才隱藏。
- 原文變動或來源節點被移除時會撤掉舊譯文。仍在全文翻譯範圍內的段落會接續重翻。單段與批次都會核對原文和當前請求，過期結果不寫入畫面或計數。
- Windows Chrome 157（build `559f5b8d8db7`）用固定供應商回應複驗 3 案，原文顯示、同節點換文、在途舊回應皆通過。驗收說明見 `MANUAL-QA.md`，案例已加入 `e2e/run.js page-translation`。

## 2026-11-07 — 修腳本實測重現的 4 個問題

- 設定頁 390 px：搜尋框改成撐滿整列（窄螢幕規則原本被寫在後面的 320 px 上限蓋掉）。
- 儲存設定：該家金鑰從沒存過就不再問「要移除已儲存的金鑰嗎」，直接存其他設定；清空已存金鑰仍會確認，按取消仍會擋下存檔。
- 全文翻譯清單：插入的譯文區塊不再算成原頁 `<ol>` 的一項（原文第 2 項不會被推成 3.）；有序清單譯文保留原編號；「•」後沒空白也認成無序清單。
- 減少動態效果：浮球、工具列、結果卡、全文翻譯的轉場全部關掉（含續看提示），一般模式不變。
- Jest：51 suites／864 tests 全過、0 skip；新增 2 條回歸測試，退回修復都會變紅。真 Chrome 155、build `451ddc23b18a`（SW 指紋重載後一致）複驗 4 項通過，證據見 `MANUAL-QA.md`「2026-11-07 Mac 腳本實測」段。
- 未處理的疑點：全文翻譯面板「本頁重點」把無序清單譯文顯示成「• •關於…」。

## 2026-10-27 — 全文翻譯自動接續、免 key 設定與 OAuth 分類

- 全文翻譯維持每輪段落／字數限制，完成後自動接下一輪；捲動、內部捲動容器及新增文字內容會接續收集。單段翻譯維持按需執行。
- 自動接續保留累計與全部譯文；停止／還原會取消觀察與待處理請求，舊請求回傳不污染新 session，停止後可立即重新翻譯未完成段落。
- 主模型沒有存過金鑰且全文翻譯選內建模型時，可以在金鑰留空的情況下儲存；移除既有金鑰仍須確認。首次請求等待設定讀回，也處理設定早於全文翻譯腳本載入的時序。
- OAuth 只依明確的 `invalid_client`／`unauthorized_client` 分類為 Client ID 問題，取消或一般 client 請求錯誤不再直接歸為設定不正確；未調整 Google Cloud 設定或驗證正式登入。
- Jest：51 suites／862 tests 通過，0 failed、0 skipped。全新 Chrome 155 測試 profile、真 storage／真內建模型（build `0c72fb4c1ca3`）通過無 key 儲存重開、18 段捲動接續、動態追加、停止與還原。
- 測試環境：Chrome 149＋Playwright 預設啟動時模型回 `Model not available`；Chrome 155 移除停用背景網路／元件更新的預設旗標後真翻譯成功。此差異不能當作所有 Chrome 版本皆已驗證。
- e2e 浮球桌機靜置檢查先把滑鼠移出浮球再量測，維持原半藏斷言；未修改版也會在 hover 時量到 `-2px`，不能拿 hover 當靜置。
- 更新後 scoped e2e（ui-panels＋legacy-regression）：29 PASS／0 FAIL／4 PARTIAL；ui-panels 13/13。4 項仍保留原有未涵蓋部分：需 key 的翻譯、敏感頁連外、以清空 storage 模擬重裝、設定備份僅驗匯出結構，不能宣稱完整真人驗收通過。
- KAKA 2026-10-27 接受保留這 4 個既有 PARTIAL，核准本輪提交與推送；正式 OAuth 登入、人眼譯文品質與上架驗收未結案。

## 2026-10-23 — e2e 啟動時確認 service worker 是現行版

**問題**：同一個測試 profile＋同一個版本號時，Chrome 會一直跑快取的舊 `background.js`；原本 `launch` 只比 manifest 版本號，看不出來。p2 profile 因此長期測到舊 background（PLAN「實機測試發現 2026-10-22」）。
**修法**：
- `scripts/build-id.js`（新）：算整包內容的 sha256 前 12 碼；`npm run package` 在 dist/pkg（與 zip）的 `background.js` 尾端加 `self.FFB_BUILD_ID = '…'`。原始碼不帶指紋。
- `e2e/lib/harness.js` 的 `launch`：叫醒 SW 讀指紋跟磁碟比。一致就放行；不一致自動 `chrome.runtime.reload()` 一次再比；仍不一致或 dist 沒指紋就停並說明原因。每次 relaunch 都會再檢查。

**驗證**：Jest 50 suites／842 tests 全過（新增 `tests/build-id.test.js` 11 條：指紋讀寫、重複蓋不疊行、任一檔變就換指紋、原始碼無指紋、判斷函式六種情境）。e2e 在 p2 實跑：
- 舊版 SW（無指紋）→ 偵測到、reload、確認現行版 ✓；打包後未 reload（舊指紋）→ 同樣自動修正 ✓；正常情況直接通過 ✓。
- 「reload 後仍不一致」的停止路徑真實環境造不出來，只有單元測試覆蓋。
- 全套 41 PASS／0 FAIL／4 PARTIAL（4 個 PARTIAL 同既有，都需 API key 或外部帳號）。
- **合併前自審補修（同日）**：①任何一步丟錯都先關瀏覽器再丟（原本 options 頁載入失敗會留 Chrome 鎖住 profile）；②讀 SW 指紋每次限 3 秒（原本卡住的 worker 會讓檢查永遠掛著）；③reload 前的 worker 物件不再採信（原本可能讀到還沒終止的舊 SW 而誤判失敗）；測試暫存夾跑完會清掉。新增 `tests/e2e-sw-check.test.js` 7 條（假 context），三項修正各做一次突變都會讓對應測試轉紅。Jest 51 suites／849 tests 全過；e2e 全套 41／0／4，另造一次「dist 內容變了但 SW 沒換」跑 ui-panels，自動 reload 後 13/13。
- **未重現的疑點**：第一輪全套出現 1 次 T8 FAIL（收藏後 2 秒按鈕仍是「收藏中」，但單字已寫入）。那輪跑到一半時另一個 session 重新打包了 dist/pkg，可能是原因但無法證明；之後 ui-panels 連跑 2 次、全套 1 次，T8 都通過。

## 2026-10-23 — popup 與設定頁改用 Radix Colors，精簡元素與文案

**追加（同日）**：KAKA 看過後，色彩與刪掉的重複文字保留，但視覺要回到上一版。改回：淡黃／淡綠光暈背景、毛玻璃外框與陰影、圓角 16／14、1px 線、卡片 hover 上浮、模型大卡漸層、Groq 卡淡綠底、淡綠次要按鈕、膠囊狀態標籤、標題 24／22、欄位高 42 與聚焦光圈；popup 回到 32px logo 綠黃光暈（減少動態效果時關閉）、實心圓點、膠囊供應商標籤。氛圍與陰影收進 `ui-tokens.css`（`--page-bg`、`--shell-bg`、`--shadow-*`），色值仍是 Radix。

**範圍**：KAKA 給一份 11 條的介面優化準則（不用「·」分隔、去冗餘說明、Radix Colors、光學對齊與同心圓角、0.5px 線、少動畫、字級 ≤ 4 種、少判斷、少裝飾圓角陰影與左側色條、去 eyebrow），套到 popup 與設定頁。浮層（`content.css`）與歡迎頁不在這次範圍。
- **token**：新增 `ui-tokens.css`（Radix lime／olive／amber／red／blue，含 dark），popup 與設定頁共用，打包清單加入。設定頁原本約 130 行的暗色覆寫規則整段刪除，改由 token 切換。
- **popup**：拿掉副標、「目前狀態」卡、三格健康狀態、底部 API 狀態燈與「已切換」提示（都在重複模型清單已表達的事）。只在選的模型缺金鑰時顯示紅色提醒，「填寫金鑰」直接開設定頁 `#model`。模型右側標籤改成供應商名稱，五色徽章改成同一種灰字。logo 光暈與狀態燈脈衝動畫移除。新增深色模式（token 免費得到）。
- **設定頁**：拿掉跟 h1 重複的「設定總覽」與跟卡片重複的三格數字列；麵包屑只留「← 返回總覽」；面板標題統一成卡片名稱；刪掉所有 `panel-badge`、供應商卡的「備用／進階／OpenAI 相容」標籤、三段只是重述標題的說明句；Obsidian 與隱私的綠色說明框改成一般段落；上限改寫在欄位標籤（最多 20 個／500 筆）。金鑰標籤視覺上只顯示「API Key」，供應商名稱留給搜尋與螢幕閱讀器（`visually-hidden`）。儲存成功訊息從黃色改成品牌綠；「新增」標籤從紅色改成資訊藍，紅色只留給錯誤。
- **文案**：模型說明、總覽摘要、模型比較耗時、診斷摘要、快照標籤裡的「·」「・」改成逗號或頓號；模型比較與隱私卡片的說明式摘要拿掉。
- **順手修**：設定頁深色區塊結尾有一條缺 `{` 的空選擇器（`#vocabularyBackupStatus, #vocabularyBackupReminder,`），隨整段刪除。

**驗證**：Jest 49 suites／831 tests 全過（新增 4 條：面板標題＝卡片名稱、popup 缺金鑰提醒 3 條；改掉依賴已刪元素的斷言）。本機注入假 `chrome.*` 的預覽伺服器看過設定頁總覽、模型、隱私、備份（淺色、深色）與 popup（缺金鑰）。真擴充（Chromium 載入 dist/pkg）截過設定頁與 popup 淺色、深色，console 錯誤 0；e2e 全套 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

## 2026-10-23 — e2e T4/T7 在 Win 失敗：125% 縮放的次像素誤差

**根因**：Windows 125% 顯示縮放讓貼齊右緣的主球量到 +0.2px，T4/T7 寫死「溢出 ≤ 0」才判 FAIL；版面本身正常（四鈕 -7.8、拖上下緣 0、桌機半藏 24px）。對照實驗：同一顆球強制 DPR 1 溢出 0、1.25 溢出 0.2，class 與 transform 相同（`468b4de`）。先前記的「四鈕超出 7.8px」實測是 -7.8。
**修法**（KAKA 選 A）：`e2e/suites/ui-panels.js` 的主球與四鈕溢出判準容許 0.5px（`SUBPIXEL`），不到 1 個實體像素、看不出裁切。

**驗證**：Win 連跑 3 次 ui-panels 皆 13/13（Chrome for Testing 全新 profile 2 次、品牌版 p2 1 次）。突變：把取消半藏的 `max-width: 480px` 改成 `1px`，T4/T7 轉紅（主球溢出 24.2px），還原後回綠。另有一筆疑點未重現：改完第一次跑出 12 案 11 PASS／1 FAIL，原文沒留下，之後 4 次都是 13/13。

## 2026-10-23 — 設定頁說明文字精簡（補做報告第 1、2、3、5 項）

**範圍**：KAKA 問「報告列的是不是都做了」，對照後有 3 項沒做、5 項換了做法；KAKA 指示補第 1、2、3、5 項（第 4、6、7 項維持現行做法）。
- **解釋語言**：選單第一項改成「跟隨翻譯語言（建議）」（`models.js` 的 `EXPLANATION_LANGUAGE_OPTIONS`）。
- **`{{pageUrl}}`**：自訂動作編輯器的變數按鈕與「複製給 AI 的說明」不再列它，說明文字也不用再解釋。驗證仍沿用 `CustomActions.VARIABLES`，已經寫了 `{{pageUrl}}` 的動作照常能存、照常換成空白。
- **快捷鍵**：總覽頁尾顯示瀏覽器實際綁定的兩組快捷鍵（`chrome.commands.getAll()`，沒綁的寫「未設定」），旁邊「更改」開 `chrome://extensions/shortcuts`；頁尾連結改名「使用說明」。
- **內建動作**：「內建」標籤加鎖頭，滑過說明「只能停用或調整順序；要改內容請按「以此為範本」」，拿掉原本的 ⓘ「內建動作能改什麼？」；「用 AI 協助設定」改名「複製給 AI 的說明」。

**驗證**：Jest 49 suites／829 tests 全過（新增 4 條：選項文字、變數按鈕與 AI 說明不含 pageUrl、內建列鎖頭與按鈕名稱、總覽快捷鍵含未設定與讀不到時收起）。真擴充淺色、深色：總覽快捷鍵顯示 ⌃⇧S／⌃⇧A、4 個內建動作有鎖頭、變數按鈕 4 顆、解釋語言選項文字、380px 無橫向捲動，頁面錯誤 0。e2e 全套 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

## 2026-10-23 — 設定頁說明文字精簡（第二、三階段：ⓘ、金鑰狀態、拆備份卡、功能介紹搬歡迎頁）

**範圍**：接續同日第一階段，KAKA 指示「go 第二階段、第三階段」。動 `options.html`、`options.js`、`welcome.html` 與測試、文件。
- **ⓘ 說明**：規則細節收進可點開的 `details.more-info`（結果卡換模型、自訂端點連線權限、內建動作能改什麼、術語表比對規則與 CSV 格式、模型比較用的設定、單字本自動快照）。原本報告建議用 `popover`，改用 `<details>`：不用處理定位、鍵盤與螢幕閱讀器原生支援，jsdom 也測得到。
- **金鑰狀態**：「必填／選填」換成依表單上選的模型（含各功能）即時顯示「使用中／缺 Key／已填／未填」（`renderProviderKeyStates`），自訂端點要網址、模型名稱、金鑰都填才算已填；主模型下拉改變時也會重算。
- **備份**：拆成「設定檔」「單字本」兩張卡；密碼欄只在勾選「加密包含 API Keys」後出現。匯入加密備份卻沒填密碼時，會打開密碼欄、聚焦並說明原因，什麼都不寫入（原本是丟「密碼至少 8 個字元」）。匯入舊版明文備份時，成功訊息後面提醒重新匯出成加密版。
- **隱私**：分頁改名「隱私」，功能與快捷鍵介紹搬到歡迎頁「小技巧」；總覽頁尾加「使用說明與快捷鍵」連到歡迎頁。字典卡、快捷鍵、結果卡三個「新增」標籤隨介紹一起拿掉。
- **樣式統一**：欄位旁提示 `label .hint` 從 `#98a2b3`（白底約 2.6:1）改用 `--muted`；單字本狀態、診斷說明的行內樣式改用 `.field-note`；刪掉只給功能介紹用的 CSS。順手修掉診斷說明裡粗體被 `.security-note strong` 撐成獨立一行的既有問題。

**驗證**：Jest 49 suites／825 tests 全過（新增 4 條：金鑰狀態隨模型與欄位變化、自訂端點三欄都填才算已填、密碼欄隨勾選顯示、加密備份缺密碼時打開密碼欄且不寫入；原本依賴功能介紹標籤與明文匯入訊息的 7 條測試改成新行為）。e2e 全套 41 PASS／0 FAIL／4 PARTIAL，與基準相同。真擴充淺色、深色：總覽、未儲存提示、存檔、網址直達、搜尋跳轉、勾選加密出現密碼欄、ⓘ 展開、380px 備份頁無橫向捲動、歡迎頁小技巧，頁面錯誤 0。

## 2026-10-23 — 設定頁說明文字精簡（第一階段：只改文案）

**範圍**：KAKA 看過文案精簡報告後選「先只改文案」；只動 `options.html` 的說明文字、placeholder 與兩條沒人用的 CSS，不改 JS 與版面。
- 刪掉各區開頭的導言（總覽卡片已有摘要）、與欄位名稱或選單選項重複的說明（翻譯目標語言、解釋語言、朗讀語音、Obsidian 資料夾）。
- 同一件事只講一次：「API Key 不會同步」從 4 處收成雲端同步區一處；備份區重複說明加密規則的「API Key 備份提醒」整塊拿掉。
- 金鑰取得方式改成「取得 Key ↗」連結，格式交給既有 placeholder（`gsk_…`、`AIza…`、`sk-or-…`）；Vault 留空規則、術語表「含子網域」改寫進 placeholder。
- 上傳／下載會覆蓋哪一邊，原本就有確認框說明，頁面上那行提示拿掉。
- 說明文字（不含隱私區的功能介紹）實測 2,113 → 671 字。

**驗證**：Jest 49 suites／821 tests 全過；重新打包 `dist/pkg` 後，真擴充互動腳本淺色、深色各一輪（總覽、未儲存提示、存檔、網址直達、搜尋跳 Obsidian、380px 無橫向捲動），頁面錯誤 0。只動靜態文字，這輪沒重跑整套 e2e。

## 2026-10-23 — 設定頁改成總覽首頁＋卡片，加上未儲存提示與深色模式

**範圍**：KAKA 從三個設計提案選定「總覽首頁＋Bento 卡片」；只動 `options.html`、`options.js` 與測試、文件。
- **總覽**：打開設定先看預設模型、已填金鑰數、雲端同步三個數字；「需要注意」只列會讓功能壞掉的事（預設模型、字典、全文翻譯選的模型缺金鑰）。9 個分類改成卡片，各自顯示目前已儲存的值與狀態（綠＝已設定、黃＝要處理、灰＝未設定）；模型卡較大，逐家列出金鑰有沒有填。摘要讀 storage，不讀表單，storage 一變就重畫。
- **詳細頁**：點卡片進入，上方「← 總覽 / 分類名稱」。網址帶 `#分類`（例如 `options.html#cloud`）可直接開到該分類，瀏覽器上一頁回總覽。搜尋框移到頁首，總覽與詳細頁都能用 Ctrl／⌘K。
- **儲存**：仍是「儲存設定」一顆按鈕（模型與金鑰要交叉驗證、自訂端點要在點擊當下要權限、術語表有衝突偵測，這輪不改成自動儲存）。儲存列改成 sticky 貼在視窗底；不經這顆按鈕的分類（動作、比較、備份、雲端、隱私）不顯示它。改了欄位會顯示「有未儲存的變更」，回總覽會列出是哪個分類，有沒存的東西時關頁會跳瀏覽器確認。存檔被擋下時提示留著。
- **深色模式**：跟著系統，色票沿用 `design.md` 的 `--ffb-dark-*`。新增配色的文字對比實測都在 4.5:1 以上（最低 4.68）；「← 總覽」改用 `#3f7a1c`，因為品牌綠 `#5a9a2e` 在白底只有 3.4:1。
- 卡片沿用 `.settings-tab[data-panel]`，搜尋、新功能標籤、e2e 的 `openOptionsPanel` 都不用改；唯一改的既有斷言是選中分類的屬性從 `aria-selected` 換成 `aria-current`（`aria-selected` 不該用在一般按鈕上）。

**驗證**：新增 `tests/options-overview.test.js` 20 條（卡片與分類對應、進出詳細頁、網址直達與 popstate、儲存鈕只在該出現的分類、摘要各種狀態、提醒規則、未儲存提示與關頁攔截、存檔成功清除／失敗保留）。Jest 49 suites／821 tests 全過。真擴充（Chrome for Testing＋拋棄式 profile）跑互動腳本：淺色、深色各一輪，含 380px 寬無橫向捲動、搜尋跳轉、網址直達，頁面錯誤 0。e2e 全套 41 PASS／0 FAIL／4 PARTIAL（與改版前基準相同，4 項 PARTIAL 都是需要金鑰、連外或帳號的既有限制）。KAKA 實機看觀感仍在 `PLAN.md`。

## 2026-10-23 — Wikipedia 全文翻譯收集得到段落

**範圍**：`PLAN.md`〈實機測試發現〉的 Wikipedia 一條，只動 `content/page-translator-collector.js`。
- 原因：Wikipedia 載入後在 `<body>` 加 `uls-dialog-sticky-hide`，排除彈出視窗的規則 `[class*="dialog" i]` 往上找命中 `<body>`，整頁段落都被當成在對話框裡，面板只顯示「目前沒有新段落」。不分模型，全文翻譯、Shadow DOM 收集與單段翻譯都受影響（三者共用 `isPageTranslatableElement`）。
- 修法：class 名稱比對抽成 `isInsideOverlayLikeClass`，最近的命中是 `<html>` 或 `<body>` 時不算。段落外面若有真正的 modal／popup，`closest` 會先碰到它，照樣排除。`role`、`aria-hidden`、`nav` 等語意規則與字詞清單不變。

**驗證**：新增 4 條測試（body 帶 dialog、html 帶 modal 照樣收集；真正的 modal、cookie-popup 照樣排除）。兩個方向的突變各紅 2 條（拿掉例外紅「照樣收集」兩條、永不排除紅「照樣排除」兩條），還原後 SHA-256 一致；全套 48 suites／801 tests exit 0、0 skipped。e2e（p2 重載後逐組跑）：ui-panels 12/13（T4/T7 為既有失敗）、hostile-data 5/5、legacy-regression 16 PASS／4 PARTIAL、vocab-import 7/7。真 Chrome 156 對 Wikipedia「Supply chain」用內建翻譯：第一輪 5/5、繼續翻譯 6/6、0 錯誤。

## 2026-10-22 — 內建翻譯第一次下載模型不再逾時

**範圍**：`PLAN.md`〈實機測試發現〉的三條：首次下載整輪逾時、進度條倒退與卡住、`translate()` 錯誤是英文。
- 串流請求原本一律 30 秒逾時；收到 `download-start`／`download-progress` 後改成「5 分鐘沒有新進度才逾時」，每次進度重新計時。非內建翻譯仍是 30 秒（`background.js` 的 `ai-stream` 監聽）。
- `create()` 前先查 `availability()`，不是 `available` 就送 `download-start`；只用來延長逾時，不畫進度條（SW 的 availability 偏保守）。
- 同一組語言同時只建立一個翻譯器（`acquireBuiltinTranslator`）：後到的請求接上同一個下載、先補一次目前進度；建立時不帶請求的 signal，單一請求逾時或取消只放棄自己的等待（`waitWithSignal`），最後一個使用者用完才 destroy。
- `translate()` 失敗包成「瀏覽器內建翻譯失敗（來源 → 目標）：原因」。
- 一輪全文翻譯結束就收起下載進度條，失敗時不再卡在「正在下載翻譯模型 0%」（`hidePageTranslationDownloadProgress`）。

**驗證**：新增 7 條測試（`background` 6、`page-translator` 1），原本的進度事件測試改為先收到 `download-start`。七個突變各跑一次皆紅（下載不延長逾時、不送 download-start、不共用建立、取消不放棄等待、錯誤不包、一般逾時放寬、結束不收進度條），還原後 SHA-256 一致；全套 48 suites／797 tests exit 0、0 skipped。e2e（p2，先 `chrome.runtime.reload()` 確認是新版 background）：hostile-data 5/5、legacy-regression 16 PASS／4 PARTIAL、vocab-import 7/7、ui-panels 12/13——T4/T7 換回修改前的程式同樣失敗，另記 PLAN。真 Chrome 156 實測（目標語言暫改日文觸發新下載）：第一輪 4/4、繼續翻譯 7/7、0 錯誤。**未驗**：這次 en→ja 下載只花約 6 秒，超過 30 秒的長下載只有單元測試涵蓋。

## 2026-10-22 — PLAN 第 6 項結案：同類專案調研兩條線索都已實作

**範圍**：`PLAN.md` 原第 6 項〈同類專案調研的兩條待裁線索〉，兩條都已做完，從 PLAN 移除。
- **Chrome 內建 AI 翻譯** → 已做成內建翻譯 provider 與下載進度條（見 2026-09-21 兩條）；真實網頁人驗仍留在 PLAN 第 7 項。
- **自訂 OpenAI 相容端點**（`kiss-translator`／`MTranServer` 顯示是本品類標配，與 `check-models.js` 一個偵測、一個逃生）→ 已實作（見 2026-09-30）。

**保留的實測紀錄**（2026-09-20，Chrome 152，Mac；細節另見 memory `reference_chrome_builtin_ai_probe`）：
- en→zh-Hant 首次含下載 4.8 秒；模型就緒後 20 段批次 313 ms（15.7 ms/段），並行沒有加速；譯文為全形標點；磁碟增量約 776 MB（`df` 差值，不是純語言包大小）。
- MV3 service worker 對從未下載過的 en→ko 直接 `create()`，不需手勢就會下載（含下載 14.8 秒）；手勢限制只在一般網頁。SW 的 `availability()` 偏保守，要看 `create()` 結果。
- `downloadable` 不是承諾：下載 100% 後仍拋過 `NotSupportedError`，`create()` 失敗要當正常路徑處理並退回雲端 provider。
- 只能翻譯，做不到詞典結構化輸出與 optimize；Prompt API 在 Chrome 152 存在，但 KAKA 2026-09-20 裁決不驗。Edge 結果不外推 Chrome（Edge Beta 154 沒有 Prompt API、標點為半形）。

## 2026-10-22 — 浮球面板不再把面板名存進 Obsidian 週記

**範圍**：`PLAN.md`〈介面與操作體驗（續 3）〉浮球三面板假 `savedSel` 一條。
- 新增 `resultCardPanelMode` 旗標（`content/state.js`）。浮球「收藏 / 紀錄」「最近查詢」「單字本」三個面板開啟時呼叫 `setResultCardPanelMode(true)`，隱藏寶石鈕並收起 Obsidian 面板（`content/result-card.js`、`content/floating-ball.js`）。
- 從最近查詢還原一筆（`applyHistoryState`）或發出新查詢（`triggerAction`）時離開面板模式；寶石鈕回來，存入用的是真的原文（`content/main.js`）。
- `saveToObsidian` 在面板模式下直接不送出，防之後有其他入口繞過按鈕（`content/obsidian.js`）。

**驗證**：新增 5 條測試（`floating-ball` 4、`card-model-override` 1）。四個突變各跑一次皆紅（面板不設模式紅 3、存入不擋紅 3、還原不離開面板紅 1、新查詢不清旗標紅 1），還原後 SHA-256 一致；全套 48 suites／790 tests exit 0、0 skipped（主樹實跑）。e2e（`C:/tmp/ffb-qa/p2`）：最後一次完整跑 41 PASS／0 FAIL／4 PARTIAL，與修改前基準相同；同一份程式前兩次完整跑分別出現 7 個與 1 個 FAIL，失敗案每次不同（第二次只有 T8 收藏按鈕停在「收藏中」），四組分開跑全過，原因未查明，記為全量跑不穩定。實機三面板操作列入 `MANUAL-QA.md`，未驗。

## 2026-10-22 — 整版 review 遺留：多分頁術語表覆蓋、被刪動作復活

**範圍**：`PLAN.md`〈整版 review 遺留〉的前兩條，只動 `options.js`。
- 術語表在別處被改（其他設定分頁、設定檔匯入、雲端同步）：編輯器沒動過就換上最新內容並提示；動過就保留手上的內容並提示（`initGlossarySync`）。
- 存檔前再讀一次 storage，開頁後被別處改過且這頁也改了，就不寫術語表、其他設定照存，訊息講明術語表沒有存。自己寫入觸發的變更事件用 `glossaryPendingWrite` 認出來，不誤報（`writeGlossary`）。
- 編輯中的自訂動作在別處被刪：存檔時跳確認，選另存就用新 id 存成新動作，選取消就放棄編輯、不寫入（`saveActionFromEditor`）。

**驗證**：新增 6 條測試（`options-glossary` 4、`options-actions` 2）。五個突變各跑一次皆紅（不監聽紅 2、不比對 storage 紅 2、不認自己寫入紅 1、拿掉刪除檢查紅 2、不換新 id 紅 1），還原後 SHA-256 一致；全套 48 suites／785 tests exit 0、0 skipped（主樹實跑）。未驗：e2e、實機兩個設定分頁同時操作。

## 2026-10-19 — 合併前自審：補修 3 條，3 條記入 PLAN

**範圍**：`fix/review-data-loss` 合併前跑 `/code-review` 自審，找到 9 條；修掉這次修法帶進來或放大的 3 條。
- 損毀（非物件）的術語表存檔不再被當成空表匯出、清掉還原端的術語表（`options.js`，`278140f`）。
- 術語表讀取失敗時，頁面上方的儲存訊息改為錯誤樣式並講明術語表沒有存（`options.js`，`6b6b76c`）。
- 從最近紀錄還原時作廢進行中的請求，舊串流不再把還原的卡片蓋回原本的動作（`content/result-card.js`，`375989c`）。
- 多分頁編輯術語表互相覆蓋、編輯中被刪的自訂動作會復活、模型下架改跟隨主模型無提示：記入 `PLAN.md`〈整版 review 遺留〉。

**驗證**：修前各自實跑皆紅、修後皆綠；全套 48 suites／779 tests exit 0、0 skipped。

## 2026-10-19 — 整版 review 第三批：修 4 個低風險問題

**範圍**：同一輪 review 的低風險項，分支 `fix/review-data-loss`。
- 新手引導把自訂端點的金鑰也算進「已設定 API Key」（`welcome.js`，`b54cc00`）。
- 雲端上傳訊息與同步紀錄的一般設定數不再把術語表算成一個設定（`cloud-sync.js` `countCloudGeneralSettings`，`1b32a6d`）。
- 存過但清空的術語表也帶進設定檔與雲端，還原端跟著清空；從沒存過才不帶（`options.js` `buildSettingsBackupPayload`，`412dee4`）。
- 術語表或自訂端點網址／模型名稱改變時清空回應快取，不再拿舊譯法或舊端點的結果（`content/main.js`，`6f1220c`）。

**驗證**：新增 6 條測試，修前各自實跑皆紅（R-02 先只加計數函式，確認紅在計數 3≠2 而非函式不存在）、修後皆綠；全套 48 suites／775 tests exit 0、0 skipped（worktree 內實跑）。未驗：e2e、實機擴充、真雲端同步。

## 2026-10-19 — 整版 review 第二批：修 6 個功能出錯的問題

**範圍**：同一輪 review 的功能出錯類，分支 `fix/review-data-loss`。
- popup 快選不再列出只能全文翻譯的瀏覽器內建模型；選成主模型會讓選字翻譯、解釋、優化全部被拒（`popup.js`，`e20d16e`）。
- 匯入設定檔／雲端下載時，全文翻譯「跟隨主模型」（空字串）不再被補成預設 Groq（`options.js` `normalizeImportedSetting`，`ef213bf`）。
- 自訂動作圖示名稱是 `constructor` 這類物件內建屬性時退回預設圖示，不再讓動作清單渲染失敗（`content/custom-action-render.js`，`82a7f3c`）。
- 從最近紀錄還原後，換模型或改原文重查跑的是還原的那個動作，不再沿用還原前的動作（`content/result-card.js`、`content/floating-ball.js`，`dd7b0cc`）。
- 自訂動作編輯器帶 `hidden` 時真的隱藏；原本被 `.field` 的 `display: grid` 蓋掉，一直顯示（`options.html`，`201ad8b`）。
- 內建翻譯下載進度條的寬度改以 important 寫入，壓得過 `content.css` 的 `width: 0% !important`；原本長條永遠是 0（`content/page-translator-panel.js`，`a8d3072`）。

**驗證**：新增 9 條測試，修前各自實跑皆紅、修後皆綠；全套 48 suites／769 tests exit 0、0 skipped（worktree 內實跑）。進度條與編輯器另在瀏覽器以原始 CSS 實測：進度條修前 0px、修後 84px；編輯器帶 hidden 時 display 由 grid 變 none。未驗：e2e、實機擴充、真實內建翻譯下載。

## 2026-10-19 — 整版 review 第一批：修 4 個會讓使用者資料不見的問題

**範圍**：v1.11.1..master 整版 review（主 session 跨模組四個重點＋Codex 逐檔）找出的資料遺失類問題，分支 `fix/review-data-loss`。
- 自訂動作指定的模型被移出清冊後，讀取時整筆被略過、下次存檔就永久刪掉；改成模型退回跟隨主模型、動作保留（`custom-actions.js` `normalizeActionList`，`22f3319`）。
- 術語表載入失敗時按「儲存設定」會寫回空表；兩個設定頁同時開著時，只改模型的那頁會把另一頁剛存的術語蓋回舊表。改成讀取失敗不寫、內容沒改不寫（`options.js`，`b93f40e`）。
- 自訂動作編輯器存檔以開啟當下的快照為底，會撤銷編輯期間在別處改的釘選／順序；改以清單最新的同一筆為底（`options.js` `readActionEditorDraft`，`68ae480`）。

**驗證**：新增 5 條測試，修前各自實跑皆紅、修後皆綠；全套 48 suites／760 tests exit 0、0 skipped（worktree 內實跑）。未驗：e2e、實機設定頁。

## 歷史封存索引

母檔只保留近期紀錄；舊段整段搬進 `docs/archive/`，內容原樣保留不重寫。PLAN／MANUAL-QA／design.md 寫「見 `CHANGELOG.md` 2026-09-xx」的指標，內容在下列封存檔。

- [`docs/archive/CHANGELOG-2026-08_10-01.md`](docs/archive/CHANGELOG-2026-08_10-01.md) — 2026-08-25～2026-10-01，37 條＋`v1.10.x` 摘要
