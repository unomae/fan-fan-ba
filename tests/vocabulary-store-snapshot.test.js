'use strict';

// 本機自動快照（兩槽 write-if-stale）契約測試。
// 條款來源＝2026-07-30 red-team 一鏡頭複查：兩槽輪替、未來時戳視為 stale、
// 主寫入先落地、清空＝明確刪除宣告不留快照、TTL 由 SW 啟動掃描執行。
// 時間相關案例一律鎖 Date.now，否則「跨越 24h 邊界」這條路徑永遠跑不到。

const KEY = 'fanFanBaVocabularyItems';
const SNAPSHOT_KEY = 'fanFanBaVocabularyItemsSnapshot';
const PREV_KEY = 'fanFanBaVocabularyItemsSnapshotPrev';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const T0 = Date.parse('2026-07-30T00:00:00.000Z');

const entry = (id, word, over = {}) => ({ id, word, lang: 'en', ...over });
const iso = ms => new Date(ms).toISOString();

let clock = T0;
const setClock = ms => { clock = ms; };

// 有狀態的 chrome.storage.local mock（快照要驗前後值，需要真狀態）；
// 同時記錄「讀到快照鍵」的次數，用來鎖 in-memory 早退是否真的生效
function installStatefulLocalStorage(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  const stats = { snapshotKeyReads: 0 };
  chrome.storage.local.get.mockImplementation(async keys => {
    const list = keys == null ? Object.keys(data) : (Array.isArray(keys) ? keys : [keys]);
    if (list.includes(SNAPSHOT_KEY)) stats.snapshotKeyReads += 1;
    const out = {};
    list.forEach(k => { if (k in data) out[k] = data[k]; });
    return out;
  });
  chrome.storage.local.set.mockImplementation(async values => {
    Object.assign(data, JSON.parse(JSON.stringify(values)));
  });
  chrome.storage.local.remove.mockImplementation(async keys => {
    (Array.isArray(keys) ? keys : [keys]).forEach(k => { delete data[k]; });
  });
  return { data, stats };
}

function freshStore() {
  jest.resetModules();
  return require('../vocabulary-store');
}

beforeEach(() => {
  delete global.indexedDB; // 無 IDB → cutover 直接 return，不干擾本檔
  clock = T0;
  jest.spyOn(Date, 'now').mockImplementation(() => clock);
  chrome.storage.local.get.mockReset();
  chrome.storage.local.set.mockReset();
  chrome.storage.local.remove.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockResolvedValue();
  chrome.storage.local.remove.mockReset().mockResolvedValue();
});

describe('本機自動快照', () => {
  it('寫入前先留一份舊值，快照內容不含這次才寫進去的條目', async () => {
    const { data } = installStatefulLocalStorage({ [KEY]: { 'en:cat': entry('en:cat', 'cat') } });

    await freshStore().upsertItem(entry('en:dog', 'dog'));

    expect(data[KEY]['en:dog']).toBeDefined();                // 主寫入照常
    expect(data[SNAPSHOT_KEY].items['en:cat']).toBeDefined(); // 快照＝寫入前的舊值
    expect(data[SNAPSHOT_KEY].items['en:dog']).toBeUndefined();
  });

  it('逐一刪除單字仍留快照（誤刪救回的主場）', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat'), 'en:dog': entry('en:dog', 'dog') }
    });

    await freshStore().deleteItem('en:cat');

    expect(data[KEY]['en:cat']).toBeUndefined();
    expect(data[SNAPSHOT_KEY].items['en:cat']).toBeDefined();
  });

  it('清空單字本＝明確刪除宣告：不留快照，既有兩槽一併移除', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 - HOUR_MS), items: { 'en:old': entry('en:old', 'old') } },
      [PREV_KEY]: { savedAt: iso(T0 - DAY_MS), items: { 'en:older': entry('en:older', 'older') } }
    });

    await freshStore().replaceAll({});

    expect(Object.keys(data[KEY])).toEqual([]);
    expect(data[SNAPSHOT_KEY]).toBeUndefined();
    expect(data[PREV_KEY]).toBeUndefined();
  });

  it('過期就輪替：舊的降到 prev，救援窗拉到 48h', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 - DAY_MS * 2), items: { 'en:old': entry('en:old', 'old') } }
    });

    await freshStore().upsertItem(entry('en:dog', 'dog'));

    expect(data[SNAPSHOT_KEY].items['en:cat']).toBeDefined(); // 新的一份
    expect(data[PREV_KEY].items['en:old']).toBeDefined();     // 舊的沒被輾掉
  });

  it('24 小時內的後續寫入不輪替', async () => {
    const { data } = installStatefulLocalStorage({ [KEY]: { 'en:cat': entry('en:cat', 'cat') } });
    const Store = freshStore();

    await Store.upsertItem(entry('en:dog', 'dog'));
    const firstSavedAt = data[SNAPSHOT_KEY].savedAt;
    setClock(T0 + HOUR_MS);
    await Store.upsertItem(entry('en:eel', 'eel'));

    expect(data[SNAPSHOT_KEY].savedAt).toBe(firstSavedAt);
    expect(data[SNAPSHOT_KEY].items['en:dog']).toBeUndefined();
    expect(data[PREV_KEY]).toBeUndefined(); // 沒有多餘輪替
  });

  it('in-memory 早退真的省掉 storage 讀取（不是只靠 storage 端判斷）', async () => {
    const { stats } = installStatefulLocalStorage({ [KEY]: { 'en:cat': entry('en:cat', 'cat') } });
    const Store = freshStore();

    await Store.upsertItem(entry('en:dog', 'dog'));
    const afterFirst = stats.snapshotKeyReads;
    setClock(T0 + HOUR_MS);
    await Store.upsertItem(entry('en:eel', 'eel'));

    expect(stats.snapshotKeyReads).toBe(afterFirst); // 第二次寫入完全沒再讀快照鍵
  });

  it('尊重既有快照時戳：不因 SW 重啟而把下一份往後推', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 - HOUR_MS * 12), items: { 'en:old': entry('en:old', 'old') } }
    });

    const Store = freshStore();
    await Store.upsertItem(entry('en:dog', 'dog'));
    expect(data[SNAPSHOT_KEY].items['en:old']).toBeDefined(); // 還很新 → 不輪替

    // 同一個 SW 生命週期內走到「距既有快照 25 小時」：該輪替了
    setClock(T0 + HOUR_MS * 13);
    await Store.upsertItem(entry('en:eel', 'eel'));

    expect(data[PREV_KEY].items['en:old']).toBeDefined();
    expect(data[SNAPSHOT_KEY].items['en:dog']).toBeDefined();
  });

  it('未來時戳視為 stale，不會讓快照永久凍結', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 + DAY_MS * 30), items: { 'en:ancient': entry('en:ancient', 'ancient') } }
    });

    await freshStore().upsertItem(entry('en:dog', 'dog'));

    expect(data[SNAPSHOT_KEY].items['en:cat']).toBeDefined();
    expect(data[PREV_KEY].items['en:ancient']).toBeDefined();
  });

  it('單字本是空的就不寫快照', async () => {
    const { data } = installStatefulLocalStorage({});

    await freshStore().upsertItem(entry('en:dog', 'dog'));

    expect(data[KEY]['en:dog']).toBeDefined();
    expect(data[SNAPSHOT_KEY]).toBeUndefined();
  });

  it('空間只夠一次寫入時，使用者的寫入優先於備份', async () => {
    const { data } = installStatefulLocalStorage({ [KEY]: { 'en:cat': entry('en:cat', 'cat') } });
    let remaining = 1;
    chrome.storage.local.set.mockImplementation(async values => {
      if (remaining <= 0) throw new Error('quota exceeded');
      remaining -= 1;
      Object.assign(data, JSON.parse(JSON.stringify(values)));
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(freshStore().upsertItem(entry('en:dog', 'dog'))).resolves.toMatchObject({ id: 'en:dog' });

    expect(data[KEY]['en:dog']).toBeDefined();   // 主寫入拿到那唯一的額度
    expect(data[SNAPSHOT_KEY]).toBeUndefined();  // 快照放棄
    expect(warn).toHaveBeenCalled();             // 但不是無聲失敗
  });

  it('超過保留上限的快照在 SW 啟動時被清掉，兩槽各自獨立判斷', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 - HOUR_MS), items: { 'en:fresh': entry('en:fresh', 'fresh') } },
      [PREV_KEY]: { savedAt: iso(T0 - DAY_MS * 40), items: { 'en:stale': entry('en:stale', 'stale') } }
    });

    await freshStore().listItems(); // 排在啟動掃描之後

    expect(data[SNAPSHOT_KEY]).toBeDefined(); // 還在保留期內
    expect(data[PREV_KEY]).toBeUndefined();   // 超過 TTL → 清掉
  });

  it('讀取端：列出兩槽的時戳與筆數，空槽不列', async () => {
    installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') },
      [SNAPSHOT_KEY]: { savedAt: iso(T0 - HOUR_MS), items: { 'en:a': entry('en:a', 'a'), 'en:b': entry('en:b', 'b') } },
      [PREV_KEY]: { savedAt: iso(T0 - DAY_MS), items: {} }
    });

    const snapshots = await freshStore().listSnapshots();

    expect(snapshots).toEqual([{ slot: 'current', savedAt: iso(T0 - HOUR_MS), count: 2 }]);
  });

  it('讀取端：取單一槽位，未知槽位要擋掉', async () => {
    installStatefulLocalStorage({
      [PREV_KEY]: { savedAt: iso(T0 - DAY_MS), items: { 'en:a': entry('en:a', 'a') } }
    });
    const Store = freshStore();

    await expect(Store.getSnapshot('prev')).resolves.toMatchObject({ savedAt: iso(T0 - DAY_MS) });
    await expect(Store.getSnapshot('current')).resolves.toBeNull();
    await expect(Store.getSnapshot('../evil')).rejects.toThrow('未知的快照槽位');
  });

  it('使用者清空後不再使用單字本，含 URL 的舊快照也會過期消失', async () => {
    const { data } = installStatefulLocalStorage({
      [KEY]: {},
      [SNAPSHOT_KEY]: {
        savedAt: iso(T0 - DAY_MS * 40),
        items: { 'en:cat': entry('en:cat', 'cat', { sources: [{ url: 'https://private.example/x' }] }) }
      }
    });

    await freshStore().listItems();

    expect(data[SNAPSHOT_KEY]).toBeUndefined();
  });
});
