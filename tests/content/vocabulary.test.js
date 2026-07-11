const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createVocabularyStoreResponder } = require('./vocab-store-responder');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createVocabularyContext({ syncStore = {} } = {}) {
  const localStore = {};
  // A1'''：直寫 fallback 已移除，harness 改為忠實模擬 background store 的訊息回應者
  const runtimeSendMessage = jest.fn(createVocabularyStoreResponder(localStore));

  const context = vm.createContext({
    window,
    document,
    location,
    console,
    Date,
    targetLanguage: 'zh-TW',
    obsidianSaving: false,
    setTimeout: jest.fn(fn => {
      if (typeof fn === 'function') fn();
      return 1;
    }),
    chrome: {
      storage: {
        local: {
          get: jest.fn(async key => {
            if (typeof key === 'string') return { [key]: localStore[key] };
            if (Array.isArray(key)) {
              return key.reduce((acc, item) => ({ ...acc, [item]: localStore[item] }), {});
            }
            return { ...localStore };
          }),
          set: jest.fn(async values => {
            Object.assign(localStore, values);
          })
        },
        sync: {
          get: jest.fn(async key => {
            if (typeof key === 'string') return { [key]: syncStore[key] };
            if (Array.isArray(key)) {
              return key.reduce((acc, item) => ({ ...acc, [item]: syncStore[item] }), {});
            }
            return { ...syncStore };
          })
        }
      },
      runtime: {
        sendMessage: runtimeSendMessage
      }
    },
    getWeekLabel: () => '2026-W22'
  });

  context.globalThis = context;
  runContentScript('content/vocabulary.js', context);
  return { context, localStore, runtimeSendMessage };
}

describe('Vocabulary storage helper', () => {
  beforeEach(() => {
    document.title = 'Vocabulary Test Page';
    window.history.pushState({}, '', '/article');
    jest.useFakeTimers().setSystemTime(new Date('2026-05-26T12:00:00+08:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves dictionary entries with a stable id and deduplicates repeated words', async () => {
    const { context, localStore } = createVocabularyContext();

    const first = await context.saveVocabularyEntry({
      word: '  Harbor  ',
      lang: 'en',
      translations: ['港口'],
      definition: 'A sheltered place for ships.'
    }, 'Harbor context one');
    const second = await context.saveVocabularyEntry({
      word: 'Harbor',
      lang: 'en',
      translations: ['港灣']
    }, 'Harbor context two');

    const items = localStore.fanFanBaVocabularyItems;
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(Object.keys(items)).toEqual(['en:harbor']);
    expect(items['en:harbor']).toMatchObject({
      id: 'en:harbor',
      word: 'Harbor',
      lang: 'en',
      count: 2,
      status: 'learning'
    });
    expect(items['en:harbor'].translations).toEqual(['港灣']);
    expect(items['en:harbor'].sources).toHaveLength(2);
  });

  it('limits source history to five unique source contexts', async () => {
    const { context } = createVocabularyContext();

    for (let index = 0; index < 7; index += 1) {
      await context.saveVocabularyEntry({ word: 'Anchor', lang: 'en' }, `context ${index}`);
    }

    const items = await context.listVocabularyItems();
    expect(items).toHaveLength(1);
    expect(items[0].count).toBe(7);
    expect(items[0].sources).toHaveLength(5);
    expect(items[0].sources.map(source => source.context)).toEqual([
      'context 6',
      'context 5',
      'context 4',
      'context 3',
      'context 2'
    ]);
  });

  it('lists, detects today entries, and deletes entries from local storage', async () => {
    const { context } = createVocabularyContext();

    const saved = await context.saveVocabularyEntry({ word: 'Route', lang: 'en' }, 'Route context');
    expect(await context.isVocabularySaved('route', 'en')).toBe(true);
    expect(context.isVocabularyItemFromToday(saved.item)).toBe(true);

    const deleted = await context.deleteVocabularyEntry(saved.item.id);
    expect(deleted).toBe(true);
    expect(await context.isVocabularySaved('route', 'en')).toBe(false);
  });

  it('updates vocabulary review status without changing the entry identity', async () => {
    const { context } = createVocabularyContext();
    const { item } = await context.saveVocabularyEntry({ word: 'Compass', lang: 'en' }, 'Compass context');

    const known = await context.updateVocabularyEntryStatus(item.id, 'known');
    const learning = await context.updateVocabularyEntryStatus(item.id, 'learning');

    expect(known).toMatchObject({ id: item.id, status: 'known' });
    expect(known.reviewedAt).toBe('2026-05-26T04:00:00.000Z');
    expect(known.nextReviewAt).toBe('2026-06-02T04:00:00.000Z');
    expect(learning).toMatchObject({ id: item.id, status: 'learning' });
    expect(learning.nextReviewAt).toBe('2026-05-27T04:00:00.000Z');
    expect((await context.listVocabularyItems())[0].id).toBe(item.id);
  });

  it('builds a due-first SRS review queue for v1.9.4', () => {
    const { context } = createVocabularyContext();
    const queue = context.buildVocabularyReviewQueue([
      {
        id: 'en:anchor',
        word: 'Anchor',
        status: 'known',
        nextReviewAt: '2026-05-20T00:00:00.000Z',
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'en:beacon',
        word: 'Beacon',
        status: 'learning',
        nextReviewAt: '2026-05-28T00:00:00.000Z',
        createdAt: '2026-05-02T00:00:00.000Z'
      },
      {
        id: 'en:compass',
        word: 'Compass',
        status: 'learning',
        createdAt: '2026-05-26T00:00:00.000Z'
      }
    ], {
      now: '2026-05-26T12:00:00.000Z'
    });

    expect(queue.map(item => ({
      id: item.id,
      due: item.due,
      reviewReason: item.reviewReason
    }))).toEqual([
      { id: 'en:compass', due: true, reviewReason: 'due' },
      { id: 'en:anchor', due: true, reviewReason: 'due' },
      { id: 'en:beacon', due: false, reviewReason: 'scheduled' }
    ]);
  });

  it('builds a weak-review queue from existing SRS status without a new model', () => {
    const { context } = createVocabularyContext();
    const queue = context.buildVocabularyWeakReviewQueue([
      {
        id: 'en:anchor',
        word: 'Anchor',
        status: 'known',
        nextReviewAt: '2026-05-20T00:00:00.000Z',
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'en:beacon',
        word: 'Beacon',
        status: 'learning',
        nextReviewAt: '2026-05-28T00:00:00.000Z',
        createdAt: '2026-05-02T00:00:00.000Z'
      },
      {
        id: 'en:compass',
        word: 'Compass',
        status: 'learning',
        nextReviewAt: '2026-05-20T00:00:00.000Z',
        createdAt: '2026-05-03T00:00:00.000Z'
      }
    ], {
      now: '2026-05-26T12:00:00.000Z'
    });

    expect(queue.map(item => ({
      id: item.id,
      status: item.status,
      due: item.due,
      reviewReason: item.reviewReason
    }))).toEqual([
      { id: 'en:compass', status: 'learning', due: true, reviewReason: 'due' },
      { id: 'en:beacon', status: 'learning', due: false, reviewReason: 'scheduled' }
    ]);
  });

  it('builds Markdown export blocks for saved vocabulary', async () => {
    const { context } = createVocabularyContext();
    const { item } = await context.saveVocabularyEntry({
      word: 'Beacon',
      lang: 'en',
      phonetic: '/ˈbiːkən/',
      pos: 'noun',
      translations: ['燈塔', '信標'],
      definition: 'A signal light.',
      examples: [{ src: 'The beacon guided ships.', zh: '信標引導船隻。' }]
    }, 'Beacon context');

    const markdown = context.buildVocabularyMarkdownExport([item]);

    expect(markdown).toContain('### Beacon');
    expect(markdown).toContain('- 音標：/ˈbiːkən/');
    expect(markdown).toContain('- 涵義：燈塔；信標');
    expect(markdown).toContain('- 來源：[Vocabulary Test Page]');
    expect(markdown).toContain('- Tags：#翻翻吧 #vocab/en');
  });

  it('builds Excel-compatible CSV exports with escaped cells', async () => {
    const { context } = createVocabularyContext();
    const { item } = await context.saveVocabularyEntry({
      word: 'Signal, flare',
      lang: 'en',
      translations: ['信號彈', '照明彈'],
      definition: 'A bright, "visible" signal.'
    }, 'Signal context');

    const csv = context.buildVocabularyCsvExport([item]);

    expect(csv.startsWith('\ufeff')).toBe(true);
    expect(csv).toContain('word,lang,translations,definition,sourceTitle,sourceUrl,createdAt,count');
    expect(csv).toContain('"Signal, flare",en,信號彈；照明彈,"A bright, ""visible"" signal."');
    expect(csv).toContain('Vocabulary Test Page');
  });

  it('appends a configured vocabulary entry to the exact Obsidian folder once', async () => {
    const { context, runtimeSendMessage } = createVocabularyContext({
      syncStore: {
        obsidianDefaultFolder: 'Learning',
        obsidianVault: 'Main Vault'
      }
    });
    const { item } = await context.saveVocabularyEntry({
      word: 'Compass',
      lang: 'en',
      translations: ['指南針']
    }, 'Compass context');

    const result = await context.exportVocabularyEntryToObsidianIfConfigured(item);
    const updated = (await context.listVocabularyItems())[0];

    expect(result).toEqual({ exported: true, folder: 'Learning' });
    expect(updated.obsidianExportedAt).toBe('2026-05-26T04:00:00.000Z');
    const obsidianCall = runtimeSendMessage.mock.calls.find(call => call[0]?.type === 'OBSIDIAN_URI');
    expect(obsidianCall).toBeTruthy();
    const url = obsidianCall[0].url;
    expect(url).toContain('obsidian://advanced-uri?');
    expect(decodeURIComponent(url)).toContain('filepath=Learning/2026-W22.md');
    expect(decodeURIComponent(url)).toContain('vault=Main Vault');
    expect(decodeURIComponent(url)).toContain('### Compass');
  });
});
