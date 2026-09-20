# PLAN.md — 翻翻吧施工計劃（活文件）

> 排版：主題分組＋目的／現況／接續／詳情四欄；原優先序、核准與待驗狀態不變，本輪未重驗產品。維護時保留四欄，舊紀錄以各指標核對。

> 建立於 2026-08-25，由 Ox Alpha 接手輪整理。事實來源以 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史為準；本檔只放「現在與下一步」；**完成項一律搬 `CHANGELOG.md`**，更早的歷史脈絡留在上述正本。

## 現況快照

| 項目 | 狀態 |
|------|------|
| 版本 | v1.11.1（package.json；尚未發布到 Chrome Web Store） |
| 自動化單元測試 | <!-- ffb:suites -->27<!-- /ffb:suites --> suites / <!-- ffb:tests -->350<!-- /ffb:tests --> tests 全綠（2026-09-20，含模型清冊完整性鎖與錯誤碼型別回歸） |
| e2e | `npm run e2e`：Playwright 驅動真 Chrome ＋ 真擴充，45 案＝41 PASS / 0 FAIL / 4 PARTIAL（2026-08-26；改 code 先 `npm run package`） |
| 手動 QA | 全表 55/78；剩 23 項幾乎全卡「無 API key」或「需外部 App／帳號」（見 `MANUAL-QA.md` 執行順序節） |
| 上架 | **2026-09-20 裁決：暫緩送審，先做功能**，告一段落再回頭走上架流程。Chrome Web Store 仍是 release checkpoint |
| 2026-08-26 全面審查 | 四路平行審查完成：code（30+ 項）、UI/UX（30 項）、流程（A1-A6＋B1-B5）；總評＝工程底子前段班，上架 blocker 集中在安全 P1×2、a11y、上架材料 |

## 下一步（依序）— 2026-08-26 審查後重排

### 上架準備與驗收

- **1. Sprint 1 上架 blocker**

  - **目的**：補齊擴充功能上架前的阻塞項。
  - **現況**：只剩 1280×800 截圖產出（Tier 5 gating，需人工）。**2026-09-20 裁決：暫緩**——KAKA 要先做功能，等告一段落再回頭。
  - **接續**：暫緩中，不主動推進也不列為阻塞；KAKA 說回頭做上架時再補商店截圖及剩餘人工驗收。
  - **詳情**：`MANUAL-QA.md`；`TESTING.md`；`CHANGELOG.md`

### 翻譯與資料可靠性

- **3. 清 Tier 3／4 剩餘項**

  - **目的**：補上自動測試無法代替的真實情境。
  - **現況**：**清 Tier 3／4 剩餘項**：需要 KAKA 決定是否配真實 API key（2026-08-14 裁決：QA profile 不配 key，這些項不會被自動化涵蓋）；Obsidian 落檔需真 App。 ⚠️ **根 PLAN P-16 的①預設模型能實際翻譯、③404 備援實跑，兩項卡在同一個裁決上**（②四顆模型清冊已於 2026-09-09 用測試鎖住，見 `CHANGELOG.md` 2026-09-09）。維持不配 key 就只能由 KAKA 本人拿自己的 key 手動跑一次；`check-models.js` 也因此只涵蓋 OpenRouter、蓋不到預設模型。
  - **接續**：KAKA 用真 key 完成 Tier 3／4；候選修改先裁決。
  - **詳情**：`CHANGELOG.md`；`scripts/check-models.js`

### 上架準備與驗收（續 2）

- **4. Tier 5 送審前 gating**

  - **目的**：達到送審前的 OAuth 與商店條件。
  - **現況**：**Tier 5 送審前 gating**：正式 OAuth client_id 確認（T7，需人工進 Google Cloud Console）、依 `STORE-SUBMISSION.md` 打包送審。
  - **接續**：**2026-09-20 裁決暫緩**，與 Sprint 1 上架 blocker 同步；回頭做上架時才由 KAKA 處理 client ID 與 console／商店人工項，再核對 Tier 5。
  - **詳情**：`STORE-SUBMISSION.md`

### 介面與操作體驗

- **5. Sprint 3 中期**

  - **目的**：改善中期介面與 DOM 維護。
  - **現況**：**Sprint 3 中期**：dom.js innerHTML 遷移完成、高亮／全文翻譯接 DOM 變更感知層、dark mode 第一階段、design token 收斂（error/focus 色、glass 參數）＋術語表。
  - **接續**：依 Sprint 3 原優先序處理，先核對研究與施工界線。
  - **詳情**：`MANUAL-QA.md`；`TESTING.md`；`CHANGELOG.md`

### 內建翻譯 provider

- [ ] **7. 內建翻譯 provider｜待裁決三點後開工**〔待裁決〕（2026-09-20）

  - **目的**：讓沒有金鑰的人也能用全文翻譯，有金鑰者這條路徑改走本機；詞典與 optimize 不動。
  - **現況**：可行性已驗完（見第 6 項）。**施工範圍四處**：①`models.js` 加 `builtin:translator` 條目（`provider: 'builtin'`、無備援模型，確認 `shouldFallbackModel`／`toApiModelId` 對它 no-op）②`background.js` 的 `resolveRoute()` 認 `builtin:` 前綴回 `{ kind: 'builtin' }`、不需 apiKey ③新函式只收 `action === 'translate'`，**batch 模式拆成逐段 `translate()` 再組回既有 `{translations:[{id,translation}]}` 契約**（讓新 provider 遷就既有契約，content 端零修改，風險鎖在 background 一層）④設定頁模型選單加「瀏覽器內建（免金鑰・僅全文翻譯）」並在非 translate 操作停用。
  - **接續**：**KAKA 2026-09-20 已裁決**：①來源語言用 `LanguageDetector` 偵測 ②有金鑰者的預設不改（內建只當額外選項）③首次下載顯示進度條。裁決落地要點（實測依據）：`LanguageDetector` 已是 `available` 免下載，輸出為依信心排序的 `{detectedLanguage, confidence}` 陣列並含 `und`；但**短片段信心極低**（`Home` 0.645、`2026-09-20` 0.279，對照長句 1.000、`Add to cart` 0.997），所以 **batch 要合併後偵測一次、整批共用來源語言，不得逐段偵測**；另需定信心門檻的退路，以及偵測結果等於目標語言時跳過不翻。開工前只剩這兩個小決定。**完成條件**：單元測試 mock `self.Translator` 鎖住 batch id 與順序、非 translate 被擋、`create()` 失敗可辨識；既有測試全綠 0 skipped；實機在 Chrome 對真實網頁跑一次 batch。**不做**：詞典、optimize、Prompt API、既有 provider 行為。
  - **詳情**：`background.js` 的 `resolveRoute`／`handleOpenAICompatRequest`（引用符號不引行號）；`models.js` 的 `PROVIDERS`；可行性證據見本檔第 6 項與 memory `reference_chrome_builtin_ai_probe`

### 待評估構想

- **6. 同類專案調研的兩條待裁線索**

  - **目的**：判斷同類專案線索是否值得採用。
  - **現況**：兩條線索，第一條已實測、第二條仍未評估。 - **Chrome 內建 AI 翻譯｜2026-09-20 真機實測（Chrome 152, Mac）**：`Translator`／`LanguageDetector` 可用，en→zh-Hant 下載後轉 `available`；首次含下載 4.8 秒，模型就緒後 **20 段批次 313 ms（15.7 ms/段）**，並行無加速（證實官方「循序處理」）；譯文全形標點、品質堪用；磁碟增量約 776 MB（`df` 差值、非純語言包大小）。**一條硬約束＋一條已解除**：①**`downloadable` 不是承諾**（見下）②手勢限制**只在一般網頁**——2026-09-20 以最小測試擴充實測，MV3 **service worker 用從未下載過的 `en→ko` 直接 `create()`，無手勢即觸發下載**（收到進度事件、100%、含下載 14.8 秒、譯文正確、轉 `available`），content script 亦可用。**所以內建翻譯可整包放 `background.js` 走 `resolveRoute()` 加 `kind: 'builtin'`，不必為首次下載另做啟用 UI**（但 14.8 秒空白仍該顯示進度）。另一眉角：SW 的 `availability()` 回報偏保守（模型已在仍回 `downloadable`），判可用性要看 `create()` 結果。原 ②**`downloadable` 不是承諾**：實測下載 100% 後仍拋過 `NotSupportedError`（第二次才成功），程式須把 `create()` 失敗當正常路徑並退回雲端 provider。**能力邊界**：只做翻譯，**詞典結構化輸出與 optimize 做不到**；`LanguageModel`（Prompt API）在 Chrome 152 **存在**（Edge Beta 154 沒有），但要下載 Gemini Nano 才能驗，**KAKA 2026-09-20 裁決不驗**。**地基已驗**（2026-09-20，見上）。**Edge 結果不得外推 Chrome**（Edge 無 Prompt API、標點為半形）。所以它打不到「23 項手動 QA 卡無 key」（那些多在驗詞典與 provider 行為），真正能解的是**新使用者第一哩路**：沒金鑰也能用全文翻譯。 - **自訂 OpenAI 相容端點**：`kiss-translator`／`MTranServer` 顯示這是本品類標配，加一個欄位即可讓模型下架時使用者自救。與 `check-models.js` 是互補而非重疊（一個偵測、一個逃生）。
  - **接續**：先評估兩條研究線索，未裁決前不排成施工。
  - **詳情**：`scripts/check-models.js`

## 缺資料／風險處置待決

### 已知風險／技術債（有證據）

### 翻譯與資料可靠性（續 2）

- **cutover｜舊 DB 佔用情境未驗**

  - **目的**：釐清舊 DB 被佔用時的清理風險。
  - **現況**：風險：cutover 刪庫的 `onblocked` 路徑從未驗證（舊 DB 被佔住時 fire-and-forget，靠下次啟動補刪） | 證據：`vocabulary-store.js:229`、`MANUAL-QA.md`〈還沒驗到的〉段 | 處置建議：低機率；可補一條多 context 的 e2e 或接受現狀並記錄
  - **接續**：先補 onblocked 自然情境證據，再決定處置；不直接刪庫。
  - **詳情**：`vocabulary-store.js:229`；`MANUAL-QA.md`

- **replaceAll({clearing:true}) 無 production 觸發者，handleMessage 不轉發 clearing**

  - **目的**：確認 clearing 介面是否有正式用途。
  - **現況**：風險：`replaceAll({clearing:true})` 無 production 觸發者，handleMessage 不轉發 clearing | 證據：`vocabulary-store.js:304`、`:375` | 處置建議：未來加「清空單字本」鈕時必須一起接線＋補驗，否則快照刪除語意靜默失效
  - **接續**：先追 production caller 與 handleMessage 契約，再決定保留或處置。
  - **詳情**：`vocabulary-store.js:304`

### 介面與操作體驗（續 2）

- **content.css 整理（2708 行）deferred**

  - **目的**：保留 CSS 整理的延後決策。
  - **現況**：風險：`content.css` 整理（2708 行）deferred | 證據：`MANUAL-QA.md` 末節 | 處置建議：維持 deferred，動它前先讀更新規則
  - **接續**：維持 deferred，等明確核准再整理。
  - **詳情**：`MANUAL-QA.md`

### 翻譯與資料可靠性（續 3）

- **字串型 error code 要不要對映成 HTTP 語意**〔待裁決〕

  - **目的**：決定非數字的 body 層 error code 是否該觸發重試或備援。
  - **現況**：型別汙染本體已修（2026-09-20，見 `CHANGELOG.md`）：`err.status` 一律是數字、原值存 `err.code`。但 `model_not_found`／`rate_limit_exceeded` 這類**純字串 code 會是 `status = 0`**，既不重試也不切備援——只是不再假裝成數字。要不要建對映表，會擴大 `shouldFallbackModel` 的行為範圍。
  - **接續**：KAKA 裁決要不要做；要做先蒐集實際 provider 回傳的 code 樣本，不憑猜測建表。
  - **詳情**：`background.js` 的 `handleOpenAICompatRequest`／`streamOpenAICompat`（**引用符號不引行號**）；`models.js` 的 `shouldFallbackModel`

### 介面與操作體驗（續 3）

- **浮球三面板假 savedSel 會把面板名當原文存進 Obsidian 週記**

  - **目的**：避免把面板名稱當翻譯原文匯出。
  - **現況**：風險：浮球三面板假 `savedSel` 會把面板名當原文存進 Obsidian 週記 | 證據：floating-ball.js:329-410 | 處置建議：加面板模式旗標，非翻譯模式擋存入或隱藏寶石鈕
  - **接續**：用三面板操作核對 savedSel，依原處置建議接續。
  - **詳情**：`MANUAL-QA.md`；`TESTING.md`；`CHANGELOG.md`

- **innerHTML 主流路徑遇 Trusted Types 頁面（Google 系）UI 全滅**

  - **目的**：確認嚴格 Trusted Types 頁面仍能操作。
  - **現況**：風險：innerHTML 主流路徑遇 Trusted Types 頁面（Google 系）UI 全滅 | 證據：content/*.js 多處；dom.js 安全 builder 遷移不到一半 | 處置建議：完成 ffbEl 遷移，過渡期包 createPolicy fallback
  - **接續**：先以指定頁面重現與界定 DOM 注入路徑，再接原處置建議。
  - **詳情**：`MANUAL-QA.md`；`TESTING.md`；`CHANGELOG.md`

## 驗證指令速查

```bash
npm test                                  # Jest 30 + jsdom（覆蓋率預設開）
npx jest --testPathIgnorePatterns '/\.claude/'   # 主樹取值用
npm run package                           # 產 dist/pkg + zip（e2e / 載入前必跑）
npm run e2e                               # Playwright 真 Chrome 45 案
npm run check-models                      # OpenRouter 模型下架對賬（免 key；0=通過 1=有下架 2=未檢）
node scripts/check-models.js --selftest    # 對賬邏輯自測，期望 SELFTEST 7/7 PASS
npm run check-docs                        # 現況數字一致性（快，不跑 jest；0=一致 1=不一致 2=未檢）
npm run check-docs -- --verify            # 權威版：實跑 jest 對照文件數字（慢，release／CI 用）
node scripts/check-doc-numbers.js --selftest  # 期望 SELFTEST 9/9 PASS
```

> **改測試數時**：現況數字用 `<!-- ffb:tests -->N<!-- /ffb:tests -->`（`N` 換成實際數字）這種標記包住，`check-docs` 只認標記、不碰未標記的歷史數字。新增一處現況宣稱要記得加標記，新增檔案要加進 `scripts/check-doc-numbers.js` 的 `FILES`。此處 `N` 是佔位符、刻意不寫成數字，否則這行說明自己會被當成一處現況宣稱。

> 更新規則：完成一個 slice 就把它從「下一步」移進 `CHANGELOG.md`，本檔不留完成紀錄；測試數字異動時同步 `TESTING.md` 標頭與 `MANUAL-QA.md` 頂部計數。
