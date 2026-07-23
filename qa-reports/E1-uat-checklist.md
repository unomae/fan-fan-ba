# E1 — Popup 與設定狀態摘要 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜5 PASS｜0 FAIL｜0 SKIP

## 測試案例

- [x] TC-E1-001 Popup 顯示目前模型與 readiness
- [x] TC-E1-002 Popup 快速切換模型
- [x] TC-E1-003 缺設定與完整設定入口
- [x] TC-E1-004 舊設定、快速連點與 Popup 壽命
- [x] TC-E1-005 Popup 375px 與實際工具列尺寸

## 執行證據

### TC-E1-001 · PASS

Popup readiness 與模型摘要可見；dummy Key 未明文顯示=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E1-002 · PASS

3 個模型快速切換後最後選擇持久化=openrouter:deepseek/deepseek-v4-flash:free；未送真實 provider request。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E1-003 · PASS

缺設定狀態明確；完整設定入口開啟正確 extension context=true（pages 5→5）。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E1-004 · PASS

未知舊模型 normalize 後未出現 undefined/null=true；pageerror=0。

證據：查無截圖；詳見自動化結果紀錄。

### TC-E1-005 · PASS

375px Popup scrollWidth=375, clientWidth=375。

證據：`screenshots/E1-TC-E1-005-popup-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
