(function initFanFanBaVocabularyBackup(global) {
  'use strict';

  // Phase B：單字本「可還原」備份 / 匯入（無 DOM 依賴，options 頁與測試共用）。
  // 與既有 MD/CSV 匯出（單向、lossy）不同 —— 這是完整 keyed map 的 round-trip 備份，
  // 用於換機 / 重新安裝後救回單字資料。

  const BACKUP_APP = 'fan-fan-ba';
  const BACKUP_SCHEMA = 'vocabulary';
  const BACKUP_SCHEMA_VERSION = 1;
  const MAX_IMPORT_ITEMS = 50000;
  // 不可當成 id 的危險鍵，避免匯入檔污染物件原型
  const DANGEROUS_IDS = new Set(['__proto__', 'constructor', 'prototype']);
  const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const XLSX_COLUMNS = [
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
      return assertImportSize(normalizeItemsMap(data.items));
    }
    // 容錯：直接給裸 keyed map
    const fallback = normalizeItemsMap(data);
    if (!Object.keys(fallback).length) throw new Error('備份內沒有可匯入的單字');
    return assertImportSize(fallback);
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

  function buildXlsxRows(itemsMap) {
    const items = Object.values(normalizeItemsMap(itemsMap))
      .sort((a, b) => entryTime(b) - entryTime(a) || String(a.word).localeCompare(String(b.word)));
    return [
      XLSX_COLUMNS.map(([header]) => header),
      ...items.map(item => XLSX_COLUMNS.map(([, read]) => normalizeXlsxCell(read(item))))
    ];
  }

  function normalizeXlsxCell(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function buildXlsxWorkbook(itemsMap) {
    const rows = buildXlsxRows(itemsMap);
    return buildZipPackage({
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vocabulary" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
      'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`,
      'xl/worksheets/sheet1.xml': buildWorksheetXml(rows)
    });
  }

  function buildWorksheetXml(rows) {
    const sheetData = rows.map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row.map((value, colIndex) => {
        const ref = `${columnName(colIndex)}${rowNumber}`;
        return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
      }).join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${sheetData}</sheetData></worksheet>`;
  }

  function columnName(index) {
    let n = index + 1;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  function escapeXml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function buildZipPackage(files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const [name, text] of Object.entries(files)) {
      const nameBytes = utf8Bytes(name);
      const data = utf8Bytes(text);
      const crc = crc32(data);
      const localHeader = zipLocalHeader(nameBytes, data.length, crc);
      const centralHeader = zipCentralHeader(nameBytes, data.length, crc, offset);
      localParts.push(localHeader, nameBytes, data);
      centralParts.push(centralHeader, nameBytes);
      offset += localHeader.length + nameBytes.length + data.length;
    }

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    return concatBytes([...localParts, ...centralParts, zipEndRecord(Object.keys(files).length, centralSize, centralOffset)]);
  }

  function zipLocalHeader(nameBytes, size, crc) {
    const out = new Uint8Array(30);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    return out;
  }

  function zipCentralHeader(nameBytes, size, crc, offset) {
    const out = new Uint8Array(46);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, crc, true);
    view.setUint32(20, size, true);
    view.setUint32(24, size, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, offset, true);
    return out;
  }

  function zipEndRecord(fileCount, centralSize, centralOffset) {
    const out = new Uint8Array(22);
    const view = new DataView(out.buffer);
    view.setUint32(0, 0x06054b50, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, fileCount, true);
    view.setUint16(10, fileCount, true);
    view.setUint32(12, centralSize, true);
    view.setUint32(16, centralOffset, true);
    view.setUint16(20, 0, true);
    return out;
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(String(text));
  }

  function concatBytes(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(part => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let i = 0; i < 8; i += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const api = {
    BACKUP_APP,
    BACKUP_SCHEMA,
    BACKUP_SCHEMA_VERSION,
    MAX_IMPORT_ITEMS,
    XLSX_MIME_TYPE,
    normalizeItemsMap,
    buildBackup,
    parseBackup,
    mergeBackup,
    buildXlsxRows,
    buildXlsxWorkbook
  };

  global.FanFanBaVocabularyBackup = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
