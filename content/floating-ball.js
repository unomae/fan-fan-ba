'use strict';

const FLOATING_POSITION_KEY = 'fanFanBaFloatingPosition';

function getPauseStorageKey() {
  const host = location.hostname || 'local-file';
  return `fanFanBaPaused:${host}`;
}

function initFloatingBall() {
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
  el.innerHTML = `
    <button class="ffb-ball-main" type="button" title="翻翻吧">
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="">
    </button>
    <button class="ffb-continue-tip" type="button" title="直接翻譯新的可見段落">有新的段落可翻譯</button>
    <div class="ffb-ball-menu">
      <button class="ffb-ball-item" type="button" data-action="history">
        <span class="ffb-ball-icon">↺</span>
        <span>最近查詢</span>
      </button>
      <button class="ffb-ball-item" type="button" data-action="vocabulary">
        <span class="ffb-ball-icon">字</span>
        <span>單字本</span>
      </button>
      <button class="ffb-ball-item" type="button" data-action="vocab-highlight">
        <span class="ffb-ball-icon">標</span>
        <span class="ffb-vocab-highlight-label">開啟單字高亮</span>
      </button>
      <button class="ffb-ball-item" type="button" data-action="page-translate">
        <span class="ffb-ball-icon">文</span>
        <span class="ffb-page-translate-label">全文翻譯 Beta</span>
      </button>
      <label class="ffb-page-model-row">
        <span>全文模型</span>
        <select class="ffb-page-model-select"></select>
      </label>
      <button class="ffb-ball-item" type="button" data-action="pause">
        <span class="ffb-ball-icon">⏸</span>
        <span class="ffb-pause-label">暫停此網站</span>
      </button>
      <button class="ffb-ball-item" type="button" data-action="settings">
        <span class="ffb-ball-icon">⚙</span>
        <span>設定</span>
      </button>
    </div>
  `;

  const mainBtn = el.querySelector('.ffb-ball-main');
  renderFloatingPageModelSelect(el);
  mainBtn.addEventListener('pointerdown', startFloatingBallPointer);
  mainBtn.addEventListener('click', e => {
    // 選單由 hover/focus 與 pointerup 處理；click 僅阻止事件外溢到宿主頁。
    e.preventDefault();
    e.stopPropagation();
  });

  el.addEventListener('mouseenter', openFloatingBallMenu);
  el.addEventListener('mouseleave', scheduleFloatingBallMenuClose);
  el.addEventListener('focusin', openFloatingBallMenu);
  el.addEventListener('focusout', scheduleFloatingBallMenuClose);
  el.addEventListener('click', e => e.stopPropagation());
  el.querySelector('.ffb-continue-tip')?.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (floatingBall?.classList.contains('ffb-page-running')) return;
    el.classList.remove('ffb-menu-open');
    startPageTranslationBeta?.();
  });
  el.querySelector('.ffb-ball-menu').addEventListener('mousedown', e => e.stopPropagation());
  el.querySelector('[data-action="history"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    showFloatingHistoryPanel();
  });
  el.querySelector('[data-action="vocabulary"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    showFloatingVocabularyPanel();
  });
  el.querySelector('[data-action="vocab-highlight"]').addEventListener('click', e => {
    e.stopPropagation();
    globalThis.toggleVocabularyHighlightForSite?.();
  });
  el.querySelector('[data-action="page-translate"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    startPageTranslationBeta?.();
  });
  el.querySelector('.ffb-page-model-select')?.addEventListener('change', e => {
    e.stopPropagation();
    setPageTranslationModel?.(e.currentTarget.value);
  });
  el.querySelector('[data-action="pause"]').addEventListener('click', e => {
    e.stopPropagation();
    toggleFanFanBaPaused();
  });
  el.querySelector('[data-action="settings"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });

  return el;
}

function renderFloatingPageModelSelect(el = floatingBall) {
  const select = el?.querySelector('.ffb-page-model-select');
  if (!select || !globalThis.FanFanBaModels) return;
  select.innerHTML = FanFanBaModels.MODELS
    .map(model => `<option value="${model.id}">${model.name}</option>`)
    .join('');
  select.value = FanFanBaModels.normalizeModel(activeModel);
  setPageTranslationModel?.(select.value);
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
    const nextTop = Math.max(12, Math.min(drag.top + dy, window.innerHeight - floatingBall.offsetHeight - 12));
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
    floatingBall.style.top = `${Math.max(12, Math.min(top || Math.round(window.innerHeight * 0.42), window.innerHeight - 56))}px`;
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
    floatingBall.style.left = '10px';
    floatingBall.style.right = 'auto';
  } else {
    floatingBall.style.left = 'auto';
    floatingBall.style.right = '10px';
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
  if (label) label.textContent = fanFanBaPaused ? '恢復此網站' : '暫停此網站';
}

function updateFloatingBallVocabularyHighlightState(enabled = false) {
  if (!floatingBall) return;
  floatingBall.classList.toggle('ffb-vocab-highlight-on', Boolean(enabled));
  const label = floatingBall.querySelector('.ffb-vocab-highlight-label');
  if (label) label.textContent = enabled ? '關閉單字高亮' : '開啟單字高亮';
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
    continueTip.title = canContinue ? '直接翻譯新的可見段落' : '目前沒有新的段落';
  }
  if (label) {
    if (running) label.textContent = '翻譯中...';
    else if (activated) label.textContent = '繼續翻譯下個段落';
    else label.textContent = '全文翻譯 Beta';
  }
  if (button) {
    button.title = running
      ? '翻譯中...'
      : canContinue
        ? '有新的段落可翻譯'
        : activated
          ? '目前沒有新段落'
          : '翻譯目前可見內容';
  }
}

async function showFloatingHistoryPanel() {
  if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();
  savedSel = { text: '最近查詢', range: null };
  userDragged = true;
  resultCard.querySelector('.g-rc-tag').innerHTML = '最近查詢';
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-history-panel')?.classList.remove('g-hist-open');
  hideAutoSaveToast(resultCard);

  const body = resultCard.querySelector('.g-rc-body');
  const history = await loadHistory();
  if (!history.length) {
    body.innerHTML = '<div class="g-hist-empty">尚無查詢紀錄</div>';
  } else {
    body.innerHTML = `
      <div class="g-floating-history">
        ${history.map((item, index) => {
          const label = { translate: '翻譯', explain: '解釋', optimize: '優化' }[item.action] || item.action;
          const preview = item.text.length > 44 ? `${item.text.slice(0, 44)}…` : item.text;
          return `<button class="g-floating-history-item" data-index="${index}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(preview)}</strong>
          </button>`;
        }).join('')}
      </div>
    `;

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
  resultCard.querySelector('.g-rc-tag').innerHTML = '單字本';
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-history-panel')?.classList.remove('g-hist-open');
  hideAutoSaveToast(resultCard);

  const body = resultCard.querySelector('.g-rc-body');
  body.innerHTML = '<div class="g-hist-empty">讀取單字本中...</div>';

  const items = typeof listVocabularyItems === 'function' ? await listVocabularyItems() : [];
  renderFloatingVocabularyPanel(body, items);
  resultCard.classList.add('g-show');
  positionResultCardNearFloatingBall();
}

function renderFloatingVocabularyPanel(body, initialItems) {
  let items = initialItems;
  let filter = 'today';
  let query = '';

  body.innerHTML = `
    <div class="g-vocab-panel">
      <div class="g-vocab-panel-toolbar">
        <input class="g-vocab-search" type="search" placeholder="搜尋單字">
        <div class="g-vocab-tabs">
          <button type="button" class="g-vocab-tab g-active" data-filter="today">今日新增</button>
          <button type="button" class="g-vocab-tab" data-filter="recent">最近遇到</button>
          <button type="button" class="g-vocab-tab" data-filter="frequent">最常遇到</button>
          <button type="button" class="g-vocab-tab" data-filter="learning">還不熟</button>
          <button type="button" class="g-vocab-tab" data-filter="known">已記得</button>
          <button type="button" class="g-vocab-tab" data-filter="all">全部</button>
        </div>
      </div>
      <div class="g-vocab-panel-actions">
        <button type="button" class="g-vocab-export" data-vocab-export="markdown">複製今日 Markdown</button>
        <button type="button" class="g-vocab-export" data-vocab-export="csv">複製今日 CSV</button>
      </div>
      <div class="g-vocab-panel-list"></div>
    </div>
  `;

  const listEl = body.querySelector('.g-vocab-panel-list');
  const searchEl = body.querySelector('.g-vocab-search');

  const render = () => {
    const visible = filterVocabularyPanelItems(items, filter, query);
    listEl.innerHTML = visible.length
      ? visible.map(item => buildVocabularyPanelItemHtml(item)).join('')
      : '<div class="g-hist-empty">沒有符合的單字</div>';

    listEl.querySelectorAll('[data-vocab-delete]').forEach(button => {
      button.addEventListener('click', async e => {
        e.stopPropagation();
        const id = button.dataset.vocabDelete;
        await deleteVocabularyEntry?.(id);
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
        const updated = await updateVocabularyEntryStatus?.(id, nextStatus);
        if (updated) {
          items = typeof listVocabularyItems === 'function'
            ? await listVocabularyItems()
            : items.map(item => item.id === id ? updated : item);
          render();
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

function filterVocabularyPanelItems(items, filter, query) {
  const visible = items.filter(item => {
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
  return visible.slice().sort((a, b) => getVocabularyItemTime(b) - getVocabularyItemTime(a));
}

function getVocabularyItemTime(item) {
  return Date.parse(item?.lastSeenAt || item?.createdAt || 0) || 0;
}

function buildVocabularyPanelItemHtml(item) {
  const translations = Array.isArray(item.translations) ? item.translations.slice(0, 3).join('；') : '';
  const count = Number(item.count || 1);
  const exportedBadge = item.obsidianExportedAt ? '<span>已匯出</span>' : '';
  const isKnown = item.status === 'known';
  const statusBadge = isKnown ? '<span class="g-vocab-known">已記得</span>' : '<span class="g-vocab-learning">還不熟</span>';
  const nextStatus = isKnown ? 'learning' : 'known';
  const statusLabel = isKnown ? '還不熟' : '我記得了';
  return `
    <div class="g-vocab-panel-item">
      <div class="g-vocab-panel-main">
        <div class="g-vocab-panel-word">${escapeHtml(item.word || '')}</div>
        <div class="g-vocab-panel-meta">
          ${item.pos ? `<span>${escapeHtml(item.pos)}</span>` : ''}
          <span>${escapeHtml(item.lang || 'und')}</span>
          <span>遇到 ${count} 次</span>
          ${statusBadge}
          ${exportedBadge}
        </div>
        ${translations ? `<div class="g-vocab-panel-meaning">${escapeHtml(translations)}</div>` : ''}
        ${item.definition ? `<div class="g-vocab-panel-def">${escapeHtml(item.definition)}</div>` : ''}
      </div>
      <div class="g-vocab-panel-item-actions">
        <button class="g-vocab-status" type="button" data-vocab-status="${escapeHtml(item.id)}" data-next-status="${nextStatus}" title="更新熟悉度">${statusLabel}</button>
        <button class="g-vocab-copy" type="button" data-vocab-copy="${escapeHtml(item.id)}" title="複製 Markdown">複製</button>
        <button class="g-vocab-delete" type="button" data-vocab-delete="${escapeHtml(item.id)}" title="刪除">刪除</button>
      </div>
    </div>
  `;
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
  const cardW = resultCard.offsetWidth || 500;
  const cardH = resultCard.offsetHeight || 180;
  const left = Math.max(8, Math.min(ballRect.left - cardW - 12, window.innerWidth - cardW - 8));
  const top = Math.max(8, Math.min(ballRect.top - 20, window.innerHeight - cardH - 8));
  resultCard.style.left = `${left}px`;
  resultCard.style.top = `${top}px`;
}

initFloatingBall();
