const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createHighlighterContext() {
  const localStore = {};
  const context = vm.createContext({
    window,
    document,
    location,
    Node,
    NodeFilter,
    console,
    chrome: {
      storage: {
        local: {
          get: jest.fn(async key => {
            if (typeof key === 'string') return { [key]: localStore[key] };
            return { ...localStore };
          }),
          set: jest.fn(async values => {
            Object.assign(localStore, values);
          })
        }
      }
    },
    updateFloatingBallVocabularyHighlightState: jest.fn(),
    targetLanguage: 'zh-TW'
  });

  context.globalThis = context;
  runContentScript('content/utils.js', context);
  runContentScript('content/vocabulary.js', context);
  runContentScript('content/vocabulary-highlighter.js', context);
  return { context, localStore };
}

describe('Vocabulary highlighter', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main>
        <p id="article">The Beacon guided ships, but beacons and anchored boats should not match Anchor.</p>
        <code>Beacon in code</code>
        <input value="Beacon in input">
        <div id="fanfanba-floating">Beacon in our UI</div>
      </main>
    `;
  });

  it('highlights saved vocabulary in readable text only', async () => {
    const { context, localStore } = createHighlighterContext();
    localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        count: 2,
        createdAt: '2026-05-26T04:00:00.000Z'
      },
      'en:anchor': {
        id: 'en:anchor',
        word: 'Anchor',
        lang: 'en',
        translations: ['錨'],
        count: 1,
        createdAt: '2026-05-26T04:00:00.000Z'
      }
    };

    const count = await context.applyVocabularyHighlights();

    expect(count).toBe(2);
    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(2);
    expect(document.querySelector('code mark')).toBeNull();
    expect(document.querySelector('#fanfanba-floating mark')).toBeNull();
    expect(document.getElementById('article').textContent).toContain('anchored boats');
  });

  it('clears highlights and restores original readable text', async () => {
    const { context, localStore } = createHighlighterContext();
    localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        count: 1
      }
    };

    await context.applyVocabularyHighlights();
    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(1);

    context.clearVocabularyHighlights();

    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(0);
    expect(document.getElementById('article').textContent).toContain('The Beacon guided ships');
  });

  it('stores the site toggle and updates floating state', async () => {
    const { context, localStore } = createHighlighterContext();
    localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        count: 1
      }
    };

    await context.toggleVocabularyHighlightForSite();
    expect(localStore[context.getVocabularyHighlightStorageKey()]).toBe(true);
    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(1);
    expect(context.updateFloatingBallVocabularyHighlightState).toHaveBeenLastCalledWith(true);

    await context.toggleVocabularyHighlightForSite();
    expect(localStore[context.getVocabularyHighlightStorageKey()]).toBe(false);
    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(0);
    expect(context.updateFloatingBallVocabularyHighlightState).toHaveBeenLastCalledWith(false);
  });

  it('caps the number of inserted marks', async () => {
    document.body.innerHTML = `<main><p>${Array(100).fill('Beacon').join(' ')}</p></main>`;
    const { context, localStore } = createHighlighterContext();
    localStore.fanFanBaVocabularyItems = {
      'en:beacon': {
        id: 'en:beacon',
        word: 'Beacon',
        lang: 'en',
        translations: ['燈塔'],
        count: 1
      }
    };

    const count = await context.applyVocabularyHighlights();

    expect(count).toBe(80);
    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(80);
  });
});
