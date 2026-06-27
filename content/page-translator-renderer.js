'use strict';

// 全文翻譯 Beta：譯文節點渲染、格式化、字級／對比樣式

function createPageTranslationBlock(item) {
  const block = document.createElement(item.el.tagName === 'LI' ? 'li' : 'div');
  block.className = 'ffb-page-translation-block ffb-page-translation-loading';
  block.dataset.ffbPairId = item.pairId;
  block.append(
    ffbEl('div', { class: 'ffb-page-translation-text' }, '翻譯中...')
  );
  bindPageTranslationBlockEvents(block);
  return block;
}

function applyPageTranslationSourceTypography(sourceEl, block) {
  if (!sourceEl || !block) return;
  const style = window.getComputedStyle(sourceEl);
  const fontSize = style.fontSize || '14px';
  const lineHeight = normalizePageTranslationLineHeight(style.lineHeight, fontSize);
  const contrastTheme = getPageTranslationContrastTheme(sourceEl);
  block.style.setProperty('--ffb-page-source-font-size', fontSize);
  block.style.setProperty('--ffb-page-source-line-height', lineHeight);
  Object.entries(contrastTheme).forEach(([name, value]) => block.style.setProperty(name, value));
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

function getPageTranslationContrastTheme(sourceEl) {
  const background = findEffectivePageTranslationBackground(sourceEl);
  const isDark = background ? getPageTranslationRelativeLuminance(background) < 0.34 : false;
  if (!isDark) return {};
  return {
    '--ffb-page-translation-color': '#f8fafc',
    '--ffb-page-translation-muted-color': '#dbeafe',
    '--ffb-page-translation-accent': 'rgba(250, 204, 21, 0.92)',
    '--ffb-page-translation-accent-soft': 'rgba(250, 204, 21, 0.32)',
    '--ffb-page-translation-action-color': '#fff7d6',
    '--ffb-page-translation-action-bg': 'rgba(255, 255, 255, 0.16)',
    '--ffb-page-translation-action-border': 'rgba(255, 255, 255, 0.34)',
    '--ffb-page-translation-fade-bg': 'rgba(2, 6, 23, 0.92)'
  };
}

function findEffectivePageTranslationBackground(sourceEl) {
  let node = sourceEl;
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const color = parsePageTranslationCssColor(window.getComputedStyle(node).backgroundColor);
    if (color && color.a > 0.05) return color;
    node = node.parentElement;
  }
  const bodyColor = parsePageTranslationCssColor(window.getComputedStyle(document.body).backgroundColor);
  if (bodyColor && bodyColor.a > 0.05) return bodyColor;
  return null;
}

function parsePageTranslationCssColor(value) {
  const color = String(value || '').trim();
  if (!color || color === 'transparent') return null;
  const rgbMatch = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgbMatch) {
    return {
      r: clampPageTranslationColor(Number(rgbMatch[1])),
      g: clampPageTranslationColor(Number(rgbMatch[2])),
      b: clampPageTranslationColor(Number(rgbMatch[3])),
      a: rgbMatch[4] === undefined ? 1 : Math.max(0, Math.min(Number(rgbMatch[4]), 1))
    };
  }
  const hexMatch = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hexMatch) return null;
  const hex = hexMatch[1].length === 3
    ? hexMatch[1].split('').map(char => char + char).join('')
    : hexMatch[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
    a: 1
  };
}

function clampPageTranslationColor(value) {
  return Math.max(0, Math.min(Math.round(Number(value) || 0), 255));
}

function getPageTranslationRelativeLuminance({ r, g, b }) {
  const channels = [r, g, b].map(value => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });
  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function renderPageTranslationResult(item, result) {
  if (!item.translationNode) return;
  item.translationNode.classList.remove('ffb-page-translation-loading', 'ffb-page-translation-error');
  const shouldCollapse = result.length > PAGE_TRANSLATION_LIMITS.collapseChars;
  item.translationNode.classList.toggle('ffb-page-collapsible', shouldCollapse);
  item.translationNode.classList.toggle('ffb-page-collapsed', shouldCollapse);
  item.translationNode.classList.toggle('ffb-page-long', shouldCollapse);

  const actions = ffbEl('div', { class: 'ffb-page-translation-actions' },
    ffbEl('button', {
      class: 'ffb-page-locate-btn', type: 'button', 'data-ffb-action': 'locate-source',
      title: '定位原文', 'aria-label': '定位到對應原文'
    }, '原'));
  if (shouldCollapse) {
    actions.appendChild(ffbEl('button', {
      class: 'ffb-page-expand-btn', type: 'button', 'data-ffb-action': 'toggle-collapse',
      title: '展開全文', 'aria-label': '展開全文'
    }, '⌄'));
  }
  const head = ffbEl('div', { class: 'ffb-page-translation-head' },
    actions);
  // 譯文本體是 formatPageTranslationText 產生、且內部已 escapeHtml 過的 HTML 結構，仍以 innerHTML 注入
  const textEl = ffbEl('div', { class: 'ffb-page-translation-text' });
  textEl.innerHTML = formatPageTranslationText(result);

  ffbClear(item.translationNode);
  item.translationNode.append(head, textEl);
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
  const retryButton = ffbEl('button', { class: 'ffb-page-retry', type: 'button', 'aria-label': '重試此段' }, '重試此段');
  ffbClear(item.translationNode);
  item.translationNode.append(
    ffbEl('div', { class: 'ffb-page-translation-text' }, message),
    retryButton
  );
  bindPageTranslationBlockEvents(item.translationNode);
  retryButton.addEventListener('click', async e => {
    e.stopPropagation();
    pageTranslationState.errors = Math.max(0, pageTranslationState.errors - 1);
    pageTranslationState.usage.failed = Math.max(0, pageTranslationState.usage.failed - 1);
    await translatePageItem(item);
    updatePageTranslationPanel();
  });
}
