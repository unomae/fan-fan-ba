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
  return floatingBall;
}

function createFloatingBall() {
  const el = document.createElement('div');
  el.id = 'fanfanba-floating';
  el.innerHTML = `
    <button class="ffb-ball-main" type="button" title="翻翻吧">
      <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="">
    </button>
    <span class="ffb-continue-tip">有新的段落可翻譯</span>
    <div class="ffb-ball-menu">
      <button class="ffb-ball-item" type="button" data-action="history">
        <span class="ffb-ball-icon">↺</span>
        <span>最近查詢</span>
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
    // 選單切換由 pointerup 處理；click 僅阻止事件外溢到宿主頁。
    e.preventDefault();
    e.stopPropagation();
  });

  el.addEventListener('click', e => e.stopPropagation());
  el.querySelector('.ffb-ball-menu').addEventListener('mousedown', e => e.stopPropagation());
  el.querySelector('[data-action="history"]').addEventListener('click', e => {
    e.stopPropagation();
    el.classList.remove('ffb-menu-open');
    showFloatingHistoryPanel();
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

  floatingBall.setPointerCapture?.(e.pointerId);

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
    if (drag.moved) {
      snapFloatingBallToSide();
      saveFloatingBallPosition();
    } else {
      floatingBall.classList.toggle('ffb-menu-open');
    }
  }

  floatingBall.addEventListener('pointermove', move, true);
  floatingBall.addEventListener('pointerup', end, true);
  floatingBall.addEventListener('pointercancel', end, true);
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

function updateFloatingBallPageTranslationState({ running = false, activated = false, canContinue = false } = {}) {
  if (!floatingBall) return;
  const label = floatingBall.querySelector('.ffb-page-translate-label');
  const button = floatingBall.querySelector('[data-action="page-translate"]');
  floatingBall.classList.toggle('ffb-page-running', running);
  floatingBall.classList.toggle('ffb-can-continue', !running && canContinue);
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
