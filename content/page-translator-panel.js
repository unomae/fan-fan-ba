'use strict';

// 全文翻譯 Beta：面板 UI、事件綁定、watcher、生命週期、配對高亮與複製

function startPageTranslationBeta() {
  bindPageTranslationNavigationWatcher();
  pageTranslationLocationKey = getPageTranslationLocationKey();

  if (pageTranslationState.running) {
    updatePageTranslationPanel();
    return;
  }

  const items = collectVisibleTranslatableBlocks();
  const embeddedSummary = detectEmbeddedTranslationTargets();
  ensurePageTranslationPanel();
  pageTranslationState = {
    running: items.length > 0,
    stopped: false,
    stopping: false,
    activated: true,
    canContinue: false,
    scrollBound: pageTranslationState.scrollBound,
    scrollTimer: pageTranslationState.scrollTimer,
    selectionBound: pageTranslationState.selectionBound,
    activePairId: pageTranslationState.activePairId,
    mode: pageTranslationState.mode || 'bilingual',
    density: pageTranslationState.density || 'compact',
    items,
    embeddedSummary,
    usage: createPageTranslationUsageSummary(items.length),
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

function cancelActivePageTranslationRequest() {
  if (!pageTranslationActivePort) return;
  try { pageTranslationActivePort.disconnect(); } catch {}
  pageTranslationActivePort = null;
}

function buildPageTranslationUsageSummaryText(summary = pageTranslationState.usage) {
  if (!summary?.paragraphs) return '';
  const requestParts = [
    summary.batchRequests ? `批次 ${summary.batchRequests}` : '',
    summary.singleRequests ? `單段 ${summary.singleRequests}` : '',
    summary.fallbackRequests ? `重試 ${summary.fallbackRequests}` : ''
  ].filter(Boolean);
  return [
    `本次全文翻譯：段落 ${summary.paragraphs}`,
    `成功 ${summary.succeeded}`,
    `失敗 ${summary.failed}`,
    `request 約 ${summary.requests}`,
    requestParts.length ? `(${requestParts.join('、')})` : ''
  ].filter(Boolean).join(' · ');
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
    <div class="ffb-page-embedded-summary" hidden></div>
    <div class="ffb-page-usage-summary" hidden></div>
    <div class="ffb-page-panel-controls">
      <div class="ffb-page-panel-modes" aria-label="全文翻譯顯示模式">
        <button type="button" data-mode="bilingual" title="雙語" aria-label="顯示雙語">雙</button>
        <button type="button" data-mode="translation" title="只看譯文" aria-label="只看譯文">譯</button>
        <button type="button" data-mode="original" title="只看原文" aria-label="只看原文">原</button>
      </div>
      <div class="ffb-page-panel-actions">
        <button type="button" data-action="copy-translation" title="複製譯文" aria-label="複製全文翻譯譯文">譯</button>
        <button type="button" data-action="copy-bilingual" title="複製雙語" aria-label="複製全文翻譯雙語對照">雙</button>
        <button type="button" data-action="stop" title="停止" aria-label="停止全文翻譯">■</button>
        <button type="button" data-action="restore" title="還原" aria-label="還原全文翻譯">↺</button>
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
    } else if (button.dataset.action === 'copy-translation') {
      copyPageTranslationText('translation', button);
    } else if (button.dataset.action === 'copy-bilingual') {
      copyPageTranslationText('bilingual', button);
    }
  });
  document.body.appendChild(pageTranslationPanel);
  return pageTranslationPanel;
}

function updatePageTranslationPanel(message = '') {
  if (!pageTranslationPanel) return;
  const status = pageTranslationPanel.querySelector('.ffb-page-panel-status');
  const embedded = pageTranslationPanel.querySelector('.ffb-page-embedded-summary');
  const usage = pageTranslationPanel.querySelector('.ffb-page-usage-summary');
  const count = pageTranslationPanel.querySelector('.ffb-page-panel-count');
  const modeButtons = pageTranslationPanel.querySelectorAll('[data-mode]');
  const densityButtons = pageTranslationPanel.querySelectorAll('[data-density]');
  const stopButton = pageTranslationPanel.querySelector('[data-action="stop"]');
  const copyButtons = pageTranslationPanel.querySelectorAll('[data-action="copy-translation"], [data-action="copy-bilingual"]');
  const done = pageTranslationState.done;
  const total = pageTranslationState.total;
  if (count) count.textContent = `${done}/${total}`;
  status.textContent = getPageTranslationStatusText(pageTranslationState, message);
  if (embedded) {
    const embeddedText = buildEmbeddedTranslationSummaryText(pageTranslationState.embeddedSummary);
    embedded.hidden = !embeddedText;
    embedded.textContent = embeddedText;
    embedded.title = embeddedText;
  }
  if (usage) {
    const usageText = buildPageTranslationUsageSummaryText(pageTranslationState.usage);
    usage.hidden = !usageText;
    usage.textContent = usageText;
    usage.title = usageText;
  }
  modeButtons.forEach(btn => btn.classList.toggle('ffb-page-active', btn.dataset.mode === pageTranslationState.mode));
  densityButtons.forEach(btn => btn.classList.toggle('ffb-page-active', btn.dataset.density === pageTranslationState.density));
  if (stopButton) stopButton.disabled = !pageTranslationState.running && !pageTranslationState.stopping;
  copyButtons.forEach(btn => { btn.disabled = !hasCompletedPageTranslationItems(); });
}

function getPageTranslationStatusText(state, message = '') {
  if (message) return message;
  const done = Number(state?.done || 0);
  const total = Number(state?.total || 0);
  const errors = Number(state?.errors || 0);
  const progress = total ? `${done}/${total}` : '0/0';

  if (state?.stopping) {
    return [`正在停止 ${progress}`, errors ? `失敗 ${errors}` : ''].filter(Boolean).join(' · ');
  }
  if (state?.running) {
    return [`翻譯中 ${progress}`, errors ? `失敗 ${errors}` : ''].filter(Boolean).join(' · ');
  }
  if (state?.stopped) {
    return [`已停止 ${progress}`, errors ? `失敗 ${errors}` : ''].filter(Boolean).join(' · ');
  }
  if (state?.canContinue) {
    return `有新段落可翻譯 · 已完成 ${progress}`;
  }
  if (total && done >= total && !errors) {
    return `可見區域翻譯完成 · ${progress}`;
  }
  if (total && errors) {
    return `已完成 ${progress} · 失敗 ${errors}`;
  }
  return '待命';
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

function hasCompletedPageTranslationItems(items = pageTranslationState.items) {
  return getCompletedPageTranslationItems(items).length > 0;
}

function getCompletedPageTranslationItems(items = pageTranslationState.items) {
  return (items || []).filter(item => String(item?.translatedText || '').trim());
}

function buildPageTranslationCopyText(format = 'translation', items = pageTranslationState.items) {
  const completedItems = getCompletedPageTranslationItems(items);
  if (!completedItems.length) return '';
  if (format === 'bilingual') {
    return completedItems.map(item => [
      `原文：${String(item.text || '').trim()}`,
      `譯文：${String(item.translatedText || '').trim()}`
    ].join('\n')).join('\n\n---\n\n');
  }
  return completedItems.map(item => String(item.translatedText || '').trim()).join('\n\n');
}

async function copyPageTranslationText(format, button) {
  const text = buildPageTranslationCopyText(format);
  if (!text) {
    updatePageTranslationPanel('沒有可複製的譯文');
    return;
  }

  const originalText = button?.textContent || '';
  try {
    await writePageTranslationClipboardText(text);
    if (button) {
      button.textContent = '✓';
      button.classList.add('ffb-page-copied');
      setTimeout(() => {
        button.textContent = originalText;
        button.classList.remove('ffb-page-copied');
      }, 1400);
    }
    updatePageTranslationPanel(format === 'bilingual' ? '已複製雙語對照' : '已複製譯文');
  } catch {
    updatePageTranslationPanel('複製失敗，請再試一次');
  }
}

async function writePageTranslationClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand?.('copy');
  textarea.remove();
  if (!copied) throw new Error('COPY_FAILED');
}

function stopPageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.stopping = true;
  pageTranslationState.running = false;
  cancelActivePageTranslationRequest();
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

function restorePageTranslationBeta() {
  pageTranslationState.stopped = true;
  pageTranslationState.stopping = false;
  pageTranslationState.running = false;
  cancelActivePageTranslationRequest();
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
    stopping: false,
    activated: false,
    canContinue: false,
    scrollBound: pageTranslationState.scrollBound,
    scrollTimer: null,
    selectionBound: pageTranslationState.selectionBound,
    activePairId: null,
    mode: 'bilingual',
    density: 'compact',
    items: [],
    embeddedSummary: null,
    usage: createPageTranslationUsageSummary(0),
    done: 0,
    errors: 0,
    total: 0
  };
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

function bindPageTranslationNavigationWatcher() {
  if (pageTranslationNavigationBound) return;
  pageTranslationNavigationBound = true;

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function pushStateWithPageTranslationReset(...args) {
    const result = originalPushState.apply(this, args);
    schedulePageTranslationNavigationCheck();
    return result;
  };
  history.replaceState = function replaceStateWithPageTranslationReset(...args) {
    const result = originalReplaceState.apply(this, args);
    schedulePageTranslationNavigationCheck();
    return result;
  };
  window.addEventListener('popstate', schedulePageTranslationNavigationCheck);
  window.addEventListener('hashchange', schedulePageTranslationNavigationCheck);
}

function schedulePageTranslationNavigationCheck() {
  setTimeout(resetPageTranslationIfLocationChanged, 0);
}

function resetPageTranslationIfLocationChanged() {
  const nextKey = getPageTranslationLocationKey();
  if (nextKey === pageTranslationLocationKey) return;
  pageTranslationLocationKey = nextKey;
  if (!pageTranslationState.activated && !pageTranslationState.running && !pageTranslationPanel) {
    updateFloatingBallPageTranslationState?.(pageTranslationState);
    return;
  }
  restorePageTranslationBeta();
  pageTranslationLocationKey = nextKey;
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
  } else if (action === 'locate-source') {
    locatePageTranslationSource(pairId);
  }
}

function locatePageTranslationSource(pairId, options = {}) {
  const pairs = options.pairs || pageTranslationPairs;
  const state = options.state || pageTranslationState;
  const pair = pairs.get(pairId);
  if (!pair?.sourceEl?.isConnected || !pair?.translationEl?.isConnected) return false;

  if (state.mode === 'translation') {
    const setMode = options.setMode || setPageTranslationMode;
    setMode('bilingual');
  }

  const setActive = options.setActive || setActivePageTranslationPair;
  setActive(pairId);
  pair.sourceEl.scrollIntoView?.({
    behavior: options.behavior || 'smooth',
    block: 'center',
    inline: 'nearest'
  });
  if (typeof pageTranslationPanel !== 'undefined') updatePageTranslationPanel('已定位原文');
  return true;
}

function togglePageTranslationCollapse(block, button) {
  if (!block) return;
  const collapsed = block.classList.toggle('ffb-page-collapsed');
  if (!button) return;
  button.textContent = collapsed ? '⌄' : '⌃';
  button.title = collapsed ? '展開全文' : '收合譯文';
  button.setAttribute('aria-label', collapsed ? '展開全文' : '收合譯文');
}
