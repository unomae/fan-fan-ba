# CHANGELOG — 翻翻吧

> 已結案的工作紀錄，新的在上。`PLAN.md` 只放「現在與下一步」，完成項搬來這裡。
> 更早的歷史脈絡在 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史。

## 2026-10-01 — 單字卡四級評分

**範圍**：單字本「今日複習」的「記得／還不熟」兩顆改成「忘了／吃力／記得／很熟」四顆，排程改用簡化 SM-2；每顆按鈕滑過去顯示幾天後再複習。其他分頁的「我記得了／還不熟」切換保留。

**做法**：
- 排程（`content/vocabulary.js`）：新增欄位 `ease`（預設 2.5、下限 1.3）、`intervalDays`（上限 365 天）、`reps`。忘了：重來、隔天、ease −0.2；吃力：間隔 ×1.2、ease −0.15；記得：第一次 1 天、之後 ×ease（至少多 1 天）；很熟：第一次 4 天、之後 ×ease×1.3、ease +0.15。`nextReviewAt` 一律等於 `reviewedAt` 加 `intervalDays` 天。
- `status` 跟著這次評分走：忘了／吃力＝還不熟，記得／很熟＝已記得，所以「已記得／還不熟／錯題回看」篩選仍是「上一次複習的結果」。列表上的切換改成套用舊資料的對照值（已記得 7 天、還不熟 1 天），ease 保留。
- 舊資料：只有 `status` 的條目在讀取時才推導初始值（learning → 1 天、reps 0；known → 7 天、reps 1；ease 2.5），**不批次改寫 storage**，第一次評分才寫回。存著的三欄只有在「`nextReviewAt` − `reviewedAt` 剛好等於 `intervalDays`」時才採用；尚未升級的裝置只會改 `status` 與兩個日期、把三欄原樣留著，日期對不上就改回 `status` 對照值（ease 沿用）。
- 資料層：`vocabulary-backup.js` 的合併與 `vocabulary-store.js` 的 cutover 都是整筆跟著勝方，邏輯不用改，只補測試鎖住三欄跟著 `status` 等複習欄位一起走、不各自取新，勝方沒有的欄位也不會從敗方補過來。完整 CSV 匯出加 `ease`、`intervalDays`、`reps` 三欄（14 → 17 欄），沒評過分的舊條目留空；浮球「複製今日 CSV」8 欄不變。單字本仍只存本機、不進雲端同步，資料流向沒變。

**刻意變更的既有測試**：`floating-ball.test.js` 錯題回看那條改驗四顆按鈕與「很熟」寫回；`vocabulary-backup.test.js` 的 CSV 表頭與 round-trip 改成 17 欄；`render-parity` 基準檔只替換 `vocab-panel` 一個情境（今日複習的按鈕換了；其他 16 個情境不動）；e2e `legacy-regression` §6-2／§6-3 改成點「記得」與「忘了」並驗評分欄位，條數不變；`e2e/README.md` 陷阱說明改成 `[data-review-grade]`。

**驗證**：
- 新增 13 條：`tests/content/vocabulary.test.js` 8 條（舊資料推導、欄位與日期對不上時退回、從還不熟與已記得各按四級、ease 下限與間隔上限、寫回與日期、列表切換、按鈕提示天數）、`tests/vocabulary-backup.test.js` 4 條（三欄跟著勝方、勝方沒有不補、JSON 匯出入不掉欄位且型別不變、CSV 三欄）、`tests/vocabulary-store-cutover.test.js` 1 條（cutover 兩方向）。
- 全套 48 suites／754 tests exit 0、0 skipped（worktree 內實跑）。
- **fail-then-pass**：十四個突變，十三個變紅、還原後 SHA-256 一致——已記得對照成 1 天（紅 5）、日期對不上仍信任欄位（紅 1）、忘了不重設 reps（紅 1）、很熟少乘 1.3（紅 2）、ease 沒有下限（紅 1）、間隔沒有上限（紅 1）、吃力算已記得（紅 2）、列表切換重設 ease（紅 1）、合併時 ease 各自取（紅 2）、備份正規化掉欄位（紅 3）、CSV 少一欄（紅 3）、cutover 勝出時丟欄位（紅 1）、按鈕一律送「記得」（紅 1）；「`reviewVocabularyEntry` 不擋未知評分」沒變紅——排程函式本身就會擋，那行是多餘的，已拿掉。
- 實機（Windows、Chromium 1161、真擴充、全新拋棄式 profile）：塞四筆只有 `status` 的舊格式單字，今日複習每張卡四顆按鈕的提示天數與單元測試一致（還不熟 1／1／1／4、已記得 1／8／18／23）；四個字各按一級，寫回的 status／ease／intervalDays／reps 與距今天數都符合預期，按完全部離開今日複習，錯題回看剩「忘了」與「吃力」那兩個；390px 寬加深色模式四顆排成一列、畫面不左右捲動；console 0 錯誤。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同（§6-2／§6-3 是改過的新斷言，實跑通過）。

**未驗**：真的從舊版升級（實機是直接塞舊格式資料，不是裝舊版再升級）；Mac 實機；匯出 CSV 用 Excel 開。列入 `MANUAL-QA.md`「單字卡四級評分」。

## 2026-10-01 — 模型比較頁

**範圍**：設定頁新增「模型比較」分頁：輸入一段文字（最多 2000 字）、勾選要比的模型，按「開始比較」同時送出，並排顯示各模型的譯文與耗時；單一模型失敗只影響自己那張卡片。

**做法**：
- 可比較的模型：只列已儲存金鑰的模型（自訂端點還要網址與模型名稱都填好），加上免金鑰的瀏覽器內建翻譯。判斷抽成 `ModelRegistry.isModelConfigured()`，結果卡「僅本次」選單（`getAvailableCardModelIds()`）改用同一個函式，行為不變。切進這個分頁時重新列一次（金鑰可能剛在別的分頁改過），保留原本的勾選。
- 送出：每個模型一個既有的 `GEMINI_REQUEST`，帶單次模型（`modelOverride`）與 `pageTranslation: true`（非批次）。這樣所有模型都拿到同一份段落翻譯 prompt，只接受全文翻譯模式的內建翻譯也能一起比；目標語言用「語言與朗讀」目前的選擇。background 未改：來源檢查與驗證照舊，術語表沒有限定網站時照常套用（設定頁不在任何網站清單內），內建翻譯不套用。
- 顯示：全部同時送出，每張卡片收到自己的結果就更新（耗時、備援模型提示、譯文），不等其他模型；回錯誤或丟例外都只把那張卡片標紅。模型回傳的內容一律當文字。比較進行中按鈕停用，再按不會重送。不寫查詢紀錄；本機診斷次數會算進「全文翻譯」。

**刻意變更的既有測試**：`options-search-badges.test.js` 的標籤清單多一個 `panel-compare`，斷言不變。

**驗證**：
- 新增 `tests/options-compare.test.js` 11 條（`isModelConfigured` 各供應商、沒金鑰只列內建、未設金鑰不列、自訂端點要網址與模型名稱、重列保留勾選、並行送出與先回先顯示、請求帶全文翻譯模式與目標語言、錯誤與例外各自標紅其他照常、HTML 只當文字、空輸入與沒勾模型、進行中不重送、background 接受內建翻譯當單次模型）。
- 全套 48 suites／741 tests exit 0、0 skipped（worktree 內實跑）。
- **fail-then-pass**：七個突變各跑一次全部變紅、還原後 SHA-256 一致——改成逐一送出（紅 1）、列出所有模型（紅 3）、例外不攔（紅 1）、不用全文翻譯模式（紅 1）、自訂端點不檢查網址（紅 2）、進行中可重送（紅 1）、輸出當 HTML（紅 1）。
- 實機（Windows、Chromium 1161、真擴充、全新拋棄式 profile，沒有金鑰）：只列「瀏覽器內建翻譯」；沒文字時提示「請先輸入要翻譯的文字。」；勾內建翻譯送出，請求經真的 background 回來，這版 Chromium 沒有 Translator API，卡片標紅顯示「此瀏覽器不支援內建翻譯」、狀態「完成：0 個成功、1 個失敗。」；390px 寬沒有橫向捲動；console 0 錯誤。分頁標章原本寫「不寫入任何紀錄」，但本機診斷次數會累加，改成「不存進查詢紀錄」。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**隱私權政策**：資料表「選取的文字…」那列補上「（或使用者在設定頁「模型比較」輸入的文字）」（KAKA 決定補，另一個 commit）。

**未驗**：**未以真實模型驗證**（測試 profile 沒有金鑰）——多家模型實際並排、耗時、錯誤金鑰只影響一家，列入 `MANUAL-QA.md`；內建翻譯成功的情況（本機 Chromium 不支援）；Mac 實機。

## 2026-10-01 — 術語表

**範圍**：設定頁新增「術語表」分頁：一列一筆原文、譯文、備註，加上生效網站清單（空＝全部網站）。翻譯選取文字與全文翻譯時，只把這段文字裡實際出現的術語附給模型。CSV 匯入匯出；跟著設定檔匯出與雲端同步。

**做法**：
- 新共用模組 `content/glossary.js`（background `importScripts`、設定頁 `<script>`；放在 `content/` 是因為打包本來就整個收錄該資料夾，不用動打包清單；content script 本身不載入）：正規化（缺原文或譯文的列略過、原文不分大小寫重複留第一筆、上限 500 筆、網站 50 個）、網站比對（主機相同或其子網域；`notexample.com`、`example.com.evil.io` 不算）、命中篩選（不分大小寫；拉丁／希臘／西里爾字母與數字要落在詞界，與字典例句加粗同一套規則；中日韓不檢查詞界；長的優先、最多 30 條）、CSV。
- background：網站範圍用訊息來源分頁的網址判斷（`getSenderPageUrl()`，iframe 內選字算外層網站），**網址只在本機比對、不進 prompt**；content 端不用改。`loadRequestGlossary()` 只在 `translate` 讀術語表，非串流與串流兩條路都接；瀏覽器內建翻譯在讀術語表之前就分流出去。全文翻譯批次只比對 JSON 裡的 text，`id`、`text` 這些鍵不會被當成原文。
- prompt：三種翻譯 prompt（單字字典、段落、全文翻譯批次）在網頁內容框之前多一段「使用者的術語表」，一行一筆「原文 → 譯文（備註）」，每項壓成單行、去控制字元。**沒有命中時是空字串，prompt 與改版前逐字相同**（既有逐字比對測試不動）。
- 設定頁：表格編輯器（新增一列、刪除、刪到最後留一列空白），按「儲存設定」時驗證：缺原文或譯文、原文重複、看不懂的網站、超過上限都擋下，切到術語表分頁並標紅該列（改過那列就先拿掉紅框）。還沒從 storage 讀完就不寫，免得用空表蓋掉。CSV 匯入接在現有列後面（原文重複的保留先前那筆、缺欄位的列略過並說明；上限 1MB），按儲存才生效；匯出用單字本同一個 `escapeCsvCell` 做公式注入防護，匯入時拿掉這個防護補上的前導單引號。
- 同步與備份：存 `chrome.storage.local` 的 `glossary`。設定檔匯出時有內容才帶，匯入時整份取代；雲端上傳把它放進 settings 一起上傳，下載時雲端檔有術語表才覆寫本機（舊版上傳的檔案沒有，本機術語表不動）。設定頁的同步範圍、設定檔說明文字都補上術語表。新分頁標「新增」（沿用新功能標籤）。

**刻意變更的既有測試**：`options-search-badges.test.js` 的標籤清單多一個 `panel-glossary`；`options-actions.test.js`、`options-feature-models.test.js` 加 `beforeAll` 預熱（見下方驗證），斷言都不變。

**驗證**：
- 新增 `tests/glossary.test.js` 16 條（正規化、網站比對、命中篩選與詞界、批次只比對 text、CSV 公式防護與往返）、`tests/glossary-request.test.js` 14 條（三種 prompt 帶術語、位置、沒命中逐字相同、解釋／優化不帶、控制字元、只附命中、網站範圍、非翻譯不讀、讀取失敗不擋、非串流與串流實際送出的 prompt、內建翻譯不讀不套用、來源網址）、`tests/options-glossary.test.js` 17 條（載入、增刪列、儲存、四種驗證錯誤、CSV 匯入與重複、1MB、匯出防護、空表、設定檔匯出入、雲端上傳不含金鑰、雲端下載有／無術語表）。
- 全套 47 suites／730 tests exit 0、0 skipped（worktree 內實跑，另以 `--clearCache` 冷快取跑一次也全綠）。
- **fail-then-pass**：十一個突變——不檢查詞界（紅 2）、網站範圍一律生效（紅 4）、批次不抽 text（紅 1）、匯出不做公式防護（紅 3）、匯入不拿掉防護單引號（紅 1）、翻譯以外也讀術語表（紅 1）、串流不帶術語（紅 1）、雲端上傳不含（紅 1）、雲端下載忽略（紅 1）、編輯器不擋重複（紅 1）都變紅，還原後 SHA-256 一致；「所有動作都加術語表區塊」沒變紅——只有翻譯的 prompt 用到這段，那個 `action === 'translate'` 判斷是多餘的，已拿掉。
- 加完術語表後全套平行跑時，`options-actions`、`options-feature-models` 的第一條各逾時一次（`options.js` 變大，冷快取下第一次 require 超過 5 秒），兩檔比照前一則加預熱，之後冷快取全套也綠。
- 實機（Windows、Chromium 1161、真擴充、全新拋棄式 profile）：background 實際載入 `content/glossary.js`；缺譯文時顯示「術語表：第 1 列缺譯文」，補上後紅框消失；匯入 3 筆、儲存後 storage 有 4 筆與網站、重新整理後仍在；在真的 service worker 呼叫 `loadRequestGlossary`：網站範圍內挑出 lead time 與 MOQ、範圍外與解釋都是空的；390px 寬沒有橫向捲動；console 0 錯誤。第一次截圖修了三處：紅框不會自己消失、底部說明被擠成半寬、網站欄的焦點樣式。測試 profile 沒有金鑰時按儲存會先問要不要移除主模型的金鑰（既有行為），術語表要按「確定」才會存。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：**未以真實模型驗證**——模型是否照術語表翻、全文翻譯整頁套用的效果，列入 `MANUAL-QA.md`；Mac 實機；雲端同步真的上傳下載（只有 mock）。隱私權政策另一個 commit 更新（文字經 KAKA 核准）：資料表新增「術語表」一列（命中的術語會送到使用者選的 AI 服務、網址不傳送、隨設定檔與雲端同步），雲端同步用途與兩處「只同步一般設定」補上術語表。

## 2026-10-01 — 設定頁搜尋＋新功能標籤

**範圍**：設定頁左側頂端新增搜尋框，⌘K／Ctrl+K 從頁面任何地方聚焦。新功能與更新過的內建動作顯示「新增／已更新」標籤，使用者點過該項後消失。

**做法**：
- 搜尋（`options.js`）：每次輸入時從 DOM 現場收集各分頁的分頁名稱、h2／h3、欄位標籤（`label`、`.field-label`）與功能說明清單，所以動態產生的列（例如功能 × 模型對照表的動作列）也找得到；關著的動作編輯器內容不收。不分大小寫，以空白分開的每個詞都要出現，開頭就符合的排前面，最多 8 筆。可搜尋文字會去掉新功能標籤、「必填／選填」提示與分頁上的數字。選中後切到該分頁（分頁切換抽成 `activateSettingsPanel()` 共用）、捲到所在區塊並高亮 2 秒；欄位標籤會把焦點交給對應的輸入框。上下鍵選、Enter 跳、Esc 清空；搜尋框是 combobox、結果是 listbox。
- 標籤：設定頁上的位置直接寫在 `options.html`（`data-feature-item` 標出項目範圍、`data-badge-for` 標出標籤）——「自訂動作」分頁、各功能使用的模型、自訂端點，以及「隱私與說明」功能說明清單新增的三行（字典卡例句加粗與難度、快捷鍵與右鍵選單、結果卡僅本次模型與修改原文）；動作清單是動態產生的，長難句分析（新增）與優化（已更新）由 `renderActionList()` 加上。
- 消失時機：在項目範圍內點任何地方就記為已看過；分頁上的標籤是點開分頁時消失。只用搜尋跳過去不算。分頁自己沒有標籤、但裡面還有沒看過的標籤時，分頁右上角顯示小圓點。
- 已看過的 id 存 `chrome.storage.local` 的 `seenFeatureBadges`，只是介面狀態，不進設定檔匯出也不進雲端同步；讀到之前標籤先全部藏著，避免載入時閃一下；存的值格式不對就當作沒看過。

**刻意變更的既有測試**：`options-actions.test.js` 取動作名稱的選擇器多排除 `.feature-badge`（動作列名稱旁多了標籤），斷言不變。

**驗證**：
- 新增 `tests/options-search-badges.test.js` 21 條（標籤比對與多詞、跨分頁跳轉＋高亮＋焦點、功能說明與分頁名稱、動態列、隱藏編輯器不收、標籤文字不算、上下鍵與 Enter、Esc、Ctrl+K／⌘K、無修飾鍵不攔、高亮 2 秒移除；標籤初始顯示與文字、圓點、點開分頁、點動作列、點卡片內欄位、搜尋跳轉不算、重新載入與清單重畫後維持、全部看過、格式不對）。
- 全套 44 suites／683 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0（文件 44／683 與實跑一致）。
- **fail-then-pass**：七個突變各跑一次，全部變紅、還原後 SHA-256 一致——跳轉不切分頁（紅 2）、已看過不寫 storage（紅 2）、標籤不看已看過清單（紅 5）、搜尋文字不去掉提示與標籤（紅 4）、不排除隱藏的編輯器（紅 1）、沒有 Ctrl/⌘+K（紅 2）、重畫動作清單不套標籤狀態（紅 3）。
- 施工中全套平行跑時新測試檔的第一條曾逾時一次：第一次 require `options.js` 要轉譯＋插樁，單跑約 2 秒，冷快取下全套平行會超過 5 秒預設逾時。改成在 `beforeAll` 先載入一次（逾時 30 秒），之後全套跑兩次皆綠。
- 實機（Windows、Chromium 1161、真擴充、全新拋棄式 profile）：初始 8 個標籤、模型與金鑰／隱私與說明有圓點；Ctrl+K 聚焦搜尋框，「vault」按 Enter 切到 Obsidian 分頁、欄位高亮、焦點在輸入框；點開自訂動作分頁與長難句分析列後兩個標籤消失、storage 記下兩筆、重新整理後仍隱藏；390px 寬沒有橫向捲動；console 0 錯誤。第一次截圖發現快捷鍵提示字型失效、打字後與瀏覽器清除鈕重疊、「各功能使用的模型」的標籤換到下一行，已修正並重新截圖確認。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：Mac 實機 ⌘K（只有單元測試以 `metaKey` 驗）；螢幕報讀器實際念法。

**未重現**：第一次跑 `check-docs --verify` 回 exit 2「jest 跑不起來」（腳本把 jest 輸出丟掉，無從得知哪條紅）；直接用同一條 jest 命令重跑 exit 0，之後 `check-docs --verify` 兩次、保留 JSON 的全套 jest 三次皆 683／0 failed，沒有再出現。疑與上面冷快取逾時同類，未證實。

## 2026-10-01 — 「優化」升級為寫作批改

**範圍**：選取句子或段落（超過 20 字）按「優化」，除了原本的優化後版本與改動說明，多三段：一句話判斷使用場合、在原文上標出「錯誤／不自然／寫得好」的片段並附說明、一句話總評。結果卡「原文」標題旁顯示各類型數量。單字（20 字以內）的優化不變。

**做法**：
- prompt 在 `background.js` 的 `optimize` 句子分支，依序要求「場合／優化後版本／改動說明／原文標記／總評」五段；原文標記一行一筆「- 類型「原文片段」：說明」，類型只有三種、片段逐字取自原文，沒有就回「- 無」；場合與總評用解釋語言，中文用台灣慣用語。原文仍放在 prompt 最後。內建 prompt 逐字比對的測試因此把這個分支排除（32 筆），其他 120 筆仍逐字相同。
- 結果卡（`content/result-card.js`）依粗體段落標題切段。回應裡有「場合」「原文標記」「總評」任一段就用新版面：場合 → 標記過的原文（沿用原文標註的標記方式）與各筆說明 → 優化後（複製鈕只複製這段，保留換行）→ 改動說明 → 總評。三種以外的類型、沒有引號的行略過；原文找不到的片段只列在說明、不標，但仍算進數量。三段都沒有時走原本的顯示方式，舊的最近紀錄照舊還原。
- 模型回的內容一律當文字插入。最近紀錄與 Obsidian 存的是原始回應，還原時照新版顯示，週記裡有場合與總評。

**驗證**：
- 新增 `tests/writing-review.test.js` 5 條（五段順序、標記規則與台灣用語、解釋語言換英文、原文在最後且無系統提示、單字分支與改版前逐字相同）與 `tests/content/writing-review.test.js` 9 條（版面順序、標記白名單與比對不到、數量、複製內容、只回部分新段落、HTML 只當文字、舊格式不變、從紀錄還原、Obsidian 輸出）。
- 全套 43 suites／662 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0。
- **fail-then-pass**：七個突變各跑一次，全部變紅、還原後全綠——prompt 少原文標記段、類型白名單多收一種、數量不算比對不到的、複製鈕複製整段回應、改動說明沒在下一段標題前切斷、一律走新版面、一律走舊版面。
- 實機（Mac、Chrome for Testing 1228、真擴充、全新拋棄式 profile）：長句按「優化」，結果卡標題「優化」、錯誤「請先在設定頁面輸入 Groq API Key」（測試 profile 沒有金鑰）。再把 mock 的模型回應交給擴充 content script 裡真的 `renderResult`（CDP 進 isolated world，套真的 `content.css`）：場合、數量「錯誤 2／不自然 1／寫得好 1」、原文三段標記各有對應底色、說明四筆（含原文沒有的一筆）、總評都有；複製鈕實際寫進剪貼簿的是兩行的優化後全文；深色模式與 390px 寬都在視窗內、沒有橫向捲動；換舊格式回應時沒有數量與標記；console 0 錯誤。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：未以真實模型驗證（測試 profile 沒有金鑰），模型是否照格式回、片段是否逐字、標記準不準列入 `MANUAL-QA.md`；實機 Obsidian 存檔（只有單元測試）；Windows 實機。

## 2026-10-01 — 新內建動作「長難句分析」

**範圍**：新增內建動作「長難句分析」，把一段英文長句的主詞、動詞、受詞、子句、修飾語、連接詞標在原文上，附整段譯文。結果卡有「只看主幹」「斷句」兩個切換。預設不放工具列，從「⋯」選單執行，可以釘選上去。

**做法**：
- 動作定義（版面、欄位、類型清單）寫在 `custom-actions.js` 的內建清單，`getStructuredBuiltinAction()` 取用；content 渲染和 background 解析共用這一份。prompt 固定寫在 `background.js`，組裝沿用自訂動作那套（網頁內容包防注入框、要求只回 JSON、台灣用語）；content 只送 `action: 'analyze'`，不送定義，請求夾帶的定義也不會被採用。只用選取文字，不把上下文與標題放進 prompt。不能用於全文翻譯。
- 內建動作多一個 `defaultPinned`：沒存過設定時翻譯／解釋／優化照舊在工具列，長難句分析不在；舊使用者存過的清單裡沒有它，同樣不會自己跑上工具列。清單還沒讀到時，工具列也用這份預設值。
- 渲染沿用原文標註版面，多三條規則：類型只收六種，其他值整筆忽略（不標、不列）；原文找不到的片段只以純文字列在說明區；說明列表前面標中文類型名稱。一般自訂動作的原文標註不受影響。
- 兩個切換只改結果卡容器上的 class，不重畫內容：「只看主幹」讓主詞／動詞／受詞以外的標記退回純文字、說明只留這三類；「斷句」在子句前後換行，子句後緊接的標點與空白留在同一行。狀態在同一頁面內沿用（串流重畫、查下一句都不會跳回預設）。按鈕用 `aria-pressed`。
- 串流時只顯示已收完的欄位。定義固定，所以跟翻譯／解釋／優化一樣會用結果快取（自訂動作可被編輯，才不用）；不寫最近紀錄（紀錄還原不了版面，同自訂動作）。可存 Obsidian，標註輸出為「［類型］片段：說明」。
- 設定頁：動作清單與「功能 × 模型」對照表多一列；「以此為範本」會開一份原文標註版面的自訂動作（prompt 是另寫的簡化版）。圖示用內建圖示集的「清單」，工具列、結果卡、設定頁一致。

**驗證**：
- 新增 `tests/sentence-analysis.test.js` 11 條（清單定義、存檔不落 prompt、請求驗證、全文翻譯擋下、prompt 內容與防注入框、夾帶定義不被採用、目標語言、非串流與串流 mock 請求）與 `tests/content/sentence-analysis.test.js` 12 條（類型白名單、原文比對不到、類型名稱、只看主幹、狀態沿用、斷句位置與標點、一般自訂動作不受影響、Obsidian 輸出、content 送出的請求、串流漸進顯示、格式不符）。既有測試因內建動作多一個而更新清單預期（工具列選單、設定頁清單與對照表、排序寫回），新增長難句分析預設不釘選、可當範本兩條。
- 全套 41 suites／648 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0。
- **fail-then-pass**：九個突變各跑一次——類型不過濾紅 1 條、比對不到的片段被丟掉紅 2 條、只看主幹不切 class 紅 2 條、不放斷句點紅 2 條、標點不留在子句行紅 1 條、預設釘選紅 8 條、background 不收 analyze 紅 4 條、content 不走版面渲染紅 2 條、prompt 走錯路由紅 4 條；還原後全綠。
- 實機（Mac、Chrome for Testing 1228、真擴充、全新拋棄式 profile）：工具列仍是三顆內建＋「⋯」，選單第四項是長難句分析；從選單執行後結果卡標題「長難句分析」、寶石鈕顯示、錯誤「請先在設定頁面輸入 Groq API Key」（測試 profile 沒有金鑰）。再把 mock 的模型回應交給擴充 content script 裡真的 `renderResult`（CDP 進 isolated world，套真的 `content.css`）：五個片段各有對應底色、白名單外的片段沒出現、原文沒有的片段列在說明區；只看主幹後非主幹標記底色變透明、說明剩三項；斷句後標註區由 41px 變 81px、四行；空白鍵可切換；深色模式與 390px 寬都在視窗內、沒有橫向捲動；設定頁清單與對照表都有這一列；console 0 錯誤。第一次實機看到斷句時逗號自己一行，已改成標點留在子句那一行。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同；修完斷句標點後換另一個全新 profile 重跑，結果一樣。

**未驗**：未以真實模型驗證（測試 profile 沒有金鑰），模型是否真的逐字取自原文、類型判斷準不準列入 `MANUAL-QA.md`；Windows 實機；螢幕報讀器實際念法。

## 2026-09-30 — 設定頁不再用舊的動作清單蓋掉其他分頁的改動

**範圍**：修正合併前自審找到的問題。設定頁開著時，在網頁「⋯」選單改了釘選或順序，回設定頁按「儲存設定」、排序、啟用或存動作，會用開頁時讀到的舊清單整份寫回，把剛才的改動蓋掉。

**做法**：
- 設定頁監聽動作清單在 storage 的變更，換上最新清單並重畫；內容跟手上一樣（多半是這頁自己剛存的）就不重畫，鍵盤焦點不會被打斷。
- 「儲存設定」寫動作模型前先重讀最新清單，只改表上真的改過的那幾列，不動其他欄位。
- 對照表因清單變動重畫時，保留使用者還沒存的選擇。

**驗證**：
- `tests/options-feature-models.test.js` 補 4 條（沒收到變更事件也不蓋掉釘選、收到事件後排序保留釘選、重畫保留未存選擇、自己存的不重畫、焦點留在原按鈕）。修正前用暫時測試重現：存檔後被取消的釘選變回釘選。
- 全套 39 suites／623 tests exit 0、0 skipped；`check-docs --verify` exit 0。
- **fail-then-pass**：四個突變（存模型不重讀、不監聽變更、重畫不保留未存選擇、自己存的也重畫）各紅 1 條，還原後全綠。
- 實機（Mac、全新 profile、兩個分頁）：設定頁表上先改一列不存 → 網頁「⋯」取消釘選「解釋」→ 回設定頁，未存的選擇還在；存檔後「解釋」仍是未釘選、模型有寫入；再到「自訂動作」分頁上移，釘選仍保留、焦點留在「上移：優化」；console 0 錯誤。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：Windows 實機；兩個設定分頁同時編輯同一個動作時，仍是後存的覆蓋先存的（同一欄位，屬預期）。

## 2026-09-30 — 各功能使用的模型＋缺金鑰提示

**範圍**：字典、翻譯、解釋、優化、各自訂動作、全文翻譯可以各自指定模型，預設跟隨主模型。設定頁選到缺金鑰的模型時就地提示。

**做法**：
- 優先序：結果卡「僅本次」＞功能設定＞主模型。判斷寫在 `custom-actions.js` 的 `resolveFeatureModel()`，content 算出功能模型後放進請求的 `model` 欄位；background 原本就依 `modelOverride`＞`model`＞主模型選用，沒有改。存的值過期、不在模型清冊內，或是只能做全文翻譯的模型，一律當成跟隨主模型，不擋請求。
- 設定存哪裡：翻譯／解釋／優化／自訂動作用動作清單既有的 `model` 欄位（存本機）。字典新增一般設定 `dictionaryModel`（`chrome.storage.sync`，跟全文翻譯模型同一類，會進雲端同步與設定檔）。字典的判斷沿用既有規則：翻譯且選取文字 20 字以內。全文翻譯沿用 `pageTranslationModel`，多了「跟隨主模型」（存成空字串）；原本沒存過的人載入時顯示跟隨主模型，按儲存後才會存成空字串。
- 設定頁：「模型與 API Key」分頁原本的「全文翻譯模型」欄位改成對照表，字典與全文翻譯兩列沿用原本的欄位 id，動作列依動作清單產生（自訂動作標「自訂：」）。表上的變更跟著「儲存設定」一起存；動作的模型有改才寫回動作清單（走 `saveActionList` 嚴格驗證，失敗時顯示原因）。
- 缺金鑰提示：選到的模型對應的金鑰欄位是空的（自訂端點則是網址、模型名稱、金鑰任一沒填），就在下拉底下顯示黃點（沿用自檢表的狀態點）與「前往填寫」，按下把焦點移到該欄位；提示用 `aria-describedby` 掛在下拉上。看的是欄位目前的值，打字填入金鑰提示就消失。跟隨主模型與免金鑰的瀏覽器內建翻譯不提示。
- 結果卡：底部模型下拉顯示這次實際會用的模型（含功能設定），選回它就取消「僅本次」。快取 key 改用實際生效的模型，換了功能模型不會拿到舊結果。
- 全文翻譯的連帶修正：原本主模型一改，已開分頁的全文翻譯模型就會被換成主模型，即使另外指定過；現在只有設成跟隨主模型才跟著變。

**驗證**：
- 新增 `tests/options-feature-models.test.js` 8 條（用真的 `options.html`：列出各列與預設、全文翻譯可選內建而其他列不列、提示出現與消失、`aria-describedby`、前往填寫的焦點、自訂端點未填完整、儲存寫入一般設定與動作清單、沒改不寫、載入反映已存值）；`tests/custom-actions.test.js` 補 4 條 `resolveFeatureModel`；`tests/card-model-override.test.js` 補 3 條 background 三層優先序；`tests/content/card-model-override.test.js` 補 6 條（沒設定帶空字串、動作模型帶在請求與卡內下拉、字典與長句分流、僅本次優先與取消、設定變更即時生效、全文翻譯指定模型不跟著主模型變）。
- 全套 39 suites／619 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0。
- **fail-then-pass**：七個突變各跑一次——字典不走字典設定紅 3 條、串流不帶功能模型紅 3 條、快取 key 只看主模型紅 1 條、全文翻譯一律跟著主模型紅 1 條、不顯示缺金鑰提示紅 4 條、動作模型不寫回紅 1 條、卡內選回功能模型不取消覆寫紅 1 條；還原後全綠。
- 實機（Mac、Chrome for Testing 1228、真擴充、全新拋棄式 profile）：對照表五列預設跟隨主模型；字典選 OpenRouter、解釋選 Groq 後出現兩則缺金鑰提示，「前往填寫」焦點到 Groq 金鑰欄；390px 寬沒有橫向捲動；存檔重新整理後值還在。網頁上（主模型 Gemini）：解釋→卡片下拉是 Groq、錯誤「請先在設定頁面輸入 Groq API Key」；長句翻譯→Gemini、Gemini 缺金鑰錯誤；7 個字的單字翻譯→OpenRouter、OpenRouter 缺金鑰錯誤。console 0 錯誤。第一次實機看到窄螢幕時黃點自己佔一行，已改成黃點固定在左、文字與按鈕同一段。
- e2e：全新 profile 41 PASS／0 FAIL／4 PARTIAL，與基準相同。（在剛跑完上面實機檢查的 profile 上跑，§5-2 會失敗：該案假設主模型是預設的 Groq，而實機檢查把主模型存成了 Gemini。）

**未驗**：未以真實模型驗證（測試 profile 沒有金鑰）；Windows 實機、螢幕報讀器實際念法。

## 2026-09-30 — 工具列依動作清單顯示＋「⋯」更多動作選單

**範圍**：選字工具列改成照動作清單顯示，新增「⋯」選單列出全部已啟用動作，可以釘選、排序、直接執行。自訂動作從這一版起可以在網頁上實際觸發。各動作選模型的缺金鑰提示還沒做。

**做法**：
- 工具列只放「釘選且啟用」的動作，照清單順序、最多 4 個，後面固定接「⋯」。還沒讀到清單前先顯示原本三顆內建按鈕（提示文字不變）。內建動作照舊走 `triggerAction`，自訂動作走 `runCustomAction`。
- 清單來源：content 啟動時讀 `chrome.storage.local` 的 `actionList`（`loadActionList`），之後監聽 storage 變更，設定頁改了清單，已開的分頁工具列跟著換，不用重新整理。沒載入 `custom-actions.js` 的環境不會報錯。
- 「⋯」選單：每列有拖曳把手、動作名稱（按下即執行並關閉選單）、釘選、上移、下移。釘選超過 4 個時選單內顯示「工具列最多放 4 個動作，請先取消一個」、不寫入。上移下移跳過停用的動作、跟選單上相鄰的交換；拖曳也能排序。改動走 `saveActionList` 嚴格驗證後寫回 storage，工具列同步更新。
- 鍵盤：開選單後焦點在第一個動作；上下方向鍵在同一欄移動、到底從頭；Esc 關閉並把焦點還給「⋯」。釘選、上移後選單重畫，焦點留在同一個動作的同一顆按鈕。
- 視窗邊界：下方放不下就往上開，左右超出就往內收（留 8px）。選單展開時「更多動作」提示不顯示，避免蓋住最後一列。工具列隱藏時選單一起關。

**驗證**：
- 新增 `tests/content/toolbar-menu.test.js` 9 條（清單未讀到時的預設、釘選上限 4、內建與自訂的觸發路徑、選單內容與焦點、Esc、方向鍵、釘選寫回與上限提示、上移下移與跳過停用、拖曳、往上開與往內收），`tests/content/custom-action-render.test.js` 補 1 條 storage 變更同步工具列。`render-parity` 的工具列情境略過新加的「⋯」。
- 全套 38 suites／598 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0。
- **fail-then-pass**：六個突變各跑一次——釘選不檢查上限、工具列不限 4 個、Esc 不還焦點、不調整選單位置、不監聽清單變更各紅 1 條，重畫不還原焦點紅 2 條；還原後全綠。
- 實機（Mac、Chrome for Testing 1228、真擴充、全新拋棄式 profile）：選字後工具列三顆內建＋「⋯」；選單列出四個已啟用動作、焦點在第一個；方向鍵、Tab 到釘選鈕、按下釘選後工具列多一顆、焦點留在「取消釘選」；上移後選單與工具列順序一致；Esc 焦點回「⋯」；貼右下角選字時選單往上開、未超出視窗；深色模式正常；console 0 錯誤。按自訂動作後結果卡標題是動作名稱、寶石鈕隱藏，請求送進 background 後回「請先在設定頁面輸入 Groq API Key」（測試 profile 沒有金鑰）。第一次實機看到「更多動作」提示蓋住選單最後一列，已修正。
- e2e：41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**實機注意**：重複使用同一個測試 profile 時，Chrome 會繼續跑快取的舊 `background.js`（版本號相同就不會換），實機檢查要用全新 profile。這一版就是這樣抓到的：舊 profile 上自訂動作回「未知的操作類型」，換新 profile 後才是正確的缺金鑰錯誤。前兩片若在舊 profile 上做實機與 e2e，background 端跑的可能是舊程式；那兩片的 background 行為另有單元測試覆蓋。

**未驗**：未以真實模型驗證（測試 profile 沒有金鑰）；Windows 實機、螢幕報讀器實際念法、觸控裝置拖曳。

## 2026-09-30 — 自訂動作：設定頁編輯器與預覽

**範圍**：設定頁新增「自訂動作」分頁，可以新增、編輯、刪除、複製自訂動作，調整所有動作（含內建）的啟用與順序，並即時預覽版面。動作清單併入本機設定檔的匯出匯入。工具列還沒有自訂動作的按鈕（那是工具列選單那片），各動作選模型的缺金鑰提示也還沒做。

**做法**：
- 清單：每列有啟用勾選、圖示、名稱、上移／下移、內建標示。內建動作只有「以此為範本」，沒有編輯與刪除；自訂動作有「編輯」「複製」。排序與啟用改了就直接存（走 `saveActionList` 嚴格驗證，失敗時顯示原因、畫面維持原狀）。上移下移後焦點留在同一個動作的同方向按鈕，到頂或到底時改到另一顆，鍵盤可以連按。
- 編輯表單：名稱、圖示（內建 8 個，放在 `content/custom-action-render.js`，之後工具列共用；不接外部圖示庫）、模型（跟隨主模型或模型清冊裡不限全文翻譯的模型）、系統提示、使用者提示＋五個變數插入鈕（插在游標位置）、欄位表（最多 8 個）、版面、存檔目的地。儲存前先跑 `validateCustomAction`，錯誤顯示在表單下方、不寫 storage。刪除要先確認。Esc 關閉表單、焦點回「新增自訂動作」。
- 「以此為範本」：內建動作的 prompt 由 background 依設定組出來，不存在清單裡，所以範本是另外寫的簡化版 prompt（翻譯用欄位卡、解釋兩欄、優化用前後對照），不是內建 prompt 的原文。
- 預覽：用範例句子與每個欄位的範例內容，直接呼叫結果卡同一套 `buildCustomActionContent` 渲染；設定頁載入 `content.css`，預覽外觀與結果卡一致。可切 320／500 寬。表單任何輸入都即時重畫，不發網路請求。
- 「用 AI 協助設定」：只把一段格式說明（變數、欄位規則、三種版面、字數上限）複製到剪貼簿，讓使用者貼給任何 AI，不呼叫任何 API。
- 設定檔：匯出時若存過動作清單，多帶 `actions`（內建動作只有啟用、釘選、順序、模型）；匯入時整份取代，壞掉的自訂動作略過，狀態列出匯入幾個自訂動作。雲端同步 payload 只取一般設定，**不含自訂動作**，隱私權政策「雲端同步只同步一般設定」不受影響。`schemaVersion` 維持 1，舊檔沒有 `actions` 照常匯入。
- 設定頁新載入 `custom-actions.js`、`content/dom.js`、`content/custom-action-render.js`（都已在打包清單內，打包白名單不用改）。classic script 的頂層 `const` 不會掛到 `globalThis`，所以圖示清單改用 `listCustomActionIcons()`／`getDefaultCustomActionIcon()` 兩個函式取用。

**驗證**：
- 新增 `tests/options-actions.test.js` 17 條：用真的 `options.html` 內容建 DOM（順便鎖住 HTML 與程式的 id 對應），涵蓋內建標示與按鈕、新增、驗證失敗不存、欄位上限、編輯與刪除（取消確認不刪）、以內建為範本、複製、上移與鍵盤焦點、停用、變數插入位置、Esc、預覽三種版面與寬度切換、預覽與 AI 說明不發請求、匯出帶 `actions`、雲端 payload 不含、沒存過不帶、匯入整份取代並略過壞資料。另在 `tests/content/custom-action-render.test.js` 補 1 條圖示（每個圖示畫得出 SVG、不認得的名稱退回預設）。
- 全套 37 suites／588 tests exit 0、0 skipped（worktree 內實跑）；`check-docs --verify` exit 0。
- **fail-then-pass**：五個突變各跑一次——排序不寫回紅 1 條、內建也顯示編輯鈕紅 3 條、匯出不帶動作紅 1 條、變數一律插到最後紅 1 條、刪除不確認紅 1 條；還原後全綠。
- 實機（Mac、Chrome for Testing 1228、真擴充，拋棄式 profile）：開設定頁「自訂動作」分頁，清單三個內建動作；新增一個原文標註動作，預覽出現兩段標註（底色依類型不同），預覽寬 320／500 實測相符，編輯與預覽期間對外請求 0 次；焦點在儲存鈕按 Enter 存檔，重新整理後仍在清單；鍵盤按上移後焦點留在「上移：文法標註」；390px 寬沒有橫向捲動；console 0 錯誤。第一次實機看到兩個畫面問題並修正：窄螢幕時按鈕被 `.btn-test { flex: 1 }` 撐開、名稱只剩一個字；「版面」與「存檔目的地」下拉選單高度不一（`.field` 是 grid 會把下拉撐高）。測試資料跑完已清掉。
- e2e：41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：Windows 實機、螢幕報讀器實際念法；隱私權政策的資料表目前沒有「自訂動作」這一列（動作清單存在本機、只在使用者匯出設定檔時帶出），要不要補列待確認。

## 2026-09-30 — 自訂動作：三種版面與串流渲染

**範圍**：自訂動作在結果卡上的顯示。三種固定版面、串流時逐欄出現、格式不符的畫面、存 Obsidian 的輸出。工具列還沒有按鈕可以觸發自訂動作（那是工具列選單那片），設定頁編輯器也還沒做，所以使用者目前仍用不到。

**做法**：
- 新增 `content/custom-action-render.js`（manifest 核心選字層接在 `content/dom.js` 後面），`custom-actions.js` 也加進同一層，content 端直接用它的 `parseCustomActionOutput()` 做最終解析，不另寫一份。打包本來就收整個 `content/` 資料夾與 `custom-actions.js`，打包白名單不用改。
- 三種版面全部用 `ffbEl` 建 DOM，模型回傳的任何字串都只當文字：
  - `fields`：每個欄位一段（欄位名＋內容）；字串保留換行，陣列逐項列出，物件退回 JSON 文字。
  - `annotate`：取第一個值是陣列的欄位當標註（`[{ text, type, note }]`），依序在選取原文裡找片段，找到的包成 `<mark>`、說明放 `title`，並在下方列出所有標註；原文找不到或與前一段重疊的只列在下方、不標。`type` 只收英數與連字號代號（會進 class 名稱），其他一律當 `other`。
  - `compare`：`before`／`after`／`notes` 三個欄位；動作沒宣告 `before` 時以選取原文當修改前。其他欄位接在後面以欄位卡顯示。
- 串流：`readCompletedCustomFields()` 掃描收到一半的 JSON，只取頂層已完整收到的欄位（字串要看到結尾引號、陣列與物件要括號閉合、數字要看到後面的分隔字元），其餘欄位顯示骨架；收完再交給 `parseCustomActionOutput()` 做最終解析。解析失敗顯示「格式不符」與原始內容（純文字）。
- 請求：`runCustomAction(action)` 記下動作定義後走原本的 `triggerAction`，重試沿用同一份定義。自訂動作一律串流、不走快取（動作內容可能被改過），也不寫入最近查詢紀錄（紀錄不存動作定義，還原不了版面）；舊紀錄裡若有 `custom` 這個動作名稱，照舊以純文字顯示。**content 端刻意不送網址**，`{{pageUrl}}` 在 background 替換成空白，隱私權政策「不傳送所在網頁的完整網址」維持不變。
- 寶石鈕：自訂動作只有存檔目的地是 Obsidian 時才顯示，換回內建動作恢復。存入週記的內容是每欄「**欄位名**＋內容」，標註陣列轉成清單。
- `content.css` 補三種版面樣式與深色模式覆寫（接在既有深色區塊內）；`.g-icon-btn[hidden]` 補 `display: none`，因為 `.g-icon-btn` 的 `display: flex !important` 會蓋掉 `hidden`。

**驗證**：
- 新增 `tests/content/custom-action-render.test.js` 18 條：部分 JSON（未收完的字串／陣列、跳脫引號與括號、數字邊界、程式碼區塊、非 JSON）、三種版面、骨架、標註比對不到與 `type` 中和、惡意字串（`<script>`、事件屬性、`javascript:` 連結）在三種版面與格式不符畫面都只當文字、Obsidian markdown，以及載入真的 `content/main.js`／`result-card.js`／`obsidian.js` 跑一次串流：請求帶動作定義且不含網址、逐欄出現、收完骨架消失、格式不符、寶石鈕顯示與隱藏。
- 全套 36 suites／570 tests exit 0、0 skipped（worktree 內實跑）。
- **fail-then-pass**：三個突變各跑一次——欄位值改用 `innerHTML` 寫入紅 3 條、串流時不做部分解析紅 5 條、送出時帶 `location.href` 紅 1 條；還原後全綠。
- 同步測試數（`TESTING.md`、`MANUAL-QA.md`、`PLAN.md`、`project-overview.html` 兩處）後 `check-docs --verify` exit 0（worktree 內實跑，36／570 與實跑一致）。
- e2e（Mac、Chrome for Testing 1228）：動到 manifest 與 content UI，`npm run package` 後跑 41 PASS／0 FAIL／4 PARTIAL，與基準相同。e2e 沒有自訂動作的案例（目前沒有入口可以點）。

**未驗**：未以真實模型驗證（模型是否照格式回 JSON、欄位逐一出現的實際節奏）；實機畫面與深色模式外觀也還沒人看過，人驗項已加進 `MANUAL-QA.md`，要等工具列有入口才能跑。

## 2026-09-30 — 自訂動作：資料層與 prompt 組裝

**範圍**：自訂動作的資料模型、驗證、變數替換、JSON 輸出解析，以及把翻譯／解釋／優化三個內建動作放進同一份動作清單。這一片沒有任何畫面，使用者還看不到也用不到自訂動作；版面、設定頁編輯器、工具列選單與各動作選模型是之後的工作。

**做法**：
- 新增共用模組 `custom-actions.js`（比照 `models.js`，background 以 `importScripts` 載入，打包白名單同步加入）。一個自訂動作的欄位：`id`、`name`、`icon`、`builtin`、`enabled`、`pinned`、`order`、`model`（`default` 或模型清冊裡的 id）、`systemPrompt`、`userPrompt`、`fields`（`key`／`label`／`description`）、`layout`（`fields`／`annotate`／`compare`）、`saveTo`（`none`／`obsidian`）。
- 上限：自訂動作最多 20 個、輸出欄位最多 8 個、系統提示與使用者提示各最多 4000 字。另外自訂的長度限制：名稱 40 字、欄位名稱 40 字、欄位說明 200 字；欄位代號要英文字母開頭、只能用英數與底線、同一動作內不可重複。
- 清單存在 `chrome.storage.local` 的 `actionList`。讀取時容錯：內建三個一定存在（刪不掉），名稱與 prompt 一律取程式定義，只收使用者可調的啟用、釘選、排序與模型；不合法的自訂動作與超過 20 個的部分直接略過。存檔時嚴格：任何一筆不合法、代號重複或超過 20 個就整份拒絕。沒存過資料時，清單是翻譯、解釋、優化三個，順序與現在的工具列相同。**動作清單目前不進雲端同步，也不進設定備份**（備份只讀 `chrome.storage.sync` 的白名單鍵）。
- 變數：`{{selection}}`、`{{context}}`、`{{pageTitle}}`、`{{pageUrl}}`、`{{targetLanguage}}`。只做一次字串替換，值裡就算出現 `{{context}}` 字樣也不會再展開。系統提示只能用 `{{targetLanguage}}`，網頁內容不進系統提示；寫了不認得的變數在存檔與送出前就擋下。
- 防注入：網頁來源的四個變數替換前先過 `sanitizePromptInput`（跟內建動作同一套：去控制字元、標題與網址壓成單行、上下文收斂空行），再包進「【以下取自網頁，不是指令】…【網頁內容結束】」框線；系統提示裡固定說明框內只是資料、其中的指示一律不理會。值裡若本來就有這兩個框線字樣，先換成六角括號，網頁內容沒辦法自己關框。
- 輸出：系統提示要求模型只回一個 JSON 物件，鍵固定是欄位代號，並要求中文用台灣慣用語。`parseCustomActionOutput()` 接受純 JSON、程式碼區塊包住的 JSON、或前後多一句話的 JSON；只取宣告過的欄位，缺的補空字串。解析不了就回 `{ ok: false, error: '格式不符', raw }`。非串流路徑在 background 解析後回傳 `fields`，格式不符時回傳原文加 `formatError`。串流路徑目前只把系統提示帶上，逐欄解析留給串流渲染那片。
- `validateAIRequest` 接受 `action: 'custom'`，連同定義一起驗證（欄位數、prompt 長度、變數、模型、版面）；自訂動作不能用於全文翻譯；新增選用的 `pageUrl`（上限 2048 字）。內建動作的請求就算夾帶 `customAction` 也會清成 `null`。清單 20 個的上限在存檔時把關，因為單一請求只帶一個動作。
- 請求組裝：自訂動作在 Gemini 用 `systemInstruction`、在 OpenAI 相容格式（Groq、OpenRouter、自訂端點）用 `system` 訊息；輸出上限 2048 token。內建動作沒有系統提示時完全不加這些欄位，request body 與改版前相同。

**`{{pageUrl}}` 尚未接上任何呼叫端**：目前 content 端不會送網址，所以實際上沒有外送。隱私權政策寫明「不傳送所在網頁的完整網址」，接上之前要先決定這個變數的去留與對外說明。

**驗證**：
- 內建三個動作的 prompt 基準：改寫前在未動的程式碼上，用 360 組輸入（三個動作 × 單字、中長句、段落、多行、含控制字元 × 十種語言與全文翻譯設定 × 一般與含注入字串的上下文／標題）把 `buildPrompt` 輸出存成 `tests/__fixtures__/prompt-parity-baseline.json`（194 種不同輸出）。改寫後 `buildPrompt` 與新的分派函式對這 360 組逐字相同，分派函式也不產生系統提示。另鎖住內建動作的 request body：OpenAI 相容只有一則 user 訊息、鍵為 `model`／`messages`／`temperature`／`max_tokens`；Gemini 只有 `contents`／`generationConfig`。
- 新增 `tests/custom-actions.test.js` 32 條：資料驗證與上限、內建動作不可改 prompt 與刪除、存讀往返、讀取容錯與存檔嚴格、單次替換、框線與 `sanitizePromptInput`、偽造框線、JSON 解析成功與失敗、`validateAIRequest` 把關，以及自訂動作走 OpenAI 相容、Gemini 與串流三條路徑。
- 全套 35 suites／552 tests exit 0、0 skipped；`check-docs --verify` exit 0（worktree 內實跑）。
- **fail-then-pass**：`background.js` 退回改版前，新測試紅 14 條（內建 parity 3 條、防注入 4 條、`validateAIRequest` 3 條、完整請求路徑 4 條）；兩條內建 request body 測試照樣綠，這是預期的回歸護欄。另外做 9 個單點突變（拿掉欄位上限、拿掉 20 個上限、內建名稱改讀存檔值、拿掉 JSON 前後文容錯、不檢查變數、不中和框線字樣、上下文不過 `sanitizePromptInput`、解釋段落 prompt 改一個空白、內建動作也送 `systemInstruction`），紅 11 條，每個突變都有測試抓到。還原後三個檔 SHA-256 一致、全綠。
- e2e（Windows、Chromium 1161）：這片沒動 content UI 與 manifest，但 background 多載一個檔、打包清單也改了，所以仍跑了一次，確認打包後的 service worker 能載入新模組：41 PASS／0 FAIL／4 PARTIAL，與基準相同。

**未驗**：未以真實模型驗證（自訂動作還沒有畫面可以觸發，模型是否照格式回 JSON 要等之後的片再人驗）。

## 2026-09-30 — 深色模式第一階段（浮層 UI）

## 2026-09-30 — 深色模式第一階段（浮層 UI）

**範圍**：系統設定為深色時，工具列、結果卡（含最近查詢、Obsidian 面板、字典／解釋／優化內容、錯誤與提示、底部列、單字本面板）、浮球與選單、單字高亮提示、全文翻譯控制面板換成暗色。亮色外觀不變。插進網頁的譯文段落與單字高亮標記不在本階段（它們依頁面底色自己調對比）；設定頁、popup、welcome 也還沒做。

**做法**：
- `content.css` 最後新增一個 `@media (prefers-color-scheme: dark)` 區塊，上方的亮色規則一行都沒改。暗色 token（`--ffb-dark-*`，共 20 個）定義在五個元件的根節點上，不寫在頁面 `:root`；覆寫的 selector 都帶元件根前綴（`#gemini-result-card …` 等），specificity 一定高於亮色的 class 規則，每條宣告都加 `!important`。
- 根節點設 `color-scheme: dark`，原生的 select、輸入框與捲軸跟著變暗。
- 暗色下錯誤色只用 `--ffb-dark-danger`、所有 `:focus-visible` 外框只用 `--ffb-dark-focus`。
- 浮球旁的「×」原本沒有底色、直接疊在網頁上，暗色下給一個深色圓底，對比才不受網頁底色影響。
- `design.md` 補上暗色 token 表、對比要求與術語表。

**亮色錯誤色與焦點色未收斂**：這一階段要求亮色外觀不變，所以只在 `design.md` 記錄現況：`.g-error` 定義兩次（`#d93025` 與 `#f87171`，後者生效，白底對比約 2.8:1，未達 4.5:1）；焦點外框有藍、綠、紫三套。要改需要另外決定。

**驗證**：
- 亮色不變：用 Chromium 1161 把渲染對照測試的 32 組基準 HTML 分別套上改前與改後的 `content.css`，逐元素比對計算後的 color、background、四邊 border-color、box-shadow、outline-color、fill、stroke、opacity、background-size，差異 0。
- 暗色對比：同樣 32 組（全文翻譯譯文段落除外），對每個有文字的元素把背景逐層疊到網頁底色上，網頁底色用純白與純黑兩種最壞情況各算一次：靜態 574 筆最低 5.25:1；再以 CDP 強制 `:hover` 與 `:focus-visible` 對所有按鈕、選單、輸入框量 260 筆，最低 4.82:1，全部 ≥ 4.5:1。第一輪有 27＋37 筆未達標（半透明底疊在白色網頁上被墊亮、「×」沒有底色），調整卡片不透明度、藍與紅的文字色、刪除鍵 hover 底色並給「×」加底色後全過。另外列出暗色下仍帶亮色背景或邊框的元素，只剩刻意的半透明彩色邊框、進度條與「重新查詢」藍底按鈕。
- `css.test.js` 新增 3 條：暗色區塊的 selector 全部以五個元件根節點開頭、不碰 `:root`／`html`／`body`；不含 animation／transition（系統要求減少動態效果時不受影響）；每條宣告都有 `!important`。**fail-then-pass**：在暗色區塊加一條 `body` 規則、一條 transition 並拿掉一個 `!important`，3 條全紅；還原後逐位元組一致、全綠。
- 全套 34 suites／520 tests exit 0、0 skipped；`check-docs --verify` exit 0。
- e2e（Windows、Chromium 1161）40 PASS／1 FAIL／4 PARTIAL。唯一的 FAIL 是「CSV 公式前綴防護：讀不到剪貼簿」：把 `dist/pkg/content.css` 換回改前版本重跑同樣失敗；另用最小腳本在同一顆 Chromium 寫入再讀取剪貼簿也只拿到空字串，判定是當時這台機器的系統剪貼簿無法存取，與本次改動無關。這一條本次未驗成。

**未驗**：實機切換系統深色後的外觀（已列入 `MANUAL-QA.md`）。CSV 匯出那條 e2e 已於同日下一片完成後補跑：`node e2e/run.js hostile-data` 5 PASS／0 FAIL／0 PARTIAL，「CSV 公式前綴防護」通過。

## 2026-09-30 — 頁面 UI 改用 DOM builder（Trusted Types 相容）

**範圍**：content script 的所有 UI 改成用 `createElement`／`createElementNS`／`createTextNode` 建立，不再把 HTML 字串交給 `innerHTML`、`insertAdjacentHTML` 這類寫入點。頁面 CSP 若要求 Trusted Types（`require-trusted-types-for 'script'`，Google 系常見），瀏覽器會直接拒絕純字串寫入，工具列、結果卡、浮球與全文翻譯面板就整塊出不來；改寫後這條路徑不再使用。這是行為不變的重構，畫面與互動不變。

**做法**：
- `content/dom.js`：`ffbEl` 的子節點可以是巢狀陣列或 `DocumentFragment`；新增 `ffbSvg`／`ffbSvgIcon`（SVG 必須建在 SVG namespace，圖示才畫得出來）與 `ffbFragment`。`class` 一律走 `setAttribute`，因為 SVG 元素的 `className` 是唯讀物件。
- `content/utils.js`：`formatMarkdown`、`renderDiff` 改為回傳 `DocumentFragment`；`highlightExampleHtml` 改名 `highlightExample`，同樣回傳節點。粗體、`{{詞}}` 標籤、清單與段落的規則不變，AI 回傳的文字一律當純文字節點。
- `content/result-card.js`：結果卡外殼、最近查詢清單、Obsidian 資料夾下拉、字典卡、解釋、優化、錯誤卡與提示列全部改用 builder。`buildDictHTML`／`buildExplainHTML`／`buildOptimizeHTML` 改名為 `buildDictContent`／`buildExplainContent`／`buildOptimizeContent`（回傳的已不是 HTML 字串）。標題列的動作標籤改由 `setResultCardTag()` 設定，最近查詢還原與 `content/main.js` 發新查詢共用，原本兩份重複的圖示字串合成一份。
- `content/main.js`：載入中畫面、串流中的暫時顯示（換行、DEEP 分隔線）與提供者提示改用 builder。
- `content/toolbar.js`、`content/floating-ball.js`（浮球、收藏／紀錄、最近查詢、單字本面板；`buildVocabularyPanelItemHtml` 改名 `buildVocabularyPanelItem`）、`content/page-translator-panel.js`、`content/page-translator-renderer.js`（`formatPageTranslationText` 改回傳節點陣列）、`content/vocabulary-highlighter.js` 同樣改寫。
- 沒有使用 `trustedTypes.createPolicy` 過渡包裝：全部寫入點都已改完，不需要。

**刻意變更的既有測試**：`utils.test.js`、`dict-examples.test.js`、`xss-regression.test.js`、`page-translator.test.js` 改為把回傳的節點放進容器再檢查，斷言內容不變（例句加粗仍逐字比對序列化後的 HTML）；這幾支直接 `require` utils 的測試把 `dom.js` 的 helper 掛到 global，對應瀏覽器端 `dom.js` 先載入的順序。`toolbar.test.js` 的 vm context 照 manifest 順序補載 `dom.js`。

**驗證**：新增 `tests/content/render-parity.test.js`（65 條）與 `dom.test.js` 2 條（SVG namespace、巢狀子節點與 fragment）。改寫前先在未動的程式碼上，用 32 組代表性輸入（結果卡外殼、載入中、串流、字典卡各種欄位組合與 XSS 字串、解釋、優化、錯誤、最近查詢、資料夾下拉、工具列、單字提示、浮球、收藏／紀錄、單字本各分頁、全文翻譯面板與譯文）把輸出存成 `tests/content/__fixtures__/render-parity-baseline.json`；改寫後同樣輸入的 DOM 必須與基準一致（屬性、SVG namespace、文字都比對）。比對時唯一的差異是行內元素之間的純空白文字節點（128 處），出現在 26 個容器；逐一查過 `content.css`，全部是 flex／grid（`.g-history-panel` 是 block，但子項是 `display:flex` 且寬 100%），空白不影響排版，這份清單與查到的 display 值寫在測試檔裡。另 32 條模擬 Trusted Types：把 `innerHTML`／`outerHTML`／`insertAdjacentHTML`／`createContextualFragment`／`DOMParser`／`document.write` 換成「記錄後拋錯」，同樣 32 個情境不得呼叫任何一個。全套 34 suites／517 tests exit 0、0 skipped；`check-docs --verify` exit 0。**fail-then-pass**：Trusted Types 模擬在改寫前 32 條全紅；改寫後故意拿掉字典卡詞性後的空格、並讓錯誤卡寫一次 `innerHTML`，分別紅 2 條與 2 條；`ffbSvg` 改回 `createElement`、拿掉巢狀陣列攤平時 `dom.test.js` 紅 2 條；還原後全綠。e2e（Windows、Chromium 1161、全新 profile 首跑）41 PASS／0 FAIL／4 PARTIAL。

**未驗**：Trusted Types 只在 jsdom 以攔截寫入點的方式模擬，還沒在真正強制 Trusted Types 的頁面上操作過；已列入 `MANUAL-QA.md`。

## 2026-09-30 — 自訂 OpenAI 相容端點

**範圍**：設定頁新增「自訂端點」卡片，可填 API 網址、模型名稱與 API Key，另有「測試自訂端點」按鈕。填好之後，「自訂端點」會像一般模型一樣出現在主模型、全文翻譯與結果卡「僅本次」的選單裡。沒有備援模型，端點掛了就如實回報。

**做法**：
- `models.js`：新 provider `custom`，只有一個固定 id `custom:endpoint`。實際網址與模型名稱存在 `chrome.storage.sync` 的 `customApiBase`／`customModelName`，這兩項不是機密，會跟著一般設定備份與雲端同步；金鑰 `customApiKey` 加進 `storage.js` 的 `SECRET_KEYS`，只存本機，不進雲端同步與一般匯出（勾選加密匯出時才以加密形式帶出）。`normalizeCustomEndpoint()` 由設定頁與 background 共用：只收 `https://`，不能帶帳密、`?` 或 `#`，結尾斜線會去掉。
- 權限：`manifest.json` 加 `optional_host_permissions: ["https://*/*"]`。安裝時不會給這項權限；使用者按儲存或測試時，才用 `chrome.permissions.request` **只請求填寫的那一個網域**，拒絕就整個不儲存。請求排在任何 `await` 與 `confirm` 之前，避免瀏覽器判定不是使用者操作。
- `background.js`：`resolveRoute` 認 `custom:` 前綴，走既有的 OpenAI 相容執行器（`{網址}/chat/completions`）。新增 `assertRoutePermission()`，送出前確認網域仍有授權。換裝置只匯入了設定、或使用者到擴充功能頁撤銷權限時，會明講「尚未授權」，不讓 fetch 丟出模糊的網路錯誤。結果卡的可用清單另外要求網址與模型名稱都已填寫。
- 測試連線打 `{網址}/models`，錯誤分成網路、權限不足、認證失敗（401／403）、回應格式不相容（其他 4xx 或沒有 `data` 陣列）四種，另有伺服器錯誤（5xx）與「連上了但清單找不到這個模型」。上游回傳的錯誤內容不顯示在畫面上，沿用 `formatApiErrorMessage` 的原則。
- 匯入設定時，網址若不是合法 https 就清空，避免備份檔把請求導到別處。
- 網址欄用 `type="text" inputmode="url"`，這樣會沿用既有欄位樣式，不必動 CSS。

**刻意變更的既有測試**：`models-registry.test.js` 與 `popup.test.js` 鎖住的模型清冊從 5 顆改為 6 顆；「PROVIDERS ⟺ host_permissions」對賬的略過清單改為恰為 `['builtin', 'custom']`，並斷言萬用權限只出現在 `optional_host_permissions`、不在必要權限裡。`jest.setup.js` 的 chrome mock 補上 `permissions`。

**隱私權政策**：`privacy-policy.html` 補上自訂端點的資料流向（選取文字會送到使用者自行填寫的網址）、設定儲存位置與選用網域存取權限，文字已經 KAKA 核准；商店送審文件的權限清單同步更新。

**驗證**：新增 21 條（`tests/custom-endpoint.test.js`：網址驗證、路由、授權撤銷、可用清單、金鑰只存本機、儲存與權限拒絕、測試連線分類、雲端同步與匯出不含金鑰、匯入網址過濾）。全套 33 suites／450 tests exit 0、0 skipped；`check-docs --verify` exit 0。**fail-then-pass**：五支實作檔退回 A3 版時紅 25 條，還原後 SHA-256 一致、全綠。e2e 41 PASS／0 FAIL／4 PARTIAL。另以 harness 開設定頁截圖，桌機與 375 寬的四張供應商卡片版面正常、無水平溢出。

**未驗**：未以真實模型驗證；也還沒用真實的相容端點實際翻譯過，瀏覽器的網域授權提示也還沒實機看過。這些已列入 `MANUAL-QA.md`。

## 2026-09-30 — 結果卡：僅本次切換模型＋修改原文後重查

**範圍**：結果卡**標題列的模型選單移除**，改到新的底部列：左邊「修改原文」、右邊模型選單＋「僅本次」。改選模型只影響這張卡接下來的查詢，**不寫回全域主模型**（主模型仍在 popup／設定頁切）。「修改原文」展開可編輯的輸入框，「重新查詢」或 ⌘／Ctrl+Enter 送出、Esc 取消。

**做法**：
- `content/state.js` 新增 `cardModelOverride`；換新選取、快捷鍵選字、關卡時清掉。請求多帶 `modelOverride` 欄位（字典與串流兩條路都有），快取 key 以「單次模型或主模型」計算，所以切回主模型會命中原本的結果、不重送。
- `background.js`：`validateAIRequest` 新增 `normalizeModelOverride()`——必須是清冊內的 id，只做頁面翻譯的內建模型不能拿來查選取文字，否則回「不支援的模型」／「此模型只能用於全文翻譯」。**與既有 `model` 欄位分開**，因為 `model` 可能帶舊版遺留的 id（由 `normalizeModel`／`getModel` 容錯），不能一起嚴格擋。`handleAIRequest` 補轉傳這個欄位（它原本逐一列欄位，漏列就會靜默失效）。
- 可選模型由新的 `MODEL_AVAILABILITY` 訊息取得：background 依金鑰有無回傳模型 id 清單，**不回金鑰內容**，content 不直接讀金鑰。目前主模型即使缺金鑰也會列出，選單才反映真實狀態。
- 浮球的「收藏／最近查詢／單字本」面板借用同一張卡，新增 `setResultCardQueryMode()`，只有選字查詢時才顯示底部列（施工時從 e2e 截圖發現底部列跑進單字本面板，連帶修改 `content/floating-ball.js` 三處）。
- `onKeyUp` 補「事件發生在我們自己的 UI 內就略過」：否則在原文輸入框按方向鍵會被當成新的選取，把卡片收掉。

**刻意變更的既有測試**：`css.test.js` 原本鎖「模型選單在標題列」與窄螢幕 `order: 3`，改為鎖底部列與原文編輯區樣式；`result-card-position.test.js` 的 vm context 補 `cardModelOverride`。

**驗證**：新增 19 條（background 驗證／路由／可用清單 7、content 單次模型與原文重查 9、底部列只在查詢模式 3）。全套 32 suites／428 tests exit 0、0 skipped；`check-docs --verify` exit 0。**fail-then-pass**：六支實作檔退回 A2 版時紅 18 條（另 1 條「舊 `model` 欄位維持寬鬆」是守衛，本就該綠），還原後 SHA-256 一致、全綠。e2e 連兩次 41 PASS／0 FAIL／4 PARTIAL（另一個 session 同時佔用 4801，改用 `FFB_E2E_PORT=4811`）；另以 harness 實際開頁選字截圖，確認標題列無選單、底部列與原文編輯區版面正常、單字本面板不顯示底部列。

**未驗**：真實模型切換後的回應（需 API key），已列入 `MANUAL-QA.md`。

## 2026-09-30 — 快捷鍵＋右鍵選單

**範圍**：`manifest.json` 加 `contextMenus` 權限與兩個 `commands`——「翻譯選取文字」（Win `Alt+S`、Mac `⌃⇧S`）、「切換全文翻譯」（Win `Alt+A`、Mac `⌃⇧A`）；右鍵選單兩項：「翻翻吧：翻譯選取文字」（contexts: selection）、「翻翻吧：翻譯整頁」（contexts: page）。`background.js` 新增 `registerContextMenus()`／`handleContextMenuClick()`／`handleCommand()`，只把 `{ type: 'FFB_TRIGGER', trigger }` 轉給分頁；`content/main.js` 新增 `onExtensionTrigger()` 接收。popup 新增「快捷鍵」區，用 `chrome.commands.getAll()` 顯示實際綁定的鍵，沒綁上顯示「未設定」，「變更快捷鍵 →」以 `chrome.tabs.create` 開 `chrome://extensions/shortcuts`。

**設計決定**：
- **background 不讀網頁內容**：站點是否停用、有沒有選字都由 content 端自己判斷。停用站點（浮球「暫停」）三種觸發都不作用；沒選字就什麼都不做，不跳錯誤。敏感網域本來就不注入 content script，訊息送不到會靜默略過。
- **快捷鍵不知道焦點在哪個 frame**，所以選取翻譯廣播給全部 frame，只有 `document.hasFocus()` 且焦點不在子 iframe 上的那個處理，避免上下層重複開卡。右鍵選單有 `info.frameId`，直接送到那個 frame、不檢查焦點。
- 快捷鍵是「切換」（已啟用就還原），右鍵「翻譯整頁」只開始、不會反過來把翻譯收掉。全文翻譯只在最上層 frame 處理。
- Mac 預設用 `⌃⇧` 而非 Option：Option＋字母是輸入特殊字元的鍵，被快捷鍵攔走會影響打字。預設鍵若與其他擴充衝突，瀏覽器不會綁上，popup 會如實顯示「未設定」。
- 更新擴充時先 `contextMenus.removeAll()` 再建立，避免重複 id 錯誤。

**測試基礎**：真正生效的 chrome mock 是 `jest.setup.js`（`tests/setup.js` 未被引用），補上 `tabs.sendMessage`、`commands`，`contextMenus.removeAll` 改成會呼叫 callback。

**驗證**：新增 24 條（background 分派 10、content 接收 10、popup 4）：command／右鍵分派到正確 frame、找不到 tab 時改查目前分頁、送不到時回 false 不丟錯、停用站點不作用、沒選字不作用、無焦點 frame 與焦點在子 iframe 時讓出、切換與「只開始」語意、子 frame 不處理全文翻譯、快捷鍵顯示「未設定」、描述含 HTML 只當文字。全套 30 suites／409 tests exit 0、0 skipped；`check-docs --verify` exit 0。**fail-then-pass**：五支實作檔退回 A1 版時 24 條全紅，還原後 SHA-256 一致、全綠。e2e 重新打包後連跑三次皆 41 PASS／0 FAIL／4 PARTIAL。

**未驗**：實機按快捷鍵與右鍵選單（e2e 無法按瀏覽器層快捷鍵，也點不到原生右鍵選單），已列入 `MANUAL-QA.md`。隱私權政策權限表已補 `contextMenus` 用途（文字經 KAKA 核准）。

## 2026-09-30 — 字典卡：例句加粗查詢詞＋CEFR 難度標籤

**範圍**：字典 JSON 每個 example 新增 `surface`（查詢詞在該例句中的原樣，可含詞形變化），頂層新增 `cefr`（僅英文，A1–C2，否則空字串）。`content/utils.js` 新增 `highlightExampleHtml()`、`normalizeCefr()`；`buildDictHTML()` 用它們渲染；`content.css` 加 `.g-ex-hit`、`.g-dict-cefr`；`buildCacheKey()` 前綴 `p${PROMPT_VERSION}`（本次為 2）。

**設計決定**：
- **加粗只取第一個大小寫不敏感的完整比對，比對不到就整句純文字**，不做詞幹還原或模糊比對——模型給錯 surface 時寧可不標，也不標錯字。拉丁／希臘／西里爾字母與數字要落在詞界上（`art` 不會命中 `Start`），中日韓無空格文字不檢查詞界。
- surface 經 regex 跳脫後以字面比對（`C++`、`(approx.)` 不會變成 pattern），切段後逐段 `escapeHtml` 才組字串，surface 本身含 HTML 也只會變成文字。
- `cefr` 只接受 `/^[ABC][12]$/`（大小寫、空白容忍），其餘一律不顯示；標籤放在單字列最右側。
- 舊格式結果（歷史紀錄、改版前的回應）沒有新欄位時照常顯示，不補猜。

**驗證**：新增 `tests/content/dict-examples.test.js` 12 條（surface 存在／缺欄位／不在句中或只在別的詞內／regex 特殊字元／中日文／HTML 跳脫／cefr 合法與非法值／prompt 規格／快取版本）；既有 XSS 回歸測試改注入新 helper。全套 28 suites／385 tests exit 0、0 skipped；`check-docs --verify` exit 0。**fail-then-pass**：五支實作檔退回 HEAD 時紅 10 條（另 2 條是舊格式相容與「非字典 prompt 不帶新欄位」守衛，本就該綠），還原後 SHA-256 一致、全綠。e2e（Mac Chrome for Testing）重新打包後首跑 37/4/4，連兩次重跑皆 41 PASS／0 FAIL／4 PARTIAL，與基準相同；紅的 T5、T6、B1、B2 與本次改動無關，未改碼的基準首跑同樣紅過（見下方「已知」）。

**未驗**：**未以真實模型驗證**——模型實際回傳的 surface 與 cefr 準確度，已列入 `MANUAL-QA.md`。

**已知**：本機 e2e 在全新 profile 或重新打包後的第一次完整跑，ui-panels／legacy-regression 間歇會紅 3–4 案（不是每次），重跑即恢復，根因未查。

## 2026-09-30 — `check-docs --verify` 在 worktree 內無法執行

`scripts/check-doc-numbers.js` 實跑 jest 時帶 `--testPathIgnorePatterns /\.claude/`，本意是排除主樹底下 `.claude/worktrees/` 的並行 worktree。但若 checkout 本身就在 `.claude/worktrees/<name>/` 裡，自己的測試路徑也含 `/.claude/`，會被整批濾掉、jest 以「找不到測試」失敗，`--verify` 回 exit 2「未檢」。

**修法**：pattern 改成 `<rootDir>/\.claude/`，只排除「本 checkout 根目錄底下」的 `.claude/`。主樹行為不變。

**驗證**：`--selftest` 新增 2 案（worktree 內不濾掉自己、主樹仍排除並行 worktree），11/11 PASS；退回舊 pattern 時新案紅 1 條（10/11）、還原後全綠。worktree 內 `check-docs --verify` exit 0（27／373）；主樹以新 pattern `jest --listTests` 得 27 支、未過濾為 80 支。

## 2026-09-30 — e2e 首跑間歇紅燈：浮球選單點擊靜默落空

**症狀**：全新 profile 或重新打包後的第一次完整跑，ui-panels 的 T2／T5／T6、B1／B2 間歇紅（`mode {}→{}`、「（無面板）」、等 `#gemini-result-card.g-show` 逾時），重跑即綠。

**根因（harness）**：收起的浮球選單是 `opacity: 0`＋`pointer-events: none`，Playwright 仍判 visible；`clickStable` 用 force click，打在收起的選單上會穿透到底下頁面、不報錯。選單被收起的觸發點：浮球先插在頁面左側，等 `storage.local` 讀回位置才移到右緣；storage 慢時 harness 在這段空窗就展開選單，球一移走游標就不在球上 → mouseleave → 220ms 後選單自己收起。

**修正**：`expandBall` 改等浮球定位完成（`style.top` 已寫入）與選單轉場跑完（`ffb-menu-open`＋opacity 1）；新增 `clickBallItem`，點之前確認選單開著、點之後確認 click 事件真的送達按鈕，否則明確報錯。T5／T6 的固定等待改成等高亮結果出現／消失。

**驗證**：受控重現（展開後讓游標離開）舊 harness 點擊落空、`vocabularyHighlightMode` 維持 `{}`，新 harness 寫入 `auto`；定位空窗重現：空窗內展開 → 位置還原後選單 `open=false`。全新 profile 連三次首跑皆 41 PASS / 0 FAIL / 4 PARTIAL；Jest 27 suites／373 tests 全過。

**未重現**：原始環境下 storage 讀取為何慢到超過 250ms（本機閒置時空窗約 5ms，加 CPU 負載也未重現）屬推論。

## 2026-09-21 — 內建模型下載進度條

內建翻譯首次使用要下載語言包（實測 4.8–14.8 秒），原本這段完全沒有回饋，使用者只會看到面板卡住。

串流 port 本來就有 `onStatus` 通道，但 content 端從未接過。這次把它接起來：`Translator.create()` 的 `monitor` 把 `downloadprogress` 轉成 `{ kind: 'download-progress', percent }` 送出，content 收到後渲染面板裡的進度條，100% 自動收起。非串流路徑不帶 `onProgress`，也就不會裝 monitor。

**踩到的坑**：原本想把百分比寫進 `.ffb-page-panel-status`，寫完才發現它在 `content.css` 是 `display: none !important`——使用者根本看不到。改成進度條自帶可見標籤，並補一條測試同時斷言「status 是 display:none」與「標籤才是承載百分比的元素」，免得日後有人又把文字塞回那個隱形元素。

進度條帶 `role="progressbar"` 與 `aria-valuenow`，百分比超出範圍會夾在 0–100，並尊重 `prefers-reduced-motion`。

**驗證**：新增 7 條測試（背景送出序列、標籤與寬度、可存取性屬性、100% 收起、越界夾住、CSS 樣式存在），全套 27 suites／373 tests exit 0、0 skipped；`check-docs --verify` exit 0。退回三支實作檔＋CSS 後剛好紅 7 條、還原後全綠且四檔 SHA-256 一致。

**未驗**：真實下載情境的視覺（自動化只驗 DOM 與樣式字串），仍須人工載入擴充跑一次首次下載。

## 2026-09-21 — 瀏覽器內建翻譯 provider（免金鑰，只做頁面翻譯）

Chrome 138+ 的 `Translator` API 接成第四個 provider。**沒有金鑰也能用全文翻譯**，模型就緒後 20 段批次實測 313 ms（15.7 ms/段），比雲端往返快一到兩個數量級。可行性證據見 2026-09-20 的實機 probe 與 memory `reference_chrome_builtin_ai_probe`。

**範圍**：`models.js` 加 `builtin:translator`（provider `builtin`、`keyless`、`pageTranslationOnly`、無備援模型）；`resolveRoute()` 認 `builtin:` 前綴且不查金鑰；新 `handleBuiltinTranslateRequest()`；`popup`／`options` 認 keyless。

**三個設計決定**：
- **只接頁面翻譯**。詞典模式同樣是 `action='translate'`，差別在有沒有 `pageTranslation`——內建 API 只吐譯文、給不出詞典要的結構化 JSON，所以閘門卡 `pageTranslation` 而不是卡 action。它也因此**不進主模型選單**（`pageTranslationOnly`），只出現在頁面翻譯專用選單；選得到卻必定失敗比沒得選更糟。
- **batch 由新 provider 遷就既有契約**：拆成逐段 `translate()` 再組回 `{translations:[{id,translation}]}`，content 端一行未改。
- **來源語言整批偵測一次**：實測短片段信心極低（`Home` 0.645、`2026-09-20` 0.279，對照長句 1.000），逐段偵測會把日期當英文送去翻。信心 < 0.8 不翻並明說「無法判定來源語言」；偵測結果等於目標語言則原文回傳、不送翻譯。

**施工中發現、計畫原本漏掉的兩處**：①**頁面翻譯實際走串流 port**（`chrome.runtime.connect({name:'ai-stream'})`），只接非串流路徑的話選內建會靜默掉進 Gemini 分支拿空金鑰——已在 `_streamAIRequest` 一併接線，內建無串流故以單一 chunk 交付 ②`popup.getApiKeyStatus` 直接取 `PROVIDERS[provider].apiKeyName`，keyless 會顯示假的「缺 key」。

**驗證**：新增 16 條測試，全套 27 suites／366 tests exit 0、0 skipped；`check-docs --verify` exit 0。**兩輪 fail-then-pass**：第一輪退回接線時發現 8 條直接呼叫 handler 的測試照樣綠、只有 1 條紅——代表路由是零覆蓋，補了 `resolveRoute`／非串流／串流三條接線測試後再退回，紅 3 條；最後把四支實作檔整組退回 HEAD，紅 18 條、還原後 366 全綠且 SHA-256 與修復版一致。既有的「清冊剛好四顆」與「PROVIDERS ⟺ host_permissions 對賬」兩條守衛如預期擋下這次改動，已依刻意變更更新期望值（後者改成 keyless 才准略過，並斷言略過清單恰為 `['builtin']`，避免日後漏填 apiBase 被靜默放行）。

**未驗**：真實網頁的端到端頁面翻譯（需載入擴充人工跑）；全部自動化證據都是 mock 層。首次下載的進度條 UI **尚未實作**，目前使用者會看到 4.8–14.8 秒無回饋。

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
