# CHANGELOG — 翻翻吧

> 已結案的工作紀錄，新的在上。`PLAN.md` 只放「現在與下一步」，完成項搬來這裡。
> 更早的歷史脈絡在 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史。

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
