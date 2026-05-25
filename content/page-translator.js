'use strict';

const PAGE_TRANSLATION_LIMITS = {
  maxBlocks: 8,
  maxChars: 3200,
  minChars: 24,
  maxBlockChars: 1200
};

let pageTranslationState = {
  running: false,
  stopped: false,
  mode: 'bilingual',
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
    mode: pageTranslationState.mode || 'bilingual',
    items,
    done: 0,
    errors: 0,
    total: items.length
  };
  setPageTranslationMode(pageTranslationState.mode);

  if (!items.length) {
    updatePageTranslationPanel('目前可見區域沒有找到適合翻譯的段落');
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
    'h1', 'h2', 'h3', 'p'
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
    items.push({ el, text, status: 'pending', translationNode: null });
  });

  return items;
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
  const text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
  if (text.length < PAGE_TRANSLATION_LIMITS.minChars) return '';
  if (text.length > PAGE_TRANSLATION_LIMITS.maxBlockChars) return '';
  if (/^[\d\s.,:;!?()[\]{}'"-]+$/.test(text)) return '';
  return text;
}

async function runPageTranslationQueue() {
  for (const item of pageTranslationState.items) {
    if (pageTranslationState.stopped) break;
    await translatePageItem(item);
    updatePageTranslationPanel();
  }
  pageTranslationState.running = false;
  updatePageTranslationPanel(pageTranslationState.stopped ? '已停止' : '可見區域翻譯完成');
}

async function translatePageItem(item) {
  if (!item.el.isConnected) return;
  item.status = 'loading';
  item.el.classList.add('ffb-page-source-translated');
  item.translationNode?.remove();
  item.translationNode = createPageTranslationBlock(item);
  item.el.insertAdjacentElement('afterend', item.translationNode);

  try {
    const result = await requestPageTranslation(item.text);
    item.status = 'done';
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

function createPageTranslationBlock(item) {
  const block = document.createElement(item.el.tagName === 'LI' ? 'li' : 'div');
  block.className = 'ffb-page-translation-block ffb-page-translation-loading';
  block.innerHTML = `
    <div class="ffb-page-translation-label">翻翻吧 Beta</div>
    <div class="ffb-page-translation-text">翻譯中...</div>
  `;
  return block;
}

function renderPageTranslationResult(item, result) {
  if (!item.translationNode) return;
  item.translationNode.classList.remove('ffb-page-translation-loading', 'ffb-page-translation-error');
  item.translationNode.innerHTML = `
    <div class="ffb-page-translation-label">${escapeHtml(FanFanBaModels.getLanguageName(targetLanguage, navigator.language || ''))}</div>
    <div class="ffb-page-translation-text">${escapeHtml(result).replace(/\n/g, '<br>')}</div>
  `;
}

function renderPageTranslationError(item, message) {
  if (!item.translationNode) return;
  item.translationNode.classList.remove('ffb-page-translation-loading');
  item.translationNode.classList.add('ffb-page-translation-error');
  item.translationNode.innerHTML = `
    <div class="ffb-page-translation-label">翻譯失敗</div>
    <div class="ffb-page-translation-text">${escapeHtml(message)}</div>
    <button class="ffb-page-retry" type="button">重試此段</button>
  `;
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
    <div class="ffb-page-panel-title">全文翻譯 Beta</div>
    <div class="ffb-page-panel-status"></div>
    <div class="ffb-page-panel-modes">
      <button type="button" data-mode="bilingual">雙語</button>
      <button type="button" data-mode="translation">譯文</button>
      <button type="button" data-mode="original">原文</button>
    </div>
    <div class="ffb-page-panel-actions">
      <button type="button" data-action="stop">停止</button>
      <button type="button" data-action="restore">還原</button>
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
  const modeButtons = pageTranslationPanel.querySelectorAll('[data-mode]');
  const stopButton = pageTranslationPanel.querySelector('[data-action="stop"]');
  const done = pageTranslationState.done;
  const total = pageTranslationState.total;
  const errors = pageTranslationState.errors;
  const runningText = pageTranslationState.running ? '翻譯中' : '待命';
  status.textContent = message || `${runningText} ${done}/${total}${errors ? `，失敗 ${errors}` : ''}`;
  modeButtons.forEach(btn => btn.classList.toggle('ffb-page-active', btn.dataset.mode === pageTranslationState.mode));
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

function stopPageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.running = false;
  updatePageTranslationPanel('正在停止...');
}

function restorePageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.running = false;
  document.querySelectorAll('.ffb-page-translation-block').forEach(node => node.remove());
  document.querySelectorAll('.ffb-page-source-translated').forEach(node => node.classList.remove('ffb-page-source-translated'));
  document.documentElement.classList.remove(
    'ffb-page-translation-mode-bilingual',
    'ffb-page-translation-mode-translation',
    'ffb-page-translation-mode-original'
  );
  pageTranslationPanel?.remove();
  pageTranslationPanel = null;
  pageTranslationState = {
    running: false,
    stopped: false,
    mode: 'bilingual',
    items: [],
    done: 0,
    errors: 0,
    total: 0
  };
}
