# B1 — 模型與金鑰 UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：`master@b90900a`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：5 TC｜3 PASS｜0 FAIL｜2 SKIP

## 測試案例

- [ ] TC-B1-001 儲存 Groq 模型與測試連線（SKIP · manual gate / 證據不足）
- [ ] TC-B1-002 Gemini 與 OpenRouter 替代模型（SKIP · manual gate / 證據不足）
- [x] TC-B1-003 缺 Key、錯誤 Key 與遮罩
- [x] TC-B1-004 特殊字元、超長輸入與連點
- [x] TC-B1-005 行動版模型與金鑰頁

## 執行證據

### TC-B1-001 · SKIP

dummy Key 與設定持久化已驗證；未呼叫真實 Groq 與實際網頁翻譯。 persisted={"targetLanguage":"ja","obsidianVault":"QA 測試 Vault","groqMasked":true}

證據：查無截圖；詳見自動化結果紀錄。

### TC-B1-002 · SKIP

三 provider dummy Key 可分離保存；未使用真實 Gemini／OpenRouter Key，未送 provider runtime。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B1-003 · PASS

缺 Key 顯示錯誤="請先輸入 Groq API Key"；4 個秘密欄位預設皆 password=true。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B1-004 · PASS

特殊字元／長輸入未執行腳本，狀態以 textContent 呈現："✓ 設定已儲存"。

證據：查無截圖；詳見自動化結果紀錄。

### TC-B1-005 · PASS

375px model 面板 scrollWidth=375, clientWidth=375。

證據：`screenshots/TC-B1-005-model-mobile.png`


## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：`qa-reports/phase1-2-results.json`
