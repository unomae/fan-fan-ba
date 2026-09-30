// 自訂動作的結果卡：三種版面、串流漸進顯示、惡意字串、Obsidian markdown、content 送出的請求
const fs = require('fs');
const path = require('path');
const vm = require('vm');

Object.assign(global, require('../../content/dom'));
const {
  readCompletedCustomFields,
  buildCustomActionContent,
  buildCustomFormatError,
  buildCustomActionMarkdown,
  normalizeAnnotationType
} = require('../../content/custom-action-render');

const XSS = '<script>alert(1)</script><img src=x onerror=alert(2)><a href="javascript:alert(3)">x</a>';

const FIELDS_ACTION = {
  id: 'custom-summary',
  name: '重點摘要',
  layout: 'fields',
  saveTo: 'obsidian',
  fields: [
    { key: 'summary', label: '摘要', description: '' },
    { key: 'points', label: '重點', description: '' }
  ]
};

const ANNOTATE_ACTION = {
  id: 'custom-grammar',
  name: '文法標註',
  layout: 'annotate',
  saveTo: 'none',
  fields: [
    { key: 'marks', label: '標註', description: '' },
    { key: 'overall', label: '總評', description: '' }
  ]
};

const COMPARE_ACTION = {
  id: 'custom-rewrite',
  name: '改寫',
  layout: 'compare',
  saveTo: 'none',
  fields: [
    { key: 'after', label: '改寫後', description: '' },
    { key: 'notes', label: '說明', description: '' }
  ]
};

// 找出可執行的東西：script／事件屬性／javascript: 連結
function executableNodes(root) {
  const bad = [...root.querySelectorAll('script, img, iframe, a[href]')];
  for (const el of root.querySelectorAll('*')) {
    for (const attr of el.attributes) {
      // title 之類的純文字屬性含 javascript: 字樣不會執行，只查會被當網址的屬性
      const isUrlAttr = /^(href|src|action|formaction|xlink:href)$/i.test(attr.name);
      if (/^on/i.test(attr.name) || (isUrlAttr && /javascript:/i.test(attr.value))) bad.push(el);
    }
  }
  return bad;
}

describe('readCompletedCustomFields：串流中只取已收完的欄位', () => {
  const fields = FIELDS_ACTION.fields;

  it('字串還沒收完就不出現，收完才出現', () => {
    expect(readCompletedCustomFields('{"summary": "半句', fields)).toEqual({});
    expect(readCompletedCustomFields('{"summary": "完整一句", "poi', fields)).toEqual({ summary: '完整一句' });
  });

  it('陣列要到右括號才算收完；跳脫的引號與括號不會提早結束', () => {
    const partial = '{"summary":"a","points":["第一點 \\"引號\\" ]"';
    expect(readCompletedCustomFields(partial, fields)).toEqual({ summary: 'a' });
    expect(readCompletedCustomFields(`${partial}, "第二點"]}`, fields))
      .toEqual({ summary: 'a', points: ['第一點 "引號" ]', '第二點'] });
  });

  it('數字要看到後面的分隔字元才算數，避免把 12 當成 123 的結果', () => {
    const numberFields = [{ key: 'score', label: '分數' }];
    expect(readCompletedCustomFields('{"score": 12', numberFields)).toEqual({});
    expect(readCompletedCustomFields('{"score": 123}', numberFields)).toEqual({ score: 123 });
  });

  it('忽略 markdown 程式碼框與沒宣告的鍵', () => {
    const text = '```json\n{"extra": "x", "summary": "ok"}\n```';
    expect(readCompletedCustomFields(text, fields)).toEqual({ summary: 'ok' });
  });

  it('不是 JSON 時回傳空物件、不丟錯', () => {
    expect(readCompletedCustomFields('抱歉我無法回答', fields)).toEqual({});
    expect(readCompletedCustomFields('', fields)).toEqual({});
  });
});

describe('fields 版面', () => {
  it('逐欄顯示標題與內容；字串保留換行、陣列逐項列出', () => {
    const node = buildCustomActionContent(FIELDS_ACTION, { summary: '第一行\n第二行', points: ['甲', '乙'] });
    const labels = [...node.querySelectorAll('.g-ca-label')].map(el => el.textContent);
    expect(labels).toEqual(['摘要', '重點']);
    expect(node.querySelector('[data-key="summary"] .g-ca-value').querySelectorAll('br')).toHaveLength(1);
    expect([...node.querySelectorAll('[data-key="points"] li')].map(li => li.textContent)).toEqual(['甲', '乙']);
    expect(node.querySelector('.g-ca-pending')).toBeNull();
  });

  it('串流中缺的欄位顯示骨架，已收到的欄位直接顯示', () => {
    const node = buildCustomActionContent(FIELDS_ACTION, { summary: '先到' }, { pending: true });
    expect(node.classList.contains('g-streaming')).toBe(true);
    expect(node.querySelector('[data-key="summary"]').textContent).toContain('先到');
    expect(node.querySelector('[data-key="points"] .g-ca-pending')).not.toBeNull();
  });
});

describe('annotate 版面', () => {
  const original = 'She go to school yesterday and eat lunch.';

  it('比對得到的片段標在原文上，比對不到的只列在下方、以純文字顯示', () => {
    const node = buildCustomActionContent(ANNOTATE_ACTION, {
      marks: [
        { text: 'go', type: 'grammar', note: '應為 went' },
        { text: 'eat', type: 'error', note: '應為 ate' },
        { text: '不存在的片段', type: 'grammar', note: '找不到' }
      ],
      overall: '時態要一致'
    }, { selectedText: original });

    const annotated = node.querySelector('.g-ca-annotated');
    expect(annotated.textContent).toBe(original); // 原文一字不少
    const marks = [...annotated.querySelectorAll('mark')];
    expect(marks.map(m => m.textContent)).toEqual(['go', 'eat']);
    expect(marks[0].className).toBe('g-ca-mark g-ca-type-grammar');
    expect(marks[0].getAttribute('title')).toBe('應為 went');
    const unmatched = node.querySelector('.g-ca-unmatched');
    expect(unmatched.textContent).toBe('不存在的片段：找不到');
    expect(unmatched.querySelector('mark')).toBeNull();
    expect(node.querySelector('[data-key="overall"]').textContent).toContain('時態要一致');
  });

  it('type 只收簡單代號，其他一律歸 other（type 會進 class 名稱）', () => {
    expect(normalizeAnnotationType('Grammar')).toBe('grammar');
    expect(normalizeAnnotationType('x" onmouseover="alert(1)')).toBe('other');
    expect(normalizeAnnotationType(null)).toBe('other');
  });

  it('標註陣列還沒收完時，原文照常顯示、下方顯示骨架', () => {
    const node = buildCustomActionContent(ANNOTATE_ACTION, {}, { selectedText: original, pending: true });
    expect(node.querySelector('.g-ca-annotated').textContent).toBe(original);
    expect(node.querySelectorAll('.g-ca-pending').length).toBe(2);
  });
});

describe('compare 版面', () => {
  it('沒宣告 before 欄位時以選取原文當修改前', () => {
    const node = buildCustomActionContent(COMPARE_ACTION, { after: '改好的', notes: '更精簡' }, { selectedText: '原本的' });
    expect(node.querySelector('.g-ca-before').textContent).toBe('原文原本的');
    expect(node.querySelector('.g-ca-after').textContent).toBe('改寫後改好的');
    expect(node.querySelector('[data-key="notes"]').textContent).toBe('說明更精簡');
  });

  it('有宣告 before 欄位時用模型回傳的 before', () => {
    const action = { ...COMPARE_ACTION, fields: [{ key: 'before', label: '修改前' }, ...COMPARE_ACTION.fields] };
    const node = buildCustomActionContent(action, { before: 'B', after: 'A', notes: '' }, { selectedText: '選取' });
    expect(node.querySelector('.g-ca-before').textContent).toBe('修改前B');
  });
});

describe('惡意字串不執行', () => {
  it('三種版面與格式不符畫面，模型回傳的 HTML／javascript: 都只當文字', () => {
    const nodes = [
      buildCustomActionContent(FIELDS_ACTION, { summary: XSS, points: [XSS, { html: XSS }] }),
      buildCustomActionContent(ANNOTATE_ACTION, {
        marks: [{ text: '<script>', type: 'x" onclick="alert(1)', note: XSS }, { text: XSS, type: 'grammar', note: XSS }],
        overall: XSS
      }, { selectedText: `前面 ${XSS} 後面` }),
      buildCustomActionContent(COMPARE_ACTION, { after: XSS, notes: XSS }, { selectedText: XSS }),
      buildCustomFormatError(XSS)
    ];
    for (const node of nodes) {
      document.body.replaceChildren(node);
      expect(executableNodes(node)).toEqual([]);
      expect(node.textContent).toContain('<script>');
    }
    expect(nodes[1].querySelector('mark').className).toBe('g-ca-mark g-ca-type-other');
  });
});

describe('Obsidian markdown', () => {
  it('每個欄位輸出「粗體標題＋內容」；標註陣列轉清單', () => {
    expect(buildCustomActionMarkdown(FIELDS_ACTION, { summary: '一句話', points: ['甲', '乙'] }))
      .toBe('**摘要**\n\n一句話\n\n**重點**\n\n- 甲\n- 乙');
    expect(buildCustomActionMarkdown(ANNOTATE_ACTION, {
      marks: [{ text: 'go', type: 'grammar', note: '應為 went' }, { text: 'eat' }],
      overall: '好'
    })).toBe('**標註**\n\n- go：應為 went\n- eat\n\n**總評**\n\n好');
  });
});

// ── 接進結果卡與 content 請求 ───────────────────────────

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function loadContent() {
  if (!Element.prototype.animate) Element.prototype.animate = () => ({ cancel() {} });
  document.body.innerHTML = '<p id="para">She go to school.</p>';
  const port = {
    listeners: [],
    onMessage: { addListener(fn) { port.listeners.push(fn); } },
    onDisconnect: { addListener() {} },
    postMessage: jest.fn(),
    disconnect: jest.fn(),
    emit(message) { port.listeners.forEach(fn => fn(message)); }
  };
  const context = vm.createContext({
    window, document, location, navigator, chrome, console, setTimeout, clearTimeout,
    requestAnimationFrame: () => 0,
    FanFanBaModels: require('../../models'),
    loadRecentFolders: jest.fn(async () => []),
    hideAutoSaveToast: jest.fn()
  });
  context.globalThis = context;
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.sync.get.mockResolvedValue({});
  chrome.runtime.id = 'mock-id';
  chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ models: [] }));
  chrome.runtime.connect = jest.fn(() => port);
  ['custom-actions.js', 'content/site-policy.js', 'content/state.js', 'content/utils.js', 'content/dom.js',
    'content/custom-action-render.js', 'content/obsidian.js', 'content/selection-controls.js',
    'content/toolbar.js', 'content/result-card.js', 'content/main.js'].forEach(file => runContentScript(file, context));
  context.saveToHistory = jest.fn();
  return { context, port };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function runAction(context, action, text = 'She go to school.') {
  await flush();
  vm.runInContext(`savedSel = { text: ${JSON.stringify(text)}, range: null };`, context);
  context.showToolbar();
  context.runCustomAction(action);
  await flush();
  return document.getElementById('gemini-result-card');
}

describe('結果卡：執行自訂動作', () => {
  beforeEach(() => jest.clearAllMocks());

  it('一律走串流，請求帶動作定義、不帶網址', async () => {
    const { context, port } = loadContent();
    await runAction(context, FIELDS_ACTION);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const request = port.postMessage.mock.calls[0][0];
    expect(request.action).toBe('custom');
    expect(request.customAction).toEqual(FIELDS_ACTION);
    expect(request).not.toHaveProperty('pageUrl');
    expect(JSON.stringify(request)).not.toContain('http');
  });

  it('串流中逐欄出現，收完依版面渲染；存 Obsidian 的內容是欄位 markdown', async () => {
    const { context, port } = loadContent();
    const card = await runAction(context, FIELDS_ACTION);
    const requestId = port.postMessage.mock.calls[0][0].requestId;
    expect(card.querySelector('.g-rc-tag').textContent).toBe('重點摘要');
    expect(card.querySelector('.g-save-obs').hidden).toBe(false);

    port.emit({ requestId, chunk: '{"summary": "一句' });
    expect(card.querySelectorAll('.g-ca-pending')).toHaveLength(2);
    port.emit({ requestId, chunk: '話", "points": ["甲"' });
    expect(card.querySelector('[data-key="summary"]').textContent).toBe('摘要一句話');
    expect(card.querySelector('[data-key="points"] .g-ca-pending')).not.toBeNull();
    port.emit({ requestId, chunk: ', "乙"]}' });
    port.emit({ requestId, done: true });

    expect(card.querySelector('.g-ca-pending')).toBeNull();
    expect(card.querySelector('.g-streaming')).toBeNull();
    expect([...card.querySelectorAll('[data-key="points"] li')].map(li => li.textContent)).toEqual(['甲', '乙']);
    const block = vm.runInContext("buildObsidianBlock({ tag: '重點摘要', hm: '10:00', date: '2026/9/30', preview: 'x' })", context);
    expect(block).toContain('**摘要**\n\n一句話\n\n**重點**\n\n- 甲\n- 乙');
    expect(context.saveToHistory).not.toHaveBeenCalled();
  });

  it('模型沒照格式回傳：顯示原文加「格式不符」', async () => {
    const { context, port } = loadContent();
    const card = await runAction(context, COMPARE_ACTION);
    const requestId = port.postMessage.mock.calls[0][0].requestId;
    port.emit({ requestId, chunk: `抱歉 ${XSS}` });
    port.emit({ requestId, done: true });
    const error = card.querySelector('.g-ca-format-error');
    expect(error.textContent).toContain('格式不符');
    expect(error.textContent).toContain(`抱歉 ${XSS}`);
    expect(executableNodes(card.querySelector('.g-rc-body'))).toEqual([]);
  });

  it('saveTo 不是 obsidian 時隱藏寶石鈕，換回內建動作再顯示', async () => {
    const { context } = loadContent();
    const card = await runAction(context, ANNOTATE_ACTION);
    expect(card.querySelector('.g-save-obs').hidden).toBe(true);
    context.triggerAction('explain');
    expect(card.querySelector('.g-save-obs').hidden).toBe(false);
  });
});

describe('動作圖示', () => {
  const { buildCustomActionIcon, listCustomActionIcons, getDefaultCustomActionIcon } = require('../../content/custom-action-render');

  it('清單裡每個圖示都畫得出 SVG；不認得的名稱退回預設圖示', () => {
    const icons = listCustomActionIcons();
    expect(icons.length).toBeGreaterThanOrEqual(8);
    for (const { name, label } of icons) {
      expect(label).toBeTruthy();
      expect(buildCustomActionIcon(name).namespaceURI).toBe('http://www.w3.org/2000/svg');
    }
    expect(buildCustomActionIcon('no-such-icon').outerHTML).toBe(buildCustomActionIcon(getDefaultCustomActionIcon()).outerHTML);
  });
});
