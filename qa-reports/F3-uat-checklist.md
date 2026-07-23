# F3 — 收藏、單字本、最近查詢與 Obsidian 入口 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜0 PASS｜2 FAIL｜3 SKIP

## 測試案例

- [ ] TC-F3-001 浮球收藏入口顯示學習庫（FAIL → QA-P1-001）
- [ ] TC-F3-002 從結果卡與歷史紀錄進入學習流程（SKIP · manual gate / 證據不足）
- [ ] TC-F3-003 Obsidian 不可用與 URI 權限邊界（SKIP · manual gate / 證據不足）
- [ ] TC-F3-004 大量／惡意單字與高亮排除（SKIP · manual gate / 證據不足）
- [ ] TC-F3-005 行動版學習庫（FAIL → QA-P1-001）

## 執行證據

### TC-F3-001 · FAIL

收藏面板 state={"exists":true,"opacity":"0","visibility":"visible","display":"flex","showClass":false}；重現 DOM 已建立但 opacity=0。

證據：`screenshots/F3-TC-F3-001-library-invisible-fail-desktop.png`

### TC-F3-002 · SKIP

前置的收藏／紀錄面板被 QA-P1-001 阻擋，且無真實翻譯結果可建立歷史。

證據：`screenshots/F3-TC-F3-001-library-invisible-fail-desktop.png`

### TC-F3-003 · SKIP

未啟動外部 Obsidian／Advanced URI；scheme 白名單改由 Jest 與程式碼稽查證明。

證據：查無截圖；詳見自動化結果紀錄。

### TC-F3-004 · SKIP

收藏入口被 QA-P1-001 阻擋；5,000 筆邊界保留給修復後回歸。

證據：`screenshots/F3-TC-F3-001-library-invisible-fail-desktop.png`

### TC-F3-005 · FAIL

375px 由浮球開啟學習庫可見=false；同受 QA-P1-001 阻斷。

證據：`screenshots/F3-TC-F3-005-library-invisible-fail-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
