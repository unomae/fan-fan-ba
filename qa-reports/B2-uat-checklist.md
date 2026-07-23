# B2 — 語言與朗讀 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜1 PASS｜0 FAIL｜4 SKIP

## 測試案例

- [ ] TC-B2-001 儲存語言、朗讀與高亮偏好（SKIP · manual gate / 證據不足）
- [ ] TC-B2-002 瀏覽器內建 TTS 替代路徑（SKIP · manual gate / 證據不足）
- [ ] TC-B2-003 無效 TTS Key 與語音權限（SKIP · manual gate / 證據不足）
- [ ] TC-B2-004 語系與特殊內容邊界（SKIP · manual gate / 證據不足）
- [x] TC-B2-005 行動版語言與朗讀頁

## 執行證據

### TC-B2-001 · SKIP

語言／朗讀／高亮設定可持久化（target=ja）；未執行 AI 輸出與真實朗讀。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B2-002 · SKIP

無人工音訊聆聽證據，不把 speechSynthesis API 存在冒充 TTS 可用。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B2-003 · SKIP

未向 Google Cloud TTS 傳送 dummy Key；網路拒絕與語音不可用保留 runtime gate。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B2-004 · SKIP

語系選單與特殊字元輸入穩定；未完成混合語句的翻譯／朗讀輸出。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B2-005 · PASS

375px language 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B2-005-language-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
