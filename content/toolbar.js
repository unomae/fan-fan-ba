'use strict';

function createToolbar() {
  const el = document.createElement('div');
  el.id = 'gemini-ai-toolbar';
  el.innerHTML = `
    <button class="g-btn" data-action="translate" data-tooltip="翻譯" aria-label="翻譯">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
        <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
      </svg>
    </button>
    <span class="g-sep"></span>
    <button class="g-btn" data-action="explain" data-tooltip="解釋這個" aria-label="解釋這個">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
      </svg>
    </button>
    <span class="g-sep"></span>
    <button class="g-btn" data-action="optimize" data-tooltip="優化精進" aria-label="優化精進">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
    </button>
  `;

  el.querySelectorAll('.g-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      triggerAction(btn.dataset.action); // triggerAction 在 main.js 定義，click 時已載入
    });
  });

  document.body.appendChild(el);
  return el;
}

function showToolbar() {
  if (!toolbar || !document.body.contains(toolbar)) toolbar = createToolbar();
  toolbar.querySelectorAll('.g-btn').forEach(b => b.classList.remove('g-active'));
  positionToolbar();
  toolbar.classList.add('g-show');

  toolbar.style.transformOrigin = '';
  toolbar.animate([
    { opacity: 0, transform: 'translateY(5px)' },
    { opacity: 1, transform: 'translateY(0)' }
  ], { duration: 150, easing: 'ease-out', fill: 'none' });
}

function hideToolbar() {
  toolbar?.classList.remove('g-show');
}

function positionToolbar() {
  if (!savedSel) return;
  try {
    const rect   = getToolbarAnchorRect(savedSel);
    if (!rect) return;
    const margin = 8;
    const th     = toolbar.offsetHeight || 42;
    const tw     = toolbar.offsetWidth  || 120;

    let top  = rect.top - th - margin;
    let left = rect.right + margin;

    if (rect.top < th + margin) top = rect.bottom + margin;
    if (top + th > window.innerHeight - margin) top = Math.max(margin, rect.top - th - margin);
    if (left + tw > window.innerWidth - margin) left = rect.right - tw;

    left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));

    toolbar.style.top  = `${top}px`;
    toolbar.style.left = `${left}px`;
  } catch { /* 靜默忽略（跨 iframe 等情境）*/ }
}

function getToolbarAnchorRect(selectionState) {
  if (!selectionState) return null;
  const rangeRect = getRangeViewportRect(selectionState.range);
  if (rangeRect) return rangeRect;
  if (selectionState.rect && isUsableToolbarRect(selectionState.rect)) return normalizeToolbarRect(selectionState.rect);
  if (selectionState.point) {
    return {
      left: selectionState.point.clientX,
      right: selectionState.point.clientX,
      top: selectionState.point.clientY,
      bottom: selectionState.point.clientY,
      width: 0,
      height: 0
    };
  }
  return null;
}

function getRangeViewportRect(range) {
  if (!range) return null;
  const rects = Array.from(range.getClientRects?.() || [])
    .map(normalizeToolbarRect)
    .filter(isUsableToolbarRect)
    .filter(rect => rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth);

  if (rects.length) return mergeToolbarRects(rects);

  const rect = normalizeToolbarRect(range.getBoundingClientRect?.());
  return isUsableToolbarRect(rect) ? rect : null;
}

function normalizeToolbarRect(rect) {
  if (!rect) return null;
  const left = Number(rect.left);
  const right = Number(rect.right);
  const top = Number(rect.top);
  const bottom = Number(rect.bottom);
  const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : right - left;
  const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : bottom - top;
  return { left, right, top, bottom, width, height };
}

function isUsableToolbarRect(rect) {
  return Boolean(rect)
    && [rect.left, rect.right, rect.top, rect.bottom].every(Number.isFinite)
    && rect.width >= 0
    && rect.height >= 0
    && (rect.width > 0 || rect.height > 0);
}

function mergeToolbarRects(rects) {
  const left = Math.min(...rects.map(rect => rect.left));
  const right = Math.max(...rects.map(rect => rect.right));
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top
  };
}
