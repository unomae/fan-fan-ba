# E2 — Welcome 與首次使用導引 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜4 PASS｜0 FAIL｜1 SKIP

## 測試案例

- [x] TC-E2-001 首次安裝顯示完整三步導引
- [x] TC-E2-002 稍後再說與重新進入
- [x] TC-E2-003 外部連結與 extension 權限邊界
- [ ] TC-E2-004 重複事件與內容邊界（SKIP · manual gate / 證據不足）
- [x] TC-E2-005 行動版 Welcome

## 執行證據

### TC-E2-001 · PASS

首次 install 已由 fresh profile 自動開 Welcome；三步內容可讀（step-like=10），設定入口有效=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E2-002 · PASS

稍後再說可關閉分頁=true；direct welcome re-entry 可用=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E2-003 · PASS

外部連結 2 個，均未帶 API Key/token=true；未登入、未傳送資料。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E2-004 · SKIP

多 Welcome 分頁可開；未重新觸發瀏覽器 install/update 事件，不能宣稱事件去重通過。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E2-005 · PASS

375px Welcome scrollWidth=375, clientWidth=375。

證據：`screenshots/E2-TC-E2-005-welcome-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
