# B5 — 雲端同步 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜1 PASS｜0 FAIL｜4 SKIP

## 測試案例

- [ ] TC-B5-001 Google 登入、上傳與下載（SKIP · manual gate / 證據不足）
- [ ] TC-B5-002 Native Auth 與 Web Auth fallback（SKIP · manual gate / 證據不足）
- [ ] TC-B5-003 未登入、過期 token 與權限拒絕（SKIP · manual gate / 證據不足）
- [ ] TC-B5-004 覆寫衝突與版本邊界（SKIP · manual gate / 證據不足）
- [x] TC-B5-005 行動版雲端同步頁

## 執行證據

### TC-B5-001 · SKIP

Phase 0-C manual gate：未建立 Google OAuth session，未執行上傳／下載。

證據：`phase0c-preauth.md`

### TC-B5-002 · SKIP

Phase 0-C manual gate：沒有第二個已授權 profile，未做跨瀏覽器同步。

證據：`phase0c-preauth.md`

### TC-B5-003 · SKIP

Phase 0-C manual gate：未登入 Google，不模擬撤銷 token。

證據：`phase0c-preauth.md`

### TC-B5-004 · SKIP

Phase 0-C manual gate：不讀寫 Google Drive appData，未測雲端檔案邊界。

證據：`phase0c-preauth.md`

### TC-B5-005 · PASS

375px cloud 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B5-005-cloud-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
