'use strict';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;'); // 防禦性：單引號也跳脫，避免未來改用單引號屬性時破口
}

// 強化 Markdown 渲染：段落、無序 / 有序清單、粗體、{{tag}} 標籤
// 回傳 DocumentFragment（一律 createElement / createTextNode，不解析 HTML 字串）
function formatMarkdown(text) {
  const fragment = document.createDocumentFragment();
  let list = null; // 目前開著的 <ul>／<ol>

  for (const raw of text.split('\n')) {
    if (raw.trim() === '===DEEP===') continue; // 略過分隔標記（完成渲染後由 buildExplainContent 處理）

    const isBullet  = /^\s*[-*•・‧]\s+/.test(raw);
    const isOrdered = /^\s*[0-9０-９]+[.)．、]\s+/.test(raw);

    if (isBullet || isOrdered) {
      const tag = isBullet ? 'ul' : 'ol';
      if (list?.localName !== tag) {
        list = ffbEl(tag, { class: 'g-list' });
        fragment.appendChild(list);
      }
      const content = raw.replace(isBullet ? /^\s*[-*•・‧]\s+/ : /^\s*[0-9０-９]+[.)．、]\s+/, '');
      list.appendChild(ffbEl('li', null, formatMarkdownInline(content)));
    } else {
      list = null;
      fragment.appendChild(raw.trim() === '' ? ffbEl('br') : ffbEl('p', { class: 'g-p' }, formatMarkdownInline(raw)));
    }
  }

  return fragment;
}

// 行內格式：**粗體** → <strong>、{{詞}} → 可點的 .g-tag；其餘一律純文字
function formatMarkdownInline(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/\*\*(.*?)\*\*/g)) {
    nodes.push(...formatMarkdownTags(text.slice(last, match.index)));
    nodes.push(ffbEl('strong', null, formatMarkdownTags(match[1])));
    last = match.index + match[0].length;
  }
  nodes.push(...formatMarkdownTags(text.slice(last)));
  return nodes;
}

function formatMarkdownTags(text) {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(/\{\{([^}]+)\}\}/g)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    nodes.push(ffbEl('span', { class: 'g-tag', dataset: { term: match[1] } }, match[1]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Gemini 有時回傳 ```json 包裝或夾帶說明文字，三層容錯解析
function parseJSON(text) {
  const trimmed = text.trim();

  if (trimmed.startsWith('{')) {
    try { return JSON.parse(trimmed); } catch { /* 繼續 */ }
  }

  const stripped = trimmed
    .replace(/^`{1,3}json\s*/i, '')
    .replace(/\s*`{1,3}$/, '')
    .trim();
  if (stripped.startsWith('{')) {
    try { return JSON.parse(stripped); } catch { /* 繼續 */ }
  }

  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return JSON.parse(text.slice(start, end + 1));
  }

  throw new Error('無法解析 JSON');
}

// ISO 週次標籤（台北時間），格式：2026-W16
function getWeekLabel() {
  const now    = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const d      = new Date(Date.UTC(taipei.getFullYear(), taipei.getMonth(), taipei.getDate()));
  const day    = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week      = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// POS 詞性 → Badge CSS class
function getPosClass(pos) {
  const p = (pos || '').toLowerCase().trim();
  if (/^n[\.\s]|^noun/.test(p))  return 'g-pos-n';
  if (/^v[\.\s]|^verb/.test(p))  return 'g-pos-v';
  if (/^adj/.test(p))            return 'g-pos-adj';
  if (/^adv/.test(p))            return 'g-pos-adv';
  if (/^prep/.test(p))           return 'g-pos-prep';
  return 'g-pos-default';
}

// 從選取範圍周圍取得上下文（依文字長度決定取多少字）
function extractContext(selectedText, range) {
  const len        = selectedText.length;
  const contextLen = len <= 20 ? 100 : len <= 150 ? 200 : 500;
  try {
    const node   = range.commonAncestorContainer;
    const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const full   = (parent.innerText || parent.textContent || '').trim();
    const idx    = full.indexOf(selectedText);
    if (idx === -1) return '';

    const start = Math.max(0, idx - contextLen);
    const end   = Math.min(full.length, idx + selectedText.length + contextLen);
    let   ctx   = full.slice(start, end);
    if (start > 0)         ctx = '...' + ctx;
    if (end < full.length) ctx = ctx + '...';
    return ctx;
  } catch { return ''; }
}

// LCS word-level diff：比對原文與優化後版本，回傳帶 <ins>/<del> 標記的 DocumentFragment
function renderDiff(original, optimized) {
  const a = original.match(/\S+|\s+/g) || [];
  const b = optimized.match(/\S+|\s+/g) || [];

  // 文字過長時降級顯示（避免 LCS 表格佔用過多記憶體）
  if (a.length > 600 || b.length > 600) {
    return ffbFragment(ffbEl('ins', { class: 'g-diff-ins' }, optimized));
  }

  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);

  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i-1] === b[j-1]) {
      ops.unshift({ t: '=', v: a[i-1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j-1] >= dp[i-1][j])) {
      ops.unshift({ t: '+', v: b[j-1] }); j--;
    } else {
      ops.unshift({ t: '-', v: a[i-1] }); i--;
    }
  }

  return ffbFragment(ops.map(o =>
    o.t === '=' ? o.v :
    o.t === '+' ? ffbEl('ins', { class: 'g-diff-ins' }, o.v) :
                  ffbEl('del', { class: 'g-diff-del' }, o.v)
  ));
}

// 字典例句：把查詢詞在例句中的原樣（surface，可含詞形變化）加粗。
// 規則：大小寫不敏感、只取第一個完整比對；拉丁／希臘／西里爾字母與數字的邊緣要落在詞界上
// （避免 "art" 命中 "start"），中日韓等無空格文字不檢查詞界。比對不到就整句純文字，不猜。
// 回傳 DocumentFragment（純文字＋<strong>），surface 以字面比對（含 C++ 這類 regex 特殊字元）。
const EXAMPLE_WORD_CHAR = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u;

function findExampleSurface(src, surface) {
  if (!src || !surface) return -1;
  const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped, 'giu');
  let match;
  while ((match = re.exec(src)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const before = src.slice(0, start).match(/.$/u)?.[0] || '';
    const after = src.slice(end).match(/^./u)?.[0] || '';
    const headIsWord = EXAMPLE_WORD_CHAR.test(match[0].match(/^./u)[0]);
    const tailIsWord = EXAMPLE_WORD_CHAR.test(match[0].match(/.$/u)[0]);
    const okBefore = !headIsWord || !before || !EXAMPLE_WORD_CHAR.test(before);
    const okAfter = !tailIsWord || !after || !EXAMPLE_WORD_CHAR.test(after);
    if (okBefore && okAfter) return { start, end };
    re.lastIndex = start + 1;
  }
  return -1;
}

function highlightExample(src, surface) {
  const text = String(src || '');
  const target = String(surface || '').trim();
  const hit = findExampleSurface(text, target);
  if (hit === -1) return ffbFragment(text);
  return ffbFragment([
    text.slice(0, hit.start),
    ffbEl('strong', { class: 'g-ex-hit' }, text.slice(hit.start, hit.end)),
    text.slice(hit.end)
  ]);
}

// CEFR 難度只接受 A1–C2，其餘（含空字串、B3、"intermediate"）一律視為沒有
function normalizeCefr(value) {
  const level = String(value || '').trim().toUpperCase();
  return /^[ABC][12]$/.test(level) ? level : '';
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { escapeHtml, formatMarkdown, parseJSON, getWeekLabel, getPosClass, extractContext, renderDiff, highlightExample, normalizeCefr }; }
