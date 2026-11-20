'use strict';

// 全文翻譯 Beta：單段翻譯（鍵盤快捷鍵 Alt+T）
//
// 重用整頁翻譯的基礎設施（translatePageItem / pair / renderer / typography /
// locate），與整頁翻譯共用同一份 pageTranslationState 與控制面板，差別只在
// 「一次只翻一段、按需加入佇列」。只在 top frame 啟用（與浮球同一 guard）。

const SINGLE_TRANSLATE_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote';
const SINGLE_TRANSLATE_FAST_SKIP_SELECTOR = '#gemini-ai-toolbar, #gemini-result-card, #fanfanba-floating, .ffb-page-translation-panel, .ffb-page-translation-block, nav, header, footer, aside, button, script, style, pre, code, [aria-hidden="true"]';
let ffbSingleLastBlock = null;      // 最近 hover 到的候選區塊（給快捷鍵 fallback）
let ffbSingleRecentBlocks = [];     // 保留最近幾個不重複候選，避免滑過短段落蓋掉前一個有效區塊
let ffbSingleBound = false;

function initSingleParagraphTranslate() {
  if (ffbSingleBound) return;
  ffbSingleBound = true;
  document.addEventListener('mouseover', trackSingleTranslateTarget, true);
  document.addEventListener('keydown', onSingleTranslateShortcut, true);
}

// 從事件目標往上找最近的可翻譯區塊（標題 / 段落 / 清單項 / 引言）
function findSinglePageTranslatableBlock(node) {
  const start = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!start?.closest) return null;
  if (start.closest('#gemini-ai-toolbar, #gemini-result-card, #fanfanba-floating, .ffb-page-translation-panel, .ffb-page-translation-block')) return null;
  const block = start.closest(SINGLE_TRANSLATE_BLOCK_SELECTOR);
  if (!block || !isPageTranslatableElement(block)) return null;
  if (!getElementTranslationText(block)) return null;
  return block;
}

// 只記錄滑鼠所在候選段落，不在 mouseover 跑 getBoundingClientRect／getComputedStyle／innerText
// （避免所有網頁滑鼠移動就觸發同步強制排版）；完整驗證延後到真正按下 Alt+T 時執行。
function trackSingleTranslateTarget(e) {
  if (fanFanBaPaused) return;
  const node = e.target;
  const start = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  if (!start?.closest) return;
  if (start.closest(SINGLE_TRANSLATE_FAST_SKIP_SELECTOR)) return;
  const block = start.closest(SINGLE_TRANSLATE_BLOCK_SELECTOR);
  if (!block || block === ffbSingleLastBlock) return;
  ffbSingleLastBlock = block;
  ffbSingleRecentBlocks = [block, ...ffbSingleRecentBlocks.filter(item => item !== block)].slice(0, 3);
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
  // 2) 最近 hover 到、且實際通過可翻譯檢查的區塊
  const candidates = ffbSingleRecentBlocks.length
    ? ffbSingleRecentBlocks
    : (ffbSingleLastBlock ? [ffbSingleLastBlock] : []);
  for (const candidate of candidates) {
    if (candidate?.isConnected && findSinglePageTranslatableBlock(candidate)) {
      return candidate;
    }
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
  const state = pageTranslationState;

  const item = {
    el: block,
    text,
    sourceSnapshot: getPageTranslationSourceSnapshot(block),
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

  // 單段翻譯的上下文取自「實際 DOM 鄰居」，而非稀疏的 items 佇列，
  // 讓 AI 拿到前後文，翻得更準（Phase C 長文 context 調優）。
  await translatePageItem(item, { requestKind: 'single', context: buildSinglePageContext(item) });

  if (state !== pageTranslationState) return true;
  pageTranslationState.canContinue = hasVisibleTranslatableBlocks();
  updatePageTranslationPanel();
  updateFloatingBallPageTranslationState?.(pageTranslationState);
  return true;
}

// 用 block 在 DOM 中前後 ±2 個可翻譯區塊組成上下文（含 block 自己，
// 讓 buildPageTranslationContextDigest 的 indexOf 能正確標 Before/After）
function buildSinglePageContext(item) {
  // T5：高敏站點不擷取周邊段落作為上下文
  if (typeof shouldOmitPageTranslationContext === 'function' && shouldOmitPageTranslationContext()) return '';
  const block = item.el;
  const all = Array.from(document.querySelectorAll(SINGLE_TRANSLATE_BLOCK_SELECTOR));
  const idx = all.indexOf(block);
  const neighbors = [];
  if (idx >= 0) {
    for (let i = Math.max(0, idx - 2); i <= Math.min(all.length - 1, idx + 2); i += 1) {
      if (all[i] === block) { neighbors.push(item); continue; }
      const text = getElementTranslationText(all[i]);
      if (text) neighbors.push({ el: all[i], text });
    }
  }
  if (!neighbors.includes(item)) neighbors.push(item);
  return buildPageTranslationContextDigest(item, neighbors);
}

// 輕量啟動：確保面板與 watcher 就緒，但不跑整頁佇列
function ensurePageTranslationSessionForSingle() {
  bindPageTranslationNavigationWatcher();
  pageTranslationLocationKey = getPageTranslationLocationKey();
  ensurePageTranslationPanel();
  pageTranslationState.stopped = false;
  pageTranslationState.stopping = false;
  bindPageTranslationContentWatcher();
  if (!pageTranslationState.activated) {
    pageTranslationState.activated = true;
    setPageTranslationMode(pageTranslationState.mode || 'bilingual');
    setPageTranslationDensity(pageTranslationState.density || 'compact');
    bindPageTranslationScrollWatcher();
    bindPageTranslationSelectionWatcher();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { findSinglePageTranslatableBlock, getSingleTranslateShortcutTarget, buildSinglePageContext };
}

// 與浮球同一 guard：只在最上層 frame、非敏感網域啟用
if (typeof fanFanBaShouldShowFloatingBall === 'function' && fanFanBaShouldShowFloatingBall()) {
  initSingleParagraphTranslate();
}
