# 翻翻吧 — Design Language

> 本文件記錄翻翻吧的設計語言，所有新頁面與 UI 元件均應遵循此規範。
> 最後更新：2026-04-22

---

## 1. 設計原則

| 原則 | 說明 |
|------|------|
| **輕量不打擾** | UI 只在需要時出現，不佔用主視覺空間 |
| **即時回饋** | 所有互動（hover / click / 載入）必須有視覺回應 |
| **品牌一致** | 綠黃漸層貫穿全 UI，讓使用者一眼認出翻翻吧 |
| **白底頁面，毛玻璃浮層** | 全頁面（popup / options / welcome）用白底；content script 浮層（工具列 / 結果卡）用 Glassmorphism |

---

## 2. 色彩系統

### 品牌主色

| 名稱 | Hex | 用途 |
|------|-----|------|
| Brand Green | `#A3D179` | 主要 accent、border active、badge 底色 |
| Brand Yellow | `#F9D423` | 漸層副色、光暈動畫 |
| Deep Green | `#5a9a2e` | 連結、次要按鈕文字、icon shadow |
| Dark Green Text | `#1a3a0a` | 主按鈕文字 |

### 頁面底色（全頁面 UI）

| 名稱 | Hex | 用途 |
|------|-----|------|
| Page BG | `#f5f7f2` / `#f7f9f5` | body 背景（帶微綠調） |
| Card BG | `#ffffff` | 主要卡片背景 |
| Field BG | `#fafafa` | 輸入框預設背景 |
| Hover BG | `#f5fbee` | hover 狀態背景 |
| Active BG | `#f0f9e6` | active / selected 狀態背景 |
| Security Note BG | `#f9fdf5` | 綠色提示區塊背景 |

### 文字色

| 名稱 | Hex | 用途 |
|------|-----|------|
| Primary | `#1a1a1a` | 主要文字 |
| Secondary | `#444` / `#555` | 標籤、次要說明 |
| Muted | `#888` / `#999` | 輔助文字、placeholder |
| Disabled | `#bbb` / `#ccc` | 禁用狀態、頁尾連結 |
| Link | `#5a9a2e` | 所有超連結 |
| Error | `#f87171` | 錯誤訊息 |

### 邊框色

| 名稱 | Hex | 用途 |
|------|-----|------|
| Default Border | `#f0f0f0` / `#e8ede2` | 卡片、分隔線 |
| Input Border | `#dde1e8` | 輸入框預設 |
| Active Border | `#A3D179` | focus / active 狀態 |
| Note Border | `#d4edbc` / `#c8e6a0` | 提示區塊邊框 |
| Error Border | `rgba(248, 113, 113, 0.35)` | 錯誤狀態 |

### 浮層 UI（Content Script — Glassmorphism）

| 名稱 | 值 | 用途 |
|------|----|------|
| 卡片背景 | `rgba(255,255,255,0.92)` + `backdrop-filter: blur(16px)` | 工具列、結果卡 |
| CSS 變數範圍 | `#gemini-ai-toolbar, #gemini-result-card` | 避免污染宿主頁 `:root` |
| 所有樣式 | 加 `!important` | 防止宿主頁覆蓋 |

---

## 3. 字型

```css
font-family: -apple-system, 'Segoe UI', 'Microsoft JhengHei', 'PingFang TC', sans-serif;
```

- 預設字體大小：`13px`（popup）/ `14px`（options）
- 標題字重：`700` / `800`
- 字距調整：標題可加 `letter-spacing: -0.3px`

---

## 4. 間距與圓角

### 圓角

| 元件 | 值 |
|------|----|
| 主卡片 | `16px` / `18px` / `20px` |
| 按鈕 | `8px` / `9px` / `10px` |
| 輸入框 | `8px` |
| 清單項目 | `8px` / `11px` / `12px` |
| 小標籤 / badge | `99px`（pill） |
| icon | `9px`（小）/ `12px`（中）/ `16px`（大） |

### 內距（Padding）

| 元件 | 值 |
|------|----|
| 主卡片 | `32px 28px`（options）/ `44px 40px`（welcome） |
| 清單項目 | `6px 10px`（popup）/ `14px 16px`（welcome step） |
| 按鈕 | `10px 24px`（save）/ `11px 18px`（secondary） |
| 輸入框 | `10px 12px` |

---

## 5. 元件規格

### Icon（Logo）

```css
/* 小（popup header）*/
width: 32px; height: 32px; border-radius: 9px;

/* 中（options header）*/
width: 48px; height: 48px; border-radius: 12px;
box-shadow: 0 2px 8px rgba(163, 209, 121, 0.4);

/* 大（welcome hero）*/
width: 64px; height: 64px; border-radius: 16px;
```

**光暈動畫**（全頁面 icon 統一使用）：

```css
@keyframes logo-glow {
  0%, 100% { filter: drop-shadow(0 0 6px rgba(163, 209, 121, 1))
                     drop-shadow(0 0 12px rgba(163, 209, 121, 0.5)); }
  50%       { filter: drop-shadow(0 0 6px rgba(249, 212, 35,  1))
                     drop-shadow(0 0 14px rgba(249, 212, 35,  0.5)); }
}
animation: logo-glow 2.5s ease-in-out infinite;
```

---

### 按鈕

**Primary（主要動作）**
```css
background: linear-gradient(135deg, #A3D179, #8fc45e);
color: #1a3a0a;
font-weight: 700;
border-radius: 8px ~ 10px;
box-shadow: 0 2px 8px rgba(163, 209, 121, 0.4);

/* hover */
opacity: 0.88; transform: translateY(-1px);
box-shadow: 0 4px 14px rgba(163, 209, 121, 0.5);
```

**Secondary（次要動作）**
```css
border: 1px solid #e0e0e0;
background: transparent;
color: #999;
border-radius: 8px ~ 10px;

/* hover */
border-color: #b0b0b0; color: #555;
```

**Save / Confirm 按鈕**
```css
background: #A3D179;
color: #fff;
font-weight: 700;

/* hover */
background: #90c462;
```

**Test / Outline 按鈕**
```css
border: 1px solid #A3D179;
color: #5a9a2e;
background: transparent;
```

---

### Badge / Pill

```css
/* 基礎 */
font-size: 10px;
font-weight: 600;
padding: 2px 7px;
border-radius: 99px;

/* 顏色變體 */
.badge-free  { background: #f0f9e6; color: #5a9a2e; }  /* 綠：免費 / 推薦 */
.badge-fast  { background: #fffbea; color: #9a6e00; }  /* 黃：快速 */
.badge-lite  { background: #fce8e6; color: #c5221f; }  /* 紅：輕量 */
.badge-groq  { background: #f3e8ff; color: #7c3aed; }  /* 紫：Groq */
.badge-or    { background: #fff4e6; color: #c05a00; }  /* 橘：OpenRouter */
```

---

### 輸入框

```css
border: 1px solid #dde1e8;
border-radius: 8px;
background: #fafafa;
padding: 10px 12px;
font-size: 13.5px;
transition: border-color 0.15s, box-shadow 0.15s;

/* focus */
border-color: #A3D179;
box-shadow: 0 0 0 3px rgba(163, 209, 121, 0.2);
background: #fff;
```

---

### 清單項目（List Item）

```css
/* 預設 */
border: 1.5px solid transparent;
border-radius: 8px ~ 12px;
transition: background 0.15s, border-color 0.15s;

/* hover */
background: #f5fbee;

/* active / selected */
background: #f0f9e6;
border-color: #A3D179;
```

---

### 提示 / 說明區塊（Note Card）

```css
background: #f9fdf5;
border: 1px solid #d4edbc;
border-radius: 8px;
padding: 10px 12px;
font-size: 12px;
color: #555;

/* icon 顏色 */
color: #5a9a2e;
```

---

### 分隔線

```css
height: 1px;
background: #f0f0f0;
margin: 24px 0;
```

---

### 錯誤訊息

```css
/* 文字 */
.g-error { font-size: 13px; color: #f87171; }

/* 重試按鈕 */
.g-retry-btn {
  padding: 5px 14px;
  border: 1px solid rgba(248, 113, 113, 0.35);
  background: rgba(248, 113, 113, 0.08);
  color: #f87171;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}
.g-retry-btn:hover { background: rgba(248, 113, 113, 0.18); }
```

---

### API 狀態燈

```css
width: 6px; height: 6px; border-radius: 50%;

/* ok：綠色脈衝 */
.api-dot.ok { background: #A3D179; animation: pulse-ok 2s ease infinite; }

/* error：紅色脈衝 */
.api-dot.err { background: #ea4335; animation: pulse-err 2s ease infinite; }

@keyframes pulse-ok {
  0%, 100% { box-shadow: 0 0 0 0 rgba(163, 209, 121, 0.6); }
  60%       { box-shadow: 0 0 0 5px rgba(163, 209, 121, 0); }
}
@keyframes pulse-err {
  0%, 100% { box-shadow: 0 0 0 0 rgba(234, 67, 53, 0.5); }
  60%       { box-shadow: 0 0 0 5px rgba(234, 67, 53, 0); }
}
```

---

## 6. 動畫規格

| 動畫 | 參數 | 用途 |
|------|------|------|
| `logo-glow` | `2.5s ease-in-out infinite` | icon 綠→黃光暈 |
| `float` | `3s ease-in-out infinite`, `translateY(0 ~ -6px)` | hero icon 浮動 |
| `pulse-ok` / `pulse-err` | `2s ease infinite` | API 狀態燈 |
| Hover transition | `0.15s` | 所有 hover 顏色 / 背景變化 |
| Button lift | `transform: translateY(-1px)` on hover | Primary 按鈕懸停 |
| Snap animation | `220ms` | 結果卡吸附邊緣 |
| Shimmer | CSS `@keyframes` | AI 載入骨架屏 |

---

## 7. 陰影

| 情境 | 值 |
|------|----|
| 主卡片 | `box-shadow: 0 4px 24px rgba(0,0,0,0.08)` |
| Icon（中） | `box-shadow: 0 2px 8px rgba(163, 209, 121, 0.4)` |
| Primary 按鈕 | `box-shadow: 0 2px 8px rgba(163, 209, 121, 0.4)` |
| Primary 按鈕 hover | `box-shadow: 0 4px 14px rgba(163, 209, 121, 0.5)` |

---

## 8. 頁面結構模板

### 全頁面（options / welcome 等）

```
body（#f5f7f2 背景）
└── .card（白底、圓角、陰影，max-width 480~600px）
    ├── .header（icon + 標題）
    ├── 內容區
    ├── .divider
    └── .btn-row / .footer-links
```

### Popup

```
body（#fff，width: 260px）
├── .header（icon 光暈 + 標題）
├── .section（模型清單）
├── #save-msg（切換提示）
└── .footer（API 狀態燈 + 設定連結）
```

---

## 9. 注意事項

- Content script 所有 CSS 加 `!important`，避免宿主頁樣式干擾
- CSS 變數定義在 `#gemini-ai-toolbar, #gemini-result-card`，不用 `:root`
- 工具列不設 `overflow: hidden`，否則 tooltip `::after` 會被截斷
- HTTP header 只允許 ASCII，中文字串改用英文替代（如 `X-Title: 'Fan Fan Ba'`）
- 顏色使用 Hex 而非 HSL，保持與現有程式碼一致
