'use strict';

const PAGE_TRANSLATION_LIMITS = {
  maxBlocks: 8,
  maxChars: 3200,
  minChars: 24,
  minHeadingChars: 4,
  minListChars: 8,
  maxBlockChars: 1200,
  collapseChars: 420
};

const pageTranslationPairs = new Map();
let pageTranslationPairCounter = 0;
let pageTranslationModel = null;

let pageTranslationState = {
  running: false,
  stopped: false,
  activated: false,
  canContinue: false,
  scrollBound: false,
  scrollTimer: null,
  selectionBound: false,
  activePairId: null,
  mode: 'bilingual',
  density: 'compact',
  items: [],
  done: 0,
  errors: 0,
  total: 0
};

function startPageTranslationBeta() {
  if (pageTranslationState.running) {
    updatePageTranslationPanel();
    return;
  }

  const items = collectVisibleTranslatableBlocks();
  ensurePageTranslationPanel();
  pageTranslationState = {
    running: items.length > 0,
    stopped: false,
    activated: true,
    canContinue: false,
    scrollBound: pageTranslationState.scrollBound,
    scrollTimer: pageTranslationState.scrollTimer,
    selectionBound: pageTranslationState.selectionBound,
    activePairId: pageTranslationState.activePairId,
    mode: pageTranslationState.mode || 'bilingual',
    density: pageTranslationState.density || 'compact',
    items,
    done: 0,
    errors: 0,
    total: items.length
  };
  setPageTranslationMode(pageTranslationState.mode);
  setPageTranslationDensity(pageTranslationState.density);
  bindPageTranslationScrollWatcher();
  bindPageTranslationSelectionWatcher();
  updateFloatingBallPageTranslationState?.(pageTranslationState);

  if (!items.length) {
    updatePageTranslationPanel('目前沒有新段落');
    schedulePageTranslationAvailabilityCheck();
    return;
  }

  updatePageTranslationPanel();
  runPageTranslationQueue();
}

function collectVisibleTranslatableBlocks() {
  const selector = [
    'main h1', 'main h2', 'main h3', 'main p', 'main li',
    'article h1', 'article h2', 'article h3', 'article p', 'article li',
    '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
    '[role="main"] p', '[role="main"] li',
    'h1', 'h2', 'h3', 'p', 'li', 'blockquote'
  ].join(',');
  const seen = new Set();
  const items = [];
  let charCount = 0;

  document.querySelectorAll(selector).forEach(el => {
    if (items.length >= PAGE_TRANSLATION_LIMITS.maxBlocks) return;
    if (seen.has(el) || !isPageTranslatableElement(el)) return;
    const text = getElementTranslationText(el);
    if (!text) return;
    if (charCount + text.length > PAGE_TRANSLATION_LIMITS.maxChars) return;
    seen.add(el);
    charCount += text.length;
    items.push({ el, text, pairId: createPageTranslationPairId(), status: 'pending', translationNode: null, translatedText: '' });
  });

  return items;
}

function hasVisibleTranslatableBlocks() {
  return collectVisibleTranslatableBlocks().length > 0;
}

function createPageTranslationPairId() {
  pageTranslationPairCounter += 1;
  return `ffb-pair-${Date.now().toString(36)}-${pageTranslationPairCounter}`;
}

function isPageTranslatableElement(el) {
  if (!el || el.closest('#gemini-ai-toolbar, #gemini-result-card, #fanfanba-floating, .ffb-page-translation-panel, .ffb-page-translation-block')) return false;
  if (el.closest('script, style, noscript, svg, canvas, pre, code, kbd, samp, textarea, input, select, button, nav, header, footer, aside, form, [contenteditable="true"], [aria-hidden="true"]')) return false;
  if (el.classList.contains('ffb-page-source-translated')) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 12) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  return true;
}

function getElementTranslationText(el) {
  const text = getElementStructuredTranslationText(el);
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (!compactText) return '';
  const minChars = getElementMinTranslationChars(el);
  if (compactText.length < minChars) return '';
  if (text.length > PAGE_TRANSLATION_LIMITS.maxBlockChars) return '';
  if (/^[\d\s.,:;!?()[\]{}'"\-•・、。]+$/.test(compactText)) return '';
  return text;
}

function getElementStructuredTranslationText(el) {
  let text = (el.innerText || el.textContent || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();

  if (el.tagName === 'LI' && text && !isPageTranslationListLine(text)) {
    text = `${getPageTranslationListMarker(el)} ${text}`;
  }
  return text;
}

function getElementMinTranslationChars(el) {
  if (/^H[1-6]$/.test(el.tagName)) return PAGE_TRANSLATION_LIMITS.minHeadingChars;
  if (el.tagName === 'LI') return PAGE_TRANSLATION_LIMITS.minListChars;
  return PAGE_TRANSLATION_LIMITS.minChars;
}

function getPageTranslationListMarker(el) {
  const parent = el.parentElement;
  if (parent?.tagName === 'OL') {
    const start = Number.parseInt(parent.getAttribute('start') || '1', 10);
    const index = Array.prototype.indexOf.call(parent.children, el);
    return `${(Number.isFinite(start) ? start : 1) + Math.max(index, 0)}.`;
  }
  return '•';
}

function isPageTranslationListLine(text) {
  return /^\s*(?:[-*•・‧]|[0-9０-９]+[.)．、])\s+/.test(String(text || ''));
}

async function runPageTranslationQueue() {
  updateFloatingBallPageTranslationState?.(pageTranslationState);
  for (const item of pageTranslationState.items) {
    if (pageTranslationState.stopped) break;
    await translatePageItem(item);
    updatePageTranslationPanel();
  }
  pageTranslationState.running = false;
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel(pageTranslationState.stopped ? '已停止' : '可見區域翻譯完成');
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

async function translatePageItem(item) {
  if (!item.el.isConnected) return;
  item.status = 'loading';
  item.el.classList.add('ffb-page-source-translated');
  item.el.dataset.ffbPairId = item.pairId;
  bindPageTranslationSourceEvents(item.el);
  item.translationNode?.remove();
  item.translationNode = createPageTranslationBlock(item);
  applyPageTranslationSourceTypography(item.el, item.translationNode);
  item.el.insertAdjacentElement('afterend', item.translationNode);
  pageTranslationPairs.set(item.pairId, {
    sourceEl: item.el,
    translationEl: item.translationNode,
    sourceText: item.text,
    translatedText: ''
  });

  try {
    const result = cleanPageTranslationResult(await requestPageTranslation(item.text), item.text);
    item.status = 'done';
    item.translatedText = result;
    pageTranslationPairs.set(item.pairId, {
      sourceEl: item.el,
      translationEl: item.translationNode,
      sourceText: item.text,
      translatedText: result
    });
    pageTranslationState.done += 1;
    renderPageTranslationResult(item, result);
  } catch (error) {
    item.status = 'error';
    pageTranslationState.errors += 1;
    renderPageTranslationError(item, error.message || '翻譯失敗');
  }
}

function requestPageTranslation(text) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error('擴充功能已更新，請重新整理頁面'));
      return;
    }
    chrome.runtime.sendMessage({
      type: 'GEMINI_REQUEST',
      action: 'translate',
      selectedText: text,
      context: text,
      pageTitle: document.title,
      model: getPageTranslationModel(),
      targetLanguage,
      explanationLanguage,
      browserLanguage: navigator.language || ''
    }, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || '連線失敗'));
        return;
      }
      if (!response) {
        reject(new Error('無回應'));
        return;
      }
      if (response.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response.result || '');
    });
  });
}

function cleanPageTranslationResult(rawResult, sourceText) {
  let result = String(rawResult || '')
    .replace(/```(?:\w+)?/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const translationLabel = /(?:^|\n)\s*(?:譯文|译文|翻譯|翻译|translation|translated text)\s*[：:]\s*/i;
  const labelMatch = result.match(translationLabel);
  if (labelMatch?.index !== undefined) {
    result = result.slice(labelMatch.index + labelMatch[0].length).trim();
  }

  const normalizedSource = normalizePageTranslationComparableText(sourceText);
  result = result
    .split('\n')
    .map(line => line.trim())
    .filter(line => {
      if (!line) return false;
      if (/^(?:原文|source|original)\s*[：:]/i.test(line)) return false;
      return normalizePageTranslationComparableText(stripOuterPageTranslationQuotes(line)) !== normalizedSource;
    })
    .join('\n')
    .trim();

  result = result.replace(/^(?:譯文|译文|翻譯|翻译|translation|translated text)\s*[：:]\s*/i, '').trim();
  result = stripOuterPageTranslationQuotes(result);
  return result || String(rawResult || '').trim();
}

function normalizePageTranslationComparableText(text) {
  return String(text || '')
    .replace(/[「」『』“”‘’"'`]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function stripOuterPageTranslationQuotes(text) {
  let value = String(text || '').trim();
  const pairs = [['「', '」'], ['『', '』'], ['“', '”'], ['"', '"'], ["'", "'"]];
  for (const [open, close] of pairs) {
    if (value.startsWith(open) && value.endsWith(close)) {
      value = value.slice(open.length, -close.length).trim();
      break;
    }
  }
  return value;
}

function createPageTranslationBlock(item) {
  const block = document.createElement(item.el.tagName === 'LI' ? 'li' : 'div');
  block.className = 'ffb-page-translation-block ffb-page-translation-loading';
  block.dataset.ffbPairId = item.pairId;
  block.innerHTML = `
    <div class="ffb-page-translation-head">
      <span class="ffb-page-translation-mark" title="翻翻吧譯文" aria-label="翻翻吧譯文">文</span>
    </div>
    <div class="ffb-page-translation-text">翻譯中...</div>
  `;
  bindPageTranslationBlockEvents(block);
  return block;
}

function applyPageTranslationSourceTypography(sourceEl, block) {
  if (!sourceEl || !block) return;
  const style = window.getComputedStyle(sourceEl);
  const fontSize = style.fontSize || '14px';
  const lineHeight = normalizePageTranslationLineHeight(style.lineHeight, fontSize);
  block.style.setProperty('--ffb-page-source-font-size', fontSize);
  block.style.setProperty('--ffb-page-source-line-height', lineHeight);
}

function normalizePageTranslationLineHeight(lineHeight, fontSize) {
  if (!lineHeight || lineHeight === 'normal') return '1.72';
  const lineHeightNumber = Number.parseFloat(lineHeight);
  const fontSizeNumber = Number.parseFloat(fontSize);
  if (!Number.isFinite(lineHeightNumber) || !Number.isFinite(fontSizeNumber) || fontSizeNumber <= 0) {
    return '1.72';
  }
  if (lineHeight.endsWith('px')) {
    return String(Math.min(Math.max(lineHeightNumber / fontSizeNumber, 1.35), 2.05));
  }
  return lineHeight;
}

function renderPageTranslationResult(item, result) {
  if (!item.translationNode) return;
  item.translationNode.classList.remove('ffb-page-translation-loading', 'ffb-page-translation-error');
  const shouldCollapse = result.length > PAGE_TRANSLATION_LIMITS.collapseChars;
  item.translationNode.classList.toggle('ffb-page-collapsible', shouldCollapse);
  item.translationNode.classList.toggle('ffb-page-collapsed', shouldCollapse);
  item.translationNode.classList.toggle('ffb-page-long', shouldCollapse);
  item.translationNode.innerHTML = `
    <div class="ffb-page-translation-head">
      <span class="ffb-page-translation-mark" title="翻翻吧譯文" aria-label="翻翻吧譯文">文</span>
      <div class="ffb-page-translation-actions">
        ${shouldCollapse ? '<button class="ffb-page-expand-btn" type="button" data-ffb-action="toggle-collapse" title="展開全文" aria-label="展開全文">⌄</button>' : ''}
      </div>
    </div>
    <div class="ffb-page-translation-text">${formatPageTranslationText(result)}</div>
  `;
  bindPageTranslationBlockEvents(item.translationNode);
}

function formatPageTranslationText(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      return;
    }

    const bulletMatch = line.match(/^(?:[-*•・‧])\s+(.+)$/);
    const orderedMatch = line.match(/^([0-9０-９]+)[.)．、]\s+(.+)$/);

    if (bulletMatch) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul class="ffb-page-translation-list">'; inUl = true; }
      html += `<li>${escapeHtml(bulletMatch[1])}</li>`;
      return;
    }

    if (orderedMatch) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol class="ffb-page-translation-list">'; inOl = true; }
      html += `<li>${escapeHtml(orderedMatch[2])}</li>`;
      return;
    }

    closeLists();
    html += `<p>${escapeHtml(line)}</p>`;
  });

  closeLists();
  return html || escapeHtml(text);
}

function renderPageTranslationError(item, message) {
  if (!item.translationNode) return;
  item.translationNode.classList.remove('ffb-page-translation-loading');
  item.translationNode.classList.add('ffb-page-translation-error');
  item.translationNode.innerHTML = `
    <div class="ffb-page-translation-head">
      <span class="ffb-page-translation-mark ffb-page-translation-mark-error" title="翻譯失敗" aria-label="翻譯失敗">!</span>
    </div>
    <div class="ffb-page-translation-text">${escapeHtml(message)}</div>
    <button class="ffb-page-retry" type="button">重試此段</button>
  `;
  bindPageTranslationBlockEvents(item.translationNode);
  item.translationNode.querySelector('.ffb-page-retry')?.addEventListener('click', async e => {
    e.stopPropagation();
    pageTranslationState.errors = Math.max(0, pageTranslationState.errors - 1);
    await translatePageItem(item);
    updatePageTranslationPanel();
  });
}

function ensurePageTranslationPanel() {
  if (pageTranslationPanel && document.body.contains(pageTranslationPanel)) return pageTranslationPanel;
  pageTranslationPanel = document.createElement('div');
  pageTranslationPanel.className = 'ffb-page-translation-panel';
  pageTranslationPanel.innerHTML = `
    <div class="ffb-page-panel-head">
      <div class="ffb-page-panel-title">全文翻譯 <span>Beta</span></div>
      <div class="ffb-page-panel-count">0/0</div>
    </div>
    <div class="ffb-page-panel-status"></div>
    <div class="ffb-page-panel-controls">
      <div class="ffb-page-panel-modes" aria-label="全文翻譯顯示模式">
        <button type="button" data-mode="bilingual" title="雙語">雙</button>
        <button type="button" data-mode="translation" title="只看譯文">譯</button>
        <button type="button" data-mode="original" title="只看原文">原</button>
      </div>
      <div class="ffb-page-panel-actions">
        <button type="button" data-action="stop" title="停止">■</button>
        <button type="button" data-action="restore" title="還原">↺</button>
      </div>
    </div>
  `;
  pageTranslationPanel.addEventListener('mousedown', e => e.stopPropagation());
  pageTranslationPanel.addEventListener('click', e => {
    e.stopPropagation();
    const button = e.target.closest('button');
    if (!button) return;
    if (button.dataset.mode) {
      setPageTranslationMode(button.dataset.mode);
      updatePageTranslationPanel();
    } else if (button.dataset.density) {
      setPageTranslationDensity(button.dataset.density);
      updatePageTranslationPanel();
    } else if (button.dataset.action === 'stop') {
      stopPageTranslationBeta();
    } else if (button.dataset.action === 'restore') {
      restorePageTranslationBeta();
    }
  });
  document.body.appendChild(pageTranslationPanel);
  return pageTranslationPanel;
}

function updatePageTranslationPanel(message = '') {
  if (!pageTranslationPanel) return;
  const status = pageTranslationPanel.querySelector('.ffb-page-panel-status');
  const count = pageTranslationPanel.querySelector('.ffb-page-panel-count');
  const modeButtons = pageTranslationPanel.querySelectorAll('[data-mode]');
  const densityButtons = pageTranslationPanel.querySelectorAll('[data-density]');
  const stopButton = pageTranslationPanel.querySelector('[data-action="stop"]');
  const done = pageTranslationState.done;
  const total = pageTranslationState.total;
  const errors = pageTranslationState.errors;
  const runningText = pageTranslationState.running ? '翻譯中' : '待命';
  const continueText = !pageTranslationState.running && pageTranslationState.canContinue ? '有新段落' : '';
  if (count) count.textContent = `${done}/${total}`;
  status.textContent = message || [runningText, errors ? `失敗 ${errors}` : '', continueText].filter(Boolean).join(' · ');
  modeButtons.forEach(btn => btn.classList.toggle('ffb-page-active', btn.dataset.mode === pageTranslationState.mode));
  densityButtons.forEach(btn => btn.classList.toggle('ffb-page-active', btn.dataset.density === pageTranslationState.density));
  if (stopButton) stopButton.disabled = !pageTranslationState.running;
}

function setPageTranslationMode(mode) {
  pageTranslationState.mode = ['bilingual', 'translation', 'original'].includes(mode) ? mode : 'bilingual';
  document.documentElement.classList.remove(
    'ffb-page-translation-mode-bilingual',
    'ffb-page-translation-mode-translation',
    'ffb-page-translation-mode-original'
  );
  document.documentElement.classList.add(`ffb-page-translation-mode-${pageTranslationState.mode}`);
}

function setPageTranslationDensity(density) {
  pageTranslationState.density = density === 'compact' ? 'compact' : 'comfortable';
  document.documentElement.classList.remove(
    'ffb-page-translation-density-comfortable',
    'ffb-page-translation-density-compact'
  );
  document.documentElement.classList.add(`ffb-page-translation-density-${pageTranslationState.density}`);
}

function stopPageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.running = false;
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel('正在停止...');
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

function restorePageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.running = false;
  if (pageTranslationState.scrollTimer) clearTimeout(pageTranslationState.scrollTimer);
  document.querySelectorAll('.ffb-page-translation-block').forEach(node => node.remove());
  document.querySelectorAll('.ffb-page-source-translated').forEach(node => node.classList.remove('ffb-page-source-translated'));
  document.documentElement.classList.remove(
    'ffb-page-translation-mode-bilingual',
    'ffb-page-translation-mode-translation',
    'ffb-page-translation-mode-original',
    'ffb-page-translation-density-comfortable',
    'ffb-page-translation-density-compact'
  );
  clearActivePageTranslationPair();
  pageTranslationPairs.clear();
  pageTranslationPanel?.remove();
  pageTranslationPanel = null;
  pageTranslationState = {
    running: false,
    stopped: false,
    activated: false,
    canContinue: false,
    scrollBound: pageTranslationState.scrollBound,
    scrollTimer: null,
    selectionBound: pageTranslationState.selectionBound,
    activePairId: null,
    mode: 'bilingual',
    density: 'compact',
    items: [],
    done: 0,
    errors: 0,
    total: 0
  };
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

function bindPageTranslationScrollWatcher() {
  if (pageTranslationState.scrollBound) return;
  pageTranslationState.scrollBound = true;
  window.addEventListener('scroll', schedulePageTranslationAvailabilityCheck, { passive: true });
  window.addEventListener('resize', schedulePageTranslationAvailabilityCheck, { passive: true });
}

function schedulePageTranslationAvailabilityCheck() {
  if (!pageTranslationState.activated || pageTranslationState.running) return;
  if (pageTranslationState.scrollTimer) clearTimeout(pageTranslationState.scrollTimer);
  pageTranslationState.scrollTimer = setTimeout(() => {
    pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
    updateFloatingBallPageTranslationState?.(pageTranslationState);
    updatePageTranslationPanel();
  }, 600);
}

function bindPageTranslationSourceEvents(sourceEl) {
  if (!sourceEl || sourceEl.dataset.ffbPairBound === '1') return;
  sourceEl.dataset.ffbPairBound = '1';
  sourceEl.addEventListener('mouseenter', () => setActivePageTranslationPair(sourceEl.dataset.ffbPairId));
}

function bindPageTranslationBlockEvents(block) {
  if (!block || block.dataset.ffbBlockBound === '1') return;
  block.dataset.ffbBlockBound = '1';
  block.addEventListener('mouseenter', () => setActivePageTranslationPair(block.dataset.ffbPairId));
  block.addEventListener('click', e => {
    const button = e.target.closest('[data-ffb-action]');
    if (!button) {
      setActivePageTranslationPair(block.dataset.ffbPairId);
      return;
    }
    e.stopPropagation();
    handlePageTranslationAction(button.dataset.ffbAction, block.dataset.ffbPairId, button);
  });
}

function bindPageTranslationSelectionWatcher() {
  if (pageTranslationState.selectionBound) return;
  pageTranslationState.selectionBound = true;
  document.addEventListener('selectionchange', handlePageTranslationSelectionChange);
  document.addEventListener('mouseover', handlePageTranslationPointerFocus, true);
  document.addEventListener('pointerover', handlePageTranslationPointerFocus, true);
  document.addEventListener('mouseout', handlePageTranslationPointerBlur, true);
  document.addEventListener('pointerout', handlePageTranslationPointerBlur, true);
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('[data-ffb-pair-id], .ffb-page-translation-panel')) {
      clearActivePageTranslationPair();
    }
  }, true);
}

function handlePageTranslationPointerFocus(event) {
  const pairEl = findPageTranslationPairElement(event.target);
  if (pairEl) setActivePageTranslationPair(pairEl.dataset.ffbPairId);
}

function handlePageTranslationPointerBlur(event) {
  const pairEl = findPageTranslationPairElement(event.target);
  if (!pairEl || pageTranslationState.activePairId !== pairEl.dataset.ffbPairId) return;
  const nextPairEl = findPageTranslationPairElement(event.relatedTarget);
  if (nextPairEl?.dataset.ffbPairId === pairEl.dataset.ffbPairId) return;
  clearActivePageTranslationPair();
}

function handlePageTranslationSelectionChange() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) return;
  const pairEl = findPageTranslationPairElement(selection.anchorNode)
    || findPageTranslationPairElement(selection.focusNode);
  if (pairEl) setActivePageTranslationPair(pairEl.dataset.ffbPairId);
}

function findPageTranslationPairElement(target) {
  if (!target) return null;
  const node = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
  return node?.closest?.('[data-ffb-pair-id]') || null;
}

function setActivePageTranslationPair(pairId) {
  if (!pairId) return;
  const pair = pageTranslationPairs.get(pairId);
  if (!pair) return;
  if (!pair.sourceEl?.isConnected || !pair.translationEl?.isConnected) {
    pageTranslationPairs.delete(pairId);
    return;
  }
  pageTranslationState.activePairId = pairId;
  document.querySelectorAll('.ffb-pair-active').forEach(node => node.classList.remove('ffb-pair-active'));
  pair.sourceEl?.classList.add('ffb-pair-active');
  pair.translationEl?.classList.add('ffb-pair-active');
}

function clearActivePageTranslationPair() {
  pageTranslationState.activePairId = null;
  document.querySelectorAll('.ffb-pair-active').forEach(node => node.classList.remove('ffb-pair-active'));
}

function handlePageTranslationAction(action, pairId, button) {
  const pair = pageTranslationPairs.get(pairId);
  if (!pair) return;
  if (action === 'toggle-collapse') {
    togglePageTranslationCollapse(pair.translationEl, button);
  }
}

function togglePageTranslationCollapse(block, button) {
  if (!block) return;
  const collapsed = block.classList.toggle('ffb-page-collapsed');
  if (!button) return;
  button.textContent = collapsed ? '⌄' : '⌃';
  button.title = collapsed ? '展開全文' : '收合譯文';
  button.setAttribute('aria-label', collapsed ? '展開全文' : '收合譯文');
}

function setPageTranslationModel(model) {
  pageTranslationModel = FanFanBaModels.normalizeModel(model);
  updatePageTranslationPanel();
}

function getPageTranslationModel() {
  return FanFanBaModels.normalizeModel(pageTranslationModel || activeModel);
}
