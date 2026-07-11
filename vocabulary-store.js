(function initFanFanBaVocabularyStore(global) {
  'use strict';

  const VOCABULARY_STORAGE_KEY = 'fanFanBaVocabularyItems';
  const VOCABULARY_MIGRATION_KEY = 'fanFanBaVocabularyIndexedDbMigratedAt';
  const DB_NAME = 'fan-fan-ba-vocabulary';
  const DB_VERSION = 1;
  const STORE_NAME = 'items';

  let dbPromise = null;

  function hasIndexedDb() {
    return typeof global.indexedDB !== 'undefined' && global.indexedDB && typeof global.indexedDB.open === 'function';
  }

  // 不可當成 id 的危險鍵，語意對齊 vocabulary-backup.js 的 DANGEROUS_IDS
  //（兩份 normalizeItemsMap 是刻意分工：本檔 trim 覆寫 id/word 保 key 一致性、
  //  backup 檔原樣保留保 round-trip；同步靠兩邊測試的相同危險鍵 fixture 鎖住）
  const DANGEROUS_IDS = new Set(['__proto__', 'constructor', 'prototype']);

  function normalizeItemsMap(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const out = Object.create(null); // null prototype：即使 id 是 __proto__ 也不會誤設原型
    Object.values(source).forEach(value => {
      if (!value || typeof value !== 'object') return;
      const id = String(value.id || '').trim();
      const word = String(value.word || '').trim();
      if (!id || !word || DANGEROUS_IDS.has(id)) return;
      out[id] = { ...value, id, word };
    });
    return out;
  }

  function mapFromList(items) {
    return normalizeItemsMap((Array.isArray(items) ? items : []).reduce((acc, item) => {
      if (item?.id) acc[item.id] = item;
      return acc;
    }, {}));
  }

  async function getLocal(keys) {
    return chrome.storage.local.get(keys);
  }

  async function setLocal(values) {
    return chrome.storage.local.set(values);
  }

  async function loadLegacyMap() {
    const { [VOCABULARY_STORAGE_KEY]: items = {} } = await getLocal(VOCABULARY_STORAGE_KEY);
    return normalizeItemsMap(items);
  }

  async function writeLegacyMap(items) {
    await setLocal({ [VOCABULARY_STORAGE_KEY]: normalizeItemsMap(items) });
  }

  function openDb() {
    if (!hasIndexedDb()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        createIndex(store, 'status', 'status');
        createIndex(store, 'nextReviewAt', 'nextReviewAt');
        createIndex(store, 'lastSeenAt', 'lastSeenAt');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 開啟失敗'));
      request.onblocked = () => reject(new Error('IndexedDB migration 被其他分頁阻擋'));
    }).catch(error => {
      dbPromise = null;
      throw error;
    });

    return dbPromise;
  }

  function createIndex(store, name, keyPath) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, { unique: false });
  }

  function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB 操作失敗'));
    });
  }

  async function withStore(mode, run) {
    const db = await openDb();
    if (!db) return null;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      Promise.resolve()
        .then(() => run(store))
        .then(value => { result = value; })
        .catch(reject);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction 失敗'));
      transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction 中止'));
    });
  }

  async function ensureMigrated() {
    const db = await openDb().catch(() => null);
    if (!db) return { mode: 'legacy' };

    const { [VOCABULARY_MIGRATION_KEY]: migratedAt } = await getLocal(VOCABULARY_MIGRATION_KEY);
    if (migratedAt) return { mode: 'indexeddb', migrated: false };

    const legacy = await loadLegacyMap();
    const list = Object.values(legacy);
    if (list.length) {
      await withStore('readwrite', store => {
        list.forEach(item => store.put(item));
      });
    }
    await setLocal({ [VOCABULARY_MIGRATION_KEY]: new Date().toISOString() });
    return { mode: 'indexeddb', migrated: true, count: list.length };
  }

  async function listItems(options = {}) {
    await ensureMigrated();
    try {
      const items = await withStore('readonly', store => requestAsPromise(store.getAll()));
      if (Array.isArray(items)) return normalizeList(items, options);
    } catch {
      // fall back below
    }
    return normalizeList(Object.values(await loadLegacyMap()), options);
  }

  async function getItem(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    await ensureMigrated();
    try {
      const item = await withStore('readonly', store => requestAsPromise(store.get(key)));
      if (item) return item;
    } catch {
      // fall back below
    }
    return (await loadLegacyMap())[key] || null;
  }

  async function upsertItem(item) {
    const map = normalizeItemsMap({ [item?.id]: item });
    const normalized = map[item?.id];
    if (!normalized) throw new Error('單字資料格式不正確');
    await ensureMigrated();
    try {
      await withStore('readwrite', store => store.put(normalized));
    } catch {
      // keep fallback mirror authoritative when IndexedDB fails
    }
    const legacy = await loadLegacyMap();
    legacy[normalized.id] = normalized;
    await writeLegacyMap(legacy);
    return normalized;
  }

  async function deleteItem(id) {
    const key = String(id || '').trim();
    if (!key) return false;
    await ensureMigrated();
    try {
      await withStore('readwrite', store => store.delete(key));
    } catch {
      // fall back below
    }
    const legacy = await loadLegacyMap();
    const existed = Boolean(legacy[key]);
    delete legacy[key];
    await writeLegacyMap(legacy);
    return existed;
  }

  async function replaceAll(itemsMap) {
    const items = normalizeItemsMap(itemsMap);
    await ensureMigrated();
    try {
      await withStore('readwrite', store => {
        store.clear();
        Object.values(items).forEach(item => store.put(item));
      });
    } catch {
      // fall back below
    }
    await writeLegacyMap(items);
    return { count: Object.keys(items).length };
  }

  async function mergeItems(incomingMap) {
    const existing = mapFromList(await listItems());
    const incoming = normalizeItemsMap(incomingMap);
    const next = { ...existing, ...incoming };
    await replaceAll(next);
    return { count: Object.keys(next).length };
  }

  function normalizeList(items, options = {}) {
    const limit = Number(options.limit || 0);
    const list = (Array.isArray(items) ? items : []).filter(item => item?.id && item?.word);
    const sorted = list.sort((a, b) => {
      const aTime = Date.parse(a.lastSeenAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.lastSeenAt || b.createdAt || 0) || 0;
      return bTime - aTime || String(a.word || '').localeCompare(String(b.word || ''));
    });
    return limit > 0 ? sorted.slice(0, limit) : sorted;
  }

  async function handleMessage(request = {}) {
    const action = String(request.action || '');
    if (action === 'list') return { ok: true, items: await listItems(request.options || {}) };
    if (action === 'get') return { ok: true, item: await getItem(request.id) };
    if (action === 'upsert') return { ok: true, item: await upsertItem(request.item) };
    if (action === 'delete') return { ok: true, deleted: await deleteItem(request.id) };
    if (action === 'replaceAll') return { ok: true, ...(await replaceAll(request.items || {})) };
    if (action === 'merge') return { ok: true, ...(await mergeItems(request.items || {})) };
    if (action === 'migrate') return { ok: true, ...(await ensureMigrated()) };
    throw new Error('未知的單字本操作');
  }

  const api = {
    VOCABULARY_STORAGE_KEY,
    VOCABULARY_MIGRATION_KEY,
    DB_NAME,
    STORE_NAME,
    normalizeItemsMap,
    mapFromList,
    listItems,
    getItem,
    upsertItem,
    deleteItem,
    replaceAll,
    mergeItems,
    ensureMigrated,
    handleMessage
  };

  global.FanFanBaVocabularyStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
