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
//   ffbSvgIcon({ viewBox: '0 0 24 24' }, [['path', { d: 'M3 3h5' }]]) → SVG 圖示（SVG namespace）
//   ffbFragment([nodeA, '文字'])            → DocumentFragment
//   ffbClear(node)                          → 清空子節點（等同 replaceChildren）

// 建立純文字節點（null/undefined → 空字串）
function ffbText(value) {
  return document.createTextNode(value == null ? '' : String(value));
}

const FFB_SVG_NS = 'http://www.w3.org/2000/svg';

// 建立元素並安全套上屬性與子節點
//   attrs：class / className → class 屬性；dataset → 逐一塞 data-*；其餘走 setAttribute
//          值為 null / undefined / false 一律略過（方便條件式屬性）
//   children：字串自動轉 TextNode；Node（含 DocumentFragment）直接 append；陣列（可巢狀）逐一處理
function ffbEl(tag, attrs, children) {
  return ffbFill(document.createElement(tag), attrs, children);
}

// SVG 元素必須建在 SVG namespace，否則瀏覽器當成未知 HTML 標籤、圖示不會畫出來
function ffbSvg(tag, attrs, children) {
  return ffbFill(document.createElementNS(FFB_SVG_NS, tag), attrs, children);
}

// 圖示捷徑：shapes 是 [標籤, 屬性] 陣列，如 [['path', { d: 'M3 3h5' }], ['circle', { r: 3 }]]
function ffbSvgIcon(attrs, shapes) {
  return ffbSvg('svg', attrs, shapes.map(([tag, shapeAttrs]) => ffbSvg(tag, shapeAttrs)));
}

function ffbFill(el, attrs, children) {
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.setAttribute('class', String(value)); // SVG 的 className 是唯讀物件，統一走 setAttribute
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
    const list = Array.isArray(children) ? children.flat(Infinity) : [children];
    for (const child of list) {
      if (child == null || child === false) continue;
      // 用 nodeType duck-typing 而非 instanceof Node：跨 realm（如 vm context）更穩
      const isNode = child && typeof child === 'object' && typeof child.nodeType === 'number';
      el.appendChild(isNode ? child : ffbText(child));
    }
  }

  return el;
}

// 建立 DocumentFragment，給需要一次回傳多個兄弟節點的格式化函式使用
function ffbFragment(children) {
  const fragment = document.createDocumentFragment();
  ffbFill(fragment, null, children);
  return fragment;
}

// 清空節點所有子元素（回傳同一節點方便串接）
function ffbClear(node) {
  if (node) node.replaceChildren();
  return node;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ffbText, ffbEl, ffbSvg, ffbSvgIcon, ffbFragment, ffbClear };
}
