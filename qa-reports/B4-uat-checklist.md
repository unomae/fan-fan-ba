# B4 — 備份還原 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜5 PASS｜0 FAIL｜0 SKIP

## 測試案例

- [x] TC-B4-001 一般設定 JSON round-trip
- [x] TC-B4-002 加密 Key 與單字本替代備份
- [x] TC-B4-003 錯誤檔案、密碼與匯入權限
- [x] TC-B4-004 惡意與極限備份內容
- [x] TC-B4-005 行動版備份還原頁

## 執行證據

### TC-B4-001 · PASS

一般設定 round-trip=true；匯出檔不含 API Key=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B4-002 · PASS

API Key 只存在加密 payload=true；單字 JSON count=1；XLSX ZIP magic=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B4-003 · PASS

損毀 JSON 明確失敗="匯入失敗：JSON 格式不正確"；現有 sync 設定未被部分覆寫=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B4-004 · PASS

>10MB 明確拒絕="檔案太大（上限 10MB），請確認是翻翻吧的單字本備份。"；Object prototype 未污染=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B4-005 · PASS

375px backup 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B4-005-backup-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
