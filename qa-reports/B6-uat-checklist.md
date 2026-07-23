# B6 — 隱私與說明 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜5 PASS｜0 FAIL｜0 SKIP

## 測試案例

- [x] TC-B6-001 本機診斷計數與自檢
- [x] TC-B6-002 缺 Key 與補回 Key 的替代狀態
- [x] TC-B6-003 清除診斷資料與儲存權限
- [x] TC-B6-004 隱私邊界與無 telemetry
- [x] TC-B6-005 行動版隱私與診斷頁

## 執行證據

### TC-B6-001 · PASS

隱私頁顯示 v1.9.9；診斷未渲染選取內容／URL=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B6-002 · PASS

隔離 profile 診斷清除後不含測試內容=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B6-003 · PASS

隱私說明涵蓋本機儲存、API Key 與雲端邊界；未發現未宣告權限文案。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B6-004 · PASS

Options console／pageerror 未含 dummy 選取內容、URL 或 Key=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B6-005 · PASS

375px privacy 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B6-005-privacy-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
