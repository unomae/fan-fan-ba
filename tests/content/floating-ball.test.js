const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createContentContext() {
  document.body.innerHTML = '<main id="page-content">Page content</main>';
  const localStore = {};
  const clipboardWriteText = jest.fn(async () => {});

  const context = vm.createContext({
    window,
    document,
    location,
    navigator: {
      ...navigator,
      clipboard: {
        writeText: clipboardWriteText
      }
    },
    chrome,
    console,
    Date,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: cb => cb(),
    targetLanguage: 'zh-TW',
    obsidianSaving: false,
    getWeekLabel: () => '2026-W22',
    hideAutoSaveToast: jest.fn(),
    FanFanBaModels: {
      DEFAULT_MODEL: 'gemini-3',
      MODEL_NAME_MAP: {},
      MODELS: [{ id: 'gemini-3', name: 'Gemini 3' }],
      normalizeModel: model => model || 'gemini-3',
      normalizeLanguage: value => value || 'zh-TW',
      normalizeExplanationLanguage: value => value || 'target',
      normalizeTtsLanguageMode: value => value || 'auto'
    },
    setPageTranslationModel: jest.fn(),
    hideToolbar: jest.fn(),
    hideResultCard: jest.fn()
  });

  context.chrome.storage.local.get = jest.fn(async key => {
    if (typeof key === 'string') return { [key]: localStore[key] };
    return { ...localStore };
  });
  context.chrome.storage.local.set = jest.fn(async values => {
    Object.assign(localStore, values);
  });
  context.chrome.storage.sync.get = jest.fn(async () => ({}));
  context.chrome.runtime.sendMessage = jest.fn(() => Promise.resolve());
  context.globalThis = context;
  return { context, localStore, clipboardWriteText };
}

describe('floating ball menu behavior', () => {
  let context;

  beforeEach(() => {
    jest.resetModules();
    chrome.runtime.openOptionsPage.mockClear();
    ({ context } = createContentContext());
    runContentScript('content/state.js', context);
    runContentScript('content/floating-ball.js', context);
    runContentScript('content/main.js', context);
  });

  it('collapses the floating menu when clicking page content', () => {
    const floatingBall = document.getElementById('fanfanba-floating');
    floatingBall.classList.add('ffb-menu-open');

    document
      .getElementById('page-content')
      .dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }));

    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(false);
  });

  it('opens the floating menu only from the main ball hover target', () => {
    const floatingBall = document.getElementById('fanfanba-floating');

    floatingBall.dispatchEvent(new window.MouseEvent('mouseenter'));
    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(false);

    floatingBall
      .querySelector('.ffb-ball-main')
      .dispatchEvent(new window.MouseEvent('mouseenter'));

    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(true);
  });

  it('keeps floating actions minimal without an inline model select', () => {
    const floatingBall = document.getElementById('fanfanba-floating');

    expect(floatingBall.querySelector('.ffb-page-model-select')).toBeNull();
    expect(floatingBall.querySelectorAll('.ffb-ball-item')).toHaveLength(3);
    expect(floatingBall.querySelectorAll('.ffb-ball-menu-top .ffb-ball-item')).toHaveLength(1);
    expect(floatingBall.querySelectorAll('.ffb-ball-menu-bottom .ffb-ball-item')).toHaveLength(2);
    expect(floatingBall.querySelector('[data-action="library"] svg')).not.toBeNull();
    expect(floatingBall.querySelector('[data-action="vocab-highlight"]')).toBeNull();
    expect(floatingBall.querySelector('.ffb-pause-x')).not.toBeNull();
    expect(floatingBall.querySelector('[data-action="page-translate"] .ffb-translate-icon')).not.toBeNull();
    expect(floatingBall.querySelector('[data-action="settings"] .ffb-settings-icon')).not.toBeNull();
  });

  it('opens the extension settings from the floating settings action', () => {
    const floatingBall = document.getElementById('fanfanba-floating');
    floatingBall.classList.add('ffb-menu-open');

    floatingBall.querySelector('[data-action="settings"]').click();

    expect(chrome.runtime.openOptionsPage).toHaveBeenCalledTimes(1);
    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(false);
  });
});

describe('floating vocabulary panel', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers().setSystemTime(new Date('2026-05-26T12:00:00+08:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders today entries and copies Markdown or CSV exports', async () => {
    const setup = createContentContext();
    context = setup.context;
    runContentScript('content/state.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/result-card.js', context);
    runContentScript('content/floating-ball.js', context);

    setup.localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        definition: 'A signal light.',
        sources: [{ title: 'Article', url: 'https://example.com/beacon' }],
        createdAt: '2026-05-26T04:00:00.000Z',
        lastSeenAt: '2026-05-26T04:00:00.000Z',
        count: 1,
        status: 'learning',
        obsidianExportedAt: '2026-05-26T04:01:00.000Z'
      },
      'en:anchor': {
        id: 'en:anchor',
        word: 'Anchor',
        lang: 'en',
        translations: ['錨'],
        definition: 'A device for holding a vessel.',
        sources: [],
        createdAt: '2026-05-25T04:00:00.000Z',
        lastSeenAt: '2026-05-25T04:00:00.000Z',
        count: 3,
        status: 'learning'
      }
    };

    await context.showFloatingVocabularyPanel();

    expect(document.querySelector('.g-vocab-panel-word').textContent).toBe('Beacon');
    expect(document.querySelector('.g-vocab-panel-meta').textContent).toContain('已匯出');

    document.querySelector('[data-vocab-copy="en:beacon"]').click();
    await Promise.resolve();
    expect(setup.clipboardWriteText).toHaveBeenLastCalledWith(expect.stringContaining('### Beacon'));

    document.querySelector('[data-vocab-export="csv"]').click();
    await Promise.resolve();
    expect(setup.clipboardWriteText).toHaveBeenLastCalledWith(expect.stringContaining('word,lang,translations'));
    expect(setup.clipboardWriteText.mock.calls.at(-1)[0]).toContain('Beacon');
    expect(setup.clipboardWriteText.mock.calls.at(-1)[0]).not.toContain('Anchor');
  });

  it('filters all entries and deletes selected vocabulary items', async () => {
    const setup = createContentContext();
    context = setup.context;
    runContentScript('content/state.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/result-card.js', context);
    runContentScript('content/floating-ball.js', context);
    context.deleteVocabularyEntry = jest.fn(async id => {
      delete setup.localStore.fanFanBaVocabularyItems[id];
      return true;
    });

    setup.localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        sources: [],
        createdAt: '2026-05-26T04:00:00.000Z',
        lastSeenAt: '2026-05-26T04:00:00.000Z',
        count: 1
      },
      'en:anchor': {
        id: 'en:anchor',
        word: 'Anchor',
        lang: 'en',
        translations: ['錨'],
        sources: [],
        createdAt: '2026-05-25T04:00:00.000Z',
        lastSeenAt: '2026-05-25T04:00:00.000Z',
        count: 2
      }
    };

    await context.showFloatingVocabularyPanel();
    document.querySelector('[data-filter="all"]').click();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Beacon', 'Anchor']);

    document.querySelector('.g-vocab-search').value = 'anchor';
    document.querySelector('.g-vocab-search').dispatchEvent(new window.Event('input', { bubbles: true }));
    expect(document.querySelector('.g-vocab-panel-word').textContent).toBe('Anchor');

    document.querySelector('[data-vocab-delete="en:anchor"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(context.deleteVocabularyEntry).toHaveBeenCalledWith('en:anchor');
    expect(setup.localStore.fanFanBaVocabularyItems['en:anchor']).toBeUndefined();
    expect(document.querySelector('.g-hist-empty').textContent).toBe('沒有符合的單字');
  });

  it('shows review views and toggles vocabulary status', async () => {
    const setup = createContentContext();
    context = setup.context;
    runContentScript('content/state.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/result-card.js', context);
    runContentScript('content/floating-ball.js', context);

    setup.localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        sources: [],
        createdAt: '2026-05-26T04:00:00.000Z',
        lastSeenAt: '2026-05-26T04:00:00.000Z',
        count: 1,
        status: 'learning'
      },
      'en:anchor': {
        id: 'en:anchor',
        word: 'Anchor',
        lang: 'en',
        translations: ['錨'],
        sources: [],
        createdAt: '2026-05-25T04:00:00.000Z',
        lastSeenAt: '2026-05-25T04:00:00.000Z',
        count: 5,
        status: 'known'
      },
      'en:compass': {
        id: 'en:compass',
        word: 'Compass',
        lang: 'en',
        translations: ['指南針'],
        sources: [],
        createdAt: '2026-05-24T04:00:00.000Z',
        lastSeenAt: '2026-05-24T04:00:00.000Z',
        count: 2,
        status: 'learning'
      }
    };

    await context.showFloatingVocabularyPanel();
    document.querySelector('[data-filter="frequent"]').click();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Anchor', 'Compass', 'Beacon']);

    document.querySelector('[data-filter="learning"]').click();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Beacon', 'Compass']);

    document.querySelector('[data-vocab-status="en:beacon"]').click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(setup.localStore.fanFanBaVocabularyItems['en:beacon'].status).toBe('known');

    await context.showFloatingVocabularyPanel();
    document.querySelector('[data-filter="known"]').click();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Beacon', 'Anchor']);
    expect(document.querySelector('[data-vocab-status="en:beacon"]').textContent).toBe('還不熟');
  });
});
