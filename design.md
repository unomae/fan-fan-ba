# 翻翻吧 — Design Language

> 本文件記錄翻翻吧的設計語言，所有新頁面與 UI 元件均應遵循此規範。
> 最後更新：2026-10-23

---

## 1. 設計原則

| 原則 | 說明 |
|------|------|
| **輕量不打擾** | UI 只在需要時出現，不佔用主視覺空間 |
| **即時回饋** | 所有互動（hover / click / 載入）必須有視覺回應 |
| **品牌一致** | 品牌綠只用在主要動作、選中狀態與連結，不做大面積漸層 |
| **白底頁面，毛玻璃浮層** | 全頁面（popup / options / welcome）用白底；content script 浮層（工具列 / 結果卡）用 Glassmorphism |

---

## 1.5 全頁面 UI 規範（popup、設定頁，2026-10-23 起）

popup 與設定頁改用 `ui-tokens.css`（兩頁共用，`npm run package` 會一起打包）。這一節優先於下面第 2～7 節裡跟全頁面有關的舊色碼與尺寸；浮層（content.css）2026-10-24 起也改用 Radix，規則見第 2 節「浮層 UI」；**歡迎頁還沒跟上**，仍照舊節。

| 項目 | 規則 |
|------|------|
| 色彩 | 只用 Radix Colors v3：`lime` 品牌、`olive` 中性、`amber` 警告、`red` 錯誤、`blue` 資訊與「新增」標籤。照 Radix 階層用：1–2 頁面底、3–5 元件底（一般／hover／按下）、6–8 邊框、9–10 實心、11–12 文字。頁面不寫色碼，用 token（`--text`、`--text-muted`、`--accent-text`、`--warn-soft`…） |
| 主按鈕 | `--accent-solid`（lime 9）底配 `--accent-on-solid`（lime 12）字；lime 9 很亮，不能配白字 |
| 深色模式 | 只在 `ui-tokens.css` 換成 Radix dark 色值，頁面不另寫暗色規則 |
| 線條 | `var(--hairline)`，1px（KAKA 2026-10-23 選回上一版的視覺，不用 0.5px） |
| 視覺氛圍 | 保留上一版：頁面淡黃／淡綠光暈背景（`--page-bg`）、毛玻璃外框加陰影（`--shell-bg`、`--shadow-shell`）、模型大卡淡綠漸層、推薦供應商卡淡綠底、次要按鈕淡綠、狀態標籤膠囊形。色值全部換成 Radix token |
| 字級 | 設定頁四種：頁首 24、分類標題 22、內文 14、輔助 12；popup 三種：14、13、12。最小 12px |
| 圓角 | 外框 16、總覽卡片 14、提醒列 10、欄位／按鈕／一般卡片 8、膠囊標籤 999 |
| 陰影 | 外框、logo、卡片 hover 用 token 陰影；深色模式只留外框陰影。不加左側色條 |
| 動畫 | 卡片 hover 上浮 1px（250ms ease-out）、按鈕按下縮放、popup logo 綠黃光暈（`prefers-reduced-motion` 時關閉）、搜尋跳轉高亮。狀態燈脈衝已拿掉 |
| 文案 | 不用「·」「・」當分隔，改用逗號、頓號或排版。不放重複標題的說明句、裝飾性標籤（eyebrow、panel-badge）；限制條件（最多 20 個）寫在欄位標籤的 `.hint` |
| 提醒 | 只在功能會壞掉時出現（例：選的模型缺金鑰），放在使用者要處理的位置，附一個直達按鈕 |

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

### 浮層 UI（Content Script，2026-10-24 起）

工具列、結果卡（含單字本面板）、浮球與選單、單字高亮提示、全文翻譯控制面板用 Radix Colors v3，保留毛玻璃。插進網頁的譯文段落與單字高亮標記不在範圍內，仍依頁面底色自己調對比。

| 項目 | 規則 |
|------|------|
| 色票 | `olive` 中性、`lime` 品牌、`blue` 資訊、`red` 錯誤、`amber` 警示、`violet` Obsidian，各 12 階，名稱 `--ffb-<色系>-<階>`。階層用法同 1.5 節 |
| 定義位置 | 只定義在 5 個根節點（`#gemini-ai-toolbar`、`#gemini-result-card`、`#fanfanba-floating`、`.g-vocab-highlight-tip`、`.ffb-page-translation-panel`），不寫在網頁 `:root`。不能直接引入 Radix 官方 CSS：它把變數寫在 `:root`，會污染網頁，也可能跟網頁自己的 Radix 變數互蓋 |
| 根節點外 | 不准引用這些 token（那裡取不到值）；`tests/content/css-tokens.test.js` 會擋 |
| 元件規則 | 不寫色碼，一律用 token。例外：陰影、深底白字 tooltip（亮暗一樣）、句子分析的分類螢光標記（`.g-ca-mark`，要彼此分得開） |
| 毛玻璃 | 白色半透明底寫成 `color-mix(in srgb, var(--ffb-surface) N%, transparent)`，透明度沿用原值；玻璃邊線用 `--ffb-edge`。`backdrop-filter` 與 `!important` 隔離不變 |
| 文字 | 白色或毛玻璃上的彩色字用 11 階；淡色底（3–5 階）上的彩色字用 12 階，因為 11 配 3 只有約 4.3:1 |
| 實心按鈕 | lime 用 9 階配深字；其他色系用 11 階（hover 12 階）配 `--ffb-on-solid`（亮色白、深色 olive 1） |
| 焦點 | 外框一律 `--ffb-focus`（lime 8），光圈一律 `--ffb-focus-ring`；錯誤欄位、執行中狀態的光圈保留各自色系 |
| 深色模式 | 只在第 18 節重新定義同一組 token（Radix dark 色值，`--ffb-surface` 換成 olive 2），元件規則不另寫暗色覆寫。深色下工具列提高到 82%、浮球 86% 不透明，避免疊在白色網頁上看不清；陰影加深 |

**對比**（2026-10-24 量，網頁底色以純白、純黑兩種最壞情況計算）：

- 深色：所有文字 ≥ 4.5:1，最低是工具列圖示疊在白色網頁上的 4.81:1。
- 亮色＋白色網頁：全部 ≥ 4.5:1，最低是 88% 卡片上的 blue 11 資訊字 4.77:1。
- 亮色＋黑色網頁：卡片上直接寫的彩色字（lime／blue 11）只剩約 3.6–4.2:1，工具列（45% 透明）圖示約 1.3:1。這是保留毛玻璃的代價，改版前也一樣不過（例：舊藍 `#1a73e8` 3.41:1）；淡色底上的 12 階字不受影響（≥ 9.8:1）。

**收斂**：錯誤色只有 red（原本 `.g-error` 定義兩次、`#f87171` 白底 2.8:1 的問題一併解掉），焦點外框只有一種（原本藍、綠、紫三套並存）。

| 名詞 | 意思 |
|------|------|
| 元件根節點 | 翻翻吧插進網頁的最外層節點；所有 token 從這裡開始，避免影響網頁本身 |
| surface／edge | 毛玻璃本體／玻璃邊線的底色；亮色是白，深色是 olive 2／olive 7 |

---

## 3. 字型

### 字型堆疊

```css
/* 標題（H1–H3、品牌文字）— 使用品牌字型 */
font-family: 'jf-openhuninn', 'Microsoft JhengHei', 'PingFang TC', sans-serif;

/* Body / Label / Input / Caption — 使用系統字型 */
font-family: -apple-system, 'Segoe UI', 'Microsoft JhengHei', 'PingFang TC', sans-serif;
```

### 品牌字型：jf-openhuninn

| 屬性 | 值 |
|------|----|
| 字型檔 | `fonts/jf-openhuninn-2.1.ttf` |
| 用途 | H1 / H2 / H3、icon 旁品牌名稱、步驟標題 |
| 不使用的地方 | Body copy、label、input、caption、content script（浮層） |
| 授權 | SIL Open Font License 1.1，可商用 |

```css
/* 在 popup.html / options.html / welcome.html 的 <style> 頂端加入 */
@font-face {
  font-family: 'jf-openhuninn';
  src: url('fonts/jf-openhuninn-2.1.ttf') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
```

### 各頁面套用位置

| 檔案 | 選擇器 | 動作 |
|------|--------|------|
| `popup.html` | `.header h1` | 加 `font-family: 'jf-openhuninn', ...` |
| `options.html` | `h1` | 加 `font-family: 'jf-openhuninn', ...` |
| `welcome.html` | `h1` | 加 `font-family: 'jf-openhuninn', ...` |
| `welcome.html` | `.step-content h3` | 加 `font-family: 'jf-openhuninn', ...` |
| `content.css` | — | **不套用**，浮層維持 system stack |

### manifest.json 新增（必要）

```json
"web_accessible_resources": [
  {
    "resources": ["fonts/jf-openhuninn-2.1.ttf"],
    "matches": ["<all_urls>"]
  }
]
```

### 字體大小

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

### 設定頁（options）

```
body（--page 底色）
├── .app-header（icon + 標題 ＋ 搜尋框 Ctrl/⌘K）
└── .settings-shell（--surface 底、圓角 12px、細線外框）
    ├── nav.settings-overview（總覽，預設顯示）
    │   ├── .overview-unsaved（有未儲存的變更時出現）
    │   ├── .overview-attention（只放「功能會壞掉」的提醒，例如預設模型缺金鑰）
    │   └── .overview-grid（9 張 .settings-tab.tile；模型卡 .is-large 佔 2×2）
    └── .settings-main（詳細頁，點卡片或網址 #分類 進入）
        ├── .settings-crumb（只有「← 返回總覽」；分類名稱由面板標題表達）
        ├── .settings-panel（一次只顯示一個；h2 與總覽卡片名稱相同；欄位說明最多一行 .field-note，細節收進 details.more-info）
        └── .settings-actions（sticky 底部儲存列；不經儲存鈕的分類只留狀態訊息）
```

- 金鑰欄位標籤旁的 `.key-state` 依目前選的模型顯示「使用中／缺 Key／已填／未填」，不再寫死「必填／選填」。
- 功能與快捷鍵介紹放歡迎頁（`welcome.html` 的「小技巧」），設定頁只放要做選擇的東西。
- 卡片的摘要與狀態一律讀**已儲存**的值，不讀表單；狀態色：綠＝已設定、黃＝要處理、灰＝未設定或未啟用。
- 卡片沿用 `.settings-tab[data-panel]`：搜尋、新功能標籤、測試與 e2e 都靠這個標記找分類，改名要一起改。

### 其他全頁面（welcome 等）

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
body（--page 底色，width: 304px）
├── .header（icon + 標題 + 「設定」）
├── .alert#keyAlert（只在選的模型缺金鑰時出現，「填寫金鑰」直達設定頁 #model）
├── .section（「模型」單選清單；右側標籤是供應商名稱）
└── .shortcuts（「快捷鍵」＋「變更」）
```

---

## 9. 注意事項

- Content script 所有 CSS 加 `!important`，避免宿主頁樣式干擾
- CSS 變數定義在 `#gemini-ai-toolbar, #gemini-result-card`，不用 `:root`
- 工具列不設 `overflow: hidden`，否則 tooltip `::after` 會被截斷
- HTTP header 只允許 ASCII，中文字串改用英文替代（如 `X-Title: 'Fan Fan Ba'`）
- 顏色使用 Hex 而非 HSL，保持與現有程式碼一致
- **jf-openhuninn 只用於全頁面 HTML**（popup / options / welcome），content script 不套用
