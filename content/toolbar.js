'use strict';

// 內建三個動作的工具列按鈕（提示文字與圖示維持改版前）
const TOOLBAR_BUILTIN_BUTTONS = {
  translate: {
    label: '翻譯',
    shapes: [
      ['path', { d: 'm5 8 6 6' }], ['path', { d: 'm4 14 6-6 2-3' }], ['path', { d: 'M2 5h12' }], ['path', { d: 'M7 2h1' }],
      ['path', { d: 'm22 22-5-10-5 10' }], ['path', { d: 'M14 18h6' }]
    ]
  },
  explain: {
    label: '解釋這個',
    shapes: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]]
  },
  optimize: {
    label: '優化精進',
    shapes: [
      ['path', { d: 'm12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z' }]
    ]
  }
};
const TOOLBAR_MAX_PINNED = 4;
const TOOLBAR_MORE_SHAPES = [['circle', { cx: 5, cy: 12, r: 1 }], ['circle', { cx: 12, cy: 12, r: 1 }], ['circle', { cx: 19, cy: 12, r: 1 }]];

let toolbarActionList = null; // 動作清單（main.js 讀 storage 後設定）；還沒讀到時用內建三個
let actionMenuDragId = null;

function toolbarIcon(shapes, size = 16) {
  return ffbSvgIcon({
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }, shapes);
}

function getAllToolbarActions() {
  if (Array.isArray(toolbarActionList)) return toolbarActionList;
  return Object.keys(TOOLBAR_BUILTIN_BUTTONS).map((id, order) => ({ id, builtin: true, enabled: true, pinned: true, order }));
}

function getEnabledToolbarActions() {
  return getAllToolbarActions().filter(action => action.enabled);
}

// 工具列只放釘選且啟用的動作，最多 4 個
function getPinnedToolbarActions() {
  return getEnabledToolbarActions().filter(action => action.pinned).slice(0, TOOLBAR_MAX_PINNED);
}

function getToolbarActionLabel(action) {
  return action.builtin ? (TOOLBAR_BUILTIN_BUTTONS[action.id]?.label || action.name || action.id) : action.name;
}

function buildToolbarActionIcon(action, size = 16) {
  if (action.builtin && TOOLBAR_BUILTIN_BUTTONS[action.id]) return toolbarIcon(TOOLBAR_BUILTIN_BUTTONS[action.id].shapes, size);
  return typeof buildCustomActionIcon === 'function' ? buildCustomActionIcon(action.icon, size) : toolbarIcon(TOOLBAR_MORE_SHAPES, size);
}

// 內建動作走 triggerAction；自訂動作走 runCustomAction（兩者都在 main.js，click 時已載入）
function runToolbarAction(action) {
  closeActionMenu();
  if (action.builtin) triggerAction(action.id);
  else runCustomAction(action);
}

function buildToolbarButton(action) {
  const label = getToolbarActionLabel(action);
  const btn = ffbEl('button', {
    class: 'g-btn',
    dataset: { action: action.builtin ? action.id : 'custom', actionId: action.builtin ? null : action.id, tooltip: label },
    'aria-label': label
  }, buildToolbarActionIcon(action));
  btn.addEventListener('click', e => {
    e.stopPropagation();
    runToolbarAction(action);
  });
  return btn;
}

function createToolbar() {
  const el = ffbEl('div', { id: 'gemini-ai-toolbar' });
  const more = ffbEl('button', {
    class: 'g-btn g-more', type: 'button', dataset: { tooltip: '更多動作' },
    'aria-label': '更多動作', 'aria-haspopup': 'true', 'aria-expanded': 'false'
  }, toolbarIcon(TOOLBAR_MORE_SHAPES));
  more.addEventListener('click', e => {
    e.stopPropagation();
    if (el.querySelector('.g-action-menu')) closeActionMenu({ restoreFocus: true });
    else openActionMenu();
  });
  el.append(ffbEl('span', { class: 'g-sep g-more-sep' }), more);
  renderToolbarButtons(el);
  document.body.appendChild(el);
  return el;
}

// 只換掉動作按鈕，「⋯」與開著的選單保留
function renderToolbarButtons(el = toolbar) {
  if (!el) return;
  el.querySelectorAll(':scope > .g-btn:not(.g-more), :scope > .g-sep:not(.g-more-sep)').forEach(node => node.remove());
  const buttons = getPinnedToolbarActions().flatMap((action, index) => [
    index > 0 && ffbEl('span', { class: 'g-sep' }),
    buildToolbarButton(action)
  ]).filter(Boolean);
  el.querySelector('.g-more-sep').before(...buttons);
  el.querySelector('.g-more-sep').hidden = buttons.length === 0;
}

// main.js 讀到（或 storage 變更後）的新清單
function setToolbarActionList(list) {
  toolbarActionList = Array.isArray(list) ? list : null;
  renderToolbarButtons();
  renderActionMenu();
}

// ── 「⋯」選單：全部已啟用動作，可執行、釘選、排序 ────

function openActionMenu() {
  if (!toolbar) return;
  closeActionMenu();
  const menu = ffbEl('div', { class: 'g-action-menu', role: 'dialog', 'aria-label': '更多動作' }, [
    ffbEl('ul', { class: 'g-am-list' }),
    ffbEl('div', { class: 'g-am-notice', role: 'status' })
  ]);
  menu.addEventListener('keydown', onActionMenuKeydown);
  menu.addEventListener('click', e => e.stopPropagation());
  toolbar.appendChild(menu);
  toolbar.querySelector('.g-more')?.setAttribute('aria-expanded', 'true');
  renderActionMenu();
  positionActionMenu(menu);
  menu.querySelector('.g-am-run')?.focus();
}

function closeActionMenu({ restoreFocus = false } = {}) {
  const menu = toolbar?.querySelector('.g-action-menu');
  if (!menu) return;
  menu.remove();
  toolbar.querySelector('.g-more')?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) toolbar.querySelector('.g-more')?.focus();
}

// 預設在工具列下方靠右；下方放不下改往上，左右超出就貼齊視窗邊
function positionActionMenu(menu) {
  const margin = 8;
  menu.classList.remove('g-am-up');
  menu.style.left = '';
  menu.style.right = '';
  const rect = menu.getBoundingClientRect();
  const toolbarRect = toolbar.getBoundingClientRect();
  if (rect.bottom > window.innerHeight - margin && toolbarRect.top - rect.height - margin >= margin) {
    menu.classList.add('g-am-up');
  }
  if (rect.left < margin) {
    menu.style.right = 'auto';
    menu.style.left = `${margin - toolbarRect.left}px`;
  } else if (rect.right > window.innerWidth - margin) {
    menu.style.right = `${toolbarRect.right - (window.innerWidth - margin)}px`;
  }
}

function renderActionMenu() {
  const menu = toolbar?.querySelector('.g-action-menu');
  if (!menu) return;
  // 重畫前記下焦點在哪個動作的哪顆按鈕，重畫後還原（排序、釘選後可以連按）
  const focused = menu.contains(document.activeElement) ? document.activeElement : null;
  const focusKey = focused ? [focused.closest('.g-am-row')?.dataset.id, focused.dataset.role] : null;

  const actions = getEnabledToolbarActions();
  const pinnedIds = new Set(getPinnedToolbarActions().map(action => action.id));
  const list = menu.querySelector('.g-am-list');
  ffbClear(list).append(...actions.map((action, index) => {
    const label = getToolbarActionLabel(action);
    const pinned = pinnedIds.has(action.id);
    const button = (role, attrs, children, onClick) => {
      const btn = ffbEl('button', { type: 'button', dataset: { role }, ...attrs }, children);
      btn.addEventListener('click', e => { e.stopPropagation(); onClick(); });
      return btn;
    };
    const row = ffbEl('li', { class: 'g-am-row', dataset: { id: action.id }, draggable: 'true' }, [
      ffbEl('span', { class: 'g-am-handle', 'aria-hidden': 'true', title: '拖曳排序' }, '⋮⋮'),
      button('run', { class: 'g-am-run' }, [buildToolbarActionIcon(action, 15), ffbEl('span', null, label)], () => runToolbarAction(action)),
      button('pin', {
        class: `g-am-icon g-am-pin${pinned ? ' g-am-pinned' : ''}`, 'aria-pressed': pinned ? 'true' : 'false',
        'aria-label': `${pinned ? '取消釘選' : '釘選到工具列'}：${label}`, title: pinned ? '取消釘選' : '釘選到工具列'
      }, toolbarIcon([['path', { d: 'M12 17v5' }], ['path', { d: 'M5 17h14v-1.8a2 2 0 0 0-1.1-1.8l-1.8-.9A2 2 0 0 1 15 10.8V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.8a2 2 0 0 1-1.1 1.8l-1.8.9A2 2 0 0 0 5 15.2Z' }]], 13),
      () => toggleActionPinned(action.id)),
      button('up', { class: 'g-am-icon', 'aria-label': `上移：${label}`, title: '上移', disabled: index === 0 }, '↑', () => moveToolbarAction(action.id, -1)),
      button('down', { class: 'g-am-icon', 'aria-label': `下移：${label}`, title: '下移', disabled: index === actions.length - 1 }, '↓', () => moveToolbarAction(action.id, 1))
    ]);
    row.addEventListener('dragstart', e => {
      actionMenuDragId = action.id;
      e.dataTransfer?.setData('text/plain', action.id);
    });
    row.addEventListener('dragover', e => e.preventDefault());
    row.addEventListener('drop', e => {
      e.preventDefault();
      if (actionMenuDragId && actionMenuDragId !== action.id) moveToolbarActionTo(actionMenuDragId, action.id);
      actionMenuDragId = null;
    });
    return row;
  }));

  if (focusKey) {
    const row = [...list.querySelectorAll('.g-am-row')].find(item => item.dataset.id === focusKey[0]);
    const target = row?.querySelector(`[data-role="${focusKey[1]}"]`);
    if (target && !target.disabled) target.focus();
    else row?.querySelector('[data-role="run"]')?.focus();
  }
}

function setActionMenuNotice(message) {
  const notice = toolbar?.querySelector('.g-am-notice');
  if (notice) notice.textContent = message;
}

// 方向鍵在同一欄上下移動焦點；Esc 關閉並把焦點還給「⋯」
function onActionMenuKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    closeActionMenu({ restoreFocus: true });
    return;
  }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const role = e.target?.dataset?.role || 'run';
  const rows = [...toolbar.querySelectorAll('.g-action-menu .g-am-row')];
  const index = rows.indexOf(e.target.closest?.('.g-am-row'));
  const next = rows[(index + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
  if (!next) return;
  e.preventDefault();
  const target = next.querySelector(`[data-role="${role}"]`);
  (target && !target.disabled ? target : next.querySelector('[data-role="run"]')).focus();
}

// 寫回動作清單（走 custom-actions.js 的嚴格存檔）；storage 變更也會觸發 main.js 重讀
async function saveToolbarActionList(list) {
  const api = globalThis.FanFanBaCustomActions;
  try {
    const saved = api ? await api.saveActionList(list) : list;
    setToolbarActionList(saved);
    return true;
  } catch (error) {
    setActionMenuNotice(`儲存失敗：${error.message}`);
    return false;
  }
}

function withOrder(list) {
  return list.map((action, order) => ({ ...action, order }));
}

function toggleActionPinned(id) {
  const all = getAllToolbarActions();
  const target = all.find(action => action.id === id);
  if (!target) return Promise.resolve(false);
  const pinnedCount = getEnabledToolbarActions().filter(action => action.pinned).length;
  if (!target.pinned && pinnedCount >= TOOLBAR_MAX_PINNED) {
    setActionMenuNotice(`工具列最多放 ${TOOLBAR_MAX_PINNED} 個動作，請先取消一個`);
    return Promise.resolve(false);
  }
  setActionMenuNotice('');
  return saveToolbarActionList(all.map(action => (action.id === id ? { ...action, pinned: !action.pinned } : action)));
}

// 選單只列已啟用的動作；上移下移是跟「選單裡相鄰的那個」交換位置
function moveToolbarAction(id, delta) {
  const visible = getEnabledToolbarActions();
  const index = visible.findIndex(action => action.id === id);
  const neighbor = visible[index + delta];
  if (index === -1 || !neighbor) return Promise.resolve(false);
  return moveToolbarActionTo(id, neighbor.id);
}

function moveToolbarActionTo(id, targetId) {
  const all = getAllToolbarActions().slice();
  const from = all.findIndex(action => action.id === id);
  const to = all.findIndex(action => action.id === targetId);
  if (from === -1 || to === -1 || from === to) return Promise.resolve(false);
  const [moved] = all.splice(from, 1);
  all.splice(to, 0, moved);
  setActionMenuNotice('');
  return saveToolbarActionList(withOrder(all));
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
  closeActionMenu();
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
