'use strict';

// WS-E T-A1：cutover（舊 IndexedDB → mirror-only）契約測試。
// 對齊藍圖 §6 驗收：合併正確（時間戳嚴格新者勝、平手鏡像勝、IDB-only 併入）、
// 守門失敗不刪庫、冪等重試、pre-cutover 備份鍵 write-if-absent、佇列序列化。

const DB_NAME = 'fan-fan-ba-vocabulary';
const KEY = 'fanFanBaVocabularyItems';
const BACKUP_KEY = 'fanFanBaVocabularyItemsPreCutoverBackup';
const MARKER_KEY = 'fanFanBaVocabularyIndexedDbMigratedAt';
const SNAPSHOT_KEY = 'fanFanBaVocabularyItemsSnapshot';

const entry = (id, word, over = {}) => ({ id, word, lang: 'en', ...over });

// 假 IndexedDB：databases()/open()/deleteDatabase() 的最小可運作面
function makeFakeIndexedDb(rows) {
  const state = { deleted: [], closed: 0 };
  return {
    state,
    databases: async () => [{ name: DB_NAME, version: 1 }],
    open() {
      const request = {};
      setTimeout(() => {
        request.result = {
          objectStoreNames: { contains: () => true },
          close: () => { state.closed += 1; },
          transaction: () => ({
            objectStore: () => ({
              getAll: () => {
                const getAll = {};
                setTimeout(() => { getAll.result = rows; getAll.onsuccess?.(); }, 0);
                return getAll;
              }
            })
          })
        };
        request.onsuccess?.();
      }, 0);
      return request;
    },
    deleteDatabase(name) { state.deleted.push(name); return {}; }
  };
}

// 有狀態的 chrome.storage.local mock（序列化與冪等測試需要真狀態）
function installStatefulLocalStorage(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys == null) return { ...data };
    const list = Array.isArray(keys) ? keys : [keys];
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
  return data;
}

function freshStore() {
  jest.resetModules();
  return require('../vocabulary-store');
}

afterEach(() => {
  delete global.indexedDB;
  chrome.storage.local.get.mockReset().mockResolvedValue({});
  chrome.storage.local.set.mockReset().mockImplementation((d, cb) => cb && cb());
  chrome.storage.local.remove.mockReset().mockImplementation((k, cb) => cb && cb());
});

describe('cutover：IDB → mirror-only', () => {
  it('合併政策：鏡像較新勝、平手鏡像勝、IDB-only 併入；成功後刪庫清 marker', async () => {
    const mirror = {
      'en:apple': entry('en:apple', 'apple', { lastSeenAt: '2026-07-10T00:00:00.000Z' }),
      'en:tie': entry('en:tie', 'tie', { lastSeenAt: '2026-07-01T00:00:00.000Z' })
    };
    const idbRows = [
      entry('en:apple', 'apple', { lastSeenAt: '2026-07-05T00:00:00.000Z', stale: true }),
      entry('en:tie', 'tie', { lastSeenAt: '2026-07-01T00:00:00.000Z', fromIdb: true }),
      entry('en:idbnewer', 'idbnewer', { reviewedAt: '2026-07-09T00:00:00.000Z' })
    ];
    const data = installStatefulLocalStorage({ [KEY]: mirror, [MARKER_KEY]: '2026-06-01' });
    global.indexedDB = makeFakeIndexedDb(idbRows);

    const Store = freshStore();
    await Store.listItems(); // 排在 cutover 首 job 之後，等它完成

    expect(data[KEY]['en:apple'].stale).toBeUndefined();      // 鏡像較新 → 鏡像勝
    expect(data[KEY]['en:tie'].fromIdb).toBeUndefined();      // 平手 → 鏡像勝
    expect(data[KEY]['en:idbnewer']).toBeDefined();           // IDB-only → 併入
    expect(global.indexedDB.state.deleted).toContain(DB_NAME);
    expect(data[MARKER_KEY]).toBeUndefined();
    // pre-cutover 備份 = 合併前的鏡像快照（不含 IDB-only 條目）
    expect(data[BACKUP_KEY].items['en:idbnewer']).toBeUndefined();
    expect(data[BACKUP_KEY].items['en:apple']).toBeDefined();
    // cutover 走 { snapshot: false }：它自己已有 BACKUP_KEY，不再多寫一份日常快照
    expect(data[SNAPSHOT_KEY]).toBeUndefined();
  });

  it('冪等重試不覆寫備份鍵（write-if-absent）', async () => {
    const data = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') }
    });
    global.indexedDB = makeFakeIndexedDb([entry('en:dog', 'dog')]);

    const Store = freshStore();
    await Store.listItems();
    const firstSavedAt = data[BACKUP_KEY].savedAt;
    expect(data[BACKUP_KEY].items['en:dog']).toBeUndefined(); // 快照是合併前的

    await Store._runCutoverForTests(); // 再跑一次（模擬 delete 殘留下次啟動重試）

    expect(data[BACKUP_KEY].savedAt).toBe(firstSavedAt);      // 不得被已合併鏡像覆寫
    expect(data[BACKUP_KEY].items['en:dog']).toBeUndefined();
    expect(Object.keys(data[KEY]).sort()).toEqual(['en:cat', 'en:dog']);
  });

  it('鏡像寫回失敗 → 不刪庫；下次重試成功才刪', async () => {
    const data = installStatefulLocalStorage({
      [KEY]: { 'en:cat': entry('en:cat', 'cat') }
    });
    global.indexedDB = makeFakeIndexedDb([entry('en:dog', 'dog')]);

    let failMirrorWrite = true;
    const baseSet = chrome.storage.local.set.getMockImplementation();
    chrome.storage.local.set.mockImplementation(async values => {
      if (failMirrorWrite && KEY in values) throw new Error('模擬寫入失敗');
      return baseSet(values);
    });

    const Store = freshStore();
    await Store._runCutoverForTests().catch(() => {});

    expect(global.indexedDB.state.deleted).toEqual([]);       // 守護不可逆刪除
    expect(data[KEY]['en:dog']).toBeUndefined();              // 鏡像未動
    expect(data[BACKUP_KEY]).toBeDefined();                   // 備份已寫（在失敗點之前）

    failMirrorWrite = false;
    await Store._runCutoverForTests();

    expect(global.indexedDB.state.deleted).toContain(DB_NAME);
    expect(Object.keys(data[KEY]).sort()).toEqual(['en:cat', 'en:dog']);
  });

  it('cutover 已完成（無 DB）：過期備份鍵 30 天後清除', async () => {
    const staleSavedAt = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    const data = installStatefulLocalStorage({
      [BACKUP_KEY]: { savedAt: staleSavedAt, items: {} }
    });
    global.indexedDB = { databases: async () => [] };

    const Store = freshStore();
    await Store.listItems();

    expect(data[BACKUP_KEY]).toBeUndefined();
  });
});

describe('mirror-only 佇列序列化', () => {
  it('並發 20 筆 upsert 無互丟', async () => {
    const data = installStatefulLocalStorage({});
    delete global.indexedDB;

    const Store = freshStore();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => Store.upsertItem(entry(`en:w${i}`, `w${i}`)))
    );

    expect(Object.keys(data[KEY])).toHaveLength(20);
  });

  it('upsert / delete 交錯序列化，結果符合提交順序', async () => {
    const data = installStatefulLocalStorage({});
    delete global.indexedDB;

    const Store = freshStore();
    await Promise.all([
      Store.upsertItem(entry('en:a', 'a')),
      Store.upsertItem(entry('en:b', 'b')),
      Store.deleteItem('en:a'),
      Store.upsertItem(entry('en:c', 'c'))
    ]);

    expect(Object.keys(data[KEY]).sort()).toEqual(['en:b', 'en:c']);
  });
});
