<!-- 重要提示：此檔案於 2026-04-22 自動生成 -->

# 測試指南

這個專案使用 **Vitest** 作為測試框架。

## 🚀 快速開始

### 執行所有測試
```bash
npm test
```

### 執行測試 + 視覺化面板
```bash
npm run test:ui
```
打開後能看到互動式測試面板，實時監控測試執行狀態。

### 生成測試覆蓋率報告
```bash
npm run test:coverage
```
覆蓋率報告會存放在 `coverage/` 目錄。

---

## 📂 目錄結構

```
tests/
├── setup.js                    # 全局設定（Mock chrome API）
└── content/
    └── utils.test.js          # content/utils.js 的測試（39 個測試案例）
```

---

## ✅ 目前的測試覆蓋

### `tests/content/utils.test.js` - 39 個測試
- ✅ `escapeHtml()` → HTML 轉義（6 個案例）
- ✅ `formatMarkdown()` → Markdown 解析（9 個案例）
- ✅ `parseJSON()` → 容錯 JSON 解析（7 個案例）
- ✅ `getWeekLabel()` → ISO 週次標籤（3 個案例）
- ✅ `getPosClass()` → POS 詞性對應（7 個案例）
- ✅ `extractContext()` → 文字上下文提取（1 個案例）
- ✅ `renderDiff()` → LCS 字級 Diff（6 個案例）

---

## 📝 後續測試計劃

### 優先級 2：`background.js` 核心邏輯
- `withRetry()` 重試機制
- `isRetryable()` 狀態碼判斷
- `checkedFetch()` HTTP 狀態檢查
- 多提供商 API 分流（Groq / Gemini / OpenRouter）

### 優先級 3：其他模組
- `content/state.js` 狀態初始值
- `content/obsidian.js` Obsidian 整合
- `content/toolbar.js` 工具列 UI
- `content/main.js` 事件監聽

---

## 🛠️ 使用的技術

- **Vitest** v4.1.5 — 快速的單元測試框架
- **@vitest/ui** — 互動式測試 UI
- **Node.js** 環境 — 測試在伺服器端執行

---

## 💡 編寫新測試的範例

在 `tests/content/` 裡建立新的 `.test.js` 檔案：

```javascript
import { describe, it, expect } from 'vitest';

// 匯入要測試的模組（或複製函數定義）
// import { myFunction } from '../../content/myFile.js';

describe('myFunction()', () => {
  it('應該做某件事', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('應該處理邊界情況', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

更多資訊：https://vitest.dev/

---

## 📊 測試狀態

| 模組 | 測試檔案 | 案例數 | 狀態 |
|------|--------|--------|------|
| `content/utils.js` | ✅ 已完成 | 39 | 全部通過 |
| `background.js` | 📋 待實施 | - | - |
| `content/state.js` | 📋 待實施 | - | - |
| `content/obsidian.js` | 📋 待實施 | - | - |
| `content/toolbar.js` | 📋 待實施 | - | - |
| `content/main.js` | 📋 待實施 | - | - |
| `content/result-card.js` | 📋 待實施 | - | - |
