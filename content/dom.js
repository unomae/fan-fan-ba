'use strict';

// ── 安全 DOM 建構 helper（XSS 硬化）──────────────────
//
// 這些函式「不解析 HTML 字串」，一律走 createElement / createTextNode，
// 所以任何不可信內容（AI 回傳、頁面文字、單字本）天生不可能被當標籤執行。
// 用來逐步取代 `innerHTML = ` 樣板字串拼接，降低忘記 escapeHtml 的破口。
//
// 用法：
//   ffbText('純文字')                       → TextNode
//   ffbEl('div', { class: 'g-x' }, '內文')   → <div class="g-x">內文</div>
//   ffbEl('button', { dataset: { id: '7' } }, [iconNode, '送出'])
//   ffbClear(node)                          → 清空子節點（等同 replaceChildren）

// 建立純文字節點（null/undefined → 空字串）
function ffbText(value) {
  return document.createTextNode(value == null ? '' : String(value));
}

// 建立元素並安全套上屬性與子節點
//   attrs：class / className → className；dataset → 逐一塞 data-*；其餘走 setAttribute
//          值為 null / undefined / false 一律略過（方便條件式屬性）
//   children：字串自動轉 TextNode；Node 直接 append；陣列逐一處理
function ffbEl(tag, attrs, children) {
  const el = document.createElement(tag);

  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.className = String(value);
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [dataKey, dataVal] of Object.entries(value)) {
          if (dataVal == null) continue;
          el.dataset[dataKey] = String(dataVal);
        }
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }

  if (children != null) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child == null || child === false) continue;
      // 用 nodeType duck-typing 而非 instanceof Node：跨 realm（如 vm context）更穩
      const isNode = child && typeof child === 'object' && typeof child.nodeType === 'number';
      el.appendChild(isNode ? child : ffbText(child));
    }
  }

  return el;
}

// 清空節點所有子元素（回傳同一節點方便串接）
function ffbClear(node) {
  if (node) node.replaceChildren();
  return node;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ffbText, ffbEl, ffbClear };
}
