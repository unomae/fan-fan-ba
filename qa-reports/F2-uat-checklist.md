# F2 — 浮球、全文翻譯與站點控制 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜1 PASS｜1 FAIL｜3 SKIP

## 測試案例

- [ ] TC-F2-001 浮球啟動全文翻譯與模式切換（SKIP · manual gate / 證據不足）
- [ ] TC-F2-002 Alt+T 單段翻譯與續翻（SKIP · manual gate / 證據不足）
- [x] TC-F2-003 缺 Key、站點停用與敏感網域
- [ ] TC-F2-004 超長頁、局部失敗與重試（SKIP · manual gate / 證據不足）
- [ ] TC-F2-005 行動版浮球與全文面板（FAIL → QA-P1-003）

## 執行證據

### TC-F2-001 · SKIP

全文翻譯入口可觸發，缺 Key 狀態可見=true；未做實際段落翻譯。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F2-002 · SKIP

Alt+T 可觸發前置路徑，但無全文翻譯 Key，未驗證續翻與請求去重。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F2-003 · PASS

缺 Key 不送請求；站點停用狀態寫入隔離 profile 並於 reload 保留=true。敏感網域由 manifest exclude + Jest 覆蓋。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F2-004 · SKIP

已建立 120 段／動態內容測試頁；無 API Key，未注入 429／中斷／局部重試。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F2-005 · FAIL

375px 浮球選單位於 viewport 內=false；無 Key，全文面板內容測試受 manual gate 限制。

證據：`screenshots/F2-TC-F2-005-floating-menu-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
