'use strict';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 強化 Markdown 渲染：段落、無序 / 有序清單、粗體、{{tag}} 標籤
function formatMarkdown(text) {
  const lines = text.split('\n');
  let html  = '';
  let inUl  = false;
  let inOl  = false;

  for (const raw of lines) {
    if (raw.trim() === '===DEEP===') continue; // 略過分隔標記（完成渲染後由 buildExplainHTML 處理）

    const esc    = escapeHtml(raw);
    const inline = esc
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\{\{([^}]+)\}\}/g, (_, t) =>
        `<span class="g-tag" data-term="${t}">${t}</span>`
      );

    const isBullet  = /^[-*]\s+/.test(raw);
    const isOrdered = /^\d+\.\s+/.test(raw);

    if (isBullet) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul class="g-list">'; inUl = true; }
      html += `<li>${inline.replace(/^[-*]\s+/, '')}</li>`;
    } else if (isOrdered) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol class="g-list">'; inOl = true; }
      html += `<li>${inline.replace(/^\d+\.\s+/, '')}</li>`;
    } else {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (inOl) { html += '</ol>'; inOl = false; }
      html += raw.trim() === '' ? '<br>' : `<p class="g-p">${inline}</p>`;
    }
  }

  if (inUl) html += '</ul>';
  if (inOl) html += '</ol>';
  return html;
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

// LCS word-level diff：比對原文與優化後版本，回傳帶 <ins>/<del> 標記的 HTML
function renderDiff(original, optimized) {
  const a = original.match(/\S+|\s+/g) || [];
  const b = optimized.match(/\S+|\s+/g) || [];

  // 文字過長時降級顯示（避免 LCS 表格佔用過多記憶體）
  if (a.length > 600 || b.length > 600) {
    return `<ins class="g-diff-ins">${escapeHtml(optimized)}</ins>`;
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

  return ops.map(o =>
    o.t === '=' ? escapeHtml(o.v) :
    o.t === '+' ? `<ins class="g-diff-ins">${escapeHtml(o.v)}</ins>` :
                  `<del class="g-diff-del">${escapeHtml(o.v)}</del>`
  ).join('');
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { escapeHtml, formatMarkdown, parseJSON, getWeekLabel, getPosClass, extractContext, renderDiff }; }
