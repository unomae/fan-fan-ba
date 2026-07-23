# 翻翻吧 v1.9.9 Phase 0-B 測試規格索引

- 日期：2026-07-24（Asia/Taipei）
- 模組：12
- 測試案例：60
- 每個模組均涵蓋：正向主流程、替代流程、負向流程、邊界測試、權限驗證、狀態轉換、RWD
- 執行狀態：僅完成規格，尚未開始 Phase 0-C／Phase 1

## 前台

- [F1 — 網頁注入、選字工具列與結果卡](F1-test-spec.md)
- [F2 — 浮球、全文翻譯與站點控制](F2-test-spec.md)
- [F3 — 收藏、單字本、最近查詢與 Obsidian 入口](F3-test-spec.md)

## 設定

- [B1 — 模型與金鑰](B1-test-spec.md)
- [B2 — 語言與朗讀](B2-test-spec.md)
- [B3 — Obsidian](B3-test-spec.md)
- [B4 — 備份還原](B4-test-spec.md)
- [B5 — 雲端同步](B5-test-spec.md)
- [B6 — 隱私、診斷與功能說明](B6-test-spec.md)

## 整合

- [E1 — Popup 與設定狀態摘要](E1-test-spec.md)
- [E2 — Welcome 與首次使用導引](E2-test-spec.md)
- [E3 — Service Worker、Options 啟動與跨元件訊息](E3-test-spec.md)

## 已知缺陷回歸錨點

- QA-P1-001 → `TC-F3-001`：浮球收藏入口必須顯示學習庫。
- QA-P2-002 → `TC-E3-003`：Options 啟動不得出現 TDZ 錯誤。

## 下一階段 gate

- B5 需要 Google OAuth session，因此確認本批規格後必須進 Phase 0-C。
- 真實 API Key、Google 登入與 Drive appData 上傳／下載均保留人工授權，不在規格階段執行。
