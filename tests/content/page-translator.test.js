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
  locatePageTranslationSource,
  getPageTranslationContrastTheme,
  getPageTranslationStatusText
} = require('../../content/page-translator');

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
});
