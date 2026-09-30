// 渲染對照測試：content script 各渲染點改用 DOM builder（不經 innerHTML）後，
// 用同一組代表性輸入產生的 DOM 必須與改寫前一致。
//
// 基準檔 __fixtures__/render-parity-baseline.json 存的是改寫前的 outerHTML 原文，
// 以 FFB_WRITE_RENDER_BASELINE=1 執行本檔產生（只在改寫前的 commit 上跑一次）。
// 比對時兩邊都走 normalizeRendered：屬性排序、SVG 命名空間必須正確、
// 純空白文字節點依所在容器判斷是否影響排版（見 FLEX_OR_BLOCK_CONTAINERS）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASELINE_PATH = path.join(__dirname, '__fixtures__', 'render-parity-baseline.json');
const WRITE_BASELINE = process.env.FFB_WRITE_RENDER_BASELINE === '1';
const SVG_NS = 'http://www.w3.org/2000/svg';
const FIXED_NOW = new Date('2026-09-30T02:00:00Z');

const CONTENT_SCRIPTS = [
  'content/site-policy.js',
  'content/state.js',
  'content/utils.js',
  'content/dom.js',
  'content/vocabulary.js',
  'content/vocabulary-highlighter.js',
  'content/obsidian.js',
  'content/selection-controls.js',
  'content/toolbar.js',
  'content/result-card.js',
  'content/main.js',
  'content/page-translator-state.js',
  'content/page-translator-collector.js',
  'content/page-translator-client.js',
  'content/page-translator-renderer.js',
  'content/page-translator-panel.js',
  'content/floating-ball.js',
  'content/page-translator-single.js'
];

// 行內元素：兩個行內兄弟之間的純空白文字在一般排版下會顯示成一個空格
const INLINE_TAGS = new Set([
  'a', 'b', 'button', 'code', 'del', 'em', 'i', 'img', 'input', 'ins', 'label',
  'select', 'span', 'strong', 'svg', 'textarea'
]);

// 這些容器在 content.css 是 flex／grid（或子元素全是區塊），子節點之間的純空白不影響排版。
// 每一筆都要在 content.css 查過 display 才能加入（括號內為查到的值）。
const FLEX_OR_BLOCK_CONTAINERS = [
  '.g-rc-actions',                // flex
  '.g-autosave-bar',              // flex
  '.g-obs-split-wrap',            // flex
  '.g-rc-source-actions',         // flex
  '.g-rc-model-wrap',             // inline-flex
  '.g-dict-word-row',             // flex
  '.g-vocab-save-btn',            // inline-flex
  '.g-synonym-row',               // flex
  '.g-optimize-label-row',        // flex
  '.g-history-panel',             // block；子項 .g-hist-item 是 display:flex＋width:100% 的區塊級盒子
  '.g-hist-item',                 // flex
  '#gemini-ai-toolbar',           // flex
  '.g-vocab-highlight-tip',       // .g-show 時 grid（隱藏時 none）
  '#fanfanba-floating',           // flex
  '.ffb-ball-menu-group',         // flex
  '.ffb-ball-item',               // inline-flex
  '.g-floating-library',          // grid
  '.g-floating-library-item',     // grid
  '.g-floating-history-item',     // grid
  '.g-vocab-tabs',                // inline-flex
  '.g-vocab-panel-actions',       // inline-flex
  '.g-vocab-panel-meta',          // flex
  '.g-vocab-panel-item-actions',  // inline-flex
  '.ffb-page-panel-modes',        // flex
  '.ffb-page-panel-actions'       // flex
];

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function isInlineElement(node) {
  return Boolean(node && node.nodeType === 1 && INLINE_TAGS.has(node.localName));
}

function containerIgnoresWhitespace(el) {
  return FLEX_OR_BLOCK_CONTAINERS.some(selector => el.matches(selector));
}

// 把 DOM 轉成穩定、可比對的文字：
// - 元素：標籤、命名空間（svg 必須在 SVG namespace）、依名稱排序的屬性
// - 文字：連續空白收成一個空格；只有相鄰兄弟存在的那一側保留前後空格
// - 純空白節點：只在兩個行內兄弟之間、且容器不是 flex／grid 時，記成一個「␠」
function normalizeRendered(node, depth = 0) {
  const pad = '  '.repeat(depth);
  if (node.nodeType === 3) return null; // 文字節點由父層處理
  const tag = node.namespaceURI === SVG_NS ? `svg:${node.localName}` : node.localName;
  const attrs = [...node.attributes]
    .map(attr => `${attr.name}="${attr.value}"`)
    .sort()
    .join(' ');
  const lines = [`${pad}<${tag}${attrs ? ' ' + attrs : ''}>`];
  const children = [...node.childNodes].filter(child => child.nodeType === 1 || child.nodeType === 3);

  children.forEach((child, index) => {
    if (child.nodeType === 1) {
      lines.push(normalizeRendered(child, depth + 1));
      return;
    }
    const prev = children[index - 1];
    const next = children[index + 1];
    const raw = child.textContent;
    if (!raw.trim()) {
      if (isInlineElement(prev) && isInlineElement(next) && !containerIgnoresWhitespace(node)) {
        lines.push(`${pad}  ␠`);
      }
      return;
    }
    let text = raw.replace(/\s+/g, ' ');
    if (!prev) text = text.replace(/^ /, '');
    if (!next) text = text.replace(/ $/, '');
    lines.push(`${pad}  "${text}"`);
  });
  return lines.join('\n');
}

function parseBaselineHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content.firstElementChild;
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function createContext() {
  if (!Element.prototype.animate) Element.prototype.animate = () => ({ cancel() {} });
  document.body.innerHTML = '<main id="page-content"><p id="para">apple pie</p></main>';
  const localStore = {};
  const port = {
    listener: null,
    onMessage: { addListener(fn) { port.listener = fn; } },
    onDisconnect: { addListener() {} },
    postMessage: jest.fn(),
    disconnect: jest.fn()
  };
  const context = vm.createContext({
    window,
    document,
    location,
    navigator,
    chrome,
    console,
    Date,
    Node,
    NodeFilter,
    URL,
    history: window.history,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
    FanFanBaModels: require('../../models')
  });
  context.globalThis = context;
  chrome.runtime.id = 'mock-id';
  chrome.runtime.connect = jest.fn(() => port);
  chrome.runtime.sendMessage = jest.fn(() => undefined); // 不回應：停在載入中畫面
  chrome.storage.local.get = jest.fn(async key => {
    if (typeof key === 'string') return { [key]: localStore[key] };
    return { ...localStore };
  });
  chrome.storage.local.set = jest.fn(async values => { Object.assign(localStore, values); });
  chrome.storage.sync.get = jest.fn(async () => ({}));
  CONTENT_SCRIPTS.forEach(file => runContentScript(file, context));
  // 非渲染點的副作用改成空函式，讓快照只反映渲染結果
  context.saveToHistory = jest.fn();
  context.initVocabularySaveButton = jest.fn();
  context.positionResultCard = jest.fn();
  context.positionResultCardNearFloatingBall = jest.fn();
  return { context, port, localStore };
}

function run(context, code) {
  return vm.runInContext(code, context);
}

function ensureCard(context) {
  run(context, 'if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();');
  return run(context, 'resultCard');
}

const DICT_FULL = {
  word: 'run',
  phonetic: '/rʌn/',
  pos: 'v.',
  definition: 'to move fast on foot',
  cefr: 'b1',
  lang: 'en',
  translations: ['跑', '經營'],
  usage: '常用於描述移動或經營',
  synonym: { word: 'sprint', diff: '短距離全力跑' },
  examples: [
    { type: 'context', src: 'She runs every morning.', surface: 'runs', zh: '她每天早上跑步。' },
    { type: 'general', en: 'Run for your life!', zh: '快逃命！' }
  ]
};
const XSS = '<img src=x onerror=alert(1)>"\'&';
const MARKDOWN = [
  'Intro **bold** and {{term}} here',
  '- first item',
  '* second **item**',
  '1. step one',
  '２．全形步驟',
  '',
  `Para ${XSS}`,
  '===DEEP===',
  '• bullet after deep',
  'Tail {{"><b>x</b>}}'
].join('\n');

const HISTORY = [
  { action: 'translate', text: 'short', result: '{"word":"short"}', ts: FIXED_NOW.getTime() },
  { action: 'explain', text: 'a very long text that is clearly more than twenty eight chars', result: '**x**', ts: FIXED_NOW.getTime() - 60000 },
  { action: 'optimize', text: 'optimize me please now', result: 'plain', ts: FIXED_NOW.getTime() - 120000 },
  { action: 'custom', text: `odd ${XSS}`, result: 'x', ts: FIXED_NOW.getTime() - 180000 }
];

const VOCAB_ITEMS = [
  {
    id: 'v1', word: 'run', lang: 'en', pos: 'v.', translations: ['跑', '經營', '運轉', '第四'], definition: 'move fast',
    status: 'learning', count: 3, createdAt: '2026-09-20T00:00:00Z', lastSeenAt: '2026-09-28T00:00:00Z',
    nextReviewAt: '2026-09-29T00:00:00Z', reviewCount: 1, wrongCount: 2
  },
  {
    id: 'v2', word: `known ${XSS}`, lang: 'en', translations: [], status: 'known', count: 1,
    createdAt: '2026-09-30T01:00:00Z', lastSeenAt: '2026-09-30T01:00:00Z', obsidianExportedAt: '2026-09-30T01:00:00Z',
    nextReviewAt: '2026-10-20T00:00:00Z'
  },
  {
    id: 'v3', word: 'ephemeral', translations: ['短暫的'], status: 'learning', count: 7,
    createdAt: '2026-08-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z', nextReviewAt: 'not-a-date', wrongCount: 1
  }
];

// 每個情境回傳要快照的 DOM 節點（或節點陣列）
const SCENARIOS = {
  'card-shell': ({ context }) => ensureCard(context).cloneNode(true),

  'loading-translate': ({ context }) => {
    run(context, 'savedSel = { text: "apple", range: null };');
    context.showToolbar();
    context.triggerAction('translate');
    const card = run(context, 'resultCard');
    return [card.querySelector('.g-rc-tag'), card.querySelector('.g-rc-body')];
  },
  'loading-explain-optimize': ({ context }) => {
    run(context, 'savedSel = { text: "some longer text to explain here", range: null };');
    context.showToolbar();
    context.triggerAction('explain');
    const explainTag = run(context, 'resultCard').querySelector('.g-rc-tag').cloneNode(true);
    run(context, 'savedSel = { text: "another longer text to optimize ok", range: null };');
    context.triggerAction('optimize');
    return [explainTag, run(context, 'resultCard').querySelector('.g-rc-tag')];
  },
  'streaming': ({ context, port }) => {
    run(context, 'savedSel = { text: "some longer text to explain here", range: null };');
    context.showToolbar();
    context.triggerAction('explain');
    const body = run(context, 'resultCard').querySelector('.g-rc-body');
    port.listener({ status: `改用備援模型 ${XSS}` });
    const noticeOnly = body.cloneNode(true);
    port.listener({ chunk: `第一段 ${XSS}\n第二行\n===DEEP===\n深入` });
    const withNotice = body.cloneNode(true);
    return [noticeOnly, withNotice];
  },
  'streaming-no-notice': ({ context, port }) => {
    run(context, 'savedSel = { text: "some longer text to explain here", range: null };');
    context.showToolbar();
    context.triggerAction('explain');
    port.listener({ chunk: 'plain chunk\nline two' });
    return run(context, 'resultCard').querySelector('.g-rc-body');
  },

  'dict-full': ({ context }) => renderBody(context, 'translate', JSON.stringify(DICT_FULL), 'run'),
  'dict-minimal': ({ context }) => renderBody(context, 'translate', '{"word":"a"}', 'a'),
  'dict-pos-only': ({ context }) => renderBody(context, 'translate', '{"word":"x","pos":"n."}', 'x'),
  'dict-definition-only': ({ context }) => renderBody(context, 'translate', '{"word":"x","definition":"only def","translations":"甲;乙；丙"}', 'x'),
  'dict-usage-no-translations': ({ context }) => renderBody(context, 'translate', '{"word":"x","usage":"用法","cefr":"Z9","examples":[{"type":"general","src":"no hit here","surface":"zzz","zh":""}]}', 'x'),
  'dict-xss': ({ context }) => renderBody(context, 'translate', JSON.stringify({
    word: XSS, phonetic: XSS, pos: XSS, definition: XSS, usage: XSS, translations: [XSS],
    synonym: { word: XSS, diff: XSS }, examples: [{ type: 'context', src: `a ${XSS} b`, surface: XSS, zh: XSS }]
  }), 'x'),
  'dict-invalid-json': ({ context }) => renderBody(context, 'translate', MARKDOWN, 'short'),
  'translate-long': ({ context }) => renderBody(context, 'translate', MARKDOWN, 'this selection is definitely longer than twenty'),
  'explain': ({ context }) => renderBody(context, 'explain', MARKDOWN, 'term'),
  'explain-empty-lines': ({ context }) => renderBody(context, 'explain', '\n\nonly\n\n', 'term'),
  'optimize-full': ({ context }) => renderBody(context, 'optimize',
    `**優化後版本：** Better text ${XSS}\n**改動說明：**\n- 改 A\n- 改 **B**`, `Original text ${XSS} long enough`),
  'optimize-no-reasons': ({ context }) => renderBody(context, 'optimize',
    '**優化後版本:** Only result', 'Original text that is long enough'),
  'optimize-unmatched': ({ context }) => renderBody(context, 'optimize', MARKDOWN, 'Original text that is long enough'),
  'optimize-short-original': ({ context }) => renderBody(context, 'optimize', MARKDOWN, 'short'),

  'error-with-retry': ({ context }) => {
    ensureCard(context);
    context.setError(`失敗 ${XSS}`, () => {});
    return run(context, 'resultCard').querySelector('.g-rc-body');
  },
  'error-plain': ({ context }) => {
    ensureCard(context);
    context.setError('失敗');
    return run(context, 'resultCard').querySelector('.g-rc-body');
  },
  'result-notice': ({ context }) => {
    const body = renderBody(context, 'explain', 'body text', 'term');
    context.showResultNotice(`提示 ${XSS}`);
    return body;
  },

  'history-panel': async ({ context, localStore }) => {
    localStore.queryHistory = HISTORY;
    const card = ensureCard(context);
    card.querySelector('.g-history').click();
    await flush();
    const panel = card.querySelector('.g-history-panel').cloneNode(true);
    const tags = [];
    for (let i = 0; i < HISTORY.length; i++) {
      card.querySelector('.g-history').click(); // 再開一次（點項目會收合）
      await flush();
      card.querySelectorAll('.g-hist-item')[i].click();
      tags.push(card.querySelector('.g-rc-tag').cloneNode(true));
    }
    return [panel, ...tags];
  },
  'obs-dropdown': async ({ context }) => {
    const card = ensureCard(context);
    context.loadRecentFolders = jest.fn(async () => ['Reading/AI', '翻翻吧', `odd ${XSS}`]);
    card.querySelector('.g-obs-chevron-btn').click();
    await flush();
    return card.querySelector('.g-obs-dropdown');
  },

  'toolbar': ({ context }) => {
    context.showToolbar();
    // 「⋯」更多動作是之後刻意新增的（行為另見 toolbar-menu.test.js），這裡只比對內建三顆按鈕
    const clone = run(context, 'toolbar').cloneNode(true);
    clone.querySelectorAll('.g-more, .g-more-sep, .g-action-menu').forEach(node => node.remove());
    return clone;
  },
  'vocab-tooltip': ({ context }) => {
    const mark = document.createElement('mark');
    mark.textContent = 'run';
    mark.dataset.vocabWord = `run ${XSS}`;
    mark.dataset.vocabMeaning = '跑；經營';
    mark.dataset.vocabCount = '3';
    document.body.appendChild(mark);
    context.showVocabularyHighlightTooltip({ currentTarget: mark });
    const withMeaning = run(context, 'vocabularyHighlightTooltip').cloneNode(true);
    const bare = document.createElement('mark');
    bare.textContent = 'bare';
    document.body.appendChild(bare);
    context.showVocabularyHighlightTooltip({ currentTarget: bare });
    return [withMeaning, run(context, 'vocabularyHighlightTooltip')];
  },

  'floating-ball': ({ context }) => context.createFloatingBall().cloneNode(true),
  'floating-library': ({ context }) => {
    context.showFloatingLibraryPanel();
    return run(context, 'resultCard').querySelector('.g-rc-body');
  },
  'floating-history': async ({ context, localStore }) => {
    localStore.queryHistory = HISTORY;
    await context.showFloatingHistoryPanel();
    return run(context, 'resultCard').querySelector('.g-rc-body');
  },
  'vocab-panel': ({ context }) => {
    const card = ensureCard(context);
    const body = card.querySelector('.g-rc-body');
    context.renderFloatingVocabularyPanel(body, VOCAB_ITEMS);
    const snaps = [body.cloneNode(true)];
    for (const filter of ['weak', 'today', 'known', 'all']) {
      body.querySelector(`.g-vocab-tab[data-filter="${filter}"]`).click();
      snaps.push(body.querySelector('.g-vocab-panel-list').cloneNode(true));
    }
    const search = body.querySelector('.g-vocab-search');
    search.value = 'zzz-no-match';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    snaps.push(body.querySelector('.g-vocab-panel-list').cloneNode(true));
    return snaps;
  },

  'page-panel': ({ context }) => context.ensurePageTranslationPanel().cloneNode(true),
  'page-result': ({ context }) => {
    const make = text => {
      const node = document.createElement('div');
      context.renderPageTranslationResult({ translationNode: node }, text);
      return node;
    };
    return [
      make(`• 第一點\n- 第二點 ${XSS}\n1. 步驟一\n2) 步驟二\n\n一般段落\n３、全形`),
      make('   '),
      make(`${'長段落文字。'.repeat(80)}\n第二段`)
    ];
  }
};

function renderBody(context, action, raw, selectedText) {
  ensureCard(context);
  context.renderResult(action, raw, selectedText);
  return run(context, 'resultCard').querySelector('.g-rc-body');
}

// 模擬頁面 CSP 帶 `require-trusted-types-for 'script'`：HTML 字串 sink 一律記錄並拋錯
// （Chrome 在這種頁面上對純字串賦值會直接丟 TypeError，UI 就整塊出不來）。
function trapHtmlSinks() {
  const calls = [];
  const patches = [];
  const trap = (proto, name, kind) => {
    const original = Object.getOwnPropertyDescriptor(proto, name);
    if (!original) return;
    patches.push(() => Object.defineProperty(proto, name, original));
    const fail = () => {
      calls.push(name);
      throw new TypeError(`This document requires 'TrustedHTML' assignment (${name}).`);
    };
    Object.defineProperty(proto, name, kind === 'setter'
      ? { ...original, set: fail }
      : { ...original, value: fail });
  };
  trap(Element.prototype, 'innerHTML', 'setter');
  trap(Element.prototype, 'outerHTML', 'setter');
  trap(ShadowRoot.prototype, 'innerHTML', 'setter');
  trap(Element.prototype, 'insertAdjacentHTML', 'method');
  trap(Range.prototype, 'createContextualFragment', 'method');
  trap(DOMParser.prototype, 'parseFromString', 'method');
  trap(Document.prototype, 'write', 'method');
  return { calls, restore: () => patches.forEach(undo => undo()) };
}

async function captureScenario(name, { sinkLog = null } = {}) {
  jest.useFakeTimers({
    now: FIXED_NOW,
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval',
      'clearInterval', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
      'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance']
  });
  let sinks = null;
  try {
    const env = createContext(); // 測試夾具本身會用 body.innerHTML，陷阱在這之後才裝
    if (sinkLog) sinks = trapHtmlSinks();
    const result = await SCENARIOS[name](env);
    return Array.isArray(result) ? result : [result];
  } finally {
    if (sinks) {
      sinkLog.push(...sinks.calls);
      sinks.restore();
    }
    jest.useRealTimers();
  }
}

const baseline = WRITE_BASELINE || !fs.existsSync(BASELINE_PATH)
  ? {}
  : JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));

describe('渲染對照：改用 DOM builder 前後輸出一致', () => {
  const written = {};

  afterAll(() => {
    if (!WRITE_BASELINE) return;
    fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(written, null, 2) + '\n', 'utf8');
  });

  it('基準檔涵蓋全部情境', () => {
    if (WRITE_BASELINE) return;
    expect(Object.keys(baseline).sort()).toEqual(Object.keys(SCENARIOS).sort());
  });

  Object.keys(SCENARIOS).forEach(name => {
    it(name, async () => {
      const nodes = await captureScenario(name);
      nodes.forEach(node => expect(node).toBeTruthy());
      if (WRITE_BASELINE) {
        written[name] = nodes.map(node => node.outerHTML);
        return;
      }
      const expected = baseline[name].map(html => normalizeRendered(parseBaselineHtml(html)));
      const actual = nodes.map(node => normalizeRendered(node));
      expect(actual).toEqual(expected);
    });
  });
});

describe('Trusted Types 模擬：渲染流程不經 HTML 字串 sink', () => {
  Object.keys(SCENARIOS).forEach(name => {
    it(name, async () => {
      const sinkLog = [];
      let failure = null;
      try {
        await captureScenario(name, { sinkLog });
      } catch (error) {
        failure = error.message;
      }
      expect({ sinkLog, failure }).toEqual({ sinkLog: [], failure: null });
    });
  });
});

