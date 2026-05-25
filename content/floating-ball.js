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
    <div class="ffb-ball-menu">
      <button class="ffb-ball-item" type="button" data-action="history">
        <span class="ffb-ball-icon">↺</span>
        <span>最近查詢</span>
      </button>
      <button class="ffb-ball-item" type="button" data-action="page-translate">
        <span class="ffb-ball-icon">文</span>
        <span>全文翻譯 Beta</span>
      </button>
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

function startFloatingBallPointer(e) {
  if (!floatingBall) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = floatingBall.getBoundingClientRect();
  const drag = {
    pointerId: e.pointerId,
    startY: e.clientY,
    top: rect.top,
    moved: false
  };

  floatingBall.setPointerCapture?.(e.pointerId);

  function move(ev) {
    if (ev.pointerId !== drag.pointerId) return;
    const dy = ev.clientY - drag.startY;
    if (Math.abs(dy) <= 6 && !drag.moved) return;
    drag.moved = true;
    ev.preventDefault();
    const nextTop = Math.max(12, Math.min(drag.top + dy, window.innerHeight - floatingBall.offsetHeight - 12));
    floatingBall.style.top = `${nextTop}px`;
    floatingBall.style.right = '10px';
  }

  function end(ev) {
    if (ev.pointerId !== drag.pointerId) return;
    floatingBall.removeEventListener('pointermove', move, true);
    floatingBall.removeEventListener('pointerup', end, true);
    floatingBall.removeEventListener('pointercancel', end, true);
    floatingBall.releasePointerCapture?.(drag.pointerId);
    if (drag.moved) {
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
    floatingBall.style.top = `${Math.max(12, Math.min(top || Math.round(window.innerHeight * 0.42), window.innerHeight - 56))}px`;
    floatingBall.style.right = '10px';
  } catch {
    floatingBall.style.top = '42vh';
    floatingBall.style.right = '10px';
  }
}

async function saveFloatingBallPosition() {
  if (!floatingBall) return;
  try {
    const host = location.hostname || 'local-file';
    const top = Math.round(floatingBall.getBoundingClientRect().top);
    const { [FLOATING_POSITION_KEY]: positions = {} } = await chrome.storage.local.get(FLOATING_POSITION_KEY);
    await chrome.storage.local.set({
      [FLOATING_POSITION_KEY]: {
        ...positions,
        [host]: { top }
      }
    });
  } catch { /* 不影響主要功能 */ }
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
