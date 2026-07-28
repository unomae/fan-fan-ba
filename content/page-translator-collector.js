'use strict';

// 全文翻譯 Beta：DOM 收集、可翻譯判斷、上下文摘要、嵌入內容偵測與學習摘要

function collectVisibleTranslatableBlocks() {
  const selector = [
    'main h1', 'main h2', 'main h3', 'main p', 'main li',
    'article h1', 'article h2', 'article h3', 'article p', 'article li',
    '[role="main"] h1', '[role="main"] h2', '[role="main"] h3',
    '[role="main"] p', '[role="main"] li',
    '[role="main"] [role="heading"]',
    '[role="main"] [role="radio"] span',
    '[role="main"] [role="checkbox"] span',
    '[role="main"] label span',
    '[role="main"] [class*="question" i] p',
    '[role="main"] [class*="question" i] span',
    '[role="main"] [class*="answer" i] span',
    '[role="main"] [class*="option" i] span',
    '[role="main"] [class*="choice" i] span',
    '.mat-radio-label-content',
    '.mdc-label',
    '.notion-page-content [data-content-editable-leaf="true"]',
    '.notion-page-content [contenteditable="true"]',
    '[data-block-id] [data-content-editable-leaf="true"]',
    'h1', 'h2', 'h3', 'p', 'li', 'blockquote'
  ].join(',');
  const seen = new Set();
  const seenTexts = new Set();
  const items = [];
  let charCount = 0;

  document.querySelectorAll(selector).forEach(el => {
    if (items.length >= PAGE_TRANSLATION_LIMITS.maxBlocks) return;
    if (seen.has(el) || !isPageTranslatableElement(el)) return;
    if (hasSelectedPageTranslationAncestor(el, items)) return;
    const text = getElementTranslationText(el);
    if (!text) return;
    const normalizedText = normalizePageTranslationComparableText(text);
    if (seenTexts.has(normalizedText)) return;
    if (charCount + text.length > PAGE_TRANSLATION_LIMITS.maxChars) return;
    seen.add(el);
    seenTexts.add(normalizedText);
    charCount += text.length;
    items.push({ el, text, pairId: createPageTranslationPairId(), status: 'pending', translationNode: null, translatedText: '' });
  });

  return items;
}

// 全文翻譯真正取用的收集入口：一般 DOM 區塊 ＋ open Shadow DOM 區塊，
// 兩者共用同一份 maxBlocks / maxChars 預算，shadow 內容不另開額度。
function collectPageTranslationItems(root = document) {
  const items = collectVisibleTranslatableBlocks();
  const seenTexts = new Set(items.map(item => normalizePageTranslationComparableText(item.text)));
  let charCount = items.reduce((sum, item) => sum + item.text.length, 0);

  collectOpenShadowDomTranslationBlocks(root).forEach(item => {
    if (items.length >= PAGE_TRANSLATION_LIMITS.maxBlocks) return;
    const normalized = normalizePageTranslationComparableText(item.text);
    if (seenTexts.has(normalized)) return;
    if (charCount + item.text.length > PAGE_TRANSLATION_LIMITS.maxChars) return;
    seenTexts.add(normalized);
    charCount += item.text.length;
    items.push(item);
  });

  return items;
}

function hasVisibleTranslatableBlocks() {
  return collectPageTranslationItems().length > 0;
}

function hasSelectedPageTranslationAncestor(el, items) {
  return items.some(item => item.el?.contains(el));
}

function isPageTranslatableElement(el) {
  if (!el || el.closest('#gemini-ai-toolbar, #gemini-result-card, #fanfanba-floating, .ffb-page-translation-panel, .ffb-page-translation-block')) return false;
  if (el.closest('script, style, noscript, svg, canvas, pre, code, kbd, samp, textarea, input, select, button, nav, header, footer, aside, [aria-hidden="true"]')) return false;
  if (el.closest('[class*="popup" i], [class*="popover" i], [class*="modal" i], [class*="dialog" i], [class*="toolbar" i], [class*="navigation" i], [class*="navbar" i], [class*="breadcrumb" i], [class*="pagination" i]')) return false;
  if (el.closest('form') && !isAllowedFormPageTranslationElement(el)) return false;
  const editableAncestor = el.closest('[contenteditable="true"]');
  if (editableAncestor && !isAllowedEditablePageTranslationElement(el, editableAncestor)) return false;
  if (el.closest('[role="button"], [role="link"], [role="menu"], [role="menubar"], [role="menuitem"], [role="toolbar"], [role="tablist"], [role="tab"], [role="dialog"], [role="alert"], [role="status"], [role="navigation"], [role="search"], [role="complementary"], [aria-modal="true"]')) return false;
  if (el.querySelector('textarea, input, select, button, [role="button"], [role="menuitem"], [role="tab"]')) return false;
  const editableChild = el.querySelector('[contenteditable="true"]');
  if (editableChild && !isAllowedEditablePageTranslationElement(editableChild, editableChild)) return false;
  if (el.classList.contains('ffb-page-source-translated')) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width < 80 || rect.height < 12) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
  return true;
}

function isAllowedEditablePageTranslationElement(el, editableEl) {
  const node = el || editableEl;
  if (!node) return false;
  if (!node.matches?.('[contenteditable="true"], [data-content-editable-leaf="true"]')) return false;
  const inNotionContent = Boolean(node.closest('.notion-page-content, [data-block-id]'));
  if (!inNotionContent) return false;
  if (node.closest('[role="toolbar"], [role="menu"], [role="menubar"], [role="dialog"], [role="button"], button, form, nav, aside, header, footer')) return false;
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
  if (isQuizChoicePageTranslationElement(el)) return PAGE_TRANSLATION_LIMITS.minChoiceChars;
  if (el.tagName === 'LI') return PAGE_TRANSLATION_LIMITS.minListChars;
  return PAGE_TRANSLATION_LIMITS.minChars;
}

function isAllowedFormPageTranslationElement(el) {
  if (!el) return false;
  if (el.closest('button, input, select, textarea, [role="button"], [role="link"], [role="menu"], [role="menubar"], [role="menuitem"], [role="toolbar"], [role="tablist"], [role="tab"], [role="dialog"], [role="alert"], [role="status"], [role="navigation"], [role="search"], [aria-modal="true"]')) return false;
  return isQuizChoicePageTranslationElement(el)
    || Boolean(el.closest('[class*="question" i], [class*="answer" i], [class*="option" i], [class*="choice" i], [role="radio"], [role="checkbox"]'));
}

function isQuizChoicePageTranslationElement(el) {
  if (!el?.matches) return false;
  return el.matches('[role="heading"], .mat-radio-label-content, .mdc-label')
    || Boolean(el.closest('[role="radio"], [role="checkbox"], label, [class*="question" i], [class*="answer" i], [class*="option" i], [class*="choice" i]'));
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

function buildPageTranslationContextDigest(item, items = pageTranslationState.items, options = {}) {
  const allItems = Array.isArray(items) ? items : [];
  const index = Math.max(0, allItems.indexOf(item));
  const nearby = allItems
    .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
    .filter(({ candidateIndex }) => candidateIndex !== index && Math.abs(candidateIndex - index) <= 2)
    .map(({ candidateIndex, candidate }) => `${candidateIndex < index ? 'Before' : 'After'}: ${truncatePageTranslationContextText(candidate.text, 220)}`)
    .filter(Boolean);
  const headings = collectPageTranslationHeadingSummary(options.root || document);
  const lines = [
    `Page title: ${document.title || ''}`,
    headings ? `Main headings: ${headings}` : '',
    nearby.length ? `Nearby paragraphs:\n${nearby.join('\n')}` : ''
  ].filter(Boolean);

  return truncatePageTranslationContextText(lines.join('\n'), PAGE_TRANSLATION_LIMITS.contextMaxChars);
}

function collectPageTranslationHeadingSummary(root = document) {
  const headings = Array.from(root.querySelectorAll?.('main h1, main h2, main h3, article h1, article h2, article h3, h1, h2, h3') || [])
    .map(el => getElementStructuredTranslationText(el))
    .map(text => text.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  return truncatePageTranslationContextText([...new Set(headings)].slice(0, 5).join(' / '), PAGE_TRANSLATION_LIMITS.contextHeadingMaxChars);
}

function truncatePageTranslationContextText(text, maxChars) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!maxChars || value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 1)).trim()}…`;
}

function normalizePageTranslationComparableText(text) {
  return String(text || '')
    .replace(/[「」『』“”‘’"'`]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function detectEmbeddedTranslationTargets(root = document) {
  const queryAll = selector => Array.from(root.querySelectorAll?.(selector) || []);
  const iframeCount = queryAll('iframe').filter(isVisiblePageTranslationEmbeddedNode).length;
  const canvasCount = queryAll('canvas').filter(isVisiblePageTranslationEmbeddedNode).length;
  const svgTextCount = queryAll('svg text, svg title, svg [aria-label]')
    .filter(node => isVisiblePageTranslationEmbeddedNode(node.closest?.('svg') || node) && isVisiblePageTranslationEmbeddedNode(node))
    .filter(node => (node.getAttribute?.('aria-label') || node.textContent || '').trim())
    .length;
  const openShadowRootCount = queryAll('*').filter(node => node.shadowRoot).length;

  const total = iframeCount + canvasCount + svgTextCount + openShadowRootCount;
  return {
    iframeCount,
    svgTextCount,
    openShadowRootCount,
    canvasCount,
    total
  };
}

// 嵌入內容不在頁面上就地翻譯，但要收集出來讓面板講清楚「哪些沒被翻到」
function collectEmbeddedTranslationTargets(root = document, options = {}) {
  return {
    frames: collectEmbeddedFrameTranslationTargets(root, options),
    svgTexts: collectSvgTextTranslationTargets(root)
  };
}

function collectEmbeddedFrameTranslationTargets(root = document, options = {}) {
  return Array.from(root.querySelectorAll?.('iframe') || [])
    .map(frame => describeEmbeddedFrameTranslationTarget(frame, options))
    .filter(Boolean);
}

function describeEmbeddedFrameTranslationTarget(frame, options = {}) {
  if (!frame || !isVisiblePageTranslationEmbeddedNode(frame)) return null;
  const src = frame.getAttribute('src') || '';
  const title = (frame.getAttribute('title') || frame.getAttribute('name') || '').trim();
  const srcdoc = frame.hasAttribute('srcdoc');
  const currentOrigin = options.currentOrigin || location.origin;
  const sameDocument = srcdoc || !src || /^about:(?:blank)?$/i.test(src);

  if (sameDocument) {
    return {
      type: 'iframe',
      title,
      src,
      status: 'ready',
      bridgeMode: 'same-document',
      reason: 'same-document'
    };
  }

  let url;
  try {
    url = new URL(src, location.href);
  } catch {
    return {
      type: 'iframe',
      title,
      src,
      status: 'blocked',
      bridgeMode: 'none',
      reason: 'invalid-src'
    };
  }

  if (!/^https?:$/.test(url.protocol)) {
    return {
      type: 'iframe',
      title,
      src: url.href,
      status: 'blocked',
      bridgeMode: 'none',
      reason: 'unsupported-scheme'
    };
  }

  const sameOrigin = url.origin === currentOrigin;
  return {
    type: 'iframe',
    title,
    src: url.href,
    status: 'ready',
    bridgeMode: sameOrigin ? 'same-origin' : 'frame-script',
    reason: sameOrigin ? 'same-origin' : 'cross-origin-frame-script'
  };
}

function collectSvgTextTranslationTargets(root = document) {
  const seen = new Set();
  return Array.from(root.querySelectorAll?.('svg text, svg title, svg [aria-label]') || [])
    .map(node => {
      const text = getSvgTranslationTargetText(node);
      const normalized = normalizePageTranslationComparableText(text);
      const svg = node.closest?.('svg');
      if (!text || seen.has(normalized) || !svg) return null;
      if (!isVisiblePageTranslationEmbeddedNode(svg) || !isVisiblePageTranslationEmbeddedNode(node)) return null;
      seen.add(normalized);
      return {
        type: 'svg-text',
        node,
        svg,
        text,
        kind: node.tagName?.toLowerCase() === 'title'
          ? 'title'
          : (node.hasAttribute?.('aria-label') ? 'aria-label' : 'text'),
        overlayMode: 'tooltip'
      };
    })
    .filter(Boolean);
}

function getSvgTranslationTargetText(node) {
  return String(node?.getAttribute?.('aria-label') || node?.textContent || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectOpenShadowDomTranslationBlocks(root = document) {
  const hosts = Array.from(root.querySelectorAll?.('*') || []).filter(node => node.shadowRoot);
  const items = [];
  const seenTexts = new Set();
  hosts.forEach(host => {
    Array.from(host.shadowRoot.querySelectorAll('h1, h2, h3, p, li, [role="heading"]')).forEach(el => {
      if (!isPageTranslatableElement(el)) return;
      const text = getElementTranslationText(el);
      const normalized = normalizePageTranslationComparableText(text);
      if (!text || seenTexts.has(normalized)) return;
      seenTexts.add(normalized);
      items.push({
        host,
        el,
        text,
        pairId: createPageTranslationPairId(),
        status: 'pending',
        translationNode: null,
        translatedText: '',
        source: 'open-shadow-dom'
      });
    });
  });
  return items;
}

function isVisiblePageTranslationEmbeddedNode(node) {
  if (!node) return false;
  const rect = node.getBoundingClientRect?.();
  const tagName = String(node.tagName || '').toLowerCase();
  const isSvgTextNode = ['svg', 'text', 'title', 'g'].includes(tagName);
  if (rect && (rect.width <= 0 || rect.height <= 0) && !isSvgTextNode) return false;
  const style = window.getComputedStyle?.(node);
  return !(style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'));
}

function buildEmbeddedTranslationSummaryText(summary, targets = null) {
  if (!summary) return '';
  const userVisibleEmbeddedCount = Number(summary.iframeCount || 0)
    + Number(summary.svgTextCount || 0)
    + Number(summary.canvasCount || 0);
  if (!userVisibleEmbeddedCount) return '';
  const base = '本頁有部分圖表或互動內容目前無法全文翻譯，可改用選取翻譯。';
  const detail = buildEmbeddedTranslationTargetDetail(targets);
  return detail ? `${base}（${detail}）` : base;
}

function buildEmbeddedTranslationTargetDetail(targets) {
  const frames = Array.isArray(targets?.frames) ? targets.frames : [];
  const svgTexts = Array.isArray(targets?.svgTexts) ? targets.svgTexts : [];
  const blockedFrames = frames.filter(frame => frame.status === 'blocked').length;
  return [
    frames.length ? `嵌入框架 ${frames.length} 個${blockedFrames ? `（${blockedFrames} 個讀不到）` : ''}` : '',
    svgTexts.length ? `圖表文字 ${svgTexts.length} 段` : ''
  ].filter(Boolean).join('、');
}

function buildPageLearningSummary(items = [], options = {}) {
  const sourceItems = (Array.isArray(items) ? items : [])
    .map(item => String(item?.translatedText || item?.text || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const text = sourceItems.join(' ');
  return {
    title: String(options.title || document.title || '').trim(),
    keySentences: splitPageLearningSentences(text).slice(0, options.maxSentences || 3),
    vocabularyCandidates: extractPageLearningVocabularyCandidates(text, options.maxVocabulary || 8),
    sourceCount: sourceItems.length
  };
}

function splitPageLearningSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?。！？])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 12);
}

function extractPageLearningVocabularyCandidates(text, limit = 8) {
  const counts = new Map();
  String(text || '').toLowerCase().match(/[a-z][a-z'-]{5,}/g)?.forEach(word => {
    if (PAGE_LEARNING_STOP_WORDS.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
