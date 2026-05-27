'use strict';

const VOCABULARY_HIGHLIGHT_LIMITS = {
  maxTerms: 80,
  maxTextNodes: 800,
  maxMarks: 80,
  minTermLength: 2
};

let vocabularyHighlightEnabled = false;
let vocabularyHighlightTooltip = null;

function getVocabularyHighlightStorageKey() {
  const host = location.hostname || 'local-file';
  return `fanFanBaVocabularyHighlight:${host}`;
}

async function restoreVocabularyHighlightState() {
  try {
    vocabularyHighlightEnabled = (await getVocabularyHighlightMode()) === 'auto';
    if (vocabularyHighlightEnabled) await applyVocabularyHighlights();
    updateFloatingBallVocabularyHighlightState?.(vocabularyHighlightEnabled);
  } catch {
    vocabularyHighlightEnabled = false;
  }
}

async function toggleVocabularyHighlightForSite() {
  const next = !vocabularyHighlightEnabled;
  await setVocabularyHighlightMode(next ? 'auto' : 'off');
  return vocabularyHighlightEnabled;
}

async function setVocabularyHighlightMode(mode = 'off') {
  const normalized = mode === 'auto' ? 'auto' : 'off';
  vocabularyHighlightEnabled = normalized === 'auto';
  if (chrome.storage.sync?.set) {
    await chrome.storage.sync.set({ vocabularyHighlightMode: normalized });
  } else {
    await chrome.storage.local.set({ [getVocabularyHighlightStorageKey()]: vocabularyHighlightEnabled });
  }
  if (vocabularyHighlightEnabled) await applyVocabularyHighlights();
  else clearVocabularyHighlights();
  updateFloatingBallVocabularyHighlightState?.(vocabularyHighlightEnabled);
  return vocabularyHighlightEnabled;
}

async function getVocabularyHighlightMode() {
  if (chrome.storage.sync?.get) {
    const { vocabularyHighlightMode = 'off' } = await chrome.storage.sync.get({ vocabularyHighlightMode: 'off' });
    return vocabularyHighlightMode === 'auto' ? 'auto' : 'off';
  }
  const key = getVocabularyHighlightStorageKey();
  const data = await chrome.storage.local.get(key);
  return data[key] ? 'auto' : 'off';
}

async function applyVocabularyHighlights() {
  clearVocabularyHighlights();
  const terms = buildVocabularyHighlightTerms(await listVocabularyItems?.());
  if (!terms.length || !document.body) return 0;

  const pattern = terms.map(term => escapeVocabularyHighlightRegExp(term.word)).join('|');
  const matcher = new RegExp(pattern, 'giu');
  const termMap = new Map(terms.map(term => [term.word.toLowerCase(), term]));
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      if (shouldSkipVocabularyHighlightNode(node.parentElement)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (nodes.length < VOCABULARY_HIGHLIGHT_LIMITS.maxTextNodes) {
    const node = walker.nextNode();
    if (!node) break;
    nodes.push(node);
  }

  let markCount = 0;
  for (const node of nodes) {
    if (markCount >= VOCABULARY_HIGHLIGHT_LIMITS.maxMarks) break;
    const result = buildVocabularyHighlightFragment(node, matcher, termMap, markCount);
    if (!result) continue;
    node.parentNode?.replaceChild(result.fragment, node);
    markCount = result.markCount;
  }
  return markCount;
}

function buildVocabularyHighlightTerms(items) {
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  return list
    .map(item => {
      const word = String(item.word || '').trim();
      const normalized = word.toLowerCase();
      if (!word || seen.has(normalized)) return null;
      seen.add(normalized);
      return { word, item };
    })
    .filter(term => term && term.word.length >= VOCABULARY_HIGHLIGHT_LIMITS.minTermLength)
    .sort((a, b) => b.word.length - a.word.length)
    .slice(0, VOCABULARY_HIGHLIGHT_LIMITS.maxTerms);
}

function buildVocabularyHighlightFragment(node, matcher, termMap, currentMarkCount) {
  const text = node.nodeValue || '';
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  let markCount = currentMarkCount;
  let changed = false;
  matcher.lastIndex = 0;

  for (const match of text.matchAll(matcher)) {
    if (markCount >= VOCABULARY_HIGHLIGHT_LIMITS.maxMarks) break;
    const value = match[0];
    const index = match.index ?? 0;
    if (index < lastIndex) continue;
    const term = termMap.get(value.toLowerCase());
    if (!term || !isVocabularyHighlightBoundary(text, index, value)) continue;

    if (index > lastIndex) fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    fragment.appendChild(createVocabularyHighlightMark(value, term.item));
    markCount += 1;
    changed = true;
    lastIndex = index + value.length;
  }

  if (!changed) return null;
  if (lastIndex < text.length) fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  return { fragment, markCount };
}

function createVocabularyHighlightMark(text, item) {
  const mark = document.createElement('mark');
  mark.className = 'g-vocab-highlight';
  mark.textContent = text;
  mark.dataset.vocabId = item.id || '';
  mark.dataset.vocabWord = item.word || text;
  mark.dataset.vocabMeaning = Array.isArray(item.translations) ? item.translations.slice(0, 2).join('；') : '';
  mark.dataset.vocabCount = String(Number(item.count || 1));
  mark.addEventListener('mouseenter', showVocabularyHighlightTooltip);
  mark.addEventListener('focus', showVocabularyHighlightTooltip);
  mark.addEventListener('mouseleave', hideVocabularyHighlightTooltip);
  mark.addEventListener('blur', hideVocabularyHighlightTooltip);
  return mark;
}

function showVocabularyHighlightTooltip(event) {
  const mark = event.currentTarget;
  if (!mark) return;
  if (!vocabularyHighlightTooltip) {
    vocabularyHighlightTooltip = document.createElement('div');
    vocabularyHighlightTooltip.className = 'g-vocab-highlight-tip';
    document.body.appendChild(vocabularyHighlightTooltip);
  }

  const word = mark.dataset.vocabWord || mark.textContent || '';
  const meaning = mark.dataset.vocabMeaning || '已收藏';
  const count = mark.dataset.vocabCount || '1';
  vocabularyHighlightTooltip.innerHTML = `
    <strong>${escapeHtml(word)}</strong>
    <span>${escapeHtml(meaning)}</span>
    <em>遇到 ${escapeHtml(count)} 次</em>
  `;
  const rect = mark.getBoundingClientRect();
  vocabularyHighlightTooltip.style.left = `${Math.min(rect.left, window.innerWidth - 220)}px`;
  vocabularyHighlightTooltip.style.top = `${Math.max(8, rect.bottom + 6)}px`;
  vocabularyHighlightTooltip.classList.add('g-show');
}

function hideVocabularyHighlightTooltip() {
  vocabularyHighlightTooltip?.classList.remove('g-show');
}

function clearVocabularyHighlights() {
  hideVocabularyHighlightTooltip();
  document.querySelectorAll('mark.g-vocab-highlight').forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
    parent.normalize?.();
  });
}

function shouldSkipVocabularyHighlightNode(el) {
  if (!el) return true;
  return Boolean(el.closest([
    '#gemini-ai-toolbar',
    '#gemini-result-card',
    '#fanfanba-floating',
    '.ffb-page-translation-panel',
    '.ffb-page-translation-block',
    '.g-vocab-highlight',
    '.g-vocab-highlight-tip',
    'script',
    'style',
    'noscript',
    'svg',
    'canvas',
    'pre',
    'code',
    'kbd',
    'samp',
    'textarea',
    'input',
    'select',
    'button',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    '[contenteditable="true"]',
    '[aria-hidden="true"]'
  ].join(',')));
}

function isVocabularyHighlightBoundary(text, index, value) {
  if (!/^[a-z0-9][a-z0-9' -]*$/i.test(value)) return true;
  const before = index > 0 ? text[index - 1] : '';
  const after = text[index + value.length] || '';
  return !/[a-z0-9_]/i.test(before) && !/[a-z0-9_]/i.test(after);
}

function escapeVocabularyHighlightRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
