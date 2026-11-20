'use strict';

const VOCABULARY_HIGHLIGHT_LIMITS = {
  maxTerms: 80,
  maxTextNodes: 800,
  maxMarks: 80,
  minTermLength: 2,
  rescanDelayMs: 250 // 網頁內容變動後的防抖動時間
};

let vocabularyHighlightEnabled = false;
let vocabularyHighlightMatcher = null; // 最近一次整頁掃描用的比對器，補標記時沿用
let vocabularyHighlightObserver = null;
let vocabularyHighlightPendingRoots = new Set();
let vocabularyHighlightRescanTimer = null;
let vocabularyHighlightTooltip = null;
let vocabularyHighlightUserToggled = false; // 使用者按過浮球開關就不讓初始讀取蓋回去
let vocabularyHighlightRunId = 0; // 避免讀取期間關閉或重啟造成的非同步競態

function getVocabularyHighlightStorageKey() {
  const host = location.hostname || 'local-file';
  return `fanFanBaVocabularyHighlight:${host}`;
}

async function restoreVocabularyHighlightState() {
  try {
    const restored = (await getVocabularyHighlightMode()) === 'auto';
    // 讀取飛行中使用者可能已按過浮球開關，此時不得把手動狀態蓋回去
    // （與收藏按鈕的 state-clobber race 同型，WS-E A1'''）
    if (vocabularyHighlightUserToggled) return;
    vocabularyHighlightEnabled = restored;
    if (vocabularyHighlightEnabled) await applyVocabularyHighlights();
    globalThis.updateFloatingBallVocabularyHighlightState?.(vocabularyHighlightEnabled);
  } catch {
    if (!vocabularyHighlightUserToggled) vocabularyHighlightEnabled = false;
  }
}

async function toggleVocabularyHighlightForSite() {
  vocabularyHighlightUserToggled = true;
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
  else {
    vocabularyHighlightRunId += 1; // 作廢飛行中的 applyVocabularyHighlights，避免讀取回來後仍畫上 mark
    stopVocabularyHighlightObserver();
    clearVocabularyHighlights();
  }
  globalThis.updateFloatingBallVocabularyHighlightState?.(vocabularyHighlightEnabled);
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
  const runId = ++vocabularyHighlightRunId;
  clearVocabularyHighlights();
  vocabularyHighlightMatcher = null;
  let allItems;
  try {
    allItems = await listVocabularyItems?.();
  } catch {
    return 0; // 讀取失敗＝跳過高亮（純顯示層降級）；資料層錯誤由主要 UI 浮出（WS-E A1'''）
  }
  // 讀取單字本期間若已關閉高亮（runId 被遞增）或啟動新一輪掃描，此時不標記也不啟動監聽
  if (runId !== vocabularyHighlightRunId) return 0;
  const terms = buildVocabularyHighlightTerms(allItems);
  if (!terms.length || !document.body) return 0;

  const pattern = terms.map(term => escapeVocabularyHighlightRegExp(term.word)).join('|');
  vocabularyHighlightMatcher = {
    matcher: new RegExp(pattern, 'giu'),
    termMap: new Map(terms.map(term => [term.word.toLowerCase(), term]))
  };
  const markCount = highlightVocabularyWithin(document.body, 0);
  if (vocabularyHighlightEnabled && runId === vocabularyHighlightRunId) startVocabularyHighlightObserver();
  return markCount;
}

// 在 root 底下標記單字；markCount 是整頁已有的標記數，用來守住整頁上限
function highlightVocabularyWithin(root, markCount) {
  if (!vocabularyHighlightMatcher || markCount >= VOCABULARY_HIGHLIGHT_LIMITS.maxMarks) return markCount;
  const { matcher, termMap } = vocabularyHighlightMatcher;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
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

  for (const node of nodes) {
    if (markCount >= VOCABULARY_HIGHLIGHT_LIMITS.maxMarks) break;
    const result = buildVocabularyHighlightFragment(node, matcher, termMap, markCount);
    if (!result) continue;
    node.parentNode?.replaceChild(result.fragment, node);
    markCount = result.markCount;
  }
  // 丟掉自己插入標記產生的變動紀錄，避免回頭再掃一次
  vocabularyHighlightObserver?.takeRecords();
  return markCount;
}

// 網頁內容變動（無限捲動、SPA 換頁）後，只對新增或改動的區塊補標記
function startVocabularyHighlightObserver() {
  if (vocabularyHighlightObserver || typeof MutationObserver === 'undefined' || !document.body) return;
  vocabularyHighlightObserver = new MutationObserver(records => {
    for (const record of records) {
      const targets = record.type === 'characterData' ? [record.target] : [...record.addedNodes];
      for (const node of targets) {
        const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
        if (!el || !el.isConnected || shouldSkipVocabularyHighlightNode(el)) continue;
        vocabularyHighlightPendingRoots.add(el);
      }
    }
    if (!vocabularyHighlightPendingRoots.size || vocabularyHighlightRescanTimer) return;
    vocabularyHighlightRescanTimer = setTimeout(flushVocabularyHighlightRescan, VOCABULARY_HIGHLIGHT_LIMITS.rescanDelayMs);
  });
  vocabularyHighlightObserver.observe(document.body, { childList: true, characterData: true, subtree: true });
}

function flushVocabularyHighlightRescan() {
  vocabularyHighlightRescanTimer = null;
  const roots = [...vocabularyHighlightPendingRoots];
  vocabularyHighlightPendingRoots = new Set();
  if (!vocabularyHighlightEnabled) return;
  let markCount = document.querySelectorAll('mark.g-vocab-highlight').length;
  for (const root of roots) {
    // 已被其他待掃區塊包住的就跳過，避免同一段掃兩次
    if (!root.isConnected || roots.some(other => other !== root && other.contains(root))) continue;
    markCount = highlightVocabularyWithin(root, markCount);
    if (markCount >= VOCABULARY_HIGHLIGHT_LIMITS.maxMarks) break;
  }
}

function stopVocabularyHighlightObserver() {
  vocabularyHighlightObserver?.disconnect();
  vocabularyHighlightObserver = null;
  if (vocabularyHighlightRescanTimer) clearTimeout(vocabularyHighlightRescanTimer);
  vocabularyHighlightRescanTimer = null;
  vocabularyHighlightPendingRoots = new Set();
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
  ffbClear(vocabularyHighlightTooltip).append(
    ffbEl('strong', null, word),
    ffbEl('span', null, meaning),
    ffbEl('em', null, `遇到 ${count} 次`)
  );
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
