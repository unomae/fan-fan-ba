const {
  cleanPageTranslationResult,
  collectVisibleTranslatableBlocks,
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
    window.getComputedStyle = jest.fn(() => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      fontSize: '16px',
      lineHeight: 'normal'
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

  it('formats page translation panel status with progress and actionable states', () => {
    expect(getPageTranslationStatusText({
      running: true,
      done: 3,
      total: 8,
      errors: 1
    })).toBe('翻譯中 3/8 · 失敗 1');

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
