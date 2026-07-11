'use strict';

const VOCABULARY_MAX_SOURCES = 5;
const VOCABULARY_MAX_CONTEXT_CHARS = 180;
const VOCABULARY_SRS_INTERVAL_DAYS = {
  new: 0,
  learning: 1,
  known: 7
};

function getVocabularyId(word, lang) {
  const normalizedWord = String(word || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const normalizedLang = String(lang || 'und').trim().toLowerCase() || 'und';
  return normalizedWord ? `${normalizedLang}:${normalizedWord}` : '';
}

// ── 資料存取一律經 background 的 VOCABULARY_STORE 訊息（WS-E A1'''）──
// 原本的 chrome.storage.local 直寫 fallback 已移除：它只在 background 拒絕請求時
// 觸發（把被正確拒絕的資料裸寫進去）、寫入的資料又進不了權威 store，之後會被
// replaceAll 永久抹除。失敗一律往上拋，由 UI 層浮出錯誤讓使用者重試。

async function loadVocabularyItems() {
  const response = await requestVocabularyStore('list');
  return vocabularyMapFromList(response.items);
}

async function getVocabularyEntry(id) {
  const key = String(id || '').trim();
  if (!key) return null;
  const response = await requestVocabularyStore('get', { id: key });
  return response.item || null;
}

async function upsertVocabularyEntry(item) {
  const response = await requestVocabularyStore('upsert', { item });
  return response.item;
}

function vocabularyMapFromList(list) {
  return (Array.isArray(list) ? list : []).reduce((acc, item) => {
    if (item?.id) acc[item.id] = item;
    return acc;
  }, {});
}

async function requestVocabularyStore(action, payload = {}) {
  if (!chrome.runtime?.sendMessage) throw new Error('單字本資料層不可用');
  const response = await chrome.runtime.sendMessage({
    type: 'VOCABULARY_STORE',
    action,
    ...payload
  });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || '單字本資料層不可用');
  }
  return response;
}

async function isVocabularySaved(word, lang) {
  const id = getVocabularyId(word, lang);
  if (!id) return false;
  return Boolean(await getVocabularyEntry(id));
}

async function listVocabularyItems() {
  const items = await loadVocabularyItems();
  return Object.values(items).sort((a, b) => {
    const aTime = Date.parse(a.lastSeenAt || a.createdAt || 0) || 0;
    const bTime = Date.parse(b.lastSeenAt || b.createdAt || 0) || 0;
    return bTime - aTime;
  });
}

async function deleteVocabularyEntry(id) {
  const response = await requestVocabularyStore('delete', { id });
  return Boolean(response.deleted);
}

async function updateVocabularyEntryStatus(id, status) {
  const normalizedStatus = status === 'known' ? 'known' : 'learning';
  const existing = await getVocabularyEntry(id);
  if (!existing) return null;
  const updated = {
    ...existing,
    status: normalizedStatus,
    reviewedAt: new Date().toISOString()
  };
  updated.nextReviewAt = getVocabularyNextReviewAt(updated, updated.reviewedAt);
  return upsertVocabularyEntry(updated);
}

async function saveVocabularyEntry(dictData, selectedText) {
  const base = normalizeVocabularyEntry(dictData, selectedText);
  if (!base.id) throw new Error('無法收藏這個單字');

  const existing = await getVocabularyEntry(base.id);
  const now = new Date().toISOString();
  const source = buildVocabularySource(selectedText);
  const sources = mergeVocabularySources(existing?.sources || [], source);

  const item = {
    ...existing,
    ...base,
    sources,
    createdAt: existing?.createdAt || now,
    lastSeenAt: now,
    count: existing ? Number(existing.count || 1) + 1 : 1,
    status: existing?.status || 'learning',
    obsidianExportedAt: existing?.obsidianExportedAt || null
  };

  await upsertVocabularyEntry(item);
  return { item, isNew: !existing };
}

function normalizeVocabularyEntry(dictData = {}, selectedText = '') {
  const word = String(dictData.word || selectedText || '').trim();
  const lang = String(dictData.lang || '').trim() || detectVocabularyLang(word);
  const targetLang = String(dictData.targetLang || targetLanguage || 'zh-TW').trim();
  const translations = Array.isArray(dictData.translations)
    ? dictData.translations.map(item => String(item || '').trim()).filter(Boolean)
    : String(dictData.translations || '').split(/[;；]/).map(item => item.trim()).filter(Boolean);

  return {
    id: getVocabularyId(word, lang),
    word,
    lang,
    targetLang,
    phonetic: String(dictData.phonetic || '').trim(),
    pos: String(dictData.pos || '').trim(),
    translations,
    definition: String(dictData.definition || '').trim(),
    usage: String(dictData.usage || '').trim(),
    synonym: dictData.synonym?.word ? {
      word: String(dictData.synonym.word || '').trim(),
      diff: String(dictData.synonym.diff || '').trim()
    } : null,
    examples: Array.isArray(dictData.examples)
      ? dictData.examples.slice(0, 4).map(ex => ({
        src: String(ex.src || ex.en || '').trim(),
        zh: String(ex.zh || '').trim(),
        type: String(ex.type || 'general').trim()
      })).filter(ex => ex.src || ex.zh)
      : []
  };
}

function detectVocabularyLang(word) {
  if (/[\u3040-\u30ff]/.test(word)) return 'ja';
  if (/[\uac00-\ud7af]/.test(word)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(word)) return 'zh';
  return 'und';
}

function buildVocabularySource(selectedText) {
  const text = String(selectedText || '').trim();
  return {
    title: document.title || '',
    url: window.location.href,
    context: text.length > VOCABULARY_MAX_CONTEXT_CHARS
      ? `${text.slice(0, VOCABULARY_MAX_CONTEXT_CHARS)}…`
      : text,
    savedAt: new Date().toISOString()
  };
}

function mergeVocabularySources(existingSources, nextSource) {
  const sourceKey = `${nextSource.url}|${nextSource.context}`;
  const filtered = existingSources.filter(source => `${source.url}|${source.context}` !== sourceKey);
  return [nextSource, ...filtered].slice(0, VOCABULARY_MAX_SOURCES);
}

async function exportVocabularyEntryToObsidianIfConfigured(item) {
  const { obsidianDefaultFolder } = await chrome.storage.sync.get('obsidianDefaultFolder');
  const baseFolder = obsidianDefaultFolder?.trim();
  if (!baseFolder) return { exported: false, reason: 'missing-folder' };

  const folder = baseFolder.replace(/\/+$/, '');
  await appendVocabularyEntryToObsidian(item, folder);
  await markVocabularyEntryExported(item.id);
  return { exported: true, folder };
}

async function markVocabularyEntryExported(id) {
  const item = await getVocabularyEntry(id);
  if (!item) return;
  await upsertVocabularyEntry({
    ...item,
    obsidianExportedAt: new Date().toISOString()
  });
}

async function appendVocabularyEntryToObsidian(item, folderPath) {
  const { obsidianVault } = await chrome.storage.sync.get('obsidianVault');
  const week = getWeekLabel();
  const filePath = `${String(folderPath || '').replace(/\/+$/, '')}/${week}.md`;
  const block = buildVocabularyObsidianBlock(item);
  const encParts = [
    `filepath=${encodeURIComponent(filePath)}`,
    `data=${encodeURIComponent(block)}`,
    'mode=append',
    'newline=true'
  ];
  if (obsidianVault?.trim()) encParts.push(`vault=${encodeURIComponent(obsidianVault.trim())}`);

  obsidianSaving = true;
  chrome.runtime.sendMessage({ type: 'OBSIDIAN_URI', url: `obsidian://advanced-uri?${encParts.join('&')}` }).catch(() => {});
  setTimeout(() => { obsidianSaving = false; }, 4000);
}

function buildVocabularyObsidianBlock(item) {
  const source = item.sources?.[0] || {};
  const translations = Array.isArray(item.translations) ? item.translations.join('；') : '';
  const lines = [
    '',
    `## ${formatVocabularyDate(new Date())}`,
    '',
    `### ${item.word || ''}`,
    ''
  ];

  if (item.pos) lines.push(`- 詞性：${item.pos}`);
  if (item.phonetic) lines.push(`- 音標：${item.phonetic}`);
  if (translations) lines.push(`- 涵義：${translations}`);
  if (item.definition) lines.push(`- 解釋：${item.definition}`);
  if (item.usage) lines.push(`- 用法：${item.usage}`);
  if (item.synonym?.word) {
    lines.push(`- 近義詞：${item.synonym.word}`);
    if (item.synonym.diff) lines.push(`  - 差異：${item.synonym.diff}`);
  }
  if (item.examples?.length) {
    lines.push('- 例句：');
    item.examples.slice(0, 2).forEach(ex => {
      if (ex.src) lines.push(`  - ${ex.src}`);
      if (ex.zh) lines.push(`  - ${ex.zh}`);
    });
  }
  if (source.title || source.url) {
    const title = source.title || source.url;
    lines.push(`- 來源：[${escapeMarkdownLinkText(title)}](${source.url || ''})`);
  }
  lines.push(`- Tags：#翻翻吧 #vocab/${item.lang || 'und'}`);
  lines.push('');
  return lines.join('\n');
}

function buildVocabularyMarkdownExport(items) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';
  return list.map(item => buildVocabularyObsidianBlock(item).trim()).filter(Boolean).join('\n\n---\n\n');
}

function buildVocabularyCsvExport(items) {
  const list = Array.isArray(items) ? items : [];
  const header = [
    'word',
    'lang',
    'translations',
    'definition',
    'sourceTitle',
    'sourceUrl',
    'createdAt',
    'count'
  ];
  const rows = list.map(item => {
    const source = item.sources?.[0] || {};
    return [
      item.word || '',
      item.lang || '',
      Array.isArray(item.translations) ? item.translations.join('；') : '',
      item.definition || '',
      source.title || '',
      source.url || '',
      item.createdAt || '',
      Number(item.count || 1)
    ];
  });

  return `\ufeff${[header, ...rows].map(row => row.map(escapeVocabularyCsvCell).join(',')).join('\r\n')}`;
}

function buildVocabularyReviewQueue(items = [], options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const limit = Number(options.limit || 20);
  return (Array.isArray(items) ? items : [])
    .map(item => buildVocabularyReviewQueueItem(item, now))
    .filter(Boolean)
    .sort((a, b) => {
      if (a.due !== b.due) return a.due ? -1 : 1;
      const aPriority = a.status === 'learning' ? 0 : 1;
      const bPriority = b.status === 'learning' ? 0 : 1;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aTime = Date.parse(a.nextReviewAt || a.lastSeenAt || a.createdAt || 0) || 0;
      const bTime = Date.parse(b.nextReviewAt || b.lastSeenAt || b.createdAt || 0) || 0;
      if (aTime !== bTime) return aTime - bTime;
      return String(a.word || '').localeCompare(String(b.word || ''));
    })
    .slice(0, limit);
}

function buildVocabularyWeakReviewQueue(items = [], options = {}) {
  return buildVocabularyReviewQueue(items, {
    ...options,
    limit: options.limit || 50
  }).filter(item => item.status !== 'known');
}

function buildVocabularyReviewQueueItem(item, now) {
  if (!item?.id) return null;
  const nextReviewAt = item.nextReviewAt || getVocabularyNextReviewAt(item, item.reviewedAt || item.createdAt || item.lastSeenAt);
  const due = !nextReviewAt || Date.parse(nextReviewAt) <= now.getTime();
  return {
    ...item,
    nextReviewAt,
    due,
    reviewReason: due ? 'due' : 'scheduled'
  };
}

function getVocabularyNextReviewAt(item, reviewedAt = new Date().toISOString()) {
  const reviewedTime = Date.parse(reviewedAt || '');
  if (!Number.isFinite(reviewedTime)) return '';
  const status = item?.status === 'known' ? 'known' : 'learning';
  const intervalDays = item?.reviewedAt
    ? VOCABULARY_SRS_INTERVAL_DAYS[status]
    : VOCABULARY_SRS_INTERVAL_DAYS.new;
  return new Date(reviewedTime + intervalDays * 24 * 60 * 60 * 1000).toISOString();
}

function escapeVocabularyCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function isVocabularyItemFromToday(item) {
  const date = new Date(item.createdAt || item.lastSeenAt || 0);
  if (Number.isNaN(date.getTime())) return false;
  return formatVocabularyDate(date) === formatVocabularyDate(new Date());
}

function formatVocabularyDate(date) {
  return date.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function escapeMarkdownLinkText(text) {
  return String(text || '').replace(/[\[\]]/g, '');
}
