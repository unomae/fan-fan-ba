# CHANGELOG — 翻翻吧

> 已結案的工作紀錄，新的在上。`PLAN.md` 只放「現在與下一步」，完成項搬來這裡。
> 更早的歷史脈絡在 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史。

## 2026-09-20 — body 層錯誤的 status 型別汙染（429 重試／404 備援靜默失效）

`background.js` 有三處寫 `err.status`：`checkedFetch` 給的是 `res.status`（一定是數字），但另外兩處直接把 body 層的 `error.code` 照抄進去——而 OpenAI 相容格式的 `code` 常是字串（`'429'`、`'model_not_found'`）。

下游兩個判斷都是嚴格比較：`isRetryable` 比 `=== 429 || === 503`、`shouldFallbackModel` 比 `=== 404 || 502 || 503`。所以只要錯誤是從 body 而不是 HTTP status 來的，**429 不會重試、404 不會切備援，而且完全不報錯**，外觀只是「翻譯失敗」。串流那處更直接：同一段上面已經算好 numeric `status` 拿去組訊息，寫 `err.status` 時卻寫回原值。

**修法**：兩處都 `Number()` 正規化存入 `err.status`，原始值另存 `err.code` 供診斷；串流那處改用它自己已算好的 `status`。轉不出數字時是 `0`，不假裝自己是某個 HTTP status。`shouldFallbackModel` 的判斷集合與 `checkedFetch` 未動。

**驗證**：新增 4 條回歸測試（numeric-string 404／429、非數字 code、串流 503）。**fail-then-pass**：退回修復時剛好只有這 4 條紅、既有 56 條全綠，還原後檔案 SHA-256 與修復版一致。全套 `npx jest --testPathIgnorePatterns '/\.claude/'` exit 0，27 suites／350 tests 全過、0 skipped；`npm run check-docs -- --verify` exit 0（文件 350＝實跑 350）。未跑 e2e：本次不碰 UI 或 DOM 路徑。

**未涵蓋**：非數字字串 code（`model_not_found` 這類）修完仍不觸發重試或備援，只是不再假裝成數字；要不要把它們對映成 HTTP 語意另列 PLAN 待裁決。真實 API 行為仍受「QA 不配 key」裁決限制，這輪全部是 mock 層證據。

## 2026-09-13 — onboarding checklist ＋ 補 Obsidian 前置條件（Sprint 2 結案）

Sprint 2 最後一項。原本 `welcome.html` 是三個純靜態 step、`welcome.js` 只有 10 行兩顆按鈕，沒有任何狀態——設完 API Key 回到這頁，它還是說你沒設。

**A：補 Obsidian 前置條件。** step 3 承諾「按寶石 💎 存入 Obsidian 週記」，但整頁**完全沒提要先裝 Advanced URI 插件**（設定頁提了兩次）。使用者照著做就是失敗。這不是體驗優化，是文件承諾了做不到的操作，所以先修。

**B：三個 step 顯示完成狀態。**

- step 1（API Key）與 step 2（用過一次）**自動偵測**：分別讀 `Storage.getSecrets` 與 `Storage.getDiagnostics`，都有現成的真實來源，問使用者反而不準。
- step 3（存 Obsidian）**使用者自己勾**、存在 `fanFanBaOnboarding`：diagnostics 只記 translate／explain／optimize／pageTranslations，沒有「存進 Obsidian 幾次」。單字本的 `exported` 旗標理論上可當代理指標，但那要向 background 要整份單字本，為一個提示性的勾不划算。
- 閉環的關鍵是 `visibilitychange`：使用者按「前往設定」填完 key 切回這頁，step 1 要自己翻成「已設定」。沒有這段，閉環就斷在「設完了但這頁還說你沒設」。

`welcome.html` 另外加載 `storage.js`（自動偵測需要），`welcome.js` 10 → 98 行。**沒做** C（設完 key 自動導回、附試翻譯）：要跨頁狀態與分頁協調，而分頁風暴正是舊 E2 spec 標過風險的地方。

驗證：`tests/welcome.test.js` 2 → 10 條；全套 336 → **346 全綠（27 suites）**；e2e 重新 package 後 41 PASS / 0 FAIL / 4 PARTIAL，PARTIAL 四項與基線相同。

e2e 不涵蓋 `welcome.html`，而這次動到 `<script src="storage.js">`——單元測試走 `require` 不經 script 標籤，載入錯了照樣綠。所以另外在**真擴充**裡開了一次 `chrome-extension://<id>/welcome.html`：`globalThis.FanFanBaStorage` 是 `object`（storage.js 真的載到）、全新安裝三格皆未完成、塞入 key 後派 `visibilitychange` → step 1 自己翻成「已設定」、step 3 勾完重載仍記得、Advanced URI 連結在頁上、**零頁面錯誤**。

過程中測試抓到我兩個錯，都不是產品的：

1. **`refreshSteps()` 在 storage 失敗時會 unhandled rejection**，頁面載入就炸——違反我自己寫的「onboarding 頁壞掉不該擋住使用者」。加 try/catch 後全部顯示未完成，並補一條測試鎖住「不得 reject」。
2. **「切回分頁會重新偵測」那條測試原本是假的**：它自己手動補呼叫了 `refreshSteps()`，所以把 `visibilitychange` listener 整段拿掉照樣 10/10 綠。改成只派事件、不手動補呼叫之後，同樣的突變就紅了。另補一條「分頁隱藏時不重算」。

突變驗證兩組，各只紅該紅的：拿掉 `visibilitychange` → 只紅切回分頁那條；step 1 偵測改恆真 → 紅 3 條。

（jsdom 環境沒有 `setImmediate`，flush 用 `setTimeout`；這是本 session 第二次踩 jsdom 缺 Node 全域，第一次是 `ReadableStream`。）

## 2026-09-13 — 單字本匯出改用 CSV，撤掉 XLSX

設定頁的「匯出 XLSX」換成「匯出 CSV」，14 欄不變。

**為什麼換**：XLSX 那條路是手寫的 OOXML＋ZIP（含自寫 CRC32），`vocabulary-backup.js` 裡 165 行都在做這件事，而它唯一的優勢——「Excel 開得起來」——CSV 也做得到。更關鍵的是公式注入防護：CSV 這邊早就有 `escapeVocabularyCsvCell`（2026-08-13 TC-F3-004 抓到後補的），還有 e2e 鎖著；XLSX 那邊則一直懸著。

順手釐清一個 repo 內的矛盾：`MANUAL-QA.md` 舊有一句「XLSX 匯出無此問題：`buildXlsxWorkbook` 以 `t="inlineStr"` 寫格，Excel 一律當字串」，但 Sprint 2 清單同時把「XLSX 公式防護」列為待辦、`MANUAL-QA.md` 也留著一格未勾的公式防護驗收。兩邊對不上。實際情況是那句推論**沒有拿真 Excel 驗過**，只是依 OOXML 規格推的。換成 CSV 之後這題不必再判。

**BOM 是必要條件不是裝飾**：少了它 Excel（尤其 Windows 版）會用系統 ANSI 解讀，中文欄位直接亂碼。`buildVocabularyCsv` 固定輸出 `\ufeff` 開頭＋CRLF 行尾。

**定位沒變**：CSV 跟原本的 XLSX 一樣是**單向、lossy 的檢視格式**，不是備份。要還原一律用 JSON，所以 CSV 匯出不會蓋「已備份」的章。另外浮球面板的「複製今日 CSV」是不同東西（8 欄、只有今天、複製到剪貼簿），這次沒動它。

**公式防護有兩份實作**：MV3 下 content script 與 options 頁不共用模組，把 `vocabulary-backup.js` 掛進 `<all_urls>` 的 content_scripts 只為共用 5 行 regex 並不划算。改用測試防漂移——新增一條交叉比對，拿 17 個惡意／邊界樣本斷言 `escapeCsvCell` 與 `escapeVocabularyCsvCell` 輸出完全相同，任一邊被改、另一邊沒跟上就紅。

驗證：`vocabulary-backup.js` 327 → 210 行。全套 333 → **336 全綠（27 suites）**；重新 `npm run package` 後 e2e **41 PASS / 0 FAIL / 4 PARTIAL**，PARTIAL 四項與基線相同。

實際產出的 CSV 逐項檢查過：前三 byte 是 `ef bb bf`、行尾 CRLF、14 欄、中日文完好、`=cmd|' /C calc'!A0` 與 `+SUM(A1)` `@handle` `-1` 都補了 `'`、`航運專欄, 第二篇` 被引號包住、內含雙引號 double 成 `""`。

突變驗證三組，每組都只紅該紅的：①防護漏掉 `@` → 公式測試＋漂移比對同時紅 ②把引號包裹搬到補前綴之前 → 順序鎖＋漂移比對紅（順序反了會得到 `"=with,comma"`，引號包住了但開頭仍是 `=`，試算表照樣當公式）③寫測試時我自己把期望值猜成「該格會被引號包起來」，測試直接紅——那格沒有逗號所以不該有引號，是我猜錯不是程式錯。

**未驗**：沒有真的用 Excel／Google Sheets 開過。

**同日後續（KAKA 裁決：遠端開不了 Excel，改自動驗 CSV）**：

- `MANUAL-QA.md` 原本那兩格人工驗拆成兩格——**檔案結構改為自動驗並已勾**（BOM／CRLF／14 欄，外加以**獨立寫的 RFC4180 解析器 round-trip**確認含逗號／雙引號／換行的值不會讓欄位錯位）；**「Excel／Sheets 實際渲染」另立一格、刻意不勾**，並寫明不得用前一格代替（自動驗過 ≠ 人眼驗過）。
- `qa-reports/scripts/run-phase1-2.js` 的 TC-B4-002 從斷言 zip magic `504b` 改成驗 CSV 的 BOM／CRLF／表頭欄數。
- round-trip 那條測試花了三次才真的會做事：①第一版的樣本值同時有逗號＋引號＋換行，引號包裹因逗號而觸發，「漏判 `\n`」的突變驗不出來 ②補了「只有換行」的樣本仍抓不到 ③根因是我那個「獨立解析器」只在 `\r\n` 斷列，裸 `\n` 被當欄位內容還原回去，比真實試算表寬容。改成 CRLF／裸 LF／裸 CR 都斷列後，同樣的突變就紅了。

`qa-reports/specs/` 與 `archive/` 的歷史紀錄一併保留原文。

## 2026-09-12 — release 打 tag（手動觸發）

repo 至今零 tag。新增 `.github/workflows/release-tag.yml`，`workflow_dispatch` 手動觸發。

**刻意獨立成一個 workflow 而不是塞進 `ci.yml`**：`ci.yml` 的 `workflow_dispatch` 是用來手動跑 e2e 的，混在一起會變成「每次想跑 e2e 都順便打 tag」。

**範圍只有打 tag**：不建 GitHub Release、不附 zip、不上傳 Chrome Web Store。送審仍照 `STORE-SUBMISSION.md` 由人執行。

三道前置，任一不過就停在打 tag 之前：

1. `manifest.json` 與 `package.json` 版本必須一致（manifest 才是擴充的真實版本）。`npm run package` 也 assert 這件事，但打 tag 不該依賴它有沒有跑過。
2. 同版本已有 tag 就停，**不自動覆蓋**——要重打得先手動刪。
3. Jest 全套＋打包 smoke 要過。tag 是「這顆 commit 就是 vX.Y.Z」的宣稱，不該落在紅的 commit 上。

驗證：run `34675582519` 八步全綠，`v1.11.1` 已在 origin 且指向 `c7d0cd3c`＝當時的 master HEAD。反向也驗了——同一個 workflow 再 dispatch 一次（run `34675617101`）在第 2 道前置就紅，訊息是「v1.11.1 已經存在。要重打請先手動刪掉那個 tag」，**沒有走到打 tag 那步**。

注意 `v1.11.1` 這顆 tag 落在 2026-09-12 這批修改之後的 HEAD 上，不是「版本號被設成 1.11.1 的那一刻」——repo 先前沒有任何 tag，所以也沒有更合適的歷史 commit。要移到別的 commit 就刪掉重打。

## 2026-09-12 — 抽 resolveRoute()，消 AI 路由雙軌

`_handleAIRequest`（非串流）與 `_streamAIRequest`（串流）各有一段約 30 行、逐字相同的 provider if 鏈：判斷 `groq:` / `openrouter:` 前綴、挑對應金鑰、組 `baseUrl`、給 `label`，無前綴落到 Gemini。差別只在後面接哪個執行器。

抽出 `resolveRoute(selectedModel, keys)` 當**路由決策的唯一正本**，回傳 `{kind:'openai-compat', modelId, apiKey, baseUrl, label, extraHeaders}` 或 `{kind:'gemini', apiKey, model}`，兩軌各自照 `kind` 分派。

**刻意只抽決策、不抽執行器**：串流與非串流的執行器（`handleWithModelFallback` / `streamWithModelFallback` / Gemini 自有 request body）差異是真實的，硬合成一個函式只會換來一堆旗標。

動工前先發現一件事改了順序：**串流軌原本零單元測試覆蓋**（`streamAIRequest` 在 `tests/` 完全沒出現），`provider-endpoints.test.js` 只鎖了非串流那半。重構沒有護欄的路徑等於碰運氣，所以**先補 4 條串流軌 URL 鎖再抽**。另外 `resolveRoute` 抽出後也補了 4 條直接測，其中「缺金鑰各自拋哪句」原本零覆蓋——那三句是使用者真的會看到的字，改壞不會有任何測試變紅。

驗證：全套 325 → **333 全綠（27 suites）**；e2e 重新 `npm run package` 後跑 **41 PASS / 0 FAIL / 4 PARTIAL**，連 PARTIAL 的四項都與基線相同＝真實擴充層面零行為改變。

突變驗證做了兩組。①把 groq 的 `baseUrl` 換成 OpenRouter 的：**重構前只紅 1 條**（串流那條），**重構後紅 2 條**（兩軌一起）——這正是決策真的共用了的證據。②把 `if (!groqApiKey)` 改成 `if (false)` 讓守衛永不觸發：缺金鑰那條紅，其餘 11 條不動。

踩到一個測試腳手架的坑：jsdom 環境沒有 `ReadableStream`，串流鎖第一次寫成真串流會四條全紅（看起來像產品回歸，其實是環境）。改成只提供 `getReader()`／`read()`／`cancel()` 的最小假物件即可——URL 與 header 的斷言讀的是 `fetch.mock.calls`，跟 body 長什麼樣無關。

## 2026-09-12 — migrationPromise 一次失敗不再永久壞掉

`storage.js` 的 `migrateSecretsFromSync()` 用 `if (migrationPromise) return migrationPromise;` 快取結果，但**失敗的 promise 也被快取**。所以一次暫時 IO 錯誤之後，每個後續呼叫都拿回同一顆 rejected promise，壞到使用者重載擴充為止。

影響範圍比原風險條目寫的「掛掉全部翻譯」更大：`getSecrets` 有 8 個呼叫點——翻譯的串流與非串流兩條路、popup 兩處、TTS、設定頁三處（含備份加密）。

修法是 `.catch` 裡把 `migrationPromise` 清回 `null` 再 rethrow：下次呼叫重跑 migration，而同一批已在 `await` 的呼叫者仍會收到這次的 rejection（不靜默吞掉）。

驗證：先用注入「只失敗一次」的 IO 錯誤實跑重現——修復前第 1／2／3 次全部失敗，修復後第 1 次失敗、第 2／3 次成功。回歸測試 `tests/storage.test.js`〈一次暫時失敗後允許重試〉走完 fail-then-pass：加上去時**只有它變紅**（1 failed／7 passed），修完 8 passed。全套 324 → **325 全綠（27 suites）**，`check-docs --verify` 文件與實跑都是 325。

## 2026-09-12 — e2e 45 案接進 workflow_dispatch job

`npm run e2e`（真 Chromium ＋ 真擴充）原本只能在本機手動跑，而且每台機器要做一次人工前置（開拋棄式 profile、到 `chrome://extensions` 手動載入未封裝）。本次接成 `ci.yml` 的 `e2e-extension` job，`if: github.event_name == 'workflow_dispatch'` 守衛——要下載瀏覽器、要 headed、一輪一分多鐘，不適合綁每個 PR。

三個環境障礙的處置：

- **瀏覽器**：`playwright-core` 不自帶 browser，用它的 CLI 裝 Chrome for Testing。**必須是 Chrome for Testing**——品牌版 Chrome 137 起封鎖 `--load-extension`，走不了自動安裝那條路，只能回去人工點。
- **擴充 ID**：unpacked 擴充 ID＝`SHA256(載入路徑)` 前 16 bytes、hex 的 `0-f` 映射到 `a-p`，**路徑一換 ID 就換**，所以不能沿用 `e2e/README.md` 的預設值（那是 Windows 正本路徑算出來的）。job 改成依 checkout 現算。
- **display**：harness 固定 `headless: false`（MV3 擴充在 headless 下不載入），所以 xvfb 是必要條件，不是保險。

驗證：ID 算法先拿已知配對驗——Windows 正本路徑以 **UTF-16LE** 算出的正好是 README 那個預設值 `cegcbfkg…`；POSIX 改用 UTF-8，本機 Mac 實跑 `ui-panels` 得 13 PASS／0 FAIL，證明現算的 ID 真的載得起擴充。CI 實跑 run `34667362915`：**41 PASS / 0 FAIL / 4 PARTIAL（共 45 案）**，與本機基線相同，且 log 裡的 ID `nhednlmlkmjkn…` 正是事先算出來的那顆。紅的路徑也驗過：故意塞錯 ID → harness 在 probe 階段拋錯 → `run.js` `process.exit(crashed || fail ? 1 : 0)` 回 **1**，CI 會紅。

注意 **PARTIAL 不會讓 job 紅**，這是刻意的：那 4 案分別卡在需要 API key（3 案）與需要連外到 `accounts.google.com`（1 案），維持 2026-08-14「QA 不配 key」裁決；`FFB_E2E_ALLOW_NET` 不設。**e2e 全綠不等於可以送審**，人工項仍照 `MANUAL-QA.md`。

Sprint 2 該項剩「release 打 tag」未做。commit `98210e5`。

## 2026-09-12 — 兩支 lint 接進 CI gate

`check-docs` 與 `check-models` 2026-09-09 就做好了，但**沒接進任何自動關卡**，等於還是靠「作者記得跑」——一個沒人跑的 lint 和沒有 lint 沒兩樣。本次接進 `ci.yml` 的 `test-and-package` job，共 4 個 step：

- 兩支各自先跑 `--selftest`（離線）。gate 自己壞掉卻還回 0，比沒有 gate 更糟，所以自測擺在實跑前面。
- `check-docs` 用 `--verify` 而非預設模式：預設只比對文件彼此，9 處一起過期它抓不到；`--verify` 實跑 jest 取真實數字再比對（腳本檔頭本來就指定此模式給 CI 用）。CI runner 上 jest 約 5s，多跑一次可接受。
- `check-models` 的 `exit 1`（真下架）與 `exit 2`（未檢）都讓 CI 紅。刻意不把 2 併進 0——那會讓「網路掛掉」和「模型都在」在 CI 上長得一樣。

驗證：本機 `check-docs --selftest` 9/9 PASS、`check-models --selftest` 7/7 PASS，兩支 exit 0；`check-docs --verify` exit 0（文件 27 suites／324 tests 與實跑一致）；`ci.yml` 以 js-yaml 解析通過、9 steps。GitHub Actions run `34631926072` **9 步全綠、21s**，log 確認 `--verify` 真的跑了 jest（12.29s→17.41s）並印出對照結果、`check-models` 真的抓到線上 443 顆清單，不是假綠。commit `a60f2f4`。

未涵蓋（刻意）：Groq／Gemini 清單端點需金鑰，維持 2026-08-14「QA 不配 key」裁決，**預設模型仍蓋不到**。另外 `check-docs` 只認標記，**新增的現況宣稱若忘了加標記，lint 看不見它**——這是設計如此（見 `PLAN.md` 驗證指令速查末段），不是本次留下的缺口。

## 2026-09-09 — 模型清冊防呆＋OpenRouter 下架對賬

清冊原本零保護：`popup.test.js` 只驗 `MODELS.length > 0`，少一顆、改 id 或改顯示名，全部測試照樣綠——而模型無預警下架是本專案的常態風險（2026-08-14 一次死兩顆、Groq 兩個 llama 08-16 也下架）。

- `tests/models-registry.test.js` 新增〈模型清冊完整性〉：四顆的 id／顯示名／provider／備援登記逐一寫死，順序也鎖（popup 依此順序渲染選項）。
- `tests/popup.test.js` 改成比對同一份四顆清單。
- 新增 `scripts/check-models.js`（`npm run check-models`）：對 OpenRouter 公開 `/v1/models` 做離線對賬。exit `0` 通過／`1` 有下架／`2` 未檢，三態刻意不合併——把「網路掛掉」併進 0，在 CI 上會跟「模型都在」長得一模一樣。
- 過程修掉一個自釀的坑：原本用 `process.exit()`，Win 上 fetch 的 undici handle 還在關閉時會噴 libuv assertion 並把 exit code 蓋成 127（輸出正確但 CI 讀到垃圾碼）。改用 `process.exitCode`。

驗證：單元測試 318 → **324 全綠**（27 suites）。fail-then-pass 實測刪掉 Flash-Lite 後**正好 3 條新斷言變紅、其餘 21 條全綠**。`check-models` 三條 exit 路徑全部反向驗過（實跑得 0／塞不存在的 id 得 1／改成連不上的 host 得 2），`--selftest` 7/7 PASS。實跑對到 431 顆線上清單，兩顆都在架上。

未涵蓋：Groq 與 Gemini 的清單端點都需金鑰，依 2026-08-14「QA 不配 key」裁決不做，**故預設模型蓋不到**（6 個 id 只鎖住 2 個）。commit `41ab9b5`。

## 2026-08-26 — Sprint 1 上架 blocker（5/6）

- API key 改 header 傳送（Gemini/TTS 三處＋`options.js` 測試連線，e2e §5-3 同步驗證通過）
- Obsidian 匯出假成功修正（`vocabulary.js` 失敗不蓋 `obsidianExportedAt`，含回歸測試）
- popup 模型清單 a11y（div→button `role=radio`）＋工具列按鈕 `aria-label`
- `privacy-policy.html` 權限表補 `unlimitedStorage`；`store-listing.md` 版號改佔位符
- 文件校正輪：README badge／權限敘述、`TESTING.md` 測試數、e2e README `--load-extension` 描述

第 6 項「1280×800 截圖產出」需人工，仍在 `PLAN.md`。單元測試 318 全綠。2026-08-27 自 ox-sandbox 併回正本並 push（cherry-pick 5 筆，`5007074`..`f725b43`）。

## 2026-08-26 — 真瀏覽器 e2e 首輪全綠

Playwright 驅動真 Chrome ＋ 真擴充，45 案＝**41 PASS / 0 FAIL / 4 PARTIAL**；4 個 PARTIAL 全是無 key 或需外部帳號的項目。§5-2 新契約驗過。

跑 e2e 的操作細節與踩雷（擴充 ID 由載入路徑雜湊產生等）在 `e2e/README.md`。

## 2026-08-26 — Ox Alpha 四路全面審查

code review（30+ 項）、UI/UX（30 項）、使用者與開發流程（A1-A6＋B1-B5）。總評＝工程底子前段班，上架 blocker 集中在安全 P1×2、a11y、上架材料。產出 Sprint 1-3 優化路線圖，發現已併入 `PLAN.md` 的「下一步」與風險表。

## 2026-08-25 — UI 清不掉目前模型 API Key

`options.js` 清空欄位＋confirm 即移除；3 條回歸測試＋反向驗；e2e legacy §5-2 改鎖新契約。正本 commit `5007074`（原 sandbox `c20639f`）。

## v1.10.x

WS-E mirror-only cutover（Tier 1 六案 6/6 PASS）、CSV 公式注入防護（v1.10.1）、半接線 6 條接線完工。
