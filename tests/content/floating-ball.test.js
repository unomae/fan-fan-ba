const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createVocabularyStoreResponder } = require('./vocab-store-responder');

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
    NodeFilter,
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
  // A1'''：單字本操作走 VOCABULARY_STORE 訊息，用忠實回應者模擬 background store
  context.chrome.runtime.sendMessage = jest.fn(createVocabularyStoreResponder(localStore));
  context.globalThis = context;
  return { context, localStore, clipboardWriteText };
}

describe('floating ball menu behavior', () => {
  let context;

  beforeEach(() => {
    jest.resetModules();
    chrome.runtime.openOptionsPage.mockClear();
    ({ context } = createContentContext());
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
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
    // 單字高亮開關接線後：上組＝收藏 / 紀錄＋單字高亮，下組＝全文翻譯＋設定
    expect(floatingBall.querySelectorAll('.ffb-ball-item')).toHaveLength(4);
    expect(floatingBall.querySelectorAll('.ffb-ball-menu-top .ffb-ball-item')).toHaveLength(2);
    expect(floatingBall.querySelectorAll('.ffb-ball-menu-bottom .ffb-ball-item')).toHaveLength(2);
    expect(floatingBall.querySelector('[data-action="library"] svg')).not.toBeNull();
    expect(floatingBall.querySelector('.ffb-pause-x')).not.toBeNull();
    expect(floatingBall.querySelector('[data-action="page-translate"] .ffb-translate-icon')).not.toBeNull();
    expect(floatingBall.querySelector('[data-action="settings"] .ffb-settings-icon')).not.toBeNull();
  });

  it('uses one custom tooltip source instead of native browser titles for floating actions', () => {
    const floatingBall = document.getElementById('fanfanba-floating');
    const pauseButton = floatingBall.querySelector('[data-action="pause"]');
    const pageTranslateButton = floatingBall.querySelector('[data-action="page-translate"]');

    expect(pauseButton.getAttribute('title')).toBeNull();
    expect(pauseButton.dataset.tooltip).toBe('在此網站停用');
    expect(pauseButton.getAttribute('aria-label')).toBe('在此網站停用');
    expect(pageTranslateButton.getAttribute('title')).toBeNull();
    expect(pageTranslateButton.dataset.tooltip).toBe('全文翻譯 Beta');
  });

  it('opens the extension settings from the floating settings action', () => {
    const floatingBall = document.getElementById('fanfanba-floating');
    floatingBall.classList.add('ffb-menu-open');

    floatingBall.querySelector('[data-action="settings"]').click();

    expect(context.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_OPTIONS' });
    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(false);
  });
});

describe('floating library panel', () => {
  // QA-P1-001 回歸：面板建好但少了 g-show，卡片會保持透明且不可操作
  it('reveals the result card when the library entry opens the panel', () => {
    const setup = createContentContext();
    const context = setup.context;
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/result-card.js', context);
    runContentScript('content/floating-ball.js', context);

    document.getElementById('fanfanba-floating').querySelector('[data-action="library"]').click();

    const card = document.getElementById('gemini-result-card');
    expect(card).not.toBeNull();
    expect(card.classList.contains('g-show')).toBe(true);
    expect(card.querySelector('[data-library-action="vocabulary"]')).not.toBeNull();
    expect(card.querySelector('[data-library-action="history"]')).not.toBeNull();
  });
});

// 半接線接完工：toggleVocabularyHighlightForSite 之前零 production caller，
// 浮球上根本沒有可以按到它的入口。
describe('floating vocabulary highlight toggle', () => {
  function mountHighlightBall() {
    const setup = createContentContext();
    const context = setup.context;
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/vocabulary-highlighter.js', context);
    runContentScript('content/floating-ball.js', context);
    return setup;
  }

  async function settle() {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  }

  it('把開關放進會被選單展開露出來的位置，而不只是掛在 DOM 上', () => {
    mountHighlightBall();
    const floatingBall = document.getElementById('fanfanba-floating');
    const button = floatingBall.querySelector('.ffb-ball-menu [data-action="vocab-highlight"]');

    // QA-P1-001 教訓：元素存在 ≠ 使用者看得到。這顆鈕必須落在 .ffb-ball-menu 裡，
    // 才會吃到 `#fanfanba-floating.ffb-menu-open .ffb-ball-menu { opacity:1; pointer-events:auto }`
    expect(button).not.toBeNull();
    expect(button.classList.contains('ffb-ball-item')).toBe(true);
    expect(button.closest('.ffb-ball-menu-top')).not.toBeNull();
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('hidden')).toBe(false);
    expect(button.querySelector('svg')).not.toBeNull();
    expect(button.getAttribute('aria-label')).toBe('開啟單字高亮');
    expect(button.dataset.tooltip).toBe('開啟單字高亮');
    expect(button.querySelector('.ffb-vocab-highlight-label').textContent).toBe('開啟單字高亮');
  });

  it('點擊真的會切換高亮模式並回寫按鈕狀態，再點一次關掉', async () => {
    const setup = mountHighlightBall();
    const floatingBall = document.getElementById('fanfanba-floating');
    const button = floatingBall.querySelector('[data-action="vocab-highlight"]');
    floatingBall.classList.add('ffb-menu-open');

    button.click();
    await settle();

    expect(setup.context.chrome.storage.sync.set).toHaveBeenCalledWith({ vocabularyHighlightMode: 'auto' });
    expect(floatingBall.classList.contains('ffb-vocab-highlight-on')).toBe(true);
    expect(button.getAttribute('aria-label')).toBe('關閉單字高亮');
    expect(button.querySelector('.ffb-vocab-highlight-label').textContent).toBe('關閉單字高亮');
    expect(floatingBall.classList.contains('ffb-menu-open')).toBe(false);

    button.click();
    await settle();

    expect(setup.context.chrome.storage.sync.set).toHaveBeenLastCalledWith({ vocabularyHighlightMode: 'off' });
    expect(floatingBall.classList.contains('ffb-vocab-highlight-on')).toBe(false);
    expect(button.querySelector('.ffb-vocab-highlight-label').textContent).toBe('開啟單字高亮');
  });

  it('真的把已收藏單字標成 mark，關掉時還原原文', async () => {
    const setup = mountHighlightBall();
    setup.localStore.fanFanBaVocabularyItems = {
      'en:allocation': {
        id: 'en:allocation',
        word: 'allocation',
        lang: 'en',
        translations: ['配置'],
        count: 2
      }
    };
    document.body.insertAdjacentHTML('beforeend', '<div id="highlight-target">Regional allocation rules changed.</div>');
    const button = document.getElementById('fanfanba-floating').querySelector('[data-action="vocab-highlight"]');

    button.click();
    await settle();

    const mark = document.querySelector('#highlight-target mark.g-vocab-highlight');
    expect(mark).not.toBeNull();
    expect(mark.textContent).toBe('allocation');

    button.click();
    await settle();

    expect(document.querySelector('mark.g-vocab-highlight')).toBeNull();
    expect(document.getElementById('highlight-target').textContent).toBe('Regional allocation rules changed.');
  });

  it('浮球位置夾在畫面內時預留選單高度，選單不會被裁到畫面外（QA-P1-003 同型風險）', () => {
    const setup = mountHighlightBall();
    const floatingBall = document.getElementById('fanfanba-floating');
    Object.defineProperty(window, 'innerHeight', { value: 812, configurable: true });
    // jsdom 沒有 layout，手動餵入真實瀏覽器量到的高度：主球 46、上下組各 2 顆 30px + 8px gap
    Object.defineProperty(floatingBall, 'offsetHeight', { value: 46, configurable: true });
    Object.defineProperty(floatingBall.querySelector('.ffb-ball-menu-top'), 'offsetHeight', { value: 68, configurable: true });
    Object.defineProperty(floatingBall.querySelector('.ffb-ball-menu-bottom'), 'offsetHeight', { value: 68, configurable: true });

    // 拖到最上緣：上組 68px + 8px 間距必須完整留在畫面內
    expect(setup.context.clampFloatingBallTop(0)).toBe(76);
    // 拖到最下緣：下組同樣不能被畫面底部裁掉
    expect(setup.context.clampFloatingBallTop(10000)).toBe(812 - 46 - 76);
    // 中間位置不受影響
    expect(setup.context.clampFloatingBallTop(400)).toBe(400);
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
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
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
        nextReviewAt: '2026-05-30T04:00:00.000Z',
        count: 3,
        status: 'learning'
      }
    };

    await context.showFloatingVocabularyPanel();

    expect(document.querySelector('.g-vocab-tab.g-active').textContent).toBe('今日複習');
    expect(document.querySelector('.g-vocab-panel-word').textContent).toBe('Beacon');
    expect(document.querySelector('.g-vocab-panel-meta').textContent).toContain('已匯出');

    document.querySelector('[data-filter="today"]').click();
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
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
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
    expect(document.querySelector('.g-hist-empty').textContent).toBe('沒有符合搜尋的單字');
  });

  it('shows review views and toggles vocabulary status', async () => {
    const setup = createContentContext();
    context = setup.context;
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
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
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect(setup.localStore.fanFanBaVocabularyItems['en:beacon'].status).toBe('known');

    await context.showFloatingVocabularyPanel();
    document.querySelector('[data-filter="known"]').click();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Beacon', 'Anchor']);
    expect(document.querySelector('[data-vocab-status="en:beacon"]').textContent).toBe('還不熟');
  });

  it('renders a weak-review view with SRS actions for learning items', async () => {
    const setup = createContentContext();
    context = setup.context;
    runContentScript('content/site-policy.js', context);
    runContentScript('content/state.js', context);
    runContentScript('content/dom.js', context);
    runContentScript('content/utils.js', context);
    runContentScript('content/vocabulary.js', context);
    runContentScript('content/result-card.js', context);
    runContentScript('content/floating-ball.js', context);

    setup.localStore.fanFanBaVocabularyItems = {
      'en:anchor': {
        id: 'en:anchor',
        word: 'Anchor',
        lang: 'en',
        translations: ['錨'],
        sources: [],
        createdAt: '2026-05-20T04:00:00.000Z',
        lastSeenAt: '2026-05-25T04:00:00.000Z',
        nextReviewAt: '2026-05-20T04:00:00.000Z',
        count: 5,
        status: 'known'
      },
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        sources: [],
        createdAt: '2026-05-26T04:00:00.000Z',
        lastSeenAt: '2026-05-26T04:00:00.000Z',
        nextReviewAt: '2026-05-28T04:00:00.000Z',
        count: 1,
        status: 'learning'
      },
      'en:compass': {
        id: 'en:compass',
        word: 'Compass',
        lang: 'en',
        translations: ['指南針'],
        sources: [],
        createdAt: '2026-05-24T04:00:00.000Z',
        lastSeenAt: '2026-05-24T04:00:00.000Z',
        nextReviewAt: '2026-05-25T04:00:00.000Z',
        count: 2,
        status: 'learning'
      }
    };

    await context.showFloatingVocabularyPanel();
    document.querySelector('[data-filter="weak"]').click();

    expect(document.querySelector('.g-vocab-tab.g-active').textContent).toBe('錯題回看');
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Compass', 'Beacon']);
    expect(document.querySelector('.g-vocab-panel-meta').textContent).toContain('錯題回看');
    expect(document.querySelector('.g-vocab-panel-meta').textContent).toContain('到期');
    expect(document.querySelector('[data-vocab-review="en:compass"][data-review-status="known"]').textContent).toBe('記得');
    expect(document.querySelector('[data-vocab-review="en:compass"][data-review-status="learning"]').textContent).toBe('還不熟');

    document.querySelector('[data-vocab-review="en:compass"][data-review-status="known"]').click();
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    expect(setup.localStore.fanFanBaVocabularyItems['en:compass'].status).toBe('known');
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    expect([...document.querySelectorAll('.g-vocab-panel-word')].map(node => node.textContent)).toEqual(['Beacon']);
  });
});
