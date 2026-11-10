'use strict';

// 全文翻譯 Beta：翻譯佇列、串流／批次請求、結果清洗

async function runPageTranslationQueue() {
  const state = pageTranslationState;
  updateFloatingBallPageTranslationState?.(pageTranslationState);
  let pending = state.items.filter(item => item.status === 'pending');
  while (pending.length && !state.stopped && state === pageTranslationState) {
    for (const batch of createPageTranslationBatches(pending)) {
      if (state.stopped || state !== pageTranslationState) break;
      if (batch.length > 1) await translatePageBatch(batch);
      else await translatePageItem(batch[0]);
      if (state !== pageTranslationState) return;
      updatePageTranslationPanel();
    }
    if (state.stopped || state !== pageTranslationState || !state.autoContinue) break;
    pending = collectNextPageTranslationItems();
  }
  if (state !== pageTranslationState) return;
  hidePageTranslationDownloadProgress();
  pageTranslationState.running = false;
  pageTranslationState.stopping = false;
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

function collectNextPageTranslationItems() {
  const known = new Set(pageTranslationState.items.map(item => item.el));
  const items = collectVisibleTranslatableBlocks().filter(item => !known.has(item.el));
  pageTranslationState.items.push(...items);
  pageTranslationState.total += items.length;
  pageTranslationState.usage.paragraphs += items.length;
  return items;
}

async function translatePageItem(item, options = {}) {
  const state = pageTranslationState;
  // 先等設定讀回，再建立這次請求與原文配對。
  if (typeof contentSettingsReady !== 'undefined') await contentSettingsReady;
  if (state !== pageTranslationState || state.stopped) return;
  if (options.retry && item.status !== 'error') return;
  const node = preparePageTranslationItem(item);
  if (!node) return;

  try {
    const result = cleanPageTranslationResult(await requestPageTranslation(item.text, {
      context: options.context || buildPageTranslationContextDigest(item, pageTranslationState.items),
      requestKind: options.requestKind || 'single',
      isCurrent: () => isPageTranslationAttemptCurrent(state, item, node)
    }), item.text);
    if (!isPageTranslationAttemptCurrent(state, item, node)) return;
    if (!result) throw new Error('翻譯未回傳內容');
    completePageTranslationItem(item, result);
  } catch (error) {
    if (!isPageTranslationAttemptCurrent(state, item, node)) return;
    item.status = 'error';
    pageTranslationState.errors += 1;
    pageTranslationState.usage.failed += 1;
    renderPageTranslationError(item, error.message || '翻譯失敗');
  }
}

function requestPageTranslation(text, options = {}) {
  return new Promise((resolve, reject) => {
    if (!chrome.runtime?.id) {
      reject(new Error('擴充功能已更新，請重新整理頁面'));
      return;
    }
    const requestId = `page-${++pageTranslationRequestCounter}`;
    const port = chrome.runtime.connect({ name: 'ai-stream' });
    pageTranslationActivePort = port;
    let accumulated = '';
    let settled = false;

    const cleanup = () => {
      if (pageTranslationActivePort === port) pageTranslationActivePort = null;
    };

    port.onMessage.addListener(response => {
      if (settled || (response.requestId && response.requestId !== requestId)) return;
      if (response.chunk) {
        accumulated += response.chunk;
        return;
      }
      // status 是背景送來的進度／通知。目前只有內建模型的下載進度需要渲染；
      // 其餘（例如備援模型通知）維持既有行為不顯示，避免蓋掉翻譯進度文字。
      if (response.status) {
        if (response.status.kind === 'download-progress' && options.isCurrent()) {
          renderPageTranslationDownloadProgress(response.status.percent);
        }
        return;
      }
      if (response.error) {
        settled = true;
        cleanup();
        try { port.disconnect(); } catch {}
        reject(new Error(response.error));
        return;
      }
      if (response.done) {
        settled = true;
        cleanup();
        try { port.disconnect(); } catch {}
        resolve(accumulated);
      }
    });

    port.onDisconnect.addListener(() => {
      cleanup();
      if (settled) return;
      reject(new Error(pageTranslationState.stopped ? 'PAGE_TRANSLATION_CANCELLED' : '連線中斷'));
    });

    recordPageTranslationRequest(options.requestKind || 'single');
    port.postMessage({
      requestId,
      action: 'translate',
      selectedText: text,
      context: options.context || text,
      pageTitle: document.title,
      model: getPageTranslationModel(),
      pageTranslation: options.pageTranslation || true,
      targetLanguage,
      explanationLanguage,
      browserLanguage: navigator.language || ''
    });
  });
}

function requestPageTranslationBatch(items, options = {}) {
  return requestPageTranslation(buildPageTranslationBatchSourceText(items), {
    context: options.context || buildPageTranslationContextDigest(items[0], pageTranslationState.items),
    isCurrent: options.isCurrent,
    requestKind: 'batch',
    pageTranslation: {
      batch: true,
      count: items.length
    }
  });
}

async function translatePageBatch(items) {
  const state = pageTranslationState;
  if (typeof contentSettingsReady !== 'undefined') await contentSettingsReady;
  if (state !== pageTranslationState || state.stopped) return;
  const attempts = [];
  for (const item of items) {
    const node = preparePageTranslationItem(item);
    if (node) attempts.push({ item, node });
  }
  const batchItems = attempts.map(({ item }) => item);
  if (!batchItems.length) return;

  try {
    const rawResult = await requestPageTranslationBatch(batchItems, {
      context: buildPageTranslationContextDigest(batchItems[0], pageTranslationState.items),
      isCurrent: () => attempts.some(({ item, node }) => isPageTranslationAttemptCurrent(state, item, node))
    });
    if (state !== pageTranslationState) return;
    const results = parsePageTranslationBatchResult(rawResult, batchItems);
    attempts.forEach(({ item, node }, index) => {
      if (isPageTranslationAttemptCurrent(state, item, node)) completePageTranslationItem(item, results[index]);
    });
  } catch (error) {
    for (const { item, node } of attempts) {
      if (!isPageTranslationAttemptCurrent(state, item, node)) continue;
      await translatePageItem(item, { requestKind: 'fallback' });
    }
  }
}

function preparePageTranslationItem(item) {
  if (item.status === 'cancelled') return null;
  const owner = pageTranslationPairs.get(item.el.dataset.ffbPairId)?.item;
  if (owner && owner !== item) {
    invalidatePageTranslationItem(item);
    return null;
  }
  item.sourceSnapshot ??= getPageTranslationSourceSnapshot(item.el);
  if (!hasCurrentPageTranslationSource(item)) return null;
  if (item.status === 'error') {
    pageTranslationState.errors = Math.max(0, pageTranslationState.errors - 1);
    pageTranslationState.usage.failed = Math.max(0, pageTranslationState.usage.failed - 1);
  }
  item.status = 'loading';
  item.el.classList.remove('ffb-page-source-ready');
  item.el.classList.add('ffb-page-source-translated');
  item.el.dataset.ffbPairId = item.pairId;
  bindPageTranslationSourceEvents(item.el);
  item.translationNode?.remove();
  item.translationNode = createPageTranslationBlock(item);
  applyPageTranslationSourceTypography(item.el, item.translationNode);
  item.el.insertAdjacentElement('afterend', item.translationNode);
  pageTranslationPairs.set(item.pairId, {
    item,
    sourceEl: item.el,
    translationEl: item.translationNode,
    sourceText: item.text,
    translatedText: ''
  });
  return item.translationNode;
}

function completePageTranslationItem(item, result) {
  renderPageTranslationResult(item, result);
  item.el.classList.add('ffb-page-source-ready');
  item.status = 'done';
  item.translatedText = result;
  pageTranslationPairs.get(item.pairId).translatedText = result;
  pageTranslationState.done += 1;
  pageTranslationState.usage.succeeded += 1;
}

function hasCurrentPageTranslationSource(item) {
  if (item.el.isConnected && getPageTranslationSourceSnapshot(item.el) === item.sourceSnapshot) return true;
  invalidatePageTranslationItem(item);
  return false;
}

function isPageTranslationAttemptCurrent(state, item, node) {
  if (state !== pageTranslationState || state.stopped || item.translationNode !== node) return false;
  if (!node.isConnected || item.el.nextElementSibling !== node) {
    invalidatePageTranslationItem(item);
    return false;
  }
  return hasCurrentPageTranslationSource(item);
}

function invalidatePageTranslationItem(item) {
  const state = pageTranslationState;
  const index = state.items.indexOf(item);
  if (index !== -1) {
    state.items.splice(index, 1);
    state.total -= 1;
    state.usage.paragraphs -= 1;
    if (item.status === 'done') {
      state.done -= 1;
      state.usage.succeeded -= 1;
    } else if (item.status === 'error') {
      state.errors -= 1;
      state.usage.failed -= 1;
    }
  }
  clearCancelledPageTranslationItem(item);
}

function createPageTranslationBatches(items = []) {
  const batches = [];
  let current = [];
  let currentChars = 0;

  items.forEach(item => {
    const textLength = String(item?.text || '').length;
    const wouldOverflow = current.length
      && (current.length >= PAGE_TRANSLATION_LIMITS.batchMaxItems
        || currentChars + textLength > PAGE_TRANSLATION_LIMITS.batchMaxChars);
    if (wouldOverflow) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(item);
    currentChars += textLength;
  });

  if (current.length) batches.push(current);
  return batches;
}

function buildPageTranslationBatchSourceText(items = []) {
  return JSON.stringify(items.map((item, index) => ({
    id: index + 1,
    text: String(item?.text || '')
  })));
}

function parsePageTranslationBatchResult(rawResult, items = []) {
  const cleaned = String(rawResult || '').replace(/```(?:json)?/gi, '').trim();
  const candidates = [cleaned];
  const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
  const objectMatch = cleaned.match(/\{[\s\S]*\}/);
  if (arrayMatch && arrayMatch[0] !== cleaned) candidates.push(arrayMatch[0]);
  if (objectMatch && objectMatch[0] !== cleaned) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const values = Array.isArray(parsed)
        ? parsed
        : (Array.isArray(parsed.translations) ? parsed.translations : []);
      const translations = values.map(value => {
        if (typeof value === 'string') return value;
        return value?.translation || value?.translatedText || value?.zh || '';
      });
      if (translations.length === items.length && translations.every(value => String(value || '').trim())) {
        return translations.map((value, index) => cleanPageTranslationResult(value, items[index]?.text || ''));
      }
    } catch { /* Try the next candidate. */ }
  }

  throw new Error('BATCH_TRANSLATION_PARSE_FAILED');
}

function clearCancelledPageTranslationItem(item) {
  item.status = 'cancelled';
  item.translationNode?.remove();
  item.translationNode = null;
  if (item.el && (!item.el.dataset.ffbPairId || item.el.dataset.ffbPairId === item.pairId)) {
    item.el.classList.remove('ffb-page-source-translated', 'ffb-page-source-ready', 'ffb-pair-active');
    delete item.el.dataset.ffbPairId;
  }
  if (pageTranslationState.activePairId === item.pairId) pageTranslationState.activePairId = null;
  pageTranslationPairs.delete(item.pairId);
}

function cleanPageTranslationResult(rawResult, sourceText) {
  let result = String(rawResult || '')
    .replace(/```(?:\w+)?/g, '')
    .replace(/\r\n/g, '\n')
    .trim();
  const jsonTranslation = extractPageTranslationJsonTranslation(result, sourceText);
  if (jsonTranslation) return jsonTranslation;

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
  const fallbackJsonTranslation = extractPageTranslationJsonTranslation(result, sourceText);
  if (fallbackJsonTranslation) return fallbackJsonTranslation;
  return result || String(rawResult || '').trim();
}

function extractPageTranslationJsonTranslation(text, sourceText = '') {
  const source = normalizePageTranslationComparableText(sourceText);
  const candidates = [String(text || '').trim()];
  const objectMatch = candidates[0].match(/\{[\s\S]*\}/);
  if (objectMatch && objectMatch[0] !== candidates[0]) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const data = JSON.parse(candidate);
      const values = [
        ...(Array.isArray(data.translations) ? data.translations : []),
        data.translation,
        data.translatedText,
        data.zh,
        data.definition
      ];
      const translation = values
        .map(value => stripOuterPageTranslationQuotes(String(value || '').trim()))
        .find(value => value && normalizePageTranslationComparableText(value) !== source);
      if (translation) return translation;
    } catch { /* 不是 JSON 就交回一般清洗流程 */ }
  }
  return '';
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
