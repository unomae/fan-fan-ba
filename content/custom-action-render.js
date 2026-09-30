'use strict';

// ── 自訂動作的結果卡版面 ─────────────────────────────
//
// 三種固定版面：fields（欄位卡）、annotate（原文標註）、compare（前後對照）。
// 全部用 ffbEl 建 DOM，模型回傳的任何字串都只當文字，不插入 HTML。
// 串流時用 readCompletedCustomFields 取出「已完整收到」的頂層欄位，
// 其餘欄位顯示骨架，收完再交給 parseCustomActionOutput 做最終解析。

// ── 部分 JSON：只取已完整收到的頂層欄位 ───────────────

// 從 start（必須是 "）掃到字串結尾，回傳結尾 " 之後的位置；未結束回傳 -1
function scanJsonString(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '"') return i + 1;
  }
  return -1;
}

// 掃一個 JSON 值，回傳結尾位置；值還沒收完回傳 -1
function scanJsonValue(text, start) {
  const first = text[start];
  if (first === '"') return scanJsonString(text, start);
  if (first === '{' || first === '[') {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (ch === '"') {
        const end = scanJsonString(text, i);
        if (end === -1) return -1;
        i = end - 1;
      } else if (ch === '{' || ch === '[') {
        depth++;
      } else if (ch === '}' || ch === ']') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }
  // 數字、true/false/null：要看到後面的分隔字元才算收完（避免 12 其實是 123 的前半）
  const match = /^[^,}\]\s]+/.exec(text.slice(start));
  if (!match) return -1;
  const end = start + match[0].length;
  return end < text.length ? end : -1;
}

function skipJsonSpace(text, index) {
  while (index < text.length && /[\s,]/.test(text[index])) index++;
  return index;
}

// 回傳 { key: value }，只含已完整收到且在 fields 宣告過的鍵
function readCompletedCustomFields(text, fields) {
  const keys = new Set((Array.isArray(fields) ? fields : []).map(field => field.key));
  const result = {};
  const source = String(text || '');
  let index = source.indexOf('{');
  if (index === -1) return result;
  index++;

  while (index < source.length) {
    index = skipJsonSpace(source, index);
    if (source[index] !== '"') break;
    const keyEnd = scanJsonString(source, index);
    if (keyEnd === -1) break;
    let key;
    try { key = JSON.parse(source.slice(index, keyEnd)); } catch { break; }
    index = keyEnd;
    while (index < source.length && /\s/.test(source[index])) index++;
    if (source[index] !== ':') break;
    index++;
    while (index < source.length && /\s/.test(source[index])) index++;
    if (index >= source.length) break;
    const valueEnd = scanJsonValue(source, index);
    if (valueEnd === -1) break;
    let value;
    try { value = JSON.parse(source.slice(index, valueEnd)); } catch { break; }
    if (keys.has(key)) result[key] = value;
    index = valueEnd;
  }
  return result;
}

// ── 值轉文字 ─────────────────────────────────────────

function customValueToText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try { return JSON.stringify(value); } catch { return ''; }
}

// 字串保留換行；陣列逐項列出；物件退回 JSON 文字（都是純文字節點）
function buildCustomValue(value) {
  if (Array.isArray(value)) {
    return ffbEl('ul', { class: 'g-list g-ca-list' }, value.map(item => ffbEl('li', null, customValueToText(item))));
  }
  const lines = customValueToText(value).split('\n');
  return ffbEl('div', { class: 'g-ca-value' },
    lines.flatMap((line, index) => [index > 0 && ffbEl('br'), line || null]));
}

function buildCustomSkeleton() {
  return ffbEl('div', { class: 'g-shimmer-wrap g-ca-pending' }, [
    ffbEl('div', { class: 'g-shimmer-line' }),
    ffbEl('div', { class: 'g-shimmer-line' })
  ]);
}

function buildCustomField(field, data, pending) {
  const has = Object.prototype.hasOwnProperty.call(data, field.key);
  return ffbEl('div', { class: 'g-ca-field', dataset: { key: field.key } }, [
    ffbEl('div', { class: 'g-ca-label' }, field.label),
    has ? buildCustomValue(data[field.key]) : (pending ? buildCustomSkeleton() : buildCustomValue(''))
  ]);
}

// ── annotate：原文標註 ───────────────────────────────

// 標註類型只收簡單代號，其他一律歸 other（type 會進 class 名稱）
function normalizeAnnotationType(type) {
  const value = String(type == null ? '' : type).trim().toLowerCase();
  return /^[a-z0-9-]{1,20}$/.test(value) ? value : 'other';
}

function normalizeAnnotations(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => item && typeof item === 'object' && typeof item.text === 'string' && item.text)
    .map(item => ({
      text: item.text,
      type: normalizeAnnotationType(item.type),
      note: typeof item.note === 'string' ? item.note : ''
    }));
}

// 依序在原文找每個片段；找得到的包成 <mark>，找不到的放進 unmatched
function buildAnnotatedText(original, annotations) {
  const source = String(original || '');
  const matches = [];
  const unmatched = [];
  let cursor = 0;
  for (const item of annotations) {
    let at = source.indexOf(item.text, cursor);
    if (at === -1) at = source.indexOf(item.text); // 模型順序錯亂時從頭再找一次
    const overlaps = matches.some(m => at < m.end && at + item.text.length > m.start);
    if (at === -1 || overlaps) { unmatched.push(item); continue; }
    matches.push({ start: at, end: at + item.text.length, item });
    cursor = at + item.text.length;
  }
  matches.sort((a, b) => a.start - b.start);

  const nodes = [];
  let pos = 0;
  for (const { start, end, item } of matches) {
    if (start > pos) nodes.push(source.slice(pos, start));
    nodes.push(ffbEl('mark', {
      class: `g-ca-mark g-ca-type-${item.type}`,
      title: item.note || null
    }, source.slice(start, end)));
    pos = end;
  }
  if (pos < source.length) nodes.push(source.slice(pos));
  return { node: ffbEl('div', { class: 'g-ca-annotated' }, nodes), matched: matches.map(m => m.item), unmatched };
}

function buildAnnotateLayout(action, data, { selectedText, pending }) {
  const arrayField = action.fields.find(field => Array.isArray(data[field.key]))
    || action.fields[0];
  const annotations = normalizeAnnotations(data[arrayField.key]);
  const hasArray = Object.prototype.hasOwnProperty.call(data, arrayField.key);
  const { node, matched, unmatched } = buildAnnotatedText(selectedText, annotations);
  const notes = [...matched, ...unmatched];

  return [
    node,
    hasArray
      ? (notes.length > 0 && ffbEl('ul', { class: 'g-list g-ca-notes' }, notes.map(item =>
        ffbEl('li', { class: unmatched.includes(item) ? 'g-ca-unmatched' : null }, [
          ffbEl('span', { class: `g-ca-note-text g-ca-type-${item.type}` }, item.text),
          item.note ? `：${item.note}` : null
        ]))))
      : (pending ? buildCustomSkeleton() : null),
    ...action.fields
      .filter(field => field.key !== arrayField.key)
      .map(field => buildCustomField(field, data, pending))
  ];
}

// ── compare：前後對照 ───────────────────────────────

function buildCompareLayout(action, data, { selectedText, pending }) {
  const byKey = key => action.fields.find(field => field.key === key);
  const beforeField = byKey('before');
  const afterField = byKey('after');
  const notesField = byKey('notes');
  const rest = action.fields.filter(field => ![beforeField, afterField, notesField].includes(field));
  const has = key => Object.prototype.hasOwnProperty.call(data, key);
  // 沒宣告 before 欄位時，以選取原文當「修改前」
  const beforeText = beforeField && has('before') ? customValueToText(data.before) : selectedText;

  return [
    ffbEl('div', { class: 'g-ca-compare-block g-ca-before' }, [
      ffbEl('div', { class: 'g-ca-label' }, beforeField?.label || '原文'),
      beforeField && !has('before') && pending ? buildCustomSkeleton() : buildCustomValue(beforeText)
    ]),
    afterField && ffbEl('div', { class: 'g-ca-compare-block g-ca-after' }, [
      ffbEl('div', { class: 'g-ca-label' }, afterField.label),
      has('after') ? buildCustomValue(data.after) : (pending ? buildCustomSkeleton() : buildCustomValue(''))
    ]),
    notesField && buildCustomField(notesField, data, pending),
    ...rest.map(field => buildCustomField(field, data, pending))
  ];
}

// ── 對外：組版面 ─────────────────────────────────────

// data：已解析的欄位；pending=true 表示串流中，缺的欄位顯示骨架
function buildCustomActionContent(action, data, { selectedText = '', pending = false } = {}) {
  const safeData = data && typeof data === 'object' ? data : {};
  const options = { selectedText, pending };
  const layout = action?.layout;
  let children;
  if (layout === 'annotate') children = buildAnnotateLayout(action, safeData, options);
  else if (layout === 'compare') children = buildCompareLayout(action, safeData, options);
  else children = action.fields.map(field => buildCustomField(field, safeData, pending));
  return ffbEl('div', { class: `g-ca g-ca-${layout === 'annotate' || layout === 'compare' ? layout : 'fields'}${pending ? ' g-streaming' : ''}` }, children);
}

// 解析失敗：原文照純文字顯示，加「格式不符」提示
function buildCustomFormatError(raw) {
  return ffbEl('div', { class: 'g-ca g-ca-format-error' }, [
    ffbEl('div', { class: 'g-ca-error-label' }, '格式不符：模型沒有回傳預期的欄位，以下是原始內容'),
    buildCustomValue(raw)
  ]);
}

// ── Obsidian：欄位轉 markdown ────────────────────────

function buildCustomActionMarkdown(action, data) {
  const safeData = data && typeof data === 'object' ? data : {};
  const blocks = action.fields.map(field => {
    const value = safeData[field.key];
    let body;
    if (Array.isArray(value)) {
      body = value.map(item => {
        if (item && typeof item === 'object' && typeof item.text === 'string') {
          return `- ${item.text}${item.note ? `：${item.note}` : ''}`;
        }
        return `- ${customValueToText(item)}`;
      }).join('\n');
    } else {
      body = customValueToText(value);
    }
    return `**${field.label}**\n\n${body}`;
  });
  return blocks.join('\n\n');
}

// ── 動作圖示（內建集合，不接外部圖示庫）─────────────
// 設定頁挑圖示、工具列顯示都用這份；名稱就是動作資料裡的 icon 值
const CUSTOM_ACTION_ICONS = {
  sparkle: { label: '星光', shapes: [['path', { d: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6' }]] },
  book: { label: '書本', shapes: [['path', { d: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z' }], ['path', { d: 'M4 19V5' }]] },
  pen: { label: '筆', shapes: [['path', { d: 'M4 20h4L19 9l-4-4L4 16z' }], ['path', { d: 'M13 7l4 4' }]] },
  list: { label: '清單', shapes: [['path', { d: 'M9 6h11M9 12h11M9 18h11' }], ['circle', { cx: 4.5, cy: 6, r: 1 }], ['circle', { cx: 4.5, cy: 12, r: 1 }], ['circle', { cx: 4.5, cy: 18, r: 1 }]] },
  check: { label: '勾選', shapes: [['path', { d: 'M4 12.5 9.5 18 20 6' }]] },
  bulb: { label: '燈泡', shapes: [['path', { d: 'M9 18h6M10 21h4' }], ['path', { d: 'M12 3a6 6 0 0 0-3.5 10.9V16h7v-2.1A6 6 0 0 0 12 3z' }]] },
  chat: { label: '對話', shapes: [['path', { d: 'M4 5h16v11H9l-5 4z' }]] },
  globe: { label: '地球', shapes: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18' }]] }
};
const CUSTOM_ACTION_DEFAULT_ICON = 'sparkle';

// 頂層 const 在 classic script 不會掛到 globalThis，設定頁透過這兩個函式取用
function listCustomActionIcons() {
  return Object.entries(CUSTOM_ACTION_ICONS).map(([name, icon]) => ({ name, label: icon.label }));
}

function getDefaultCustomActionIcon() {
  return CUSTOM_ACTION_DEFAULT_ICON;
}

// 不認得的名稱一律退回預設圖示
function buildCustomActionIcon(name, size = 14) {
  const icon = CUSTOM_ACTION_ICONS[name] || CUSTOM_ACTION_ICONS[CUSTOM_ACTION_DEFAULT_ICON];
  return ffbSvgIcon({
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true'
  }, icon.shapes);
}

// ── 設定頁預覽用的範例資料（不呼叫模型）─────────────
const CUSTOM_ACTION_SAMPLE_TEXT = 'She have been working here since three years.';

function buildCustomActionSample(action) {
  const fields = Array.isArray(action?.fields) ? action.fields : [];
  const data = {};
  fields.forEach((field, index) => {
    const label = field.label || field.key;
    if (action.layout === 'annotate' && index === 0) {
      data[field.key] = [
        { text: 'have been', type: 'grammar', note: '主詞是 She，應為 has been' },
        { text: 'since three years', type: 'error', note: '一段時間用 for three years' }
      ];
    } else if (action.layout === 'compare' && field.key === 'before') {
      data[field.key] = CUSTOM_ACTION_SAMPLE_TEXT;
    } else if (action.layout === 'compare' && field.key === 'after') {
      data[field.key] = 'She has been working here for three years.';
    } else {
      data[field.key] = `（${label}的範例內容）`;
    }
  });
  return { selectedText: CUSTOM_ACTION_SAMPLE_TEXT, data };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    readCompletedCustomFields,
    buildCustomActionContent,
    buildCustomFormatError,
    buildCustomActionMarkdown,
    normalizeAnnotationType,
    CUSTOM_ACTION_ICONS,
    CUSTOM_ACTION_DEFAULT_ICON,
    listCustomActionIcons,
    getDefaultCustomActionIcon,
    buildCustomActionIcon,
    buildCustomActionSample
  };
}
