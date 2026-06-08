const {
  cleanPageTranslationResult,
  collectVisibleTranslatableBlocks,
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
});
