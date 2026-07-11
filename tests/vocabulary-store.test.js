const Store = require('../vocabulary-store');

const entry = (id, word, over = {}) => ({
  id,
  word,
  lang: 'en',
  count: 1,
  createdAt: '2026-06-01T00:00:00.000Z',
  lastSeenAt: '2026-06-01T00:00:00.000Z',
  ...over
});

describe('vocabulary store fallback', () => {
  beforeEach(() => {
    delete global.indexedDB;
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
  });

  it('lists legacy chrome.storage.local items when IndexedDB is unavailable', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      fanFanBaVocabularyItems: {
        'en:beacon': entry('en:beacon', 'Beacon'),
        junk: { id: '', word: '' }
      }
    });

    const items = await Store.listItems();

    expect(items.map(item => item.id)).toEqual(['en:beacon']);
  });

  it('upserts and mirrors entries to the legacy map for fallback backup', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      fanFanBaVocabularyItems: {
        'en:anchor': entry('en:anchor', 'Anchor')
      }
    });

    const item = await Store.upsertItem(entry('en:beacon', 'Beacon'));

    expect(item.id).toBe('en:beacon');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      fanFanBaVocabularyItems: expect.objectContaining({
        'en:anchor': expect.objectContaining({ word: 'Anchor' }),
        'en:beacon': expect.objectContaining({ word: 'Beacon' })
      })
    });
  });

  // 與 tests/vocabulary-backup.test.js 的 import hardening 案例同一組危險鍵 fixture，
  // 鎖住兩份 normalizeItemsMap 的防護語意同步（WS-E M1'）
  it('filters dangerous ids so prototype keys never reach the stored map', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      fanFanBaVocabularyItems: {
        ok: entry('en:anchor', 'Anchor'),
        '__proto__': { id: '__proto__', word: 'evil', polluted: 'yes' },
        'constructor': { id: 'constructor', word: 'evil2' },
        'prototype': { id: 'prototype', word: 'evil3' }
      }
    });

    const items = await Store.listItems();

    expect(items.map(item => item.id)).toEqual(['en:anchor']);
    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
  });

  it('rejects dangerous-id upserts instead of silently mangling the map', async () => {
    await expect(Store.upsertItem({ id: '__proto__', word: 'evil' }))
      .rejects.toThrow('單字資料格式不正確');
  });

  it('replaces all entries through the same message-facing API', async () => {
    await Store.handleMessage({
      action: 'replaceAll',
      items: {
        'en:compass': entry('en:compass', 'Compass')
      }
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      fanFanBaVocabularyItems: {
        'en:compass': expect.objectContaining({ word: 'Compass' })
      }
    });
  });
});
