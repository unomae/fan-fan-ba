'use strict';

const VOCABULARY_MAX_SOURCES = 5;
const VOCABULARY_MAX_CONTEXT_CHARS = 180;
const VOCABULARY_SRS_INTERVAL_DAYS = {
  new: 0,
  learning: 1,
  known: 7
};
// 四級評分（簡化 SM-2）：ease 預設 2.5、下限 1.3；間隔以天計、上限 365 天
const VOCABULARY_SRS_DEFAULT_EASE = 2.5;
const VOCABULARY_SRS_MIN_EASE = 1.3;
const VOCABULARY_SRS_MAX_INTERVAL_DAYS = 365;
const VOCABULARY_SRS_GRADES = ['again', 'hard', 'good', 'easy'];
const VOCABULARY_DAY_MS = 24 * 60 * 60 * 1000;

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

// 列表上的「我記得了／還不熟」切換：間隔與次數套用舊資料的對照值，ease 保留
async function updateVocabularyEntryStatus(id, status) {
  const normalizedStatus = status === 'known' ? 'known' : 'learning';
  const existing = await getVocabularyEntry(id);
  if (!existing) return null;
  const reviewedAt = new Date().toISOString();
  const defaults = getVocabularySrsDefaults(normalizedStatus);
  const updated = {
    ...existing,
    status: normalizedStatus,
    ease: getVocabularySrsState(existing).ease,
    intervalDays: defaults.intervalDays,
    reps: defaults.reps,
    reviewedAt,
    nextReviewAt: addVocabularyDays(reviewedAt, defaults.intervalDays)
  };
  return upsertVocabularyEntry(updated);
}

// 複習卡的四級評分：算出下一次排程後整筆寫回
async function reviewVocabularyEntry(id, grade) {
  const existing = await getVocabularyEntry(id);
  if (!existing) return null;
  return upsertVocabularyEntry({
    ...existing,
    ...scheduleVocabularyReview(existing, grade, new Date().toISOString())
  });
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
  const response = await appendVocabularyEntryToObsidian(item, folder);
  // 只有 background 確認已開啟 URI（ok !== false）才蓋 exported 章，
  // 失敗的單字保持未匯出，之後才能重試（review 2026-08-26：原實作吞錯造成假成功）
  if (response?.ok === false) {
    return { exported: false, reason: response.error || 'obsidian-error', folder };
  }
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
  try {
    return await chrome.runtime
      .sendMessage({ type: 'OBSIDIAN_URI', url: `obsidian://advanced-uri?${encParts.join('&')}` })
      .catch(error => ({ ok: false, error: error?.message || 'sendMessage failed' }));
  } finally {
    setTimeout(() => { obsidianSaving = false; }, 4000);
  }
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

function addVocabularyDays(isoTime, days) {
  return new Date(Date.parse(isoTime) + days * VOCABULARY_DAY_MS).toISOString();
}

function roundVocabularyEase(value) {
  return Math.max(VOCABULARY_SRS_MIN_EASE, Math.round(value * 100) / 100);
}

function getVocabularySrsDefaults(status) {
  return status === 'known'
    ? { ease: VOCABULARY_SRS_DEFAULT_EASE, intervalDays: VOCABULARY_SRS_INTERVAL_DAYS.known, reps: 1 }
    : { ease: VOCABULARY_SRS_DEFAULT_EASE, intervalDays: VOCABULARY_SRS_INTERVAL_DAYS.learning, reps: 0 };
}

// 讀出目前的排程狀態。舊條目只有 status，這裡才推導初始值（不批次改寫 storage）。
// 只有在「nextReviewAt − reviewedAt 剛好等於 intervalDays」時才信任存著的欄位：
// 尚未升級的裝置只會改 status 與兩個日期、把這三欄原樣留著，日期對不上就代表
// 欄位已過時，改以 status 對照值為準（ease 仍可沿用）。
function getVocabularySrsState(item) {
  const defaults = getVocabularySrsDefaults(item?.status === 'known' ? 'known' : 'learning');
  const ease = Number(item?.ease);
  const intervalDays = Number(item?.intervalDays);
  const reps = Number(item?.reps);
  const easeValid = typeof item?.ease === 'number' && Number.isFinite(ease) && ease >= VOCABULARY_SRS_MIN_EASE;
  const fieldsValid = easeValid
    && typeof item?.intervalDays === 'number' && Number.isInteger(intervalDays) && intervalDays >= 1
    && typeof item?.reps === 'number' && Number.isInteger(reps) && reps >= 0;
  if (!fieldsValid) return easeValid ? { ...defaults, ease } : defaults;
  const spanDays = (Date.parse(item.nextReviewAt) - Date.parse(item.reviewedAt)) / VOCABULARY_DAY_MS;
  if (!Number.isFinite(spanDays) || Math.abs(spanDays - intervalDays) > 0.01) return { ...defaults, ease };
  return { ease, intervalDays, reps };
}

// 簡化 SM-2。忘了：重來、隔天；吃力：間隔 ×1.2；記得：首次 1 天、之後 ×ease；
// 很熟：首次 4 天、之後 ×ease×1.3。status 跟著這次評分：忘了／吃力＝還不熟、記得／很熟＝已記得，
// 讓「已記得／還不熟／錯題回看」篩選維持「上一次複習結果」的意思。
function computeVocabularySrs(state, grade) {
  const { ease, intervalDays, reps } = state;
  const cap = days => Math.min(VOCABULARY_SRS_MAX_INTERVAL_DAYS, Math.max(1, Math.round(days)));
  const good = reps === 0 ? 1 : cap(Math.max(intervalDays + 1, intervalDays * ease));
  if (grade === 'again') return { ease: roundVocabularyEase(ease - 0.2), intervalDays: 1, reps: 0 };
  if (grade === 'hard') return { ease: roundVocabularyEase(ease - 0.15), intervalDays: cap(intervalDays * 1.2), reps: reps + 1 };
  if (grade === 'good') return { ease, intervalDays: good, reps: reps + 1 };
  const easy = reps === 0 ? 4 : cap(Math.max(good + 1, intervalDays * ease * 1.3));
  return { ease: roundVocabularyEase(ease + 0.15), intervalDays: easy, reps: reps + 1 };
}

function scheduleVocabularyReview(item, grade, reviewedAt = new Date().toISOString()) {
  if (!VOCABULARY_SRS_GRADES.includes(grade)) throw new Error('未知的複習評分');
  const next = computeVocabularySrs(getVocabularySrsState(item), grade);
  return {
    status: grade === 'again' || grade === 'hard' ? 'learning' : 'known',
    ...next,
    reviewedAt,
    nextReviewAt: addVocabularyDays(reviewedAt, next.intervalDays)
  };
}

// 按鈕提示用：每一級按下去後幾天再複習
function previewVocabularyReviewIntervals(item) {
  const state = getVocabularySrsState(item);
  return VOCABULARY_SRS_GRADES.reduce((acc, grade) => {
    acc[grade] = computeVocabularySrs(state, grade).intervalDays;
    return acc;
  }, {});
}

// CSV 公式注入防護（2026-08-13 TC-F3-004 實測抓到）：Excel／Sheets 會把
// `=` `+` `-` `@`（含前導 tab / CR）開頭的儲存格當公式算，單字本的 word 與
// definition 都是從網頁抓來的外部文字，`=cmd|' /C calc'!A0` 這種值一路貼進
// 試算表就會被執行。補一個單引號讓它維持純文字（試算表顯示時不會出現該引號）。
// 順序重要：先補前綴、再做引號包裹，含逗號的惡意值才會變成 "'=..." 而不是 "..."。
function escapeVocabularyCsvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
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
