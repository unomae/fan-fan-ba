# B3 — Obsidian 設定 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜1 PASS｜0 FAIL｜4 SKIP

## 測試案例

- [ ] TC-B3-001 設定 Vault 與資料夾後存入筆記（SKIP · manual gate / 證據不足）
- [ ] TC-B3-002 留空 Vault 與首次記住資料夾（SKIP · manual gate / 證據不足）
- [ ] TC-B3-003 Advanced URI 缺失與 scheme 白名單（SKIP · manual gate / 證據不足）
- [ ] TC-B3-004 路徑字元與長度邊界（SKIP · manual gate / 證據不足）
- [x] TC-B3-005 行動版 Obsidian 設定

## 執行證據

### TC-B3-001 · SKIP

未啟動真實 Obsidian 或寫入測試 Vault。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B3-002 · SKIP

未啟動真實 Obsidian，目前 Vault fallback 與最近資料夾需人工驗。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B3-003 · SKIP

未呼叫外部 app；惡意 scheme 白名單由 Jest 與背景訊息測試覆蓋。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B3-004 · SKIP

Options 可安全儲存 Unicode 路徑；未對外部 Obsidian 執行路徑穿越／URI 寫入。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B3-005 · PASS

375px obsidian 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B3-005-obsidian-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
