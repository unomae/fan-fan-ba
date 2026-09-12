(function initFanFanBaVocabularyBackup(global) {
  'use strict';

  // Phase B：單字本「可還原」備份 / 匯入（無 DOM 依賴，options 頁與測試共用）。
  // 本檔有兩種產出，**別混用**：
  //   - `buildBackup` / `parseBackup` / `mergeBackup`：完整 keyed map 的 round-trip
  //     備份（JSON），用於換機 / 重新安裝後救回單字資料。
  //   - `buildVocabularyCsv`：單向、lossy 的檢視格式，給 Excel / Sheets 看，不能還原。
  //     浮球面板另有「複製今日 CSV」（`content/vocabulary.js`，8 欄、只有今天），與此處
  //     的 14 欄完整匯出不是同一個東西。

  const BACKUP_APP = 'fan-fan-ba';
  const BACKUP_SCHEMA = 'vocabulary';
  const BACKUP_SCHEMA_VERSION = 1;
  const MAX_IMPORT_ITEMS = 50000;
  // 不可當成 id 的危險鍵，避免匯入檔污染物件原型
  const DANGEROUS_IDS = new Set(['__proto__', 'constructor', 'prototype']);
  const CSV_MIME_TYPE = 'text/csv;charset=utf-8';
  const CSV_COLUMNS = [
    ['word', item => item.word],
    ['lang', item => item.lang],
    ['pos', item => item.pos],
    ['translations', item => Array.isArray(item.translations) ? item.translations.join('；') : item.translations],
    ['definition', item => item.definition],
    ['count', item => item.count],
    ['createdAt', item => item.createdAt],
    ['lastSeenAt', item => item.lastSeenAt],
    // D5（WS-E）：原 'familiarity' 欄是 Phase B 接線錯誤——寫入端從無此欄位，
    // 實際熟悉度狀態存在 status（'learning'/'known'，content/vocabulary.js 寫入）
    ['status', item => item.status],
    ['reviewedAt', item => item.reviewedAt],
    ['nextReviewAt', item => item.nextReviewAt],
    ['sourceTitle', item => item.sources?.[0]?.title],
    ['sourceUrl', item => item.sources?.[0]?.url],
    ['sourceContext', item => item.sources?.[0]?.context]
  ];

  // 把 storage 的 keyed map 正規化成「只含有效條目」的 map（id + word 必要）
  function normalizeItemsMap(input) {
    const source = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
    const out = Object.create(null); // null prototype：即使 id 是 __proto__ 也不會污染原型
    for (const value of Object.values(source)) {
      if (!value || typeof value !== 'object') continue;
      const id = String(value.id || '').trim();
      const word = String(value.word || '').trim();
      if (!id || !word || DANGEROUS_IDS.has(id)) continue;
      out[id] = value;
    }
    return out;
  }

  function assertImportSize(map) {
    if (Object.keys(map).length > MAX_IMPORT_ITEMS) {
      throw new Error(`單字數超過匯入上限（${MAX_IMPORT_ITEMS}）`);
    }
    return map;
  }

  // 零有效條目的檔案不是合法匯入來源。**兩個分支都要擋**（2026-07-30 red-team F1）：
  // 原本只有裸 map 分支擋，帶 schema 的備份（`{"schema":"vocabulary","items":{}}`、
  // `items: null`、或條目全缺 word/id 的舊檔）會回一個空 map、一路走到
  // replaceAll({})，被下游判成「使用者要清空」而刪掉救援快照。
  // 匯入零個字沒有任何合法用途，在門口擋掉最省事。
  function assertNonEmpty(map) {
    if (!Object.keys(map).length) throw new Error('備份內沒有可匯入的單字');
    return map;
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
      return assertImportSize(assertNonEmpty(normalizeItemsMap(data.items)));
    }
    // 容錯：直接給裸 keyed map
    return assertImportSize(assertNonEmpty(normalizeItemsMap(data)));
  }

  function entryTime(item) {
    return Date.parse(item?.lastSeenAt || item?.createdAt || 0) || 0;
  }

  // 勝方判定時鐘：entryTime 再與 reviewedAt 取較新者（語意對齊 vocabulary-store.js 的 effectiveTimestamp）
  // 只複習、沒再遇到的條目 lastSeenAt 不會動，光看 entryTime 會把它誤判成「舊的」。
  function mergeClock(item) {
    return Math.max(entryTime(item), Date.parse(item?.reviewedAt) || 0);
  }

  // 衝突（同 id）取「同步時鐘較新」者為主，平手取匯入方；count 只取較大值、不參與勝方判定
  //（count＝遇到次數，與複習進度獨立演進；舊版先比 count，會讓另一台裝置較新的
  //  status / reviewedAt / nextReviewAt 在匯入時靜默倒退）
  // status / reviewedAt / nextReviewAt 三欄刻意跟著勝方整組走，不各自取新——
  // 拆開會併出「status 來自 A、nextReviewAt 來自 B」這種不一致的複習狀態。
  function mergeEntry(existing, incoming) {
    const base = mergeClock(incoming) >= mergeClock(existing) ? incoming : existing;
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

  // ── 完整單字本 CSV 匯出 ──────────────────────────────────────────────
  // 原本這裡是手寫的 OOXML＋ZIP（含自寫 CRC32）約 200 行，產出 .xlsx。2026-09-13 換成
  // CSV：Excel 與 Google Sheets 都直接開得起來，而公式注入防護在 CSV 這邊已經有現成、
  // 有 e2e 鎖著的做法。XLSX 那條路的 cell 是 `t="inlineStr"`，依 OOXML 規格不會被當
  // 公式，但那是規格推理、沒人真的拿 Excel 驗過——換成 CSV 讓這個懸而未決的問題消失。
  //
  // 定位不變：這是**單向、lossy 的檢視格式**，不是還原用備份。要還原一律用 JSON。

  function buildCsvRows(itemsMap) {
    const items = Object.values(normalizeItemsMap(itemsMap))
      .sort((a, b) => entryTime(b) - entryTime(a) || String(a.word).localeCompare(String(b.word)));
    return [
      CSV_COLUMNS.map(([header]) => header),
      ...items.map(item => CSV_COLUMNS.map(([, read]) => normalizeCsvValue(read(item))))
    ];
  }

  function normalizeCsvValue(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  // 公式注入防護。單字本的 word／definition 都是從網頁抓來的外部文字，`=cmd|' /C calc'!A0`
  // 這種值一路貼進試算表就會被執行，所以 `=` `+` `-` `@`（含前導 tab / CR）開頭要補一個
  // 單引號維持純文字。順序重要：先補前綴、再做引號包裹。
  //
  // ⚠️ 這段邏輯在 `content/vocabulary.js` 的 `escapeVocabularyCsvCell` 有第二份。MV3 下
  // content script 與 options 頁不共用模組，而把這個檔掛進 <all_urls> 的 content_scripts
  // 只為了共用 5 行 regex 並不划算。改用測試防漂移：`tests/vocabulary-backup.test.js`
  // 有一條交叉比對，拿同一組惡意樣本斷言兩份實作輸出完全相同。**改這裡就要同步改那邊。**
  function escapeCsvCell(value) {
    let text = normalizeCsvValue(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  }

  // BOM 是必要的不是裝飾：沒有它 Excel（尤其 Windows 版）會用系統 ANSI 解讀，
  // 中文欄位直接變亂碼。CRLF 同理，對齊試算表的預期。
  function buildVocabularyCsv(itemsMap) {
    const rows = buildCsvRows(itemsMap);
    return `\ufeff${rows.map(row => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
  }

  const api = {
    BACKUP_APP,
    BACKUP_SCHEMA,
    BACKUP_SCHEMA_VERSION,
    MAX_IMPORT_ITEMS,
    CSV_MIME_TYPE,
    normalizeItemsMap,
    buildBackup,
    parseBackup,
    mergeBackup,
    buildCsvRows,
    buildVocabularyCsv,
    escapeCsvCell
  };

  global.FanFanBaVocabularyBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
