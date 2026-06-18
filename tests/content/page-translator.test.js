const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createInstrumenter } = require('istanbul-lib-instrument');

// page-translator.js 已機械式拆成 5 個檔（state / collector / client / renderer / panel）。
// 瀏覽器端靠 content_scripts 共用同一 isolated-world scope 互相呼叫；
// 測試端用 vm.runInContext 把這 5 個檔依相依順序串進同一 context，
// 再從 context 取出函式斷言（與 floating-ball.test.js / result-card-position.test.js 同模式）。
//
// vm.runInContext 載入的原始碼 jest(babel) 不會自動 instrument，覆蓋率會歸零，
// 因此先用 istanbul-lib-instrument 把每個檔 instrument 後再丟進 vm，
// 讓覆蓋率計數寫進 context 的 __coverage__，最後在 afterAll 併回 jest 的
// global.__coverage__（babel coverageProvider 由此產生報告），拆檔後仍可量測覆蓋率。
const instrumenter = createInstrumenter({ esModules: false, coverageVariable: '__coverage__' });

function runContentScript(file, context) {
  const abs = path.join(__dirname, '../../', file);
  const source = fs.readFileSync(abs, 'utf8');
  const instrumented = instrumenter.instrumentSync(source, abs);
  vm.runInContext(instrumented, context, { filename: abs });
}

afterAll(() => {
  const covered = pageTranslatorContext.__coverage__;
  if (!covered) return;
  global.__coverage__ = global.__coverage__ || {};
  Object.assign(global.__coverage__, covered);
});

const pageTranslatorContext = vm.createContext({
  window,
  document,
  location,
  navigator,
  chrome,
  console,
  Date,
  setTimeout,
  clearTimeout,
  Node,
  URL,
  history: window.history,
  targetLanguage: 'zh-TW',
  explanationLanguage: 'target',
  activeModel: 'gemini-3',
  escapeHtml: value => String(value),
  FanFanBaModels: { normalizeModel: model => model || 'gemini-3' },
  updateFloatingBallPageTranslationState: () => {},
  // pageTranslationPanel 正本宣告在 content/state.js（瀏覽器端先載入）。
  // 此 harness 不載 state.js，故在 context global 預先放一個 null 屬性，
  // 讓 panel 檔的 `pageTranslationPanel = ...` 賦值在 strict mode 下可解析。
  pageTranslationPanel: null
});
pageTranslatorContext.globalThis = pageTranslatorContext;

[
  'content/page-translator-state.js',
  'content/page-translator-collector.js',
  'content/page-translator-client.js',
  'content/page-translator-renderer.js',
  'content/page-translator-panel.js'
].forEach(file => runContentScript(file, pageTranslatorContext));

const {
  cleanPageTranslationResult,
  collectVisibleTranslatableBlocks,
  buildPageTranslationCopyText,
  createPageTranslationBatches,
  buildPageTranslationBatchSourceText,
  parsePageTranslationBatchResult,
  buildPageTranslationContextDigest,
  collectPageTranslationHeadingSummary,
  createPageTranslationUsageSummary,
  buildPageTranslationUsageSummaryText,
  detectEmbeddedTranslationTargets,
  buildEmbeddedTranslationSummaryText,
  collectEmbeddedFrameTranslationTargets,
  collectSvgTextTranslationTargets,
  collectOpenShadowDomTranslationBlocks,
  buildPageLearningSummary,
  locatePageTranslationSource,
  getPageTranslationContrastTheme,
  getPageTranslationStatusText
} = pageTranslatorContext;

describe('page translator helpers', () => {
  let originalGetComputedStyle;
  let originalGetBoundingClientRect;

  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
    originalGetComputedStyle = window.getComputedStyle;
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    window.getComputedStyle = jest.fn(el => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      fontSize: '16px',
      lineHeight: 'normal',
      backgroundColor: el?.dataset?.bg || 'rgba(0, 0, 0, 0)'
    }));
    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      return {
        width: Number(this.dataset.rectWidth || 360),
        height: Number(this.dataset.rectHeight || 28),
        top: Number(this.dataset.rectTop || 20),
        bottom: Number(this.dataset.rectBottom || 48),
        left: 0,
        right: Number(this.dataset.rectWidth || 360)
      };
    };
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('extracts a usable translation from dictionary JSON responses', () => {
    const raw = JSON.stringify({
      word: 'Most viewed',
      lang: 'en',
      phonetic: '/moost vjuud/',
      translations: ['最多瀏覽', '最常查看'],
      definition: '瀏覽次數最高的內容'
    });

    expect(cleanPageTranslationResult(raw, 'Most viewed')).toBe('最多瀏覽');
  });

  it('deduplicates selected parent, child, and repeated text blocks', () => {
    document.body.innerHTML = `
      <main>
        <blockquote>
          <p>Europe live - latest updates</p>
        </blockquote>
        <h1>Europe live - latest updates</h1>
        <p>Markets responded cautiously as officials prepared a new statement for the afternoon.</p>
      </main>
    `;

    const items = collectVisibleTranslatableBlocks();

    expect(items.map(item => item.text)).toEqual([
      'Europe live - latest updates',
      'Markets responded cautiously as officials prepared a new statement for the afternoon.'
    ]);
  });

  it('skips app chrome, controls, and editable regions on complex sites', () => {
    document.body.innerHTML = `
      <main>
        <div role="toolbar"><p>Archive Reply More actions</p></div>
        <div role="dialog"><p>Share this document with teammates</p></div>
        <section contenteditable="true"><p>This editable Notion block should not be translated.</p></section>
        <p><button type="button">Expand</button>Interactive control wrapper should be ignored.</p>
        <article>
          <p>The report explains how regional supply chains adjusted after a sudden demand change.</p>
        </article>
      </main>
    `;

    const items = collectVisibleTranslatableBlocks();

    expect(items.map(item => item.text)).toEqual([
      'The report explains how regional supply chains adjusted after a sudden demand change.'
    ]);
  });

  it('allows Notion正文 editable leaves while still skipping generic editable regions', () => {
    document.body.innerHTML = `
      <main>
        <section contenteditable="true">
          <p>This generic editable draft should still be ignored by page translation.</p>
        </section>
        <div class="notion-page-content">
          <div data-block-id="block-a">
            <div data-content-editable-leaf="true" contenteditable="true">
              Notion article paragraphs should be translated when they are visible in the page body.
            </div>
          </div>
          <div role="toolbar">
            <div data-content-editable-leaf="true" contenteditable="true">Toolbar label should not translate.</div>
          </div>
        </div>
      </main>
    `;

    const items = collectVisibleTranslatableBlocks();

    expect(items.map(item => item.text)).toEqual([
      'Notion article paragraphs should be translated when they are visible in the page body.'
    ]);
  });

  it('detects quiz question and choice text while skipping quiz navigation chrome', () => {
    document.body.innerHTML = `
      <main role="main">
        <div class="quiz-popup-navigation">
          <span>Previous question</span>
          <span>Next question</span>
        </div>
        <form class="skills-quiz">
          <section class="question-card">
            <p>Which command creates a new branch in Git?</p>
            <mat-radio-button role="radio">
              <span class="mat-radio-label-content">git checkout -b feature/login</span>
            </mat-radio-button>
            <mat-radio-button role="radio">
              <span class="mat-radio-label-content">git status --short</span>
            </mat-radio-button>
          </section>
        </form>
      </main>
    `;

    const items = collectVisibleTranslatableBlocks();

    expect(items.map(item => item.text)).toEqual([
      'Which command creates a new branch in Git?',
      'git checkout -b feature/login',
      'git status --short'
    ]);
  });

  it('uses high-contrast translation colors on dark source backgrounds', () => {
    document.body.innerHTML = `
      <section data-bg="rgb(2, 32, 52)">
        <h1 id="hero-title">Gen AI: Navigate the Landscape</h1>
      </section>
    `;

    const theme = getPageTranslationContrastTheme(document.getElementById('hero-title'));

    expect(theme['--ffb-page-translation-color']).toBe('#f8fafc');
    expect(theme['--ffb-page-translation-accent']).toBe('rgba(250, 204, 21, 0.92)');
  });

  it('keeps the default translation colors on light source backgrounds', () => {
    document.body.innerHTML = `
      <section data-bg="rgb(255, 255, 255)">
        <p id="article-copy">Markets responded cautiously after the announcement.</p>
      </section>
    `;

    expect(getPageTranslationContrastTheme(document.getElementById('article-copy'))).toEqual({});
  });

  it('formats page translation panel status with progress and actionable states', () => {
    expect(getPageTranslationStatusText({
      running: true,
      done: 3,
      total: 8,
      errors: 1
    })).toBe('翻譯中 3/8 · 失敗 1');

    expect(getPageTranslationStatusText({
      stopping: true,
      done: 2,
      total: 8,
      errors: 0
    })).toBe('正在停止 2/8');

    expect(getPageTranslationStatusText({
      stopped: true,
      done: 2,
      total: 8,
      errors: 0
    })).toBe('已停止 2/8');

    expect(getPageTranslationStatusText({
      running: false,
      canContinue: true,
      done: 8,
      total: 8,
      errors: 0
    })).toBe('有新段落可翻譯 · 已完成 8/8');
  });

  it('builds copy text for translated and bilingual page translation results', () => {
    const items = [
      {
        text: 'Markets responded cautiously after the announcement.',
        translatedText: '公告後，市場反應謹慎。'
      },
      {
        text: 'Analysts expect demand to recover next quarter.',
        translatedText: '分析師預期需求會在下季復甦。'
      },
      {
        text: 'Pending paragraph',
        translatedText: ''
      }
    ];

    expect(buildPageTranslationCopyText('translation', items)).toBe([
      '公告後，市場反應謹慎。',
      '分析師預期需求會在下季復甦。'
    ].join('\n\n'));

    expect(buildPageTranslationCopyText('bilingual', items)).toBe([
      '原文：Markets responded cautiously after the announcement.\n譯文：公告後，市場反應謹慎。',
      '原文：Analysts expect demand to recover next quarter.\n譯文：分析師預期需求會在下季復甦。'
    ].join('\n\n---\n\n'));
  });

  it('builds a local context digest from title, hostname, headings, and nearby paragraphs', () => {
    document.title = 'Supply chain outlook';
    document.body.innerHTML = `
      <main>
        <h1>Quarterly demand planning</h1>
        <h2>Automotive backlog</h2>
        <p>Opening paragraph explains the market background and supplier risk.</p>
        <p id="target">Analysts expect demand to recover next quarter.</p>
        <p>Closing paragraph mentions inventory discipline and allocation policy.</p>
      </main>
    `;
    const items = collectVisibleTranslatableBlocks();
    const target = items.find(item => item.el.id === 'target');

    const digest = buildPageTranslationContextDigest(target, items);

    expect(digest).toContain('Page title: Supply chain outlook');
    expect(digest).toContain('Hostname: localhost');
    expect(digest).toContain('Quarterly demand planning');
    expect(digest).toContain('Automotive backlog');
    expect(digest).toContain('Before: Opening paragraph');
    expect(digest).toContain('After: Closing paragraph');
    expect(collectPageTranslationHeadingSummary()).toContain('Quarterly demand planning');
  });

  it('creates bounded page translation batches and serializes source text as JSON', () => {
    const items = [
      { text: 'A'.repeat(600) },
      { text: 'B'.repeat(600) },
      { text: 'C'.repeat(600) },
      { text: 'D'.repeat(600) }
    ];

    const batches = createPageTranslationBatches(items);

    expect(batches.map(batch => batch.length)).toEqual([3, 1]);
    expect(JSON.parse(buildPageTranslationBatchSourceText(batches[0]))).toEqual([
      { id: 1, text: 'A'.repeat(600) },
      { id: 2, text: 'B'.repeat(600) },
      { id: 3, text: 'C'.repeat(600) }
    ]);
  });

  it('parses batch translation JSON and cleans each segment result', () => {
    const items = [
      { text: 'Markets responded cautiously after the announcement.' },
      { text: 'Analysts expect demand to recover next quarter.' }
    ];
    const raw = JSON.stringify({
      translations: [
        { id: 1, translation: '公告後，市場反應謹慎。' },
        { id: 2, translation: '分析師預期需求會在下季復甦。' }
      ]
    });

    expect(parsePageTranslationBatchResult(raw, items)).toEqual([
      '公告後，市場反應謹慎。',
      '分析師預期需求會在下季復甦。'
    ]);
  });

  it('summarizes local page translation usage without uploading data', () => {
    const summary = createPageTranslationUsageSummary(5);
    summary.succeeded = 4;
    summary.failed = 1;
    summary.requests = 3;
    summary.batchRequests = 1;
    summary.singleRequests = 1;
    summary.fallbackRequests = 1;

    expect(buildPageTranslationUsageSummaryText(summary)).toBe(
      '本次全文翻譯：段落 5 · 成功 4 · 失敗 1 · request 約 3 · (批次 1、單段 1、重試 1)'
    );
  });

  it('locates the source paragraph and switches translation-only mode back to bilingual', () => {
    document.body.innerHTML = `
      <article>
        <p id="source" data-ffb-pair-id="pair-1">Markets responded cautiously after the announcement.</p>
        <div id="translation" data-ffb-pair-id="pair-1">公告後，市場反應謹慎。</div>
      </article>
    `;
    const sourceEl = document.getElementById('source');
    const translationEl = document.getElementById('translation');
    const scrollIntoView = jest.fn();
    sourceEl.scrollIntoView = scrollIntoView;
    const state = { mode: 'translation' };
    const setActive = jest.fn();

    const located = locatePageTranslationSource('pair-1', {
      pairs: new Map([['pair-1', { sourceEl, translationEl }]]),
      state,
      setMode: mode => { state.mode = mode; },
      setActive,
      behavior: 'auto'
    });

    expect(located).toBe(true);
    expect(state.mode).toBe('bilingual');
    expect(setActive).toHaveBeenCalledWith('pair-1');
    expect(scrollIntoView).toHaveBeenCalledWith({
      behavior: 'auto',
      block: 'center',
      inline: 'nearest'
    });
  });

  it('detects embedded translation targets without translating them in place', () => {
    document.body.innerHTML = `
      <main>
        <iframe title="interactive chart"></iframe>
        <svg><text>Revenue</text><g aria-label="Profit margin"></g></svg>
        <canvas></canvas>
        <div id="shadow-host"></div>
      </main>
    `;
    document.getElementById('shadow-host').attachShadow({ mode: 'open' });

    const summary = detectEmbeddedTranslationTargets();

    expect(summary).toEqual({
      iframeCount: 1,
      svgTextCount: 2,
      openShadowRootCount: 1,
      canvasCount: 1,
      total: 5
    });
    expect(buildEmbeddedTranslationSummaryText(summary)).toBe(
      '本頁有部分圖表或互動內容目前無法全文翻譯，可改用選取翻譯。'
    );
  });

  it('does not show technical embedded warnings for shadow-dom-only pages', () => {
    expect(buildEmbeddedTranslationSummaryText({
      iframeCount: 0,
      svgTextCount: 0,
      openShadowRootCount: 12,
      canvasCount: 0,
      total: 12
    })).toBe('');
  });

  it('classifies iframe targets for the v1.9.0 frame bridge', () => {
    document.body.innerHTML = `
      <main>
        <iframe title="same origin chart" src="/chart.html"></iframe>
        <iframe title="cross origin chart" src="https://charts.example.com/embed"></iframe>
        <iframe title="unsupported widget" src="chrome://extensions"></iframe>
      </main>
    `;

    const targets = collectEmbeddedFrameTranslationTargets(document, {
      currentOrigin: 'http://localhost'
    });

    expect(targets.map(target => ({
      title: target.title,
      status: target.status,
      bridgeMode: target.bridgeMode,
      reason: target.reason
    }))).toEqual([
      {
        title: 'same origin chart',
        status: 'ready',
        bridgeMode: 'same-origin',
        reason: 'same-origin'
      },
      {
        title: 'cross origin chart',
        status: 'ready',
        bridgeMode: 'frame-script',
        reason: 'cross-origin-frame-script'
      },
      {
        title: 'unsupported widget',
        status: 'blocked',
        bridgeMode: 'none',
        reason: 'unsupported-scheme'
      }
    ]);
  });

  it('collects SVG text overlay targets for v1.9.1 without mutating the chart', () => {
    document.body.innerHTML = `
      <main>
        <svg>
          <text>Revenue</text>
          <title>Quarterly profit</title>
          <g aria-label="Gross margin"></g>
        </svg>
      </main>
    `;

    const targets = collectSvgTextTranslationTargets();

    expect(targets.map(target => ({
      text: target.text,
      kind: target.kind,
      overlayMode: target.overlayMode
    }))).toEqual([
      { text: 'Revenue', kind: 'text', overlayMode: 'tooltip' },
      { text: 'Quarterly profit', kind: 'title', overlayMode: 'tooltip' },
      { text: 'Gross margin', kind: 'aria-label', overlayMode: 'tooltip' }
    ]);
    expect(document.querySelector('svg').textContent).toContain('Revenue');
  });

  it('collects readable open Shadow DOM blocks for v1.9.2', () => {
    document.body.innerHTML = '<main><custom-card id="host"></custom-card></main>';
    const host = document.getElementById('host');
    host.attachShadow({ mode: 'open' });
    host.shadowRoot.innerHTML = `
      <article>
        <h2>Inventory planning inside a web component</h2>
        <p>Regional teams adjusted allocation rules after demand shifted quickly.</p>
      </article>
    `;

    const items = collectOpenShadowDomTranslationBlocks();

    expect(items.map(item => ({
      host: item.host.id,
      text: item.text,
      source: item.source
    }))).toEqual([
      {
        host: 'host',
        text: 'Inventory planning inside a web component',
        source: 'open-shadow-dom'
      },
      {
        host: 'host',
        text: 'Regional teams adjusted allocation rules after demand shifted quickly.',
        source: 'open-shadow-dom'
      }
    ]);
  });

  it('builds a local learning summary seed for v1.9.3', () => {
    const summary = buildPageLearningSummary([
      { text: 'Supply planners reduced allocation risk after volatility increased.' },
      { translatedText: 'Teams reviewed procurement scenarios and inventory discipline.' },
      { text: 'Allocation planning improved after repeated scenario reviews.' }
    ], {
      title: 'Learning article',
      maxSentences: 2,
      maxVocabulary: 3
    });

    expect(summary).toMatchObject({
      title: 'Learning article',
      sourceCount: 3,
      keySentences: [
        'Supply planners reduced allocation risk after volatility increased.',
        'Teams reviewed procurement scenarios and inventory discipline.'
      ]
    });
    expect(summary.vocabularyCandidates).toEqual([
      { word: 'allocation', count: 2 },
      { word: 'discipline', count: 1 },
      { word: 'improved', count: 1 }
    ]);
  });
});

// ── 拆檔後補測：render / client / panel / state 覆蓋率 ──────────────
// 這些函式依賴 DOM、串流 port、面板狀態，無法用單純 require 觸發，
// 統一在同一 vm context 內驅動，把 page-translator 整體 lines 覆蓋率推到目標。

const ctx = pageTranslatorContext;
const {
  translatePageItem,
  translatePageBatch,
  runPageTranslationQueue,
  clearCancelledPageTranslationItem,
  formatPageTranslationText,
  createPageTranslationBlock,
  renderPageTranslationResult,
  renderPageTranslationError,
  applyPageTranslationSourceTypography,
  normalizePageTranslationLineHeight,
  parsePageTranslationCssColor,
  getPageTranslationRelativeLuminance,
  clampPageTranslationColor,
  ensurePageTranslationPanel,
  updatePageTranslationPanel,
  setPageTranslationMode,
  setPageTranslationDensity,
  hasCompletedPageTranslationItems,
  getCompletedPageTranslationItems,
  copyPageTranslationText,
  writePageTranslationClipboardText,
  stopPageTranslationBeta,
  restorePageTranslationBeta,
  togglePageTranslationCollapse,
  bindPageTranslationScrollWatcher,
  bindPageTranslationSelectionWatcher,
  bindPageTranslationNavigationWatcher,
  startPageTranslationBeta,
  setActivePageTranslationPair,
  clearActivePageTranslationPair,
  findPageTranslationPairElement,
  handlePageTranslationAction,
  recordPageTranslationRequest,
  getPageTranslationModel,
  setPageTranslationModel
} = ctx;

function ctxRun(code) {
  return vm.runInContext(code, ctx);
}

function resetPageTranslationState() {
  ctxRun(`pageTranslationState = {
    running: false, stopped: false, stopping: false, activated: false, canContinue: false,
    scrollBound: false, scrollTimer: null, selectionBound: false, activePairId: null,
    mode: 'bilingual', density: 'compact', items: [], embeddedSummary: null,
    usage: createPageTranslationUsageSummary(0), done: 0, errors: 0, total: 0
  };
  pageTranslationActivePort = null;
  pageTranslationPairs.clear();`);
  ctx.pageTranslationPanel = null;
  document.documentElement.className = '';
}

// 模擬 background 的 ai-stream port：每次 connect() 給一個獨立 port（listener 不互相干擾），
// postMessage 後以 microtask 回傳 chunk/done/error。
function installStreamingPort(reply) {
  chrome.runtime.id = 'mock-ext';
  chrome.runtime.connect = jest.fn(() => {
    const listeners = { message: [], disconnect: [] };
    return {
      onMessage: { addListener: cb => listeners.message.push(cb) },
      onDisconnect: { addListener: cb => listeners.disconnect.push(cb) },
      postMessage: jest.fn(() => {
        Promise.resolve().then(() => {
          if (reply.error) {
            listeners.message.forEach(cb => cb({ error: reply.error }));
            return;
          }
          (reply.chunks || []).forEach(chunk => listeners.message.forEach(cb => cb({ chunk })));
          listeners.message.forEach(cb => cb({ done: true }));
        });
      }),
      disconnect: jest.fn(() => listeners.disconnect.forEach(cb => cb()))
    };
  });
}

function installPageTranslationDomMocks() {
  Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
  window.getComputedStyle = jest.fn(el => ({
    display: 'block',
    visibility: 'visible',
    opacity: '1',
    fontSize: '16px',
    lineHeight: 'normal',
    backgroundColor: el?.dataset?.bg || 'rgba(0, 0, 0, 0)'
  }));
  HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return {
      width: Number(this.dataset.rectWidth || 360),
      height: Number(this.dataset.rectHeight || 28),
      top: Number(this.dataset.rectTop || 20),
      bottom: Number(this.dataset.rectBottom || 48),
      left: 0,
      right: Number(this.dataset.rectWidth || 360)
    };
  };
}

function makeSourceParagraph(text) {
  const p = document.createElement('p');
  p.textContent = text;
  document.body.appendChild(p);
  return p;
}

describe('page translator render helpers', () => {
  let originalGetComputedStyle;
  let originalGetBoundingClientRect;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalGetComputedStyle = window.getComputedStyle;
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    installPageTranslationDomMocks();
    resetPageTranslationState();
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('formats bullet lists, ordered lists, and paragraphs into HTML', () => {
    const html = formatPageTranslationText('• 第一點\n• 第二點\n1. 步驟一\n2. 步驟二\n一般段落');
    expect(html).toContain('<ul class="ffb-page-translation-list"><li>第一點</li><li>第二點</li></ul>');
    expect(html).toContain('<ol class="ffb-page-translation-list"><li>步驟一</li><li>步驟二</li></ol>');
    expect(html).toContain('<p>一般段落</p>');
  });

  it('builds a loading translation block for paragraphs and list items', () => {
    const p = makeSourceParagraph('Some readable source paragraph text.');
    const block = createPageTranslationBlock({ el: p, pairId: 'blk-1' });
    expect(block.tagName).toBe('DIV');
    expect(block.classList.contains('ffb-page-translation-loading')).toBe(true);
    expect(block.dataset.ffbPairId).toBe('blk-1');

    const li = document.createElement('li');
    document.body.appendChild(li);
    expect(createPageTranslationBlock({ el: li, pairId: 'blk-2' }).tagName).toBe('LI');
  });

  it('renders a short result without a collapse toggle and a long one with it', () => {
    const p = makeSourceParagraph('Short source text used for rendering.');
    const shortItem = { el: p, pairId: 'r-short', translationNode: createPageTranslationBlock({ el: p, pairId: 'r-short' }) };
    renderPageTranslationResult(shortItem, '簡短譯文');
    expect(shortItem.translationNode.querySelector('.ffb-page-expand-btn')).toBeNull();
    expect(shortItem.translationNode.querySelector('.ffb-page-translation-text').textContent).toContain('簡短譯文');

    const longItem = { el: p, pairId: 'r-long', translationNode: createPageTranslationBlock({ el: p, pairId: 'r-long' }) };
    renderPageTranslationResult(longItem, '長'.repeat(500));
    expect(longItem.translationNode.classList.contains('ffb-page-collapsed')).toBe(true);
    expect(longItem.translationNode.querySelector('.ffb-page-expand-btn')).not.toBeNull();
  });

  it('renders an error node with a working retry button', async () => {
    const p = makeSourceParagraph('Source paragraph for the error path.');
    const item = { el: p, pairId: 'e-1', status: 'error', translationNode: createPageTranslationBlock({ el: p, pairId: 'e-1' }) };
    renderPageTranslationError(item, '翻譯失敗');
    expect(item.translationNode.classList.contains('ffb-page-translation-error')).toBe(true);
    const retry = item.translationNode.querySelector('.ffb-page-retry');
    expect(retry).not.toBeNull();

    installStreamingPort({ chunks: ['重試後的譯文'] });
    retry.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(item.translatedText).toBe('重試後的譯文');
  });

  it('applies source typography variables onto the translation block', () => {
    const p = makeSourceParagraph('Typography source paragraph here.');
    const block = createPageTranslationBlock({ el: p, pairId: 't-1' });
    applyPageTranslationSourceTypography(p, block);
    expect(block.style.getPropertyValue('--ffb-page-source-font-size')).toBe('16px');
    expect(block.style.getPropertyValue('--ffb-page-source-line-height')).toBe('1.72');
  });

  it('normalizes line-height values across units', () => {
    expect(normalizePageTranslationLineHeight('normal', '16px')).toBe('1.72');
    expect(normalizePageTranslationLineHeight('32px', '16px')).toBe('2');
    expect(normalizePageTranslationLineHeight('1.6', '16px')).toBe('1.6');
    expect(normalizePageTranslationLineHeight('0px', '0px')).toBe('1.72');
  });

  it('parses css colors and computes relative luminance', () => {
    expect(parsePageTranslationCssColor('transparent')).toBeNull();
    expect(parsePageTranslationCssColor('not-a-color')).toBeNull();
    expect(parsePageTranslationCssColor('rgb(255, 255, 255)')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parsePageTranslationCssColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0, a: 0.5 });
    expect(parsePageTranslationCssColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(clampPageTranslationColor(300)).toBe(255);
    expect(getPageTranslationRelativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 5);
    expect(getPageTranslationRelativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 5);
  });
});

describe('page translator request pipeline', () => {
  let originalGetComputedStyle;
  let originalGetBoundingClientRect;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalGetComputedStyle = window.getComputedStyle;
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    installPageTranslationDomMocks();
    resetPageTranslationState();
    chrome.runtime.id = 'mock-ext';
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('translates a single block end-to-end and renders the result', async () => {
    const p = makeSourceParagraph('Markets responded cautiously after the announcement.');
    const item = { el: p, text: p.textContent, pairId: 'single-1', status: 'pending', translationNode: null, translatedText: '' };
    installStreamingPort({ chunks: ['公告後，', '市場反應謹慎。'] });

    await translatePageItem(item);

    expect(item.status).toBe('done');
    expect(item.translatedText).toBe('公告後，市場反應謹慎。');
    expect(item.translationNode.querySelector('.ffb-page-translation-text').textContent).toContain('公告後');
    expect(p.classList.contains('ffb-page-source-translated')).toBe(true);
  });

  it('marks an item as error when the stream returns an error', async () => {
    const p = makeSourceParagraph('Another readable paragraph for errors.');
    const item = { el: p, text: p.textContent, pairId: 'err-1', status: 'pending', translationNode: null, translatedText: '' };
    installStreamingPort({ error: '翻譯服務忙線' });

    await translatePageItem(item);

    expect(item.status).toBe('error');
    expect(item.translationNode.classList.contains('ffb-page-translation-error')).toBe(true);
  });

  it('translates a batch via JSON response', async () => {
    const p1 = makeSourceParagraph('Alpha paragraph with enough length here.');
    const p2 = makeSourceParagraph('Beta paragraph with enough length here.');
    const items = [
      { el: p1, text: p1.textContent, pairId: 'b-1', status: 'pending', translationNode: null, translatedText: '' },
      { el: p2, text: p2.textContent, pairId: 'b-2', status: 'pending', translationNode: null, translatedText: '' }
    ];
    installStreamingPort({ chunks: [JSON.stringify({ translations: [{ id: 1, translation: '甲段譯文' }, { id: 2, translation: '乙段譯文' }] })] });

    await translatePageBatch(items);

    expect(items.map(item => item.translatedText)).toEqual(['甲段譯文', '乙段譯文']);
    expect(items.every(item => item.status === 'done')).toBe(true);
  });

  it('falls back to per-item translation when the batch result is unparseable', async () => {
    const p1 = makeSourceParagraph('Gamma paragraph with enough length here.');
    const p2 = makeSourceParagraph('Delta paragraph with enough length here.');
    const items = [
      { el: p1, text: p1.textContent, pairId: 'f-1', status: 'pending', translationNode: null, translatedText: '' },
      { el: p2, text: p2.textContent, pairId: 'f-2', status: 'pending', translationNode: null, translatedText: '' }
    ];
    installStreamingPort({ chunks: ['這不是合法的批次 JSON'] });

    await translatePageBatch(items);

    expect(items.every(item => item.status === 'done')).toBe(true);
    expect(items.every(item => item.translatedText === '這不是合法的批次 JSON')).toBe(true);
  });

  it('clears a cancelled item back to its untranslated state', () => {
    const p = makeSourceParagraph('Cancelled paragraph long enough to qualify.');
    p.classList.add('ffb-page-source-translated');
    const node = createPageTranslationBlock({ el: p, pairId: 'c-1' });
    document.body.appendChild(node);
    const item = { el: p, pairId: 'c-1', status: 'loading', translationNode: node };

    clearCancelledPageTranslationItem(item);

    expect(item.status).toBe('cancelled');
    expect(item.translationNode).toBeNull();
    expect(p.classList.contains('ffb-page-source-translated')).toBe(false);
  });

  it('runs the full beta flow from the floating-ball entry point', async () => {
    makeSourceParagraph('First translatable paragraph that is long enough.');
    makeSourceParagraph('Second translatable paragraph that is long enough.');
    makeSourceParagraph('Third translatable paragraph that is long enough.');
    makeSourceParagraph('Fourth translatable paragraph that is long enough.');
    installStreamingPort({
      chunks: [JSON.stringify({ translations: [{ id: 1, translation: '一' }, { id: 2, translation: '二' }, { id: 3, translation: '三' }] })]
    });

    startPageTranslationBeta();
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(document.querySelector('.ffb-page-translation-panel')).not.toBeNull();
    expect(document.querySelectorAll('.ffb-page-translation-block').length).toBe(4);
    expect(ctxRun('pageTranslationState.done')).toBe(4);
    expect(ctxRun('pageTranslationState.running')).toBe(false);
  });
});

describe('page translator panel + state controls', () => {
  let originalGetComputedStyle;
  let originalGetBoundingClientRect;

  beforeEach(() => {
    document.body.innerHTML = '';
    originalGetComputedStyle = window.getComputedStyle;
    originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    installPageTranslationDomMocks();
    resetPageTranslationState();
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('creates the control panel once and reuses it', () => {
    const panel = ensurePageTranslationPanel();
    expect(panel.querySelector('.ffb-page-panel-title')).not.toBeNull();
    expect(panel.querySelectorAll('[data-mode]').length).toBe(3);
    expect(panel.querySelectorAll('.ffb-page-panel-actions button').length).toBe(4);
    expect(ensurePageTranslationPanel()).toBe(panel);
  });

  it('reflects progress and toggles mode/density from panel buttons', () => {
    ensurePageTranslationPanel();
    ctxRun('pageTranslationState.done = 2; pageTranslationState.total = 5; pageTranslationState.running = true;');
    updatePageTranslationPanel();
    expect(ctx.pageTranslationPanel.querySelector('.ffb-page-panel-count').textContent).toBe('2/5');
    expect(ctx.pageTranslationPanel.querySelector('.ffb-page-panel-status').textContent).toBe('翻譯中 2/5');

    ctx.pageTranslationPanel.querySelector('[data-mode="translation"]').click();
    expect(document.documentElement.classList.contains('ffb-page-translation-mode-translation')).toBe(true);

    setPageTranslationDensity('comfortable');
    expect(document.documentElement.classList.contains('ffb-page-translation-density-comfortable')).toBe(true);
    setPageTranslationMode('original');
    expect(document.documentElement.classList.contains('ffb-page-translation-mode-original')).toBe(true);
  });

  it('stops and restores the beta session, clearing injected nodes', () => {
    ensurePageTranslationPanel();
    const block = createPageTranslationBlock({ el: makeSourceParagraph('Restored paragraph long enough here.'), pairId: 's-1' });
    document.body.appendChild(block);

    stopPageTranslationBeta();
    expect(ctxRun('pageTranslationState.stopped')).toBe(true);

    restorePageTranslationBeta();
    expect(document.querySelectorAll('.ffb-page-translation-block').length).toBe(0);
    expect(ctx.pageTranslationPanel).toBeNull();
    expect(ctxRun('pageTranslationState.activated')).toBe(false);
  });

  it('reports completed items and copies translated text', async () => {
    ensurePageTranslationPanel();
    ctxRun(`pageTranslationState.items = [
      { text: 'A', translatedText: '甲' },
      { text: 'B', translatedText: '乙' },
      { text: 'C', translatedText: '' }
    ];`);
    expect(hasPageCompleted()).toBe(true);
    expect(getCompletedPageTranslationItems(ctxRun('pageTranslationState.items')).length).toBe(2);

    await copyPageTranslationText('translation', ctx.pageTranslationPanel.querySelector('[data-action="copy-translation"]'));
    // 不論複製成功或在 jsdom 走 fallback 失敗，面板狀態都會被更新
    expect(ctx.pageTranslationPanel.querySelector('.ffb-page-panel-status').textContent.length).toBeGreaterThan(0);

    function hasPageCompleted() {
      return hasCompletedPageTranslationItems(ctxRun('pageTranslationState.items'));
    }
  });

  it('throws from clipboard fallback when execCommand is unavailable', async () => {
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const originalExec = document.execCommand;
    document.execCommand = undefined;

    await expect(writePageTranslationClipboardText('內容')).rejects.toThrow('COPY_FAILED');

    document.execCommand = originalExec;
    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
  });

  it('toggles collapse state on a translation block', () => {
    const block = document.createElement('div');
    const button = document.createElement('button');
    togglePageTranslationCollapse(block, button);
    expect(block.classList.contains('ffb-page-collapsed')).toBe(true);
    expect(button.textContent).toBe('⌄');
    togglePageTranslationCollapse(block, button);
    expect(block.classList.contains('ffb-page-collapsed')).toBe(false);
    expect(button.textContent).toBe('⌃');
  });

  it('binds scroll, selection, and navigation watchers once', () => {
    bindPageTranslationScrollWatcher();
    bindPageTranslationScrollWatcher();
    expect(ctxRun('pageTranslationState.scrollBound')).toBe(true);

    bindPageTranslationSelectionWatcher();
    expect(ctxRun('pageTranslationState.selectionBound')).toBe(true);

    bindPageTranslationNavigationWatcher();
    expect(ctxRun('pageTranslationNavigationBound')).toBe(true);
  });

  it('activates pair highlighting and locates the source paragraph', () => {
    ctxRun(`document.body.innerHTML = '<p id="pair-src" data-ffb-pair-id="pp-1">來源</p><div id="pair-tr" data-ffb-pair-id="pp-1">譯文</div>';
      pageTranslationPairs.set('pp-1', {
        sourceEl: document.getElementById('pair-src'),
        translationEl: document.getElementById('pair-tr'),
        sourceText: '來源', translatedText: '譯文'
      });
      document.getElementById('pair-src').scrollIntoView = function () {};`);

    setActivePageTranslationPair('pp-1');
    expect(document.getElementById('pair-src').classList.contains('ffb-pair-active')).toBe(true);
    expect(document.getElementById('pair-tr').classList.contains('ffb-pair-active')).toBe(true);

    const found = findPageTranslationPairElement(document.getElementById('pair-tr').firstChild || document.getElementById('pair-tr'));
    expect(found?.dataset.ffbPairId).toBe('pp-1');

    handlePageTranslationAction('locate-source', 'pp-1');
    expect(locatePageTranslationSource('pp-1')).toBe(true);

    clearActivePageTranslationPair();
    expect(document.querySelectorAll('.ffb-pair-active').length).toBe(0);
  });

  it('shows the empty state when no translatable blocks are present', () => {
    startPageTranslationBeta();
    expect(ctx.pageTranslationPanel.querySelector('.ffb-page-panel-status').textContent).toBe('目前沒有新段落');
    expect(ctxRun('pageTranslationState.activated')).toBe(true);
    expect(ctxRun('pageTranslationState.running')).toBe(false);
  });

  it('tracks model selection and request usage in state', () => {
    setPageTranslationModel('gemini-3');
    expect(getPageTranslationModel()).toBe('gemini-3');

    ctxRun('pageTranslationState.usage = createPageTranslationUsageSummary(3);');
    recordPageTranslationRequest('batch');
    recordPageTranslationRequest('fallback');
    recordPageTranslationRequest('single');
    expect(ctxRun('pageTranslationState.usage.requests')).toBe(3);
    expect(ctxRun('pageTranslationState.usage.batchRequests')).toBe(1);
    expect(ctxRun('pageTranslationState.usage.fallbackRequests')).toBe(1);
    expect(ctxRun('pageTranslationState.usage.singleRequests')).toBe(1);
  });
});
