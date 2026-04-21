'use strict';

// ── 事件監聽 ─────────────────────────────────────────
document.addEventListener('mouseup',   (e) => { onDragEnd(e); onMouseUp(e); });
document.addEventListener('keyup',     onKeyUp);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onDragMove);

window.addEventListener('beforeunload', () => {
  toolbar?.remove();
  resultCard?.remove();
  dragState = null;
  savedSel  = null;
});

// ── 拖曳（rAF throttle）──────────────────────────────
function onDragMove(e) {
  if (!dragState || !resultCard || dragPending) return;
  dragPending = true;
  requestAnimationFrame(() => {
    if (dragState) {
      const dx      = e.clientX - dragState.startX;
      const dy      = e.clientY - dragState.startY;
      const margin  = 4;
      const cardW   = resultCard.offsetWidth  || 500;
      const cardH   = resultCard.offsetHeight || 200;
      const newLeft = Math.max(margin, Math.min(dragState.origLeft + dx, window.innerWidth  - cardW - margin));
      const newTop  = Math.max(margin, Math.min(dragState.origTop  + dy, window.innerHeight - cardH - margin));
      resultCard.style.left = `${newLeft}px`;
      resultCard.style.top  = `${newTop}px`;
    }
    dragPending = false;
  });
}

function onDragEnd() {
  if (!dragState) return;
  dragState = null;
  resultCard?.classList.remove('g-dragging');
}

// ── 選取偵測 ─────────────────────────────────────────
function onMouseUp(e) {
  if (isInOurUI(e.target)) return;
  setTimeout(checkSelection, 20);
}

function onKeyUp(e) {
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
    setTimeout(checkSelection, 20);
  }
}

function onMouseDown(e) {
  if (isInOurUI(e.target)) return;
  hideAll();
}

function isInOurUI(el) {
  return (toolbar    && toolbar.contains(el))
      || (resultCard && resultCard.contains(el));
}

function checkSelection() {
  const sel  = window.getSelection();
  const text = sel?.toString().trim();
  if (text && text.length > 0) {
    try {
      savedSel = { text, range: sel.getRangeAt(0).cloneRange() };
      showToolbar();
    } catch { /* 跨 iframe 等情況靜默忽略 */ }
  } else {
    hideAll();
  }
}

function hideAll() {
  hideToolbar();
  hideResultCard();
}

// ── 觸發 AI 功能 ─────────────────────────────────────
const ACTION_META = {
  translate: {
    label: '翻譯',
    svg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`
  },
  explain: {
    label: '解釋',
    svg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`
  },
  optimize: {
    label: '優化',
    svg: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
  }
};

function triggerAction(action) {
  if (!savedSel) return;

  activeAction = action;
  userDragged  = false;

  toolbar.querySelectorAll('.g-btn').forEach(b =>
    b.classList.toggle('g-active', b.dataset.action === action)
  );

  if (!resultCard) resultCard = createResultCard();

  // 新請求時收合 Obsidian 面板
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-obs-dropdown')?.classList.remove('g-obs-dd-open');

  const meta = ACTION_META[action] || { label: action, svg: '' };
  resultCard.querySelector('.g-rc-tag').innerHTML = `${meta.svg}${meta.label}`;
  resultCard.querySelector('.g-rc-body').innerHTML =
    '<div class="g-shimmer-wrap"><div class="g-shimmer-line"></div><div class="g-shimmer-line"></div><div class="g-shimmer-line"></div></div>';

  hideToolbar();
  resultCard.classList.add('g-show');
  requestAnimationFrame(positionResultCard);

  if (!chrome.runtime?.id) {
    setError('擴充功能已更新，請重新整理頁面（F5）');
    return;
  }

  const cacheKey  = `${action}:${savedSel.text}`;
  const context   = extractContext(savedSel.text, savedSel.range);
  const pageTitle = document.title;

  // 快取命中：直接渲染，不發 API 請求
  if (responseCache.has(cacheKey)) {
    renderResult(action, responseCache.get(cacheKey), savedSel.text);
    requestAnimationFrame(positionResultCard);
    return;
  }

  // 字典模式（translate + 短文字）需要完整 JSON，不能 streaming
  const isDict = action === 'translate' && savedSel.text.length <= 20;

  if (isDict) {
    sendNonStreaming(action, savedSel.text, context, pageTitle, cacheKey);
  } else {
    startStreaming(action, savedSel.text, context, pageTitle, cacheKey);
  }
}

// ── Non-streaming（字典模式）─────────────────────────
function sendNonStreaming(action, selectedText, context, pageTitle, cacheKey) {
  try {
    chrome.runtime.sendMessage(
      { type: 'GEMINI_REQUEST', action, selectedText, context, pageTitle },
      response => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          setError(msg.includes('context invalidated')
            ? '擴充功能已更新，請重新整理頁面（F5）'
            : '連線失敗，請重試');
          return;
        }
        if (!response)        { setError('無回應，請重試'); return; }
        if (response.error) {
          if (response.code === 'RPD_LIMIT') {
            showRpdLimitWarning(response);
          } else {
            setError(response.error);
          }
          return;
        }
        responseCache.set(cacheKey, response.result);
        renderResult(action, response.result, selectedText);
        requestAnimationFrame(positionResultCard);
      }
    );
  } catch {
    setError('擴充功能已更新，請重新整理頁面（F5）');
  }
}

// ── Streaming（翻譯段落 / 解釋 / 優化）──────────────
function startStreaming(action, selectedText, context, pageTitle, cacheKey) {
  const port        = chrome.runtime.connect({ name: 'ai-stream' });
  let   accumulated = '';
  const body        = resultCard?.querySelector('.g-rc-body');
  let   portDone    = false;

  port.onMessage.addListener(msg => {
    if (msg.error) {
      setError(msg.error);
      port.disconnect();
      return;
    }
    if (msg.done) {
      portDone = true;
      // Stream 完成：套用完整 markdown 格式並存入快取
      lastRawResult = accumulated;
      if (body) {
        body.innerHTML = `<div class="g-text-body">${formatMarkdown(accumulated)}</div>`;
      }
      responseCache.set(cacheKey, accumulated);
      requestAnimationFrame(positionResultCard);
      port.disconnect();
      return;
    }
    if (msg.chunk) {
      accumulated += msg.chunk;
      // 串流進行中：顯示純文字 + 閃爍游標
      if (body) {
        body.innerHTML = `<div class="g-text-body g-streaming">${escapeHtml(accumulated).replace(/\n/g, '<br>')}</div>`;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    // port 意外斷線（擴充功能更新等）且串流尚未完成
    if (!portDone && chrome.runtime.lastError) {
      setError('連線中斷，請重試');
    }
  });

  port.postMessage({ action, selectedText, context, pageTitle });
}
