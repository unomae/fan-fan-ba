'use strict';

// 全文翻譯 Beta：單段翻譯（hover 浮鈕 + 鍵盤快捷鍵 Alt+T）
//
// 重用整頁翻譯的基礎設施（translatePageItem / pair / renderer / typography /
// locate），與整頁翻譯共用同一份 pageTranslationState 與控制面板，差別只在
// 「一次只翻一段、按需加入佇列」。只在 top frame 啟用（與浮球同一 guard）。

const SINGLE_TRANSLATE_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote';
let ffbSingleTranslateButton = null;
let ffbSingleHoverBlock = null;     // 目前浮鈕對應的區塊
let ffbSingleLastBlock = null;      // 最近 hover 到的可翻譯區塊（給快捷鍵 fallback）
let ffbSingleHideTimer = null;
let ffbSingleBound = false;

function initSingleParagraphTranslate() {
  if (ffbSingleBound) return;
  ffbSingleBound = true;
  document.addEventListener('mouseover', onSingleTranslateHover, true);
  document.addEventListener('keydown', onSingleTranslateShortcut, true);
}

// 從事件目標往上找最近的可翻譯區塊（標題 / 段落 / 清單項 / 引言）
function findSinglePageTranslatableBlock(node) {
  const start = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!start?.closest) return null;
  if (start.closest('#gemini-ai-toolbar, #gemini-result-card, #fanfanba-floating, .ffb-page-translation-panel, .ffb-page-translation-block, .ffb-single-translate-btn')) return null;
  const block = start.closest(SINGLE_TRANSLATE_BLOCK_SELECTOR);
  if (!block || !isPageTranslatableElement(block)) return null;
  if (!getElementTranslationText(block)) return null;
  return block;
}

// ── hover 浮鈕 ───────────────────────────────────────
function onSingleTranslateHover(e) {
  if (fanFanBaPaused) { hideSingleTranslateButton(); return; }
  const block = findSinglePageTranslatableBlock(e.target);
  if (!block) { scheduleHideSingleTranslateButton(); return; }
  ffbSingleLastBlock = block;
  if (block === ffbSingleHoverBlock && ffbSingleTranslateButton?.classList.contains('ffb-single-show')) return;
  ffbSingleHoverBlock = block;
  showSingleTranslateButtonFor(block);
}

function ensureSingleTranslateButton() {
  if (ffbSingleTranslateButton && document.body.contains(ffbSingleTranslateButton)) return ffbSingleTranslateButton;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ffb-single-translate-btn';
  btn.textContent = '譯';
  btn.title = '翻譯這一段（Alt+T）';
  btn.setAttribute('aria-label', '翻譯這一段');
  btn.addEventListener('mousedown', ev => { ev.preventDefault(); ev.stopPropagation(); });
  btn.addEventListener('mouseenter', () => clearTimeout(ffbSingleHideTimer));
  btn.addEventListener('mouseleave', scheduleHideSingleTranslateButton);
  btn.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ffbSingleHoverBlock;
    hideSingleTranslateButton();
    if (target) translateSinglePageBlock(target);
  });
  document.body.appendChild(btn);
  ffbSingleTranslateButton = btn;
  return btn;
}

function showSingleTranslateButtonFor(block) {
  clearTimeout(ffbSingleHideTimer);
  const btn = ensureSingleTranslateButton();
  const rect = block.getBoundingClientRect();
  btn.style.top = `${Math.max(4, rect.top + 2)}px`;
  btn.style.left = `${Math.min(window.innerWidth - 32, rect.right - 26)}px`;
  btn.classList.add('ffb-single-show');
}

function scheduleHideSingleTranslateButton() {
  clearTimeout(ffbSingleHideTimer);
  ffbSingleHideTimer = setTimeout(hideSingleTranslateButton, 180);
}

function hideSingleTranslateButton() {
  clearTimeout(ffbSingleHideTimer);
  ffbSingleHoverBlock = null;
  ffbSingleTranslateButton?.classList.remove('ffb-single-show');
}

// ── 鍵盤快捷鍵 Alt+T ─────────────────────────────────
function onSingleTranslateShortcut(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (String(e.key).toLowerCase() !== 't') return;
  if (fanFanBaPaused) return;
  const block = getSingleTranslateShortcutTarget();
  if (!block) return;
  e.preventDefault();
  e.stopPropagation();
  translateSinglePageBlock(block);
}

function getSingleTranslateShortcutTarget() {
  // 1) 目前選取所在的區塊
  const sel = window.getSelection?.();
  if (sel && !sel.isCollapsed && sel.rangeCount) {
    const fromSelection = findSinglePageTranslatableBlock(sel.getRangeAt(0).commonAncestorContainer);
    if (fromSelection) return fromSelection;
  }
  // 2) 最近 hover 到、且仍可翻譯的區塊
  if (ffbSingleLastBlock?.isConnected && isPageTranslatableElement(ffbSingleLastBlock)) {
    return ffbSingleLastBlock;
  }
  return null;
}

// ── 核心：翻譯單一區塊（按需加入既有佇列狀態）──────────
async function translateSinglePageBlock(el) {
  const block = findSinglePageTranslatableBlock(el) || el;
  if (!block) return false;

  // 已翻譯過 → 直接定位，不重複請求
  const existingPairId = block.dataset?.ffbPairId;
  if (existingPairId && pageTranslationPairs.has(existingPairId)) {
    locatePageTranslationSource(existingPairId);
    return true;
  }

  const text = getElementTranslationText(block);
  if (!text) return false;

  ensurePageTranslationSessionForSingle();

  const item = {
    el: block,
    text,
    pairId: createPageTranslationPairId(),
    status: 'pending',
    translationNode: null,
    translatedText: ''
  };
  pageTranslationState.items.push(item);
  pageTranslationState.total += 1;
  pageTranslationState.activated = true;
  if (pageTranslationState.usage) pageTranslationState.usage.paragraphs += 1;
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);

  await translatePageItem(item, { requestKind: 'single' });

  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);
  return true;
}

// 輕量啟動：確保面板與 watcher 就緒，但不跑整頁佇列
function ensurePageTranslationSessionForSingle() {
  bindPageTranslationNavigationWatcher();
  pageTranslationLocationKey = getPageTranslationLocationKey();
  ensurePageTranslationPanel();
  pageTranslationState.stopped = false;
  pageTranslationState.stopping = false;
  if (!pageTranslationState.activated) {
    pageTranslationState.activated = true;
    setPageTranslationMode(pageTranslationState.mode || 'bilingual');
    setPageTranslationDensity(pageTranslationState.density || 'compact');
    bindPageTranslationScrollWatcher();
    bindPageTranslationSelectionWatcher();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { findSinglePageTranslatableBlock, getSingleTranslateShortcutTarget };
}

// 與浮球同一 guard：只在最上層 frame、非敏感網域啟用
if (typeof fanFanBaShouldShowFloatingBall === 'function' && fanFanBaShouldShowFloatingBall()) {
  initSingleParagraphTranslate();
}
