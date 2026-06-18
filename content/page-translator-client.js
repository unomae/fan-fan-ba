'use strict';

// 全文翻譯 Beta：翻譯佇列、串流／批次請求、結果清洗

async function runPageTranslationQueue() {
  updateFloatingBallPageTranslationState?.(pageTranslationState);
  const batches = createPageTranslationBatches(pageTranslationState.items);
  for (const batch of batches) {
    if (pageTranslationState.stopped) break;
    if (batch.length > 1) {
      await translatePageBatch(batch);
    } else {
      await translatePageItem(batch[0]);
    }
    updatePageTranslationPanel();
  }
  pageTranslationState.running = false;
  pageTranslationState.stopping = false;
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);
}

async function translatePageItem(item, options = {}) {
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
    const result = cleanPageTranslationResult(await requestPageTranslation(item.text, {
      context: options.context || buildPageTranslationContextDigest(item, pageTranslationState.items),
      requestKind: options.requestKind || 'single'
    }), item.text);
    if (pageTranslationState.stopped) {
      clearCancelledPageTranslationItem(item);
      return;
    }
    item.status = 'done';
    item.translatedText = result;
    pageTranslationPairs.set(item.pairId, {
      sourceEl: item.el,
      translationEl: item.translationNode,
      sourceText: item.text,
      translatedText: result
    });
    pageTranslationState.done += 1;
    pageTranslationState.usage.succeeded += 1;
    renderPageTranslationResult(item, result);
  } catch (error) {
    if (pageTranslationState.stopped || error.message === 'PAGE_TRANSLATION_CANCELLED') {
      clearCancelledPageTranslationItem(item);
      return;
    }
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
      if (response.requestId && response.requestId !== requestId) return;
      if (response.chunk) {
        accumulated += response.chunk;
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
    requestKind: 'batch',
    pageTranslation: {
      batch: true,
      count: items.length
    }
  });
}

async function translatePageBatch(items) {
  const batchItems = items.filter(item => preparePageTranslationBatchItem(item));
  if (!batchItems.length) return;

  try {
    const rawResult = await requestPageTranslationBatch(batchItems, {
      context: buildPageTranslationContextDigest(batchItems[0], pageTranslationState.items)
    });
    const results = parsePageTranslationBatchResult(rawResult, batchItems);
    if (pageTranslationState.stopped) {
      batchItems.forEach(clearCancelledPageTranslationItem);
      return;
    }
    batchItems.forEach((item, index) => completePageTranslationBatchItem(item, results[index]));
  } catch (error) {
    if (pageTranslationState.stopped || error.message === 'PAGE_TRANSLATION_CANCELLED') {
      batchItems.forEach(clearCancelledPageTranslationItem);
      return;
    }
    for (const item of batchItems) {
      if (pageTranslationState.stopped) {
        clearCancelledPageTranslationItem(item);
        break;
      }
      await translatePageItem(item, { requestKind: 'fallback' });
    }
  }
}

function preparePageTranslationBatchItem(item) {
  if (!item.el.isConnected) return false;
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
  return true;
}

function completePageTranslationBatchItem(item, result) {
  item.status = 'done';
  item.translatedText = result;
  pageTranslationPairs.set(item.pairId, {
    sourceEl: item.el,
    translationEl: item.translationNode,
    sourceText: item.text,
    translatedText: result
  });
  pageTranslationState.done += 1;
  pageTranslationState.usage.succeeded += 1;
  renderPageTranslationResult(item, result);
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
  item.el?.classList.remove('ffb-page-source-translated');
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
