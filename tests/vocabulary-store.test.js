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
