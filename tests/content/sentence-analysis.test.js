// 長難句分析的結果卡：類型白名單、原文比對不到、只看主幹／斷句兩個切換、Obsidian 輸出、content 送出的請求
const fs = require('fs');
const path = require('path');
const vm = require('vm');

Object.assign(global, require('../../content/dom'));
const CustomActions = require('../../custom-actions');
const {
  buildCustomActionContent,
  buildCustomActionMarkdown,
  annotateViewState
} = require('../../content/custom-action-render');

const ANALYZE = CustomActions.getStructuredBuiltinAction('analyze');
const SENTENCE = 'The book that I bought yesterday is on the table.';
const ANNOTATIONS = [
  { text: 'The book', type: 'subject' },
  { text: 'that I bought yesterday', type: 'clause', note: '關係子句，修飾 The book' },
  { text: 'is', type: 'predicate' },
  { text: 'on the table', type: 'modifier', note: '表示位置' }
];

function render(annotations = ANNOTATIONS, extra = {}) {
  const node = buildCustomActionContent(ANALYZE, { annotations, translation: '我昨天買的書在桌上。', ...extra }, { selectedText: SENTENCE });
  document.body.replaceChildren(node);
  return node;
}

const markTexts = node => [...node.querySelectorAll('.g-ca-annotated mark')].map(mark => mark.textContent);
const toggle = (node, key) => node.querySelector(`.g-ca-toggle[data-toggle="${key}"]`);

// 斷句點切出來的每一行文字
function splitLines(node) {
  const lines = [''];
  for (const child of node.querySelector('.g-ca-annotated').childNodes) {
    if (child.nodeType === 1 && child.classList.contains('g-ca-break')) lines.push('');
    else lines[lines.length - 1] += child.textContent;
  }
  return lines.map(line => line.trim());
}

beforeEach(() => {
  annotateViewState.coreOnly = false;
  annotateViewState.split = false;
});

describe('類型白名單與原文比對', () => {
  it('六種類型以外的標註整筆忽略：不標在原文上、也不列在說明裡', () => {
    const node = render([
      ...ANNOTATIONS,
      { text: 'table', type: 'noun', note: '不該出現' },
      { text: 'yesterday', type: 'Adverb" onclick="x', note: '不該出現' }
    ]);
    expect(markTexts(node)).toEqual(['The book', 'that I bought yesterday', 'is', 'on the table']);
    expect(node.textContent).not.toContain('不該出現');
    expect(node.querySelectorAll('.g-ca-notes li')).toHaveLength(4);
  });

  it('text 不在原文裡：原文照常顯示、不標記，片段以純文字列在說明區', () => {
    const node = render([{ text: 'The book', type: 'subject' }, { text: 'was lying', type: 'predicate', note: '原文沒有這段' }]);
    expect(node.querySelector('.g-ca-annotated').textContent).toBe(SENTENCE);
    expect(markTexts(node)).toEqual(['The book']);
    const unmatched = node.querySelector('.g-ca-unmatched');
    expect(unmatched.textContent).toBe('動詞was lying：原文沒有這段');
    expect(unmatched.querySelector('mark')).toBeNull();
  });

  it('說明列表每項前面標中文類型名稱；譯文欄位照常顯示', () => {
    const node = render();
    expect([...node.querySelectorAll('.g-ca-notes .g-ca-type-label')].map(el => el.textContent))
      .toEqual(['主詞', '子句', '動詞', '修飾']);
    expect(node.querySelector('[data-key="translation"]').textContent).toBe('譯文我昨天買的書在桌上。');
  });
});

describe('只看主幹', () => {
  it('預設關閉；點了容器加 g-ca-core-only，只有主詞／動詞／受詞帶 g-ca-core；再點一次關閉', () => {
    const node = render();
    const btn = toggle(node, 'coreOnly');
    expect(btn.textContent).toBe('只看主幹');
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    expect(node.classList.contains('g-ca-core-only')).toBe(false);

    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(node.classList.contains('g-ca-core-only')).toBe(true);
    const core = [...node.querySelectorAll('.g-ca-annotated mark.g-ca-core')].map(mark => mark.textContent);
    expect(core).toEqual(['The book', 'is']);
    expect([...node.querySelectorAll('.g-ca-notes li.g-ca-core')]).toHaveLength(2);

    btn.click();
    expect(node.classList.contains('g-ca-core-only')).toBe(false);
  });

  it('狀態會沿用到下一次渲染（串流重畫、查下一句）', () => {
    toggle(render(), 'coreOnly').click();
    const next = render();
    expect(next.classList.contains('g-ca-core-only')).toBe(true);
    expect(toggle(next, 'coreOnly').getAttribute('aria-pressed')).toBe('true');
  });
});

describe('斷句', () => {
  it('在子句前後放斷句點，原文文字不變；開關只切換容器 class', () => {
    const node = render();
    expect(node.querySelector('.g-ca-annotated').textContent).toBe(SENTENCE);
    expect(splitLines(node)).toEqual(['The book', 'that I bought yesterday', 'is on the table.']);

    const btn = toggle(node, 'split');
    expect(node.classList.contains('g-ca-split')).toBe(false);
    btn.click();
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    expect(node.classList.contains('g-ca-split')).toBe(true);
  });

  it('子句在句首或句尾時不會多出空行；相鄰兩個子句之間只放一個斷句點', () => {
    const text = 'Although it rained, we went out because we were bored.';
    const node = buildCustomActionContent(ANALYZE, {
      annotations: [
        { text: 'Although it rained,', type: 'clause' },
        { text: 'we', type: 'subject' },
        { text: 'went out', type: 'predicate' },
        { text: 'because we were bored.', type: 'clause' }
      ]
    }, { selectedText: text });
    expect(splitLines(node)).toEqual(['Although it rained,', 'we went out', 'because we were bored.']);

    // 子句後面緊接的標點留在子句那一行，不會單獨成行、也不會跑到下一行開頭
    const commas = buildCustomActionContent(ANALYZE, {
      annotations: [
        { text: 'The report', type: 'subject' },
        { text: 'that the committee released last week', type: 'clause' },
        { text: 'which surprised many analysts', type: 'clause' },
        { text: 'suggests', type: 'predicate' }
      ]
    }, { selectedText: 'The report that the committee released last week, which surprised many analysts, suggests that prices will rise.' });
    expect(splitLines(commas)).toEqual([
      'The report', 'that the committee released last week,', 'which surprised many analysts,', 'suggests that prices will rise.'
    ]);

    const adjacent = buildCustomActionContent(ANALYZE, {
      annotations: [{ text: 'A b', type: 'clause' }, { text: 'c d', type: 'clause' }]
    }, { selectedText: 'x A bc d y' });
    expect(adjacent.querySelectorAll('.g-ca-break')).toHaveLength(3);
    expect(splitLines(adjacent)).toEqual(['x', 'A b', 'c d', 'y']);
  });
});

describe('一般自訂動作的 annotate 不受影響', () => {
  it('沒有類型白名單與主幹設定：不出現切換鈕、不放斷句點、任何類型都照標', () => {
    const custom = { id: 'custom-x', name: 'x', layout: 'annotate', fields: [{ key: 'marks', label: '標註' }] };
    const node = buildCustomActionContent(custom, { marks: [{ text: 'that I bought yesterday', type: 'clause' }, { text: 'table', type: 'noun' }] }, { selectedText: SENTENCE });
    expect(node.querySelector('.g-ca-toggles')).toBeNull();
    expect(node.querySelector('.g-ca-break')).toBeNull();
    expect(node.querySelector('.g-ca-type-label')).toBeNull();
    expect(markTexts(node)).toEqual(['that I bought yesterday', 'table']);
  });
});

describe('Obsidian 輸出', () => {
  it('標註前加類型名稱、白名單外的不輸出，譯文照常', () => {
    const md = buildCustomActionMarkdown(ANALYZE, {
      annotations: [{ text: 'The book', type: 'subject' }, { text: 'x', type: 'noun' }, { text: 'is', type: 'predicate', note: '主要動詞' }],
      translation: '書在桌上。'
    });
    expect(md).toBe('**句子成分**\n\n- ［主詞］The book\n- ［動詞］is：主要動詞\n\n**譯文**\n\n書在桌上。');
  });
});

// ── 接進結果卡與 content 請求 ───────────────────────────

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function loadContent() {
  if (!Element.prototype.animate) Element.prototype.animate = () => ({ cancel() {} });
  document.body.innerHTML = `<p id="para">${SENTENCE}</p>`;
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
  chrome.storage.onChanged = { addListener: jest.fn() };
  ['custom-actions.js', 'content/site-policy.js', 'content/state.js', 'content/utils.js', 'content/dom.js',
    'content/custom-action-render.js', 'content/obsidian.js', 'content/selection-controls.js',
    'content/toolbar.js', 'content/result-card.js', 'content/main.js'].forEach(file => runContentScript(file, context));
  context.saveToHistory = jest.fn();
  return { context, port };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('結果卡：執行長難句分析', () => {
  beforeEach(() => jest.clearAllMocks());

  it('送出 action=analyze、不帶動作定義與網址；標題是「長難句分析」、顯示寶石鈕', async () => {
    const { context, port } = loadContent();
    await flush();
    vm.runInContext(`savedSel = { text: ${JSON.stringify(SENTENCE)}, range: null };`, context);
    context.showToolbar();
    context.triggerAction('analyze');
    await flush();

    const request = port.postMessage.mock.calls[0][0];
    expect(request.action).toBe('analyze');
    expect(request).not.toHaveProperty('customAction');
    expect(request).not.toHaveProperty('pageUrl');
    const card = document.getElementById('gemini-result-card');
    expect(card.querySelector('.g-rc-tag').textContent).toBe('長難句分析');
    expect(card.querySelector('.g-rc-tag svg')).not.toBeNull();
    expect(card.querySelector('.g-save-obs').hidden).toBe(false);
  });

  it('串流中逐欄出現，收完依標註版面渲染；存 Obsidian 是欄位 markdown，不寫最近紀錄', async () => {
    const { context, port } = loadContent();
    await flush();
    vm.runInContext(`savedSel = { text: ${JSON.stringify(SENTENCE)}, range: null };`, context);
    context.showToolbar();
    context.triggerAction('analyze');
    await flush();
    const requestId = port.postMessage.mock.calls[0][0].requestId;
    const card = document.getElementById('gemini-result-card');

    port.emit({ requestId, chunk: '{"annotations": [{"text": "The book", "type": "subject"}' });
    expect(card.querySelector('.g-ca-annotated').textContent).toBe(SENTENCE);
    expect(card.querySelectorAll('.g-ca-pending').length).toBe(2);
    port.emit({ requestId, chunk: ', {"text": "is", "type": "predicate"}], "translation": "書在桌上。"}' });
    port.emit({ requestId, done: true });

    expect(card.querySelector('.g-ca-pending')).toBeNull();
    expect([...card.querySelectorAll('.g-ca-annotated mark')].map(mark => mark.textContent)).toEqual(['The book', 'is']);
    expect(card.querySelector('.g-ca-toggles')).not.toBeNull();
    const block = vm.runInContext("buildObsidianBlock({ tag: '長難句分析', hm: '10:00', date: '2026/10/1', preview: 'x' })", context);
    expect(block).toContain('**句子成分**\n\n- ［主詞］The book\n- ［動詞］is\n\n**譯文**\n\n書在桌上。');
    expect(context.saveToHistory).not.toHaveBeenCalled();
  });

  it('模型沒照格式回傳：顯示原文加「格式不符」', async () => {
    const { context, port } = loadContent();
    await flush();
    vm.runInContext(`savedSel = { text: ${JSON.stringify(SENTENCE)}, range: null };`, context);
    context.showToolbar();
    context.triggerAction('analyze');
    await flush();
    const requestId = port.postMessage.mock.calls[0][0].requestId;
    port.emit({ requestId, chunk: '這句話的主詞是 The book。' });
    port.emit({ requestId, done: true });
    expect(document.querySelector('#gemini-result-card .g-ca-format-error').textContent).toContain('格式不符');
  });
});
