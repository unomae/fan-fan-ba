# Phase 2 — Console / Network / 邊界稽查

- 11 / 11 關鍵 surface 無非預期 console／network／5xx。
- 404 測試頁的 404 console／network 訊息為預期負向證據。
- Options 每次載入都重現 `LAST_VOCAB_BACKUP_KEY` TDZ，已列 QA-P2-002。
- host 表單與 Options 的空白、XSS、500 字元輸入均未執行 script。
- 500 雙重探測：fresh context 200；extension context reload 200；查無 5xx。
- Phase 3 未觸發 OTP／金流／CAPTCHA；Google OAuth 已在 Phase 0-C 先分流。

完整機器證據：`qa-reports/phase1-2-results.json`。
