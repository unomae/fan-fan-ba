(function initFanFanBaVocabularyStore(global) {
  'use strict';

  // ── 單字本資料層（WS-E A1'''：mirror-only 單一 store）─────────────
  //
  // 歷史：v1.9.9 以前是 IndexedDB（主）+ chrome.storage.local 鏡像（備援）雙存放，
  // 但 index 全 repo 零查詢、無 unlimitedStorage 時配額被鏡像綁死，雙存放只貢獻
  // 讀寫權威分裂（IDB 空陣列照信、marker 比資料長壽、fallback 直寫被 replaceAll
  // 抹除）。經 4 輪 adversarial-review 收斂為：chrome.storage.local 單一 store，
  // 啟動時一次性 cutover 把舊 IDB 資料合併回來後刪庫。
  //
  // 本檔只在 background service worker 載入（importScripts），為唯一寫入者；
  // 所有 context 一律經 VOCABULARY_STORE 訊息存取。

  const VOCABULARY_STORAGE_KEY = 'fanFanBaVocabularyItems';
  const VOCABULARY_MIGRATION_KEY = 'fanFanBaVocabularyIndexedDbMigratedAt'; // 舊雙存放時代的 marker，cutover 完成後清除
  const PRE_CUTOVER_BACKUP_KEY = 'fanFanBaVocabularyItemsPreCutoverBackup';
  const PRE_CUTOVER_BACKUP_TTL_MS = 30 * 24 * 60 * 60 * 1000; // cutover 完成 30 天後清備份
  const DB_NAME = 'fan-fan-ba-vocabulary';
  const STORE_NAME = 'items';

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

  async function removeLocal(keys) {
    return chrome.storage.local.remove(keys);
  }

  async function loadLegacyMap() {
    const { [VOCABULARY_STORAGE_KEY]: items = {} } = await getLocal(VOCABULARY_STORAGE_KEY);
    return normalizeItemsMap(items);
  }

  async function writeLegacyMap(items) {
    await setLocal({ [VOCABULARY_STORAGE_KEY]: normalizeItemsMap(items) });
  }

  // 同步時鐘：取 lastSeenAt / reviewedAt 較大者（cutover 合併衝突判準）
  function effectiveTimestamp(item) {
    return Math.max(Date.parse(item?.lastSeenAt) || 0, Date.parse(item?.reviewedAt) || 0);
  }

  // ── 序列化佇列 ──────────────────────────────────────────────
  // mirror-only 後所有寫入都是同一 key 的 read-modify-write，並發 handleMessage
  // 會互丟條目；佇列逐 op 隔離 rejection（q.then(run, run)），單一 op 失敗不
  // 餓死後續。cutover 掛佇列頭，保證先於任何 CRUD（禁 lazy——否則匯入後殭屍復活）。
  let queue = cutoverFromIndexedDb();
  queue.catch(() => {}); // cutover 失敗不阻塞 CRUD，下次 SW 啟動冪等重試

  function enqueue(task) {
    const run = queue.then(task, task);
    queue = run.then(() => {}, () => {});
    return run;
  }

  // ── 一次性 cutover：舊 IDB → 鏡像合併後刪庫（A1''' 條款）────────────
  // 條款來源＝4 輪 adversarial-review：
  // - databases() 偵測（open 會憑空建庫；marker 可能比資料短命，不可信）
  // - pre-cutover 備份鍵 write-if-absent（冪等重試不得用已合併/limbo 鏡像覆寫
  //   唯一的合併前快照）；備份寫失敗＝abort；TTL 清除以 cutover 已完成為前置
  // - 合併政策：同 id 取 effectiveTimestamp 嚴格較新者，平手/無時戳＝鏡像勝
  //   （quota 卡住族群的 IDB 系統性較新，盲目鏡像勝會回滾複習進度）
  // - 守門：寫回讀出 key 集合相等 ＋ IDB 勝出條目時戳全驗，通過才刪庫
  //   （純筆數比對抓不到「等大但過期的 map」）
  // - deleteDatabase fire-and-forget 出佇列鏈（onblocked 不阻塞 CRUD，下次補刪）
  async function cutoverFromIndexedDb() {
    if (typeof global.indexedDB?.databases !== 'function') return; // 無法安全偵測就不動

    const dbs = await global.indexedDB.databases();
    const exists = (dbs || []).some(db => db?.name === DB_NAME);
    const stored = await getLocal([VOCABULARY_STORAGE_KEY, PRE_CUTOVER_BACKUP_KEY, VOCABULARY_MIGRATION_KEY]);
    const backup = stored[PRE_CUTOVER_BACKUP_KEY];

    if (!exists) {
      // cutover 已完成（或全新安裝）：清 marker；備份鍵過 TTL 才清
      if (stored[VOCABULARY_MIGRATION_KEY] !== undefined) await removeLocal(VOCABULARY_MIGRATION_KEY);
      if (backup && Date.now() - (Date.parse(backup.savedAt) || 0) > PRE_CUTOVER_BACKUP_TTL_MS) {
        await removeLocal(PRE_CUTOVER_BACKUP_KEY);
      }
      return;
    }

    const mirror = normalizeItemsMap(stored[VOCABULARY_STORAGE_KEY] || {});

    // write-if-absent：只保留第一次的合併前快照
    if (!backup) {
      await setLocal({ [PRE_CUTOVER_BACKUP_KEY]: { savedAt: new Date().toISOString(), items: mirror } });
    }

    const idbItems = await readAllFromIndexedDb();
    const incoming = mapFromList(idbItems);
    const merged = { ...mirror };
    const idbWins = [];
    Object.values(incoming).forEach(item => {
      const existing = merged[item.id];
      if (!existing) {
        merged[item.id] = item; // IDB-only（歷史反向分裂殘留）：併入
        idbWins.push(item);
      } else if (effectiveTimestamp(item) > effectiveTimestamp(existing)) {
        merged[item.id] = item; // 嚴格較新才勝
        idbWins.push(item);
      }
    });

    await writeLegacyMap(merged);

    // 守門：通過才觸發不可逆的刪庫
    const readBack = await loadLegacyMap();
    const mergedKeys = Object.keys(normalizeItemsMap(merged));
    const backKeys = Object.keys(readBack);
    const gatePassed = backKeys.length === mergedKeys.length
      && mergedKeys.every(key => key in readBack)
      && idbWins.every(item => readBack[item.id] && effectiveTimestamp(readBack[item.id]) === effectiveTimestamp(item));
    if (!gatePassed) return; // 不刪庫；下次啟動冪等重試

    // fire-and-forget：onblocked 不 reject 也不阻塞佇列，殘留下次啟動補刪
    try { global.indexedDB.deleteDatabase(DB_NAME); } catch { /* 下次啟動重試 */ }
    try { await removeLocal(VOCABULARY_MIGRATION_KEY); } catch { /* 冪等，可留待下次 */ }
  }

  // 讀出舊庫全部條目後 close（close 後 deleteDatabase 才不會被自己 block）
  function readAllFromIndexedDb() {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = global.indexedDB.open(DB_NAME);
      } catch (error) {
        reject(error);
        return;
      }
      request.onerror = () => reject(request.error || new Error('IndexedDB 開啟失敗'));
      request.onsuccess = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.close();
            resolve([]);
            return;
          }
          const getAll = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
          getAll.onsuccess = () => { const rows = getAll.result || []; db.close(); resolve(rows); };
          getAll.onerror = () => { db.close(); reject(getAll.error || new Error('IndexedDB 讀取失敗')); };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  // ── CRUD（全部經佇列；reply 在 storage commit 之後）─────────────
  async function listItems(options = {}) {
    return enqueue(async () => normalizeList(Object.values(await loadLegacyMap()), options));
  }

  async function getItem(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    return enqueue(async () => (await loadLegacyMap())[key] || null);
  }

  async function upsertItem(item) {
    const normalized = Object.values(normalizeItemsMap({ item }))[0];
    if (!normalized) throw new Error('單字資料格式不正確');
    return enqueue(async () => {
      const legacy = await loadLegacyMap();
      legacy[normalized.id] = normalized;
      await writeLegacyMap(legacy);
      return normalized;
    });
  }

  async function deleteItem(id) {
    const key = String(id || '').trim();
    if (!key) return false;
    return enqueue(async () => {
      const legacy = await loadLegacyMap();
      const existed = Boolean(legacy[key]);
      delete legacy[key];
      await writeLegacyMap(legacy);
      return existed;
    });
  }

  async function replaceAll(itemsMap) {
    const items = normalizeItemsMap(itemsMap);
    return enqueue(async () => {
      await writeLegacyMap(items);
      return { count: Object.keys(items).length };
    });
  }

  async function mergeItems(incomingMap) {
    const incoming = normalizeItemsMap(incomingMap);
    return enqueue(async () => {
      const next = { ...(await loadLegacyMap()), ...incoming };
      await writeLegacyMap(next);
      return { count: Object.keys(next).length };
    });
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
    throw new Error('未知的單字本操作');
  }

  const api = {
    VOCABULARY_STORAGE_KEY,
    VOCABULARY_MIGRATION_KEY,
    PRE_CUTOVER_BACKUP_KEY,
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
    handleMessage,
    // 測試用：手動重跑 cutover（生產路徑只在模組載入時自動執行一次）
    _runCutoverForTests: () => {
      const run = cutoverFromIndexedDb();
      queue = run.then(() => {}, () => {});
      return run;
    }
  };

  global.FanFanBaVocabularyStore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
