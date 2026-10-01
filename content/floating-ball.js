'use strict';

const FLOATING_POSITION_KEY = 'fanFanBaFloatingPosition';
// 浮球與收藏面板的線條圖示（形狀陣列；由 floatingBallIcon 建成 SVG namespace 節點）
const FFB_ICON_HISTORY = [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }], ['path', { d: 'M12 7v5l4 2' }]];
const FFB_ICON_NOTEBOOK = [['path', { d: 'M2 6h4' }], ['path', { d: 'M2 10h4' }], ['path', { d: 'M2 14h4' }], ['path', { d: 'M2 18h4' }], ['rect', { x: 4, y: 2, width: 16, height: 20, rx: 2 }], ['path', { d: 'M9.5 8h5' }], ['path', { d: 'M9.5 12H16' }], ['path', { d: 'M9.5 16H14' }]];
const FFB_ICON_HIGHLIGHTER = [['path', { d: 'm9 11-6 6v3h9l3-3' }], ['path', { d: 'm22 12-4.6 4.6a2 2 0 0 1-2.83 0l-5.17-5.17a2 2 0 0 1 0-2.83L16 4' }]];
const FFB_ICON_LANGUAGES = [['path', { d: 'm5 8 6 6' }], ['path', { d: 'm4 14 6-6 2-3' }], ['path', { d: 'M2 5h12' }], ['path', { d: 'M7 2h1' }], ['path', { d: 'm22 22-5-10-5 10' }], ['path', { d: 'M14 18h6' }]];
const FFB_ICON_SETTINGS = [['path', { d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.52a2 2 0 0 1-1 1.72l-.15.1a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.52a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z' }], ['circle', { cx: 12, cy: 12, r: 3 }]];

function floatingBallIcon(shapes) {
  return ffbSvgIcon({ viewBox: '0 0 24 24', 'aria-hidden': 'true' }, shapes);
}

// getPauseStorageKey 已移至 content/site-policy.js（all_frames 都載入）。
// 本檔只在 top frame 載入，靠 site-policy 提供的 helper 取得 per-site 停用 key。

function initFloatingBall() {
  if (window.top !== window.self) return null;
  if (floatingBall && document.body.contains(floatingBall)) return floatingBall;
  floatingBall = createFloatingBall();
  document.body.appendChild(floatingBall);
  restoreFloatingBallPosition();
  updateFloatingBallPausedState();
  globalThis.restoreVocabularyHighlightState?.();
  return floatingBall;
}

function createFloatingBall() {
  const el = document.createElement('div');
  el.id = 'fanfanba-floating';
  const menuItem = ({ action, label, iconClass, labelClass, icon }) => ffbEl('button',
    { class: 'ffb-ball-item', type: 'button', dataset: { action, tooltip: label }, 'aria-label': label }, [
      ffbEl('span', { class: iconClass ? `ffb-ball-icon ${iconClass}` : 'ffb-ball-icon' }, floatingBallIcon(icon)),
      ffbEl('span', { class: labelClass ? `ffb-ball-label ${labelClass}` : 'ffb-ball-label' }, label)
    ]);

  el.append(
    ffbEl('button', { class: 'ffb-ball-main', type: 'button', title: '翻翻吧' },
      ffbEl('img', { src: chrome.runtime.getURL('icons/icon48.png'), alt: '' })),
    ffbEl('button', { class: 'ffb-continue-tip', type: 'button', 'aria-label': '直接翻譯新的可見段落' }, '有新的段落可翻譯'),
    ffbEl('div', { class: 'ffb-ball-menu' }, [
      ffbEl('div', { class: 'ffb-ball-menu-group ffb-ball-menu-top' }, [
        menuItem({ action: 'library', label: '收藏 / 紀錄', icon: FFB_ICON_NOTEBOOK }),
        menuItem({
          action: 'vocab-highlight', label: '開啟單字高亮', icon: FFB_ICON_HIGHLIGHTER,
          iconClass: 'ffb-vocab-highlight-icon', labelClass: 'ffb-vocab-highlight-label'
        })
      ]),
      ffbEl('div', { class: 'ffb-ball-menu-gap', 'aria-hidden': 'true' }),
      ffbEl('div', { class: 'ffb-ball-menu-group ffb-ball-menu-bottom' }, [
        menuItem({
          action: 'page-translate', label: '全文翻譯 Beta', icon: FFB_ICON_LANGUAGES,
          iconClass: 'ffb-translate-icon', labelClass: 'ffb-page-translate-label'
        }),
        menuItem({ action: 'settings', label: '設定', icon: FFB_ICON_SETTINGS, iconClass: 'ffb-settings-icon' })
      ])
    ]),
    ffbEl('button', {
      class: 'ffb-pause-x', type: 'button', dataset: { action: 'pause', tooltip: '在此網站停用' }, 'aria-label': '在此網站停用'
    }, '×')
  );

  const mainBtn = el.querySelector('.ffb-ball-main');
  const menu = el.querySelector('.ffb-ball-menu');
  mainBtn.addEventListener('pointerdown', startFloatingBallPointer);
  mainBtn.addEventListener('click', e => {
    // 選單由 hover/focus 與 pointerup 處理；click 僅阻止事件外溢到宿主頁。
    e.preventDefault();
    e.stopPropagation();
  });

  mainBtn.addEventListener('mouseenter', openFloatingBallMenu);
  mainBtn.addEventListener('mouseleave', scheduleFloatingBallMenuClose);
  mainBtn.addEventListener('focus', openFloatingBallMenu);
  el.addEventListener('mouseleave', scheduleFloatingBallMenuClose);
  el.addEventListener('focusout', scheduleFloatingBallMenuClose);
  el.addEventListener('click', e => e.stopPropagation());
  menu.addEventListener('mouseenter', () => {
    if (el.classList.contains('ffb-menu-open')) clearFloatingBallMenuTimer();
  });
  menu.addEventListener('mouseleave', scheduleFloatingBallMenuClose);
  el.querySelector('.ffb-continue-tip')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (floatingBall?.classList.contains('ffb-page-running')) return;
    el.classList.remove('ffb-menu-open');
    startPageTranslationBeta?.();
  });
  menu.addEventListener('mousedown', e => e.stopPropagation());
  el.querySelector('[data-action="library"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    showFloatingLibraryPanel();
  });
  el.querySelector('[data-action="vocab-highlight"]').addEventListener('click', async e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    try {
      // 高亮 helper 在 vocabulary-highlighter.js（manifest 第一組先載入），
      // 切換完會自己回呼 updateFloatingBallVocabularyHighlightState 更新按鈕文字
      await globalThis.toggleVocabularyHighlightForSite?.();
    } catch {
      // 切換失敗就維持原狀（按鈕文字沒變＝沒開起來），不在宿主頁丟 unhandled rejection
    }
  });
  el.querySelector('[data-action="page-translate"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    startPageTranslationBeta?.();
  });
  el.querySelector('[data-action="settings"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' }).catch(() => {});
  });
  el.querySelector('[data-action="pause"]').addEventListener('click', e => {
    e.stopPropagation();
    toggleFanFanBaPaused();
  });
  return el;
}

function startFloatingBallPointer(e) {
  if (!floatingBall) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = floatingBall.getBoundingClientRect();
  const drag = {
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    left: rect.left,
    top: rect.top,
    moved: false
  };

  clearFloatingBallMenuTimer();
  floatingBall.setPointerCapture?.(e.pointerId);
  floatingBall.classList.add('ffb-dragging');

  function move(ev) {
    if (ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= 6 && !drag.moved) return;
    drag.moved = true;
    ev.preventDefault();
    const nextLeft = Math.max(8, Math.min(drag.left + dx, window.innerWidth - floatingBall.offsetWidth - 8));
    const nextTop = clampFloatingBallTop(drag.top + dy);
    floatingBall.style.left = `${nextLeft}px`;
    floatingBall.style.top = `${nextTop}px`;
    floatingBall.style.right = 'auto';
  }

  function end(ev) {
    if (ev.pointerId !== drag.pointerId) return;
    floatingBall.removeEventListener('pointermove', move, true);
    floatingBall.removeEventListener('pointerup', end, true);
    floatingBall.removeEventListener('pointercancel', end, true);
    floatingBall.releasePointerCapture?.(drag.pointerId);
    floatingBall.classList.remove('ffb-dragging');
    if (drag.moved) {
      snapFloatingBallToSide();
      saveFloatingBallPosition();
    } else {
      openFloatingBallMenu();
    }
  }

  floatingBall.addEventListener('pointermove', move, true);
  floatingBall.addEventListener('pointerup', end, true);
  floatingBall.addEventListener('pointercancel', end, true);
}

function openFloatingBallMenu() {
  if (!floatingBall || floatingBall.classList.contains('ffb-dragging')) return;
  clearFloatingBallMenuTimer();
  floatingBall.classList.add('ffb-menu-open');
}

function scheduleFloatingBallMenuClose() {
  if (!floatingBall) return;
  clearFloatingBallMenuTimer();
  floatingBall._menuCloseTimer = setTimeout(() => {
    if (!floatingBall?.matches(':hover') && !floatingBall?.contains(document.activeElement)) {
      floatingBall?.classList.remove('ffb-menu-open');
    }
  }, 220);
}

function clearFloatingBallMenuTimer() {
  if (!floatingBall?._menuCloseTimer) return;
  clearTimeout(floatingBall._menuCloseTimer);
  floatingBall._menuCloseTimer = null;
}

async function restoreFloatingBallPosition() {
  if (!floatingBall) return;
  try {
    const host = location.hostname || 'local-file';
    const { [FLOATING_POSITION_KEY]: positions = {} } = await chrome.storage.local.get(FLOATING_POSITION_KEY);
    const top = positions[host]?.top;
    const side = positions[host]?.side || 'right';
    floatingBall.style.top = `${clampFloatingBallTop(top || Math.round(window.innerHeight * 0.42))}px`;
    setFloatingBallSide(side);
  } catch {
    floatingBall.style.top = '42vh';
    setFloatingBallSide('right');
  }
}

async function saveFloatingBallPosition() {
  if (!floatingBall) return;
  try {
    const host = location.hostname || 'local-file';
    const top = Math.round(floatingBall.getBoundingClientRect().top);
    const side = floatingBall.classList.contains('ffb-side-left') ? 'left' : 'right';
    const { [FLOATING_POSITION_KEY]: positions = {} } = await chrome.storage.local.get(FLOATING_POSITION_KEY);
    await chrome.storage.local.set({
      [FLOATING_POSITION_KEY]: {
        ...positions,
        [host]: { top, side }
      }
    });
  } catch { /* 不影響主要功能 */ }
}

// 選單上組往上長、下組往下長；只夾 12px 的話，浮球拖到畫面上下極端時
// 選單會被裁到看不見（上組加了單字高亮鈕後更明顯）。改成預留實際量到的選單高度，
// 量不到（尚未 layout / jsdom）就退回原本的 12px 邊界。
function clampFloatingBallTop(top) {
  const height = floatingBall?.offsetHeight || 46;
  const above = Math.max(12, (floatingBall?.querySelector('.ffb-ball-menu-top')?.offsetHeight || 0) + 8);
  const below = Math.max(12, (floatingBall?.querySelector('.ffb-ball-menu-bottom')?.offsetHeight || 0) + 8);
  const max = Math.max(above, window.innerHeight - height - below);
  return Math.round(Math.max(above, Math.min(Number(top) || 0, max)));
}

function snapFloatingBallToSide() {
  if (!floatingBall) return;
  const rect = floatingBall.getBoundingClientRect();
  const side = rect.left + rect.width / 2 < window.innerWidth / 2 ? 'left' : 'right';
  setFloatingBallSide(side);
}

function setFloatingBallSide(side = 'right') {
  if (!floatingBall) return;
  const normalized = side === 'left' ? 'left' : 'right';
  floatingBall.classList.toggle('ffb-side-left', normalized === 'left');
  floatingBall.classList.toggle('ffb-side-right', normalized === 'right');
  if (normalized === 'left') {
    floatingBall.style.left = '0';
    floatingBall.style.right = 'auto';
  } else {
    floatingBall.style.left = 'auto';
    floatingBall.style.right = '0';
  }
}

async function toggleFanFanBaPaused() {
  const next = !fanFanBaPaused;
  fanFanBaPaused = next;
  await chrome.storage.local.set({ [getPauseStorageKey()]: next });
  updateFloatingBallPausedState();
  if (next) hideAll();
}

function updateFloatingBallPausedState() {
  if (!floatingBall) return;
  floatingBall.classList.toggle('ffb-paused', fanFanBaPaused);
  const label = floatingBall.querySelector('.ffb-pause-label');
  const button = floatingBall.querySelector('[data-action="pause"]');
  const text = fanFanBaPaused ? '恢復此網站' : '在此網站停用';
  if (label) label.textContent = text;
  if (button) {
    button.dataset.tooltip = text;
    button.setAttribute('aria-label', text);
  }
}

function updateFloatingBallVocabularyHighlightState(enabled = false) {
  if (!floatingBall) return;
  floatingBall.classList.toggle('ffb-vocab-highlight-on', Boolean(enabled));
  const label = floatingBall.querySelector('.ffb-vocab-highlight-label');
  const button = floatingBall.querySelector('[data-action="vocab-highlight"]');
  const text = enabled ? '關閉單字高亮' : '開啟單字高亮';
  if (label) label.textContent = text;
  if (button) {
    button.dataset.tooltip = text;
    button.setAttribute('aria-label', text);
  }
}

function hideFloatingBallMenu() {
  floatingBall?.classList.remove('ffb-menu-open');
}

function updateFloatingBallPageTranslationState({ running = false, activated = false, canContinue = false } = {}) {
  if (!floatingBall) return;
  const label = floatingBall.querySelector('.ffb-page-translate-label');
  const button = floatingBall.querySelector('[data-action="page-translate"]');
  const continueTip = floatingBall.querySelector('.ffb-continue-tip');
  floatingBall.classList.toggle('ffb-page-running', running);
  floatingBall.classList.toggle('ffb-can-continue', !running && canContinue);
  if (continueTip) {
    continueTip.disabled = running || !canContinue;
    continueTip.setAttribute('aria-label', canContinue ? '直接翻譯新的可見段落' : '目前沒有新的段落');
  }
  if (label) {
    if (running) label.textContent = '翻譯中...';
    else if (activated) label.textContent = '繼續翻譯下個段落';
    else label.textContent = '全文翻譯 Beta';
  }
  if (button) {
    const title = running
      ? '翻譯中...'
      : canContinue
        ? '有新的段落可翻譯'
        : activated
          ? '目前沒有新段落'
          : '翻譯目前可見內容';
    button.setAttribute('aria-description', title);
    button.dataset.tooltip = running
      ? '翻譯中...'
      : activated
        ? '繼續翻譯'
        : '全文翻譯 Beta';
    button.setAttribute('aria-label', button.dataset.tooltip);
  }
}

function showFloatingLibraryPanel() {
  if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();
  savedSel = { text: '收藏 / 紀錄', range: null };
  userDragged = true;
  resultCard.querySelector('.g-rc-tag').textContent = '收藏 / 紀錄';
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-history-panel')?.classList.remove('g-hist-open');
  setResultCardQueryMode?.(false);
  hideAutoSaveToast(resultCard);

  const body = resultCard.querySelector('.g-rc-body');
  const libraryItem = (action, icon, title, hint) => ffbEl('button',
    { class: 'g-floating-library-item', type: 'button', dataset: { libraryAction: action } }, [
      ffbEl('span', null, floatingBallIcon(icon)),
      ffbEl('strong', null, title),
      ffbEl('em', null, hint)
    ]);
  ffbClear(body).appendChild(ffbEl('div', { class: 'g-floating-library' }, [
    libraryItem('vocabulary', FFB_ICON_NOTEBOOK, '單字本', '今日新增、複習、錯題回看、匯出'),
    libraryItem('history', FFB_ICON_HISTORY, '最近查詢', '回到最近翻譯、解釋、優化結果')
  ]));

  body.querySelector('[data-library-action="vocabulary"]')?.addEventListener('click', e => {
    e.stopPropagation();
    showFloatingVocabularyPanel();
  });
  body.querySelector('[data-library-action="history"]')?.addEventListener('click', e => {
    e.stopPropagation();
    showFloatingHistoryPanel();
  });

  resultCard.classList.add('g-show');
  positionResultCardNearFloatingBall();
}

async function showFloatingHistoryPanel() {
  if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();
  savedSel = { text: '最近查詢', range: null };
  userDragged = true;
  resultCard.querySelector('.g-rc-tag').textContent = '最近查詢';
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-history-panel')?.classList.remove('g-hist-open');
  setResultCardQueryMode?.(false);
  hideAutoSaveToast(resultCard);

  const body = resultCard.querySelector('.g-rc-body');
  const history = await loadHistory();
  if (!history.length) {
    ffbClear(body).appendChild(ffbEl('div', { class: 'g-hist-empty' }, '尚無查詢紀錄'));
  } else {
    ffbClear(body).appendChild(ffbEl('div', { class: 'g-floating-history' }, history.map((item, index) => {
      const label = { translate: '翻譯', explain: '解釋', optimize: '優化' }[item.action] || item.action;
      const preview = item.text.length > 44 ? `${item.text.slice(0, 44)}…` : item.text;
      return ffbEl('button', { class: 'g-floating-history-item', dataset: { index } }, [
        ffbEl('span', null, label),
        ffbEl('strong', null, preview)
      ]);
    })));

    body.querySelectorAll('.g-floating-history-item').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const item = history[parseInt(btn.dataset.index, 10)];
        if (!item) return;
        applyHistoryState(item.text);
        resultCard.querySelector('.g-rc-tag').textContent = ({ translate: '翻譯', explain: '解釋', optimize: '優化' }[item.action] || item.action);
        renderResult(item.action, item.result, item.text, { fromHistory: true });
      });
    });
  }

  resultCard.classList.add('g-show');
  positionResultCardNearFloatingBall();
}

async function showFloatingVocabularyPanel() {
  if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();
  savedSel = { text: '單字本', range: null };
  userDragged = true;
  resultCard.querySelector('.g-rc-tag').textContent = '單字本';
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-history-panel')?.classList.remove('g-hist-open');
  setResultCardQueryMode?.(false);
  hideAutoSaveToast(resultCard);

  const body = resultCard.querySelector('.g-rc-body');
  ffbClear(body).appendChild(ffbEl('div', { class: 'g-hist-empty' }, '讀取單字本中...'));

  let items;
  try {
    items = typeof listVocabularyItems === 'function' ? await listVocabularyItems() : [];
  } catch {
    // A1'''：讀取失敗不得渲染成「空單字本」——使用者會誤以為資料被清空
    // 而恐慌匯入舊備份（那才會真的蓋掉活資料）
    ffbClear(body).appendChild(ffbEl('div', { class: 'g-hist-empty' },
      '單字資料暫時無法讀取（資料並未被清空）。請重新整理頁面後再試。'));
    resultCard.classList.add('g-show');
    positionResultCardNearFloatingBall();
    return;
  }
  renderFloatingVocabularyPanel(body, items);
  resultCard.classList.add('g-show');
  positionResultCardNearFloatingBall();
}

function renderFloatingVocabularyPanel(body, initialItems) {
  let items = initialItems;
  let filter = 'review';
  let query = '';

  const VOCAB_TABS = [
    ['review', '今日複習'], ['weak', '錯題回看'], ['today', '今日新增'], ['recent', '最近遇到'],
    ['frequent', '最常遇到'], ['learning', '還不熟'], ['known', '已記得'], ['all', '全部']
  ];
  ffbClear(body).appendChild(ffbEl('div', { class: 'g-vocab-panel' }, [
    ffbEl('div', { class: 'g-vocab-panel-toolbar' }, [
      ffbEl('input', { class: 'g-vocab-search', type: 'search', placeholder: '搜尋單字' }),
      ffbEl('div', { class: 'g-vocab-tabs' }, VOCAB_TABS.map(([value, label]) => ffbEl('button',
        { type: 'button', class: value === filter ? 'g-vocab-tab g-active' : 'g-vocab-tab', dataset: { filter: value } }, label)))
    ]),
    ffbEl('div', { class: 'g-vocab-panel-actions' }, [
      ffbEl('button', { type: 'button', class: 'g-vocab-export', dataset: { vocabExport: 'markdown' } }, '複製今日 Markdown'),
      ffbEl('button', { type: 'button', class: 'g-vocab-export', dataset: { vocabExport: 'csv' } }, '複製今日 CSV')
    ]),
    ffbEl('div', { class: 'g-vocab-panel-list' })
  ]));

  const listEl = body.querySelector('.g-vocab-panel-list');
  const searchEl = body.querySelector('.g-vocab-search');

  const render = () => {
    const visible = filterVocabularyPanelItems(items, filter, query);
    ffbClear(listEl).append(...(visible.length
      ? visible.map(item => buildVocabularyPanelItem(item))
      : [ffbEl('div', { class: 'g-hist-empty' }, getVocabularyPanelEmptyText(items, filter, query))]));

    listEl.querySelectorAll('[data-vocab-delete]').forEach(button => {
      button.addEventListener('click', async e => {
        e.stopPropagation();
        const id = button.dataset.vocabDelete;
        try {
          await deleteVocabularyEntry?.(id);
        } catch {
          // 刪除失敗要讓使用者看見，不能讓項目留在列表卻零回饋（WS-E A1'''）
          button.textContent = '刪除失敗';
          setTimeout(() => { button.textContent = '刪除'; }, 1500);
          return;
        }
        items = items.filter(item => item.id !== id);
        render();
      });
    });
    listEl.querySelectorAll('[data-vocab-copy]').forEach(button => {
      button.addEventListener('click', async e => {
        e.stopPropagation();
        const item = items.find(entry => entry.id === button.dataset.vocabCopy);
        const markdown = buildVocabularyMarkdownExport?.(item ? [item] : []) || '';
        await copyVocabularyPanelText(markdown, button, '已複製');
      });
    });
    listEl.querySelectorAll('[data-vocab-status]').forEach(button => {
      button.addEventListener('click', async e => {
        e.stopPropagation();
        const id = button.dataset.vocabStatus;
        const nextStatus = button.dataset.nextStatus === 'known' ? 'known' : 'learning';
        try {
          const updated = await updateVocabularyEntryStatus?.(id, nextStatus);
          if (updated) {
            const refreshedItems = typeof listVocabularyItems === 'function' ? await listVocabularyItems() : items;
            items = updateVocabularyPanelItems(refreshedItems, updated);
            render();
          }
        } catch {
          button.textContent = '更新失敗';
          setTimeout(render, 1500); // render 會由 items 重建按鈕文字（WS-E A1'''）
        }
      });
    });
    listEl.querySelectorAll('[data-vocab-review]').forEach(button => {
      button.addEventListener('click', async e => {
        e.stopPropagation();
        const id = button.dataset.vocabReview;
        try {
          const updated = await reviewVocabularyEntry?.(id, button.dataset.reviewGrade);
          if (updated) {
            const refreshedItems = typeof listVocabularyItems === 'function' ? await listVocabularyItems() : items;
            items = updateVocabularyPanelItems(refreshedItems, updated);
            render();
          }
        } catch {
          button.textContent = '更新失敗';
          setTimeout(render, 1500);
        }
      });
    });
  };

  searchEl.addEventListener('input', e => {
    query = e.currentTarget.value.trim().toLowerCase();
    render();
  });

  body.querySelectorAll('.g-vocab-tab').forEach(button => {
    button.addEventListener('click', e => {
      e.stopPropagation();
      filter = button.dataset.filter || 'today';
      body.querySelectorAll('.g-vocab-tab').forEach(tab => tab.classList.toggle('g-active', tab === button));
      render();
    });
  });

  body.querySelectorAll('[data-vocab-export]').forEach(button => {
    button.addEventListener('click', async e => {
      e.stopPropagation();
      const todayItems = items.filter(item => isVocabularyItemFromToday?.(item));
      const type = button.dataset.vocabExport;
      const text = type === 'csv'
        ? buildVocabularyCsvExport?.(todayItems)
        : buildVocabularyMarkdownExport?.(todayItems);
      const fallback = type === 'csv' ? '複製今日 CSV' : '複製今日 Markdown';
      await copyVocabularyPanelText(text || '', button, '已複製', fallback);
    });
  });

  render();
}

function updateVocabularyPanelItems(items, updatedItem) {
  if (!updatedItem?.id) return Array.isArray(items) ? items : [];
  const source = Array.isArray(items) ? items : [];
  let found = false;
  const nextItems = source.map(item => {
    if (item.id !== updatedItem.id) return item;
    found = true;
    return updatedItem;
  });
  return found ? nextItems : [updatedItem, ...nextItems];
}

function filterVocabularyPanelItems(items, filter, query) {
  let source = items;
  if (filter === 'review') {
    source = (buildVocabularyReviewQueue?.(items, { limit: 50 }) || [])
      .filter(item => item.due)
      .map(item => ({ ...item, reviewMode: true }));
  } else if (filter === 'weak') {
    source = (buildVocabularyWeakReviewQueue?.(items, { limit: 50 }) || [])
      .map(item => ({ ...item, reviewMode: true, weakReviewMode: true }));
  }
  const visible = source.filter(item => {
    if (filter === 'today' && !isVocabularyItemFromToday?.(item)) return false;
    if (filter === 'learning' && item.status === 'known') return false;
    if (filter === 'known' && item.status !== 'known') return false;
    if (!query) return true;
    const haystack = [
      item.word,
      item.pos,
      item.definition,
      ...(item.translations || [])
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  if (filter === 'frequent') {
    return visible.slice().sort((a, b) => {
      const countDiff = Number(b.count || 1) - Number(a.count || 1);
      if (countDiff) return countDiff;
      return getVocabularyItemTime(b) - getVocabularyItemTime(a);
    });
  }
  if (filter === 'review' || filter === 'weak') return visible;
  return visible.slice().sort((a, b) => getVocabularyItemTime(b) - getVocabularyItemTime(a));
}

function getVocabularyPanelEmptyText(items, filter, query) {
  if (query) return '沒有符合搜尋的單字';
  if (!items.length) return '單字本是空的';
  if (filter === 'review') return '今天沒有到期複習的單字';
  if (filter === 'weak') return '目前沒有還不熟的單字';
  if (filter === 'today') return '今天還沒有新增單字';
  return '沒有符合的單字';
}

function getVocabularyItemTime(item) {
  return Date.parse(item?.lastSeenAt || item?.createdAt || 0) || 0;
}

function buildVocabularyPanelItem(item) {
  const translations = Array.isArray(item.translations) ? item.translations.slice(0, 3).join('；') : '';
  const count = Number(item.count || 1);
  const isKnown = item.status === 'known';
  const statusButton = (attrs, title, label) => ffbEl('button', { class: 'g-vocab-status', type: 'button', ...attrs, title }, label);
  // 複習模式：四級評分另起一列；其餘分頁維持單顆熟悉度切換
  const statusActions = item.reviewMode
    ? []
    : [statusButton({ dataset: { vocabStatus: item.id, nextStatus: isKnown ? 'learning' : 'known' } }, '更新熟悉度', isKnown ? '還不熟' : '我記得了')];
  const intervals = item.reviewMode ? (previewVocabularyReviewIntervals?.(item) || {}) : null;
  const gradeButton = (grade, label) => statusButton(
    { dataset: { vocabReview: item.id, reviewGrade: grade } },
    intervals?.[grade] ? `${intervals[grade]} 天後再複習` : label,
    label
  );

  return ffbEl('div', { class: 'g-vocab-panel-item' }, [
    ffbEl('div', { class: 'g-vocab-panel-main' }, [
      ffbEl('div', { class: 'g-vocab-panel-word' }, item.word || ''),
      ffbEl('div', { class: 'g-vocab-panel-meta' }, [
        item.pos && ffbEl('span', null, item.pos),
        ffbEl('span', null, item.lang || 'und'),
        ffbEl('span', null, `遇到 ${count} 次`),
        isKnown ? ffbEl('span', { class: 'g-vocab-known' }, '已記得') : ffbEl('span', { class: 'g-vocab-learning' }, '還不熟'),
        item.obsidianExportedAt && ffbEl('span', null, '已匯出'),
        item.weakReviewMode && ffbEl('span', null, '錯題回看'),
        item.reviewMode && ffbEl('span', null, `${item.due ? '到期' : '下次'} ${formatVocabularyReviewDate(item.nextReviewAt)}`)
      ]),
      translations && ffbEl('div', { class: 'g-vocab-panel-meaning' }, translations),
      item.definition && ffbEl('div', { class: 'g-vocab-panel-def' }, item.definition)
    ]),
    ffbEl('div', { class: 'g-vocab-panel-item-actions' }, [
      ...statusActions,
      ffbEl('button', { class: 'g-vocab-copy', type: 'button', dataset: { vocabCopy: item.id }, title: '複製 Markdown' }, '複製'),
      ffbEl('button', { class: 'g-vocab-delete', type: 'button', dataset: { vocabDelete: item.id }, title: '刪除' }, '刪除')
    ]),
    item.reviewMode && ffbEl('div', { class: 'g-vocab-review-grades' }, [
      gradeButton('again', '忘了'),
      gradeButton('hard', '吃力'),
      gradeButton('good', '記得'),
      gradeButton('easy', '很熟')
    ])
  ]);
}

function formatVocabularyReviewDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '尚未排程';
  return date.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    month: '2-digit',
    day: '2-digit'
  });
}

async function copyVocabularyPanelText(text, button, successText, fallbackText) {
  const originalText = fallbackText || button?.textContent || '';
  if (!text) {
    if (button) {
      button.textContent = '沒有資料';
      setTimeout(() => { button.textContent = originalText; }, 1400);
    }
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    if (button) {
      button.textContent = successText || '已複製';
      setTimeout(() => { button.textContent = originalText; }, 1400);
    }
    return true;
  } catch {
    if (button) {
      button.textContent = '複製失敗';
      setTimeout(() => { button.textContent = originalText; }, 1400);
    }
    return false;
  }
}

function positionResultCardNearFloatingBall() {
  if (!floatingBall || !resultCard) return;
  const ballRect = floatingBall.getBoundingClientRect();
  const cardW = resultCard.offsetWidth || Math.min(500, window.innerWidth - 16);
  const cardH = resultCard.offsetHeight || 180;
  const left = Math.max(8, Math.min(ballRect.left - cardW - 12, window.innerWidth - cardW - 8));
  const top = Math.max(8, Math.min(ballRect.top - 20, window.innerHeight - cardH - 8));
  resultCard.style.left = `${left}px`;
  resultCard.style.top = `${top}px`;
}

// 子 frame 與敏感網域不生成常駐浮球（避免每個 iframe 都長一顆球、登入頁不擾民）
if (fanFanBaShouldShowFloatingBall()) initFloatingBall();
