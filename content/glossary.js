// content/glossary.js — 術語表：使用者指定的固定譯法。
// background（挑出這次要附進 prompt 的術語）與設定頁（編輯、CSV 匯入匯出）共用。
// 放在 content/ 是沿用「設定頁與背景共用的模組」的既有位置，content script 本身不載入它。
(function initFanFanBaGlossary(global) {
  'use strict';

  const STORAGE_KEY = 'glossary'; // chrome.storage.local
  const MAX_TERMS = 500;
  const MAX_SITES = 50;
  const MAX_SOURCE_CHARS = 100;
  const MAX_TARGET_CHARS = 100;
  const MAX_NOTE_CHARS = 200;
  // 一次請求最多附幾條；長的詞優先，避免「supply」搶走「supply chain」的位置
  const MAX_TERMS_PER_REQUEST = 30;
  const CSV_HEADER = ['source', 'target', 'note'];

  // 與字典例句加粗同一套詞界規則：拉丁／希臘／西里爾字母與數字要落在詞界上，
  // 中日韓這類不用空白分詞的文字不檢查詞界
  const WORD_CHAR = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{N}]/u;

  function cleanText(value, maxChars) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxChars);
  }

  // 網站清單一行一個；可以貼完整網址，只取主機名稱。example.com 也涵蓋子網域。
  function normalizeSite(value) {
    let text = String(value ?? '').trim().toLowerCase();
    if (!text) return '';
    text = text.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^\*\./, '');
    text = text.split(/[/?#]/)[0].replace(/:\d+$/, '').replace(/\.$/, '');
    return /^(?:[a-z0-9-]+\.)*[a-z0-9-]+$/.test(text) ? text : '';
  }

  function normalizeTerm(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const source = cleanText(entry.source, MAX_SOURCE_CHARS);
    const target = cleanText(entry.target, MAX_TARGET_CHARS);
    if (!source || !target) return null;
    const note = cleanText(entry.note, MAX_NOTE_CHARS);
    return note ? { source, target, note } : { source, target };
  }

  // 讀存檔或匯入時用：壞掉的列略過、同一個原文（不分大小寫）留第一筆、超過上限截掉
  function normalizeGlossary(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const seen = new Set();
    const terms = [];
    for (const entry of Array.isArray(value.terms) ? value.terms : []) {
      const term = normalizeTerm(entry);
      if (!term) continue;
      const key = term.source.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push(term);
      if (terms.length >= MAX_TERMS) break;
    }
    const sites = [...new Set((Array.isArray(value.sites) ? value.sites : []).map(normalizeSite).filter(Boolean))].slice(0, MAX_SITES);
    return { terms, sites };
  }

  function getHostname(url) {
    try {
      return new URL(String(url || '')).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  // 網站清單是空的＝全部網站；有清單時只在符合的網站（含子網域）生效
  function isSiteEnabled(sites, url) {
    if (!Array.isArray(sites) || !sites.length) return true;
    const host = getHostname(url);
    if (!host) return false;
    return sites.some(site => host === site || host.endsWith(`.${site}`));
  }

  // 逐字轉小寫但不改變長度：轉小寫後會變長的字元（如土耳其文 İ → i̇）保留原樣，
  // 小寫字串的位置才能直接拿回原字串切詞界，否則後面的術語全部位移、比對不到
  function lowerSameLength(text) {
    return Array.from(text, ch => {
      const lower = ch.toLowerCase();
      return lower.length === ch.length ? lower : ch;
    }).join('');
  }

  function containsTerm(haystack, needle) {
    const lowerHay = lowerSameLength(haystack);
    const lowerNeedle = lowerSameLength(needle);
    const headIsWord = WORD_CHAR.test(Array.from(needle)[0]);
    const tailIsWord = WORD_CHAR.test(Array.from(needle).pop());
    let from = 0;
    while (from <= lowerHay.length) {
      const index = lowerHay.indexOf(lowerNeedle, from);
      if (index === -1) return false;
      const before = Array.from(haystack.slice(0, index)).pop();
      const after = Array.from(haystack.slice(index + needle.length))[0];
      const okBefore = !headIsWord || !before || !WORD_CHAR.test(before);
      const okAfter = !tailIsWord || !after || !WORD_CHAR.test(after);
      if (okBefore && okAfter) return true;
      from = index + 1;
    }
    return false;
  }

  // 只挑「實際出現在這次文字裡」的術語：不分大小寫、完整詞比對
  function findMatchingTerms(terms, text) {
    const haystack = String(text || '');
    if (!haystack || !Array.isArray(terms)) return [];
    return terms
      .filter(term => term && term.source && containsTerm(haystack, term.source))
      .sort((a, b) => b.source.length - a.source.length)
      .slice(0, MAX_TERMS_PER_REQUEST);
  }

  // 全文翻譯批次送的是 JSON 陣列，只比對其中的 text，免得 "id"、"text" 這些鍵被當成原文
  function extractRequestText(selectedText, pageTranslation) {
    const text = String(selectedText || '');
    if (!pageTranslation || !pageTranslation.batch) return text;
    try {
      const items = JSON.parse(text);
      if (Array.isArray(items)) return items.map(item => String(item?.text ?? '')).join('\n');
    } catch { /* 格式不對就照原字串比對 */ }
    return text;
  }

  // ── CSV ─────────────────────────────────────────
  // 匯出沿用單字本的公式注入防護（escapeCell 由呼叫端傳入 VocabularyBackup.escapeCsvCell），
  // 加 BOM 與 CRLF 讓 Excel 正確顯示中文。
  function buildGlossaryCsv(terms, escapeCell) {
    const rows = [CSV_HEADER, ...(terms || []).map(term => [term.source, term.target, term.note || ''])];
    return `﻿${rows.map(row => row.map(escapeCell).join(',')).join('\r\n')}`;
  }

  // RFC 4180 的最小實作：雙引號包裹、"" 代表一個引號、引號內可換行
  function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const input = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quoted) {
        if (ch === '"' && input[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"' && cell === '') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell); cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(cells => cells.some(value => value.trim() !== ''));
  }

  // 匯出時為防公式注入補上的前導單引號，匯入時拿掉（只在後面接 = + - @ 時）
  function unescapeCell(value) {
    return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
  }

  // 回傳 { terms, skipped }；第一列是 source,target(,note) 表頭就略過
  function parseGlossaryCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length && rows[0][0]?.trim().toLowerCase() === 'source' && rows[0][1]?.trim().toLowerCase() === 'target') rows.shift();
    const terms = [];
    let skipped = 0;
    for (const cells of rows) {
      const term = normalizeTerm({
        source: unescapeCell(cells[0] ?? ''),
        target: unescapeCell(cells[1] ?? ''),
        note: unescapeCell(cells[2] ?? '')
      });
      if (term) terms.push(term);
      else skipped++;
    }
    return { terms, skipped };
  }

  const api = {
    STORAGE_KEY,
    MAX_TERMS,
    MAX_SITES,
    MAX_SOURCE_CHARS,
    MAX_TARGET_CHARS,
    MAX_NOTE_CHARS,
    MAX_TERMS_PER_REQUEST,
    normalizeSite,
    normalizeGlossary,
    isSiteEnabled,
    findMatchingTerms,
    extractRequestText,
    buildGlossaryCsv,
    parseGlossaryCsv
  };

  global.FanFanBaGlossary = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
