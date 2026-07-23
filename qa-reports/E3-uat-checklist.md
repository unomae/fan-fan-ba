# E3 — Service Worker、Options 啟動與跨元件訊息 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜3 PASS｜1 FAIL｜1 SKIP

## 測試案例

- [x] TC-E3-001 Service Worker 啟動、休眠與喚醒
- [ ] TC-E3-002 跨元件請求 correlation（SKIP · manual gate / 證據不足）
- [ ] TC-E3-003 Options 啟動不得發生 TDZ 錯誤（FAIL → QA-P2-002）
- [x] TC-E3-004 惡意訊息、重複安裝與權限邊界
- [x] TC-E3-005 雙端 extension page 與背景一致性

## 執行證據

### TC-E3-001 · PASS

Service Worker 可喚醒=true；本輪 worker console errors=0。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E3-002 · SKIP

無真實 API Key，未做雙分頁並行 AI request correlation。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E3-003 · FAIL

Options 啟動重現 TDZ：Cannot access 'LAST_VOCAB_BACKUP_KEY' before initialization

證據：`screenshots/B1-options-desktop-runtime.png`、`screenshots/20260724-p2-options-tdz-error.jpg`

### TC-E3-004 · PASS

4 組 malformed／未知訊息均被忽略或結構化拒絕=true；worker 未崩潰。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E3-005 · PASS

Options／Popup／Welcome 雙端巡覽後仍連到同一 service worker=true；新增 worker error=0。

證據：`screenshots/E1-TC-E1-005-popup-mobile.png`、`screenshots/E2-TC-E2-005-welcome-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
