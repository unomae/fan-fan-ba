# 測試指南

這個專案使用 **Jest 30** + **jsdom** 作為測試框架（早期曾用 Vitest，已全面遷移到 Jest）。
本檔說明的是**自動化單元測試**；需要在真實瀏覽器執行的**手動驗收**請見 [`MANUAL-QA.md`](MANUAL-QA.md)。

最後更新：2026-07-24 · 26 suites / 246 tests 全綠（0 failed、0 skipped）。

---

## 🚀 執行

```bash
npm test
```

- 設定在 [`jest.config.js`](jest.config.js)：`testEnvironment: 'jsdom'`、`setupFilesAfterEnv: jest.setup.js`、`collectCoverage: true`。
- **覆蓋率預設開啟**，報告輸出到 `coverage/`（reporters：`text` 印在終端、`lcov` 供工具讀）。目前行覆蓋約 **68%**。
- 跑單一檔：`npx jest tests/background.test.js`
- 跑單一案例：`npx jest -t "關鍵字"`
- 序列執行（debug 偶發順序問題）：`npm test -- --runInBand`

> `jest.config.js` 與 `jest.setup.js` 是**執行測試的必要設定檔，需進版控**（曾被 `.gitignore` 排除，導致他機 clone 後缺檔失敗，已於 2026-06-19 修正）。

---

## 📂 目錄結構

```
tests/
├── setup.js                     # 早期 vitest setup（保留）
├── background.test.js           # background.js：API 分流 / retry / 驗證 / 訊息硬化 / 診斷計數
├── storage.test.js              # storage.js：API Key 遷移 + 本機診斷摘要
├── cloud-sync.test.js           # cloud-sync.js：Google Drive appData 同步
├── vocabulary-backup.test.js    # vocabulary-backup.js：JSON round-trip / merge / XLSX / 匯入硬化
├── vocabulary-store.test.js     # vocabulary-store.js：IndexedDB store fallback / legacy mirror
├── options.test.js              # options.js：設定載入 / 儲存 / 備份還原
├── popup.test.js                # popup.js：模型快選
├── welcome.test.js              # welcome.js：首次安裝頁
└── content/
    ├── utils.test.js            # escapeHtml / formatMarkdown / parseJSON / getWeekLabel 等
    ├── dom.test.js              # ffbText / ffbEl / ffbClear 安全 DOM helper
    ├── css.test.js              # content.css 規則回歸（list-style / 隔離等）
    ├── site-policy.test.js      # 敏感網域 denylist / top-frame 判斷
    ├── toolbar.test.js          # 懸浮工具列
    ├── selection-controls.test.js
    ├── result-card-position.test.js
    ├── floating-ball.test.js    # 浮球（vm-harness）
    ├── page-translator.test.js  # 全文 + 單段翻譯 5+1 拆檔（vm-harness + istanbul）
    ├── vocabulary.test.js
    ├── vocabulary-highlighter.test.js
    └── xss-regression.test.js   # XSS 硬化回歸
```

---

## 🧩 兩種測試寫法

### 1) 一般 module（有 `module.exports`）
`background.js` / `storage.js` / `models.js` / `vocabulary-backup.js` 等用 IIFE 或 CommonJS 匯出，直接 `require` 測：

```javascript
const Storage = require('../storage');
it('records a diagnostic event', async () => {
  chrome.storage.local.get.mockResolvedValue({});
  const d = await Storage.recordDiagnosticEvent('translate');
  expect(d.actions.translate).toBe(1);
});
```

### 2) content scripts（共用 isolated-world scope，無 export）
`content/` 下的檔在瀏覽器靠 manifest 依序載入、共用同一全域 scope 互相呼叫，沒有 `require`。
測試端用 `vm.runInContext` 把相依檔串進同一 context，再從 context 取函式斷言；
並用 `istanbul-lib-instrument` 先 instrument 才能量到覆蓋率。範例見
[`tests/content/page-translator.test.js`](tests/content/page-translator.test.js) 開頭的 harness。

新增 page-translator 相關函式要測時：在該 harness 的載入清單補檔、在 `module.exports`
加上要測的函式、再加進 context 解構清單即可。

---

## 🔧 Chrome API mock

`jest.setup.js`（`setupFilesAfterEnv`）在每個 suite 前注入 `global.chrome`
（`runtime` / `storage.sync` / `storage.local` / `tabs` 等皆為 `jest.fn()`）。
測試裡用 `chrome.storage.local.get.mockResolvedValue(...)` 安排回傳、
`mockReset()` 清狀態（見 `storage.test.js` 的 `beforeEach`）。

---

## ✅ 撰寫新測試

在對應位置建 `*.test.js`：

```javascript
const { myFn } = require('../my-module');

describe('myFn()', () => {
  it('做某件事', () => {
    expect(myFn('input')).toBe('expected');
  });
  it('處理邊界', () => {
    expect(() => myFn(null)).toThrow();
  });
});
```

content script 函式則沿用 vm-harness 模式（見上）。

更多：https://jestjs.io/
