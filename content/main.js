'use strict';

// ── 注入品牌字型（content script 無法用靜態 CSS @font-face，需動態取得 extension URL）
(function injectBrandFont() {
  const url = chrome.runtime.getURL('fonts/jf-openhuninn-2.1.ttf');
  const style = document.createElement('style');
  style.textContent = `@font-face{font-family:'jf-openhuninn';src:url('${url}')format('truetype');font-display:block;}`;
  document.head.appendChild(style);
})();

// ── 事件監聽 ─────────────────────────────────────────
document.addEventListener('mouseup',   (e) => { onDragEnd(e); onMouseUp(e); });
document.addEventListener('keyup',     onKeyUp);
document.addEventListener('mousedown', onMouseDown);
document.addEventListener('mousemove', onDragMove);

window.addEventListener('beforeunload', () => {
  toolbar?.remove();
  resultCard?.remove();
  floatingBall?.remove();
  pageTranslationPanel?.remove();
  dragState = null;
  savedSel  = null;
});

initContentSettings();

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
  snapToEdgeIfNear();
}

function snapToEdgeIfNear() {
  if (!resultCard) return;
  const margin    = 4;
  const threshold = 28;
  const rect      = resultCard.getBoundingClientRect();
  let   left      = parseFloat(resultCard.style.left) || rect.left;
  let   top       = parseFloat(resultCard.style.top)  || rect.top;
  let   snapped   = false;

  if (rect.left   < threshold)                            { left = margin;                                   snapped = true; }
  else if (rect.right  > window.innerWidth  - threshold) { left = window.innerWidth  - rect.width  - margin; snapped = true; }
  if (rect.top    < threshold)                            { top  = margin;                                   snapped = true; }
  else if (rect.bottom > window.innerHeight - threshold) { top  = window.innerHeight - rect.height - margin; snapped = true; }

  if (snapped) {
    resultCard.classList.add('g-snapping');
    resultCard.style.left = `${left}px`;
    resultCard.style.top  = `${top}px`;
    setTimeout(() => resultCard?.classList.remove('g-snapping'), 220);
  }
}

// ── 選取偵測 ─────────────────────────────────────────
function onMouseUp(e) {
  if (fanFanBaPaused) return;
  if (isInOurUI(e.target)) return;
  if (obsidianSaving) return; // 存入 Obsidian 期間 tab 切換可能觸發合成事件
  setTimeout(checkSelection, 20);
}

function onKeyUp(e) {
  if (fanFanBaPaused) return;
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
    setTimeout(checkSelection, 20);
  }
}

function onMouseDown(e) {
  if (isInOurUI(e.target)) return;
  if (fanFanBaPaused) return;
  if (isPinned) {
    // 釘住時只收起工具列，結果卡保留
    hideToolbar();
    return;
  }
  hideAll();
}

function isInOurUI(el) {
  return (toolbar    && toolbar.contains(el))
      || (resultCard && resultCard.contains(el))
      || (floatingBall && floatingBall.contains(el))
      || (pageTranslationPanel && pageTranslationPanel.contains(el));
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
    // pin 住時只收工具列，結果卡保留
    if (isPinned) hideToolbar();
    else          hideAll();
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
  if (!isPinned) userDragged = false; // pin 住時保留位置

  toolbar.querySelectorAll('.g-btn').forEach(b =>
    b.classList.toggle('g-active', b.dataset.action === action)
  );

  if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();

  // 新請求時收合 Obsidian 面板與存入提示
  resultCard.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
  resultCard.querySelector('.g-obs-dropdown')?.classList.remove('g-obs-dd-open');
  hideAutoSaveToast(resultCard);

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

  const context   = extractContext(savedSel.text, savedSel.range);
  const pageTitle = document.title;
  const cacheKey  = FanFanBaModels.buildCacheKey({
    action,
    text: savedSel.text,
    model: activeModel,
    targetLanguage,
    explanationLanguage,
    context,
    pageTitle
  });

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
      { type: 'GEMINI_REQUEST', action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage: navigator.language || '' },
      response => {
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message || '';
          // 擴充功能失效需重整頁面，不提供重試；其他連線錯誤可重試
          if (msg.includes('context invalidated')) {
            setError('擴充功能已更新，請重新整理頁面（F5）');
          } else {
            setError('連線失敗，請重試', () => triggerAction(activeAction));
          }
          return;
        }
        if (!response)        { setError('無回應，請重試', () => triggerAction(activeAction)); return; }
        if (response.error) {
          if (response.code === 'RPD_LIMIT') {
            showRpdLimitWarning(response);
          } else {
            setError(response.error, () => triggerAction(activeAction));
          }
          return;
        }
        responseCache.set(cacheKey, response.result);
        renderResult(action, response.result, selectedText);
        if (response.notice) showResultNotice(response.notice);
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
  let   streamNotice = '';

  port.onMessage.addListener(msg => {
    if (msg.status) {
      streamNotice = msg.status;
      if (body && !accumulated) body.innerHTML = `<div class="g-provider-notice">${escapeHtml(streamNotice)}</div>`;
      return;
    }
    if (msg.error) {
      setError(msg.error, () => triggerAction(activeAction)); // streaming 錯誤可重試
      port.disconnect();
      return;
    }
    if (msg.done) {
      portDone = true;
      // Stream 完成：交由 renderResult 做結構化渲染
      renderResult(action, accumulated, selectedText);
      if (streamNotice) showResultNotice(streamNotice);
      responseCache.set(cacheKey, accumulated);
      requestAnimationFrame(positionResultCard);
      port.disconnect();
      return;
    }
    if (msg.chunk) {
      accumulated += msg.chunk;
      // 串流進行中：純文字 + 游標，DEEP 標記顯示為分隔線
      if (body) {
        const display = escapeHtml(accumulated)
          .replace(/===DEEP===/g, '<hr class="g-deep-divider">')
          .replace(/\n/g, '<br>');
        const notice = streamNotice ? `<div class="g-provider-notice">${escapeHtml(streamNotice)}</div>` : '';
        body.innerHTML = `${notice}<div class="g-text-body g-streaming">${display}</div>`;
      }
    }
  });

  port.onDisconnect.addListener(() => {
    // port 意外斷線（擴充功能更新等）且串流尚未完成
    if (!portDone && chrome.runtime.lastError) {
      setError('連線中斷，請重試', () => triggerAction(activeAction));
    }
  });

  port.postMessage({ action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage: navigator.language || '' });
}

function initContentSettings() {
  chrome.storage.sync.get({ model: FanFanBaModels.DEFAULT_MODEL, targetLanguage: 'zh-TW', explanationLanguage: 'target', ttsLanguageMode: 'auto' })
    .then(settings => {
      activeModel = FanFanBaModels.normalizeModel(settings.model);
      targetLanguage = FanFanBaModels.normalizeLanguage(settings.targetLanguage, 'zh-TW');
      explanationLanguage = FanFanBaModels.normalizeExplanationLanguage(settings.explanationLanguage, 'target');
      ttsLanguageMode = FanFanBaModels.normalizeTtsLanguageMode(settings.ttsLanguageMode, 'auto');
    })
    .catch(() => {});

  chrome.storage.local.get(getPauseStorageKey())
    .then(data => {
      fanFanBaPaused = !!data[getPauseStorageKey()];
      updateFloatingBallPausedState?.();
    })
    .catch(() => {});

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.model) activeModel = FanFanBaModels.normalizeModel(changes.model.newValue);
      if (changes.targetLanguage) targetLanguage = FanFanBaModels.normalizeLanguage(changes.targetLanguage.newValue, 'zh-TW');
      if (changes.explanationLanguage) explanationLanguage = FanFanBaModels.normalizeExplanationLanguage(changes.explanationLanguage.newValue, 'target');
      if (changes.ttsLanguageMode) ttsLanguageMode = FanFanBaModels.normalizeTtsLanguageMode(changes.ttsLanguageMode.newValue, 'auto');
    }
    if (area === 'local' && changes[getPauseStorageKey()]) {
      fanFanBaPaused = !!changes[getPauseStorageKey()].newValue;
      updateFloatingBallPausedState?.();
      if (fanFanBaPaused) hideAll();
    }
  });
}
