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
  const LOCAL_SNAPSHOT_KEY = 'fanFanBaVocabularyItemsSnapshot';
  const LOCAL_SNAPSHOT_PREV_KEY = 'fanFanBaVocabularyItemsSnapshotPrev'; // 上一份，把救援窗從 24h 拉到 48h
  const LOCAL_SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 每 24 小時最多輪替一次
  const LOCAL_SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 保留上限，比照 PRE_CUTOVER_BACKUP_TTL_MS
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

  // ── 本機自動快照（純附加；主讀寫路徑不讀它）───────────────────────
  // 誤刪 / 匯入蓋掉後的救命繩：留的是「寫入前的舊值」。存新值沒有意義——
  // 真正要救的那次寫入，存下來的就已經是壞掉的狀態。
  // 設計條款（2026-07-30 red-team 一鏡頭複查後定案）：
  // - **兩槽輪替**：單槽 write-if-stale 會在 24h 後被自己覆寫（Day0 誤刪、Day1 隨手
  //   存一個字就把唯一的好備份輾掉）。輪替後救援窗 = 24–48h，**這是明確上限、不是無限**。
  // - **未來時戳視為 stale**：時鐘超前時 `now - savedAt` 為負，若當成「還很新」會讓快照
  //   永久凍結，且校正回來也不會恢復。
  // - **主寫入先落地、快照才寫**：空間 / IO 只夠一次時，備份不得把使用者的寫入擠掉。
  // - **TTL 由 SW 啟動掃描執行**：maybeWriteSnapshot 只在有寫入時才跑，使用者清空後
  //   不再用單字本的話它永遠不會被觸發，含 URL 的舊資料會無限期留著。
  // - cutover 不走這裡（它另有 PRE_CUTOVER_BACKUP_KEY 專屬備份，重複寫只是多耗配額）。
  let snapshotCheckedAt = 0; // in-memory：SW 存活期間免每次寫入都多讀一次 storage

  function snapshotSavedAt(record) {
    return Date.parse(record?.savedAt) || 0;
  }

  // 判斷這次要不要輪替；要的話回傳待寫的 payload（主寫入之後才真的寫進去）
  async function prepareSnapshot() {
    const now = Date.now();
    if (now - snapshotCheckedAt < LOCAL_SNAPSHOT_INTERVAL_MS) return null;
    const stored = await getLocal([LOCAL_SNAPSHOT_KEY, VOCABULARY_STORAGE_KEY]);
    const current = stored[LOCAL_SNAPSHOT_KEY];
    const savedAt = snapshotSavedAt(current);
    const fresh = savedAt <= now && now - savedAt < LOCAL_SNAPSHOT_INTERVAL_MS; // 未來時戳＝stale
    if (fresh) {
      snapshotCheckedAt = savedAt; // 對齊既有快照時戳，避免每次 SW 重啟都把下一份往後推
      return null;
    }
    const items = normalizeItemsMap(stored[VOCABULARY_STORAGE_KEY] || {});
    if (!Object.keys(items).length) return null; // 空的不留，免得首裝就寫一份空快照
    const next = { savedAt: new Date(now).toISOString(), items };
    return {
      at: now,
      values: current
        ? { [LOCAL_SNAPSHOT_KEY]: next, [LOCAL_SNAPSHOT_PREV_KEY]: current }
        : { [LOCAL_SNAPSHOT_KEY]: next }
    };
  }

  // SW 啟動掃一次：兩槽各自獨立判斷過期（寫入稀疏時 prev 可能比 current 老很多）
  // 未來時戳要重新錨定（2026-07-30 red-team F2）：`now - savedAt` 是負數，永遠不會
  // 大於 TTL，那筆快照會**永久掃不掉**，含來源 URL 的舊資料無限期留著——直接牴觸
  // options 頁對使用者的「逾 30 天自動清除」承諾。prepareSnapshot 早就把未來時戳
  // 當 stale（:93），這裡漏了。
  //
  // 為什麼是重錨不是刪：savedAt > now 只發生在「寫入時時鐘超前、之後被校正回來」
  // （RTC 沒電、VM resume、手動改日期），那筆的真實年齡不可知——但它可能是使用者
  // **唯一的救援資料**。同一天 red-team F1 的教訓就是別在救命繩上做不可逆的破壞。
  // 把 savedAt 重錨到現在：TTL 重新開始跑（30 天上限確實生效、承諾兌現），
  // 資料留著，之後照常輪替。代價是最多多留 30 天，換不弄丟資料，划算。
  async function sweepExpiredSnapshots() {
    const keys = [LOCAL_SNAPSHOT_KEY, LOCAL_SNAPSHOT_PREV_KEY];
    const stored = await getLocal(keys);
    const now = Date.now();
    const expired = [];
    const reanchored = {};
    for (const key of keys) {
      const record = stored[key];
      if (!record) continue;
      const savedAt = snapshotSavedAt(record);
      if (savedAt > now) reanchored[key] = { ...record, savedAt: new Date(now).toISOString() };
      else if (now - savedAt > LOCAL_SNAPSHOT_TTL_MS) expired.push(key);
    }
    if (expired.length) await removeLocal(expired);
    if (Object.keys(reanchored).length) await setLocal(reanchored);
  }

  async function writeLegacyMap(items, { snapshot = true } = {}) {
    const pending = snapshot ? await prepareSnapshot().catch(() => null) : null;
    await setLocal({ [VOCABULARY_STORAGE_KEY]: normalizeItemsMap(items) });
    if (!pending) return;
    // 主寫入已落地，快照才寫；失敗吞掉但要留訊號，否則「一直寫失敗」與「有備份」無法區分
    try {
      await setLocal(pending.values);
      snapshotCheckedAt = pending.at;
    } catch (error) {
      console.warn('[fan-fan-ba] 單字本本機快照寫入失敗，這次沒有備份', error);
    }
  }

  // 同步時鐘：取 lastSeenAt / reviewedAt 較大者（cutover 合併衝突判準）
  function effectiveTimestamp(item) {
    return Math.max(Date.parse(item?.lastSeenAt) || 0, Date.parse(item?.reviewedAt) || 0);
  }

  // ── 序列化佇列 ──────────────────────────────────────────────
  // mirror-only 後所有寫入都是同一 key 的 read-modify-write，並發 handleMessage
  // 會互丟條目；佇列逐 op 隔離 rejection（q.then(run, run)），單一 op 失敗不
  // 餓死後續。cutover 掛佇列頭，保證先於任何 CRUD（禁 lazy——否則匯入後殭屍復活）。
  // 快照 TTL 掃描接在 cutover 之後：兩者都在任何 CRUD 之前，且互不影響成敗
  let queue = cutoverFromIndexedDb().then(sweepExpiredSnapshots, sweepExpiredSnapshots);
  queue.catch(() => {}); // cutover / 掃描失敗不阻塞 CRUD，下次 SW 啟動冪等重試

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

    await writeLegacyMap(merged, { snapshot: false }); // cutover 已有 PRE_CUTOVER_BACKUP_KEY

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

  // 清空＝使用者明確要求刪除，隱私優先於救援：不留快照，連既有兩槽一併移除。
  // **意圖必須由呼叫端宣告，不從資料形狀推論**（2026-07-30 red-team F1）：
  // 原本用 `Object.keys(items).length === 0` 推論，於是「使用者把單字刪光後，
  // 想匯入備份救回來、但那份備份零有效條目」會一路走到 replaceAll({})，被判成
  // 「明確清空」而清掉兩槽——**正好在快照唯一該發揮作用的時刻把它刪掉**，
  // 而且畫面只顯示「新增 0、更新 0」，看起來像什麼都沒發生。
  // 現況全 repo 沒有任何「清空單字本」控制項，clearing 因此沒有真實觸發者；
  // 保留這個參數是為了讓將來要加清空鈕的人有明確的接法，不必再走形狀推論。
  // 逐一 delete 不算清空宣告，仍會留快照——那才是誤刪救回的主場。
  // `snapshot: false` 給「還原快照」用（2026-07-30 red-team F4）：還原走 mergeBackup
  // 'merge'，只會補字與取較新的複習進度、不刪不回滾，所以還原**前**的狀態沒有備份
  // 價值；而使用者通常隔天才發現資料沒了，此時 current 已 stale → 一還原就輪替，
  // 把還原前的壞狀態寫進 current、好快照擠到 prev，再過一天再還原一次就全沒了。
  // 拿救援槽去備份一個非破壞性動作的前態，是把救命繩換成雜訊。
  async function replaceAll(itemsMap, { clearing = false, snapshot = !clearing } = {}) {
    const items = normalizeItemsMap(itemsMap);
    return enqueue(async () => {
      await writeLegacyMap(items, { snapshot });
      if (clearing) await removeLocal([LOCAL_SNAPSHOT_KEY, LOCAL_SNAPSHOT_PREV_KEY]);
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

  // ── 快照讀取（給 options 頁的還原入口用；仍不在主讀寫路徑上）──────────
  // 走佇列：避免在輪替寫入的中間讀到半套狀態。
  const SNAPSHOT_SLOTS = [['current', LOCAL_SNAPSHOT_KEY], ['prev', LOCAL_SNAPSHOT_PREV_KEY]];

  async function listSnapshots() {
    return enqueue(async () => {
      const stored = await getLocal(SNAPSHOT_SLOTS.map(([, key]) => key));
      return SNAPSHOT_SLOTS
        .map(([slot, key]) => ({
          slot,
          savedAt: stored[key]?.savedAt || null,
          count: Object.keys(normalizeItemsMap(stored[key]?.items || {})).length
        }))
        .filter(entry => entry.count > 0);
    });
  }

  async function getSnapshot(slot) {
    const match = SNAPSHOT_SLOTS.find(([name]) => name === String(slot || ''));
    if (!match) throw new Error('未知的快照槽位');
    return enqueue(async () => {
      const stored = await getLocal(match[1]);
      const record = stored[match[1]];
      if (!record) return null;
      return { savedAt: record.savedAt || null, items: normalizeItemsMap(record.items || {}) };
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
    // 只轉發 snapshot（要不要順手備份），**不轉發 clearing** —— 刪快照是不可逆的，
    // 不開放給訊息端；將來要加清空鈕時另開一個明確的 action。
    if (action === 'replaceAll') {
      return { ok: true, ...(await replaceAll(request.items || {}, { snapshot: request.snapshot !== false })) };
    }
    if (action === 'merge') return { ok: true, ...(await mergeItems(request.items || {})) };
    if (action === 'snapshots') return { ok: true, snapshots: await listSnapshots() };
    if (action === 'snapshot') return { ok: true, snapshot: await getSnapshot(request.slot) };
    throw new Error('未知的單字本操作');
  }

  const api = {
    VOCABULARY_STORAGE_KEY,
    VOCABULARY_MIGRATION_KEY,
    PRE_CUTOVER_BACKUP_KEY,
    LOCAL_SNAPSHOT_KEY,
    LOCAL_SNAPSHOT_PREV_KEY,
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
    listSnapshots,
    getSnapshot,
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
