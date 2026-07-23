# F1 — 網頁注入、選字工具列與結果卡 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜3 PASS｜0 FAIL｜2 SKIP

## 測試案例

- [ ] TC-F1-001 選字後完成翻譯、解釋與優化（SKIP · manual gate / 證據不足）
- [ ] TC-F1-002 iframe 與主頁的替代選字路徑（SKIP · manual gate / 證據不足）
- [x] TC-F1-003 缺 Key、敏感頁與敏感欄位保護
- [x] TC-F1-004 空白、超長與惡意選取內容
- [x] TC-F1-005 行動版工具列與結果卡

## 執行證據

### TC-F1-001 · SKIP

工具列注入與 3 個操作按鈕已實測（visible=true, buttons=3），但無真實 API Key，未執行翻譯／解釋／優化 runtime。

證據：`screenshots/F1-TC-F1-001-selection-toolbar-pass-desktop.png`

### TC-F1-002 · SKIP

主頁工具列=true、iframe 工具列=true、top-frame 浮球=1；無 Key，未完成 iframe 翻譯 runtime。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F1-003 · PASS

缺 Key 顯示可行動提示、未送 AI 請求；password 欄位選取不顯示工具列=true。manifest denylist 另由靜態與 Jest 覆蓋。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F1-004 · PASS

惡意字串以 host 純文字處理；window.__xssExecuted=false；工具列數=1。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F1-005 · PASS

375px viewport 工具列位於畫面內=true。host 故意有寬內容，不拿整頁 overflow 冒充 extension 缺陷。

證據：`screenshots/F1-TC-F1-005-toolbar-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
