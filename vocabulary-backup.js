(function initFanFanBaVocabularyBackup(global) {
  'use strict';

  // Phase B：單字本「可還原」備份 / 匯入（無 DOM 依賴，options 頁與測試共用）。
  // 與既有 MD/CSV 匯出（單向、lossy）不同 —— 這是完整 keyed map 的 round-trip 備份，
  // 用於換機 / 重新安裝後救回單字資料。

  const BACKUP_APP = 'fan-fan-ba';
  const BACKUP_SCHEMA = 'vocabulary';
  const BACKUP_SCHEMA_VERSION = 1;

  // 把 storage 的 keyed map 正規化成「只含有效條目」的 map（id + word 必要）
  function normalizeItemsMap(input) {
    const source = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const out = {};
    for (const value of Object.values(source)) {
      if (!value || typeof value !== 'object') continue;
      const id = String(value.id || '').trim();
      const word = String(value.word || '').trim();
      if (!id || !word) continue;
      out[id] = value;
    }
    return out;
  }

  function buildBackup(itemsMap) {
    const items = normalizeItemsMap(itemsMap);
    return {
      app: BACKUP_APP,
      schema: BACKUP_SCHEMA,
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      count: Object.keys(items).length,
      items
    };
  }

  // 解析匯入檔：接受 buildBackup 產出的物件，或退而求其次接受裸 keyed map
  function parseBackup(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); }
      catch { throw new Error('檔案不是有效的 JSON'); }
    }
    if (!data || typeof data !== 'object') throw new Error('備份內容格式不正確');
    if (data.items || data.schema === BACKUP_SCHEMA) {
      if (data.app && data.app !== BACKUP_APP) throw new Error('這不是翻翻吧的單字本備份');
      return normalizeItemsMap(data.items);
    }
    // 容錯：直接給裸 keyed map
    const fallback = normalizeItemsMap(data);
    if (!Object.keys(fallback).length) throw new Error('備份內沒有可匯入的單字');
    return fallback;
  }

  function entryTime(item) {
    return Date.parse(item?.lastSeenAt || item?.createdAt || 0) || 0;
  }

  // 衝突（同 id）取「遇到次數較多」者為主，平手取較新；count 取較大值
  function mergeEntry(existing, incoming) {
    const base = (Number(incoming.count || 1) > Number(existing.count || 1)
      || (Number(incoming.count || 1) === Number(existing.count || 1) && entryTime(incoming) >= entryTime(existing)))
      ? incoming
      : existing;
    return {
      ...base,
      count: Math.max(Number(existing.count || 1), Number(incoming.count || 1)),
      createdAt: [existing.createdAt, incoming.createdAt].filter(Boolean).sort()[0] || base.createdAt,
      lastSeenAt: entryTime(incoming) >= entryTime(existing) ? incoming.lastSeenAt : existing.lastSeenAt
    };
  }

  // mode: 'merge'（預設，保留現有 + 併入）/ 'replace'（完全以匯入取代）
  function mergeBackup(existingMap, incomingMap, mode = 'merge') {
    const existing = normalizeItemsMap(existingMap);
    const incoming = normalizeItemsMap(incomingMap);
    const summary = { added: 0, updated: 0, kept: 0, total: 0 };

    if (mode === 'replace') {
      summary.added = Object.keys(incoming).length;
      summary.total = summary.added;
      return { items: { ...incoming }, summary };
    }

    const result = { ...existing };
    for (const [id, item] of Object.entries(incoming)) {
      if (result[id]) {
        result[id] = mergeEntry(result[id], item);
        summary.updated += 1;
      } else {
        result[id] = item;
        summary.added += 1;
      }
    }
    summary.kept = Object.keys(existing).length - summary.updated;
    summary.total = Object.keys(result).length;
    return { items: result, summary };
  }

  const api = {
    BACKUP_APP,
    BACKUP_SCHEMA,
    BACKUP_SCHEMA_VERSION,
    normalizeItemsMap,
    buildBackup,
    parseBackup,
    mergeBackup
  };

  global.FanFanBaVocabularyBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
