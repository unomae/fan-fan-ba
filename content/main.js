'use strict';

let lastSelectionPointerDown = null;

// ── 注入品牌字型（content script 無法用靜態 CSS @font-face，需動態取得 extension URL）
function injectBrandFont() {
  const url = chrome.runtime.getURL('fonts/jf-openhuninn-2.1.ttf');
  const style = document.createElement('style');
  style.textContent = `@font-face{font-family:'jf-openhuninn';src:url('${url}')format('truetype');font-display:block;}`;
  (document.head || document.documentElement).appendChild(style);
}

// ── 啟動 guard：敏感網域（登入 / 密碼管理）整支 content script 不啟用 ──
if (fanFanBaShouldActivate()) {
  injectBrandFont();

  // 事件監聽
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
}

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
  const point = { clientX: e.clientX, clientY: e.clientY };
  const allowGoogleDocsFallback = isLikelySelectionDrag(point);
  setTimeout(() => checkSelection(point, { allowGoogleDocsFallback }), 20);
}

function onKeyUp(e) {
  if (fanFanBaPaused) return;
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
    setTimeout(checkSelection, 20);
  }
}

function onMouseDown(e) {
  lastSelectionPointerDown = { clientX: e.clientX, clientY: e.clientY };
  if (isInOurUI(e.target)) return;
  hideFloatingBallMenu?.();
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

function checkSelection(point = null, options = {}) {
  const selectionData = getCurrentSelectionData(point);
  if (selectionData?.text) {
    try {
      savedSel = selectionData;
      showToolbar();
    } catch { /* 跨 iframe 等情況靜默忽略 */ }
  } else if (options.allowGoogleDocsFallback && isGoogleDocsDocumentPage()) {
    savedSel = {
      text: '',
      range: null,
      point,
      pendingGoogleDocsSelection: true
    };
    showToolbar();
  } else {
    // pin 住時只收工具列，結果卡保留
    if (isPinned) hideToolbar();
    else          hideAll();
  }
}

function getCurrentSelectionData(point = null) {
  return getWindowSelectionData(point) || getEditableSelectionData(point) || getNestedFrameSelectionData(point);
}

function getWindowSelectionData(point = null) {
  return getWindowSelectionDataFromWindow(window, point);
}

function getEditableSelectionData(point = null) {
  return getEditableSelectionDataFromDocument(document, point);
}

function getEditableSelectionDataFromDocument(doc, point = null) {
  const el = doc?.activeElement;
  if (!el || isInOurUI(el)) return null;
  if (!isTextSelectionControl(el)) return null;
  const start = Number(el.selectionStart);
  const end = Number(el.selectionEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return null;
  const text = String(el.value || '').slice(Math.min(start, end), Math.max(start, end)).trim();
  if (!text) return null;
  return {
    text,
    range: null,
    rect: getEditableSelectionFallbackRect(el, point),
    point
  };
}

function getEditableSelectionFallbackRect(el, point = null) {
  if (point && Number.isFinite(point.clientX) && Number.isFinite(point.clientY)) {
    return {
      left: point.clientX,
      right: point.clientX,
      top: point.clientY,
      bottom: point.clientY,
      width: 0,
      height: 0
    };
  }
  const rect = el.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function getNestedFrameSelectionData(point = null) {
  const frames = getSelectionCandidateFrames();
  for (const frame of frames) {
    const data = getFrameSelectionData(frame, point);
    if (data) return data;
  }
  return null;
}

function getSelectionCandidateFrames() {
  const frames = [];
  const active = document.activeElement;
  if (active && ['IFRAME', 'FRAME'].includes(active.tagName)) frames.push(active);
  document
    .querySelectorAll('iframe.docs-texteventtarget-iframe, iframe[name*="docs-texteventtarget" i], iframe[id*="docs-texteventtarget" i]')
    .forEach(frame => {
      if (!frames.includes(frame)) frames.push(frame);
    });
  return frames;
}

function getFrameSelectionData(frame, point = null) {
  try {
    const frameWindow = frame.contentWindow;
    const frameDocument = frame.contentDocument || frameWindow?.document;
    const frameRect = frame.getBoundingClientRect();
    const childPoint = point && Number.isFinite(point.clientX) && Number.isFinite(point.clientY)
      ? { clientX: point.clientX - frameRect.left, clientY: point.clientY - frameRect.top }
      : null;
    const data = getWindowSelectionDataFromWindow(frameWindow, childPoint)
      || getEditableSelectionDataFromDocument(frameDocument, childPoint);
    if (!data) return null;
    const rect = data.rect || getRangeSelectionRect(data.range);
    data.range = null;
    if (rect) data.rect = offsetRect(rect, frameRect.left, frameRect.top);
    if (data.point) data.point = { clientX: data.point.clientX + frameRect.left, clientY: data.point.clientY + frameRect.top };
    return data;
  } catch {
    return null;
  }
}

function getWindowSelectionDataFromWindow(win, point = null) {
  const sel = win?.getSelection?.();
  const text = sel?.toString().trim();
  if (!text || !sel.rangeCount) return null;
  try {
    return {
      text,
      range: sel.getRangeAt(0).cloneRange(),
      point
    };
  } catch {
    return { text, range: null, point };
  }
}

function offsetRect(rect, leftOffset, topOffset) {
  return {
    left: rect.left + leftOffset,
    right: rect.right + leftOffset,
    top: rect.top + topOffset,
    bottom: rect.bottom + topOffset,
    width: rect.width,
    height: rect.height
  };
}

function getRangeSelectionRect(range) {
  if (!range) return null;
  const rects = Array.from(range.getClientRects?.() || []);
  const rect = rects.find(item => Number(item.width) > 0 || Number(item.height) > 0)
    || range.getBoundingClientRect?.();
  if (!rect) return null;
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

function isLikelySelectionDrag(point) {
  if (!point || !lastSelectionPointerDown) return false;
  return Math.max(
    Math.abs(point.clientX - lastSelectionPointerDown.clientX),
    Math.abs(point.clientY - lastSelectionPointerDown.clientY)
  ) >= 4;
}

function isGoogleDocsDocumentPage() {
  const loc = getCurrentLocationParts();
  return loc?.hostname === 'docs.google.com' && loc?.pathname?.startsWith('/document/');
}

function getCurrentLocationParts() {
  try {
    return {
      hostname: location.hostname || '',
      pathname: location.pathname || ''
    };
  } catch {
    return null;
  }
}

function hideAll() {
  hideToolbar();
  hideResultCard();
  hideFloatingBallMenu?.();
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
  if (savedSel.pendingGoogleDocsSelection) {
    resolvePendingGoogleDocsSelection(action);
    return;
  }

  activeAction = action;
  const requestId = ++activeRequestId;
  cancelActiveStream();
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

  const toolbarRect = toolbar?.getBoundingClientRect?.();
  resultCardAnchorRect = toolbarRect && Number.isFinite(toolbarRect.bottom) ? {
    left: toolbarRect.left,
    right: toolbarRect.right,
    top: toolbarRect.top,
    bottom: toolbarRect.bottom,
    width: toolbarRect.width,
    height: toolbarRect.height
  } : null;
  hideToolbar();
  resultCard.classList.add('g-show');
  requestAnimationFrame(() => positionResultCard(resultCardAnchorRect));

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
    requestAnimationFrame(() => positionResultCard(resultCardAnchorRect));
    return;
  }

  // 字典模式（translate + 短文字）需要完整 JSON，不能 streaming
  const isDict = action === 'translate' && savedSel.text.length <= 20;

  if (isDict) {
    sendNonStreaming(action, savedSel.text, context, pageTitle, cacheKey, requestId);
  } else {
    startStreaming(action, savedSel.text, context, pageTitle, cacheKey, requestId);
  }
}

async function resolvePendingGoogleDocsSelection(action) {
  const pendingSel = savedSel;
  const text = await readGoogleDocsSelectionFromCopyEvent();
  if (!text) {
    if (!resultCard || !document.body.contains(resultCard)) resultCard = createResultCard();
    activeAction = action;
    resultCard.querySelector('.g-rc-tag').textContent = 'Google Docs';
    resultCard.classList.add('g-show');
    hideToolbar();
    requestAnimationFrame(() => positionResultCard(pendingSel?.rect || pendingSel?.point || null));
    setError('Google Docs 沒有提供可讀取的選取文字。請確認已拖曳選取文字後再按一次，或先用 Ctrl+C 複製選取文字。');
    return;
  }
  savedSel = {
    text,
    range: null,
    rect: pendingSel?.rect || null,
    point: pendingSel?.point || null
  };
  triggerAction(action);
}

function readGoogleDocsSelectionFromCopyEvent() {
  return new Promise(resolve => {
    let resolved = false;
    let captured = '';
    const finish = value => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('copy', onCopy, false);
      resolve(String(value || '').trim());
    };
    const onCopy = event => {
      captured = event.clipboardData?.getData('text/plain') || captured;
      setTimeout(() => finish(event.clipboardData?.getData('text/plain') || captured), 0);
    };

    document.addEventListener('copy', onCopy, false);
    try {
      const copied = document.execCommand?.('copy');
      if (!copied) setTimeout(() => finish(captured), 60);
      else setTimeout(() => finish(captured), 160);
    } catch {
      finish('');
    }
  });
}

function cancelActiveStream() {
  if (!activeStreamPort) return;
  try { activeStreamPort.disconnect(); } catch {}
  activeStreamPort = null;
}

// ── Non-streaming（字典模式）─────────────────────────
function sendNonStreaming(action, selectedText, context, pageTitle, cacheKey, requestId) {
  try {
    chrome.runtime.sendMessage(
      { type: 'GEMINI_REQUEST', action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage: navigator.language || '' },
      response => {
        if (requestId !== activeRequestId) return;
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
        // 用箭頭函式傳入 anchorRect，否則 rAF 會把 timestamp 當 anchorRect → 掉進選字置中分支（卡片亂跑）
        requestAnimationFrame(() => positionResultCard(resultCardAnchorRect));
      }
    );
  } catch {
    setError('擴充功能已更新，請重新整理頁面（F5）');
  }
}

// ── Streaming（翻譯段落 / 解釋 / 優化）──────────────
function startStreaming(action, selectedText, context, pageTitle, cacheKey, requestId) {
  const port        = chrome.runtime.connect({ name: 'ai-stream' });
  activeStreamPort = port;
  let   accumulated = '';
  const body        = resultCard?.querySelector('.g-rc-body');
  let   portDone    = false;
  let   streamNotice = '';

  port.onMessage.addListener(msg => {
    if (requestId !== activeRequestId || (msg.requestId && msg.requestId !== requestId)) return;
    if (msg.status) {
      streamNotice = msg.status;
      if (body && !accumulated) body.innerHTML = `<div class="g-provider-notice">${escapeHtml(streamNotice)}</div>`;
      return;
    }
    if (msg.error) {
      setError(msg.error, () => triggerAction(activeAction)); // streaming 錯誤可重試
      if (activeStreamPort === port) activeStreamPort = null;
      port.disconnect();
      return;
    }
    if (msg.done) {
      portDone = true;
      // Stream 完成：交由 renderResult 做結構化渲染
      renderResult(action, accumulated, selectedText);
      if (streamNotice) showResultNotice(streamNotice);
      responseCache.set(cacheKey, accumulated);
      // 同上：箭頭函式傳 anchorRect，避免 rAF timestamp 觸發選字置中分支
      requestAnimationFrame(() => positionResultCard(resultCardAnchorRect));
      if (activeStreamPort === port) activeStreamPort = null;
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
    if (activeStreamPort === port) activeStreamPort = null;
    // port 意外斷線（擴充功能更新等）且串流尚未完成
    if (!portDone && chrome.runtime.lastError) {
      setError('連線中斷，請重試', () => triggerAction(activeAction));
    }
  });

  port.postMessage({ requestId, action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage: navigator.language || '' });
}

function initContentSettings() {
  chrome.storage.sync.get({ model: FanFanBaModels.DEFAULT_MODEL, pageTranslationModel: '', targetLanguage: 'zh-TW', explanationLanguage: 'target', ttsLanguageMode: 'auto' })
    .then(settings => {
      activeModel = FanFanBaModels.normalizeModel(settings.model);
      setPageTranslationModel?.(settings.pageTranslationModel || activeModel);
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
      if (changes.model) {
        activeModel = FanFanBaModels.normalizeModel(changes.model.newValue);
        syncResultCardModelSelect?.();
      }
      if (changes.model && !changes.pageTranslationModel) setPageTranslationModel?.(activeModel);
      if (changes.pageTranslationModel) setPageTranslationModel?.(changes.pageTranslationModel.newValue || activeModel);
      if (changes.targetLanguage) targetLanguage = FanFanBaModels.normalizeLanguage(changes.targetLanguage.newValue, 'zh-TW');
      if (changes.explanationLanguage) explanationLanguage = FanFanBaModels.normalizeExplanationLanguage(changes.explanationLanguage.newValue, 'target');
      if (changes.ttsLanguageMode) ttsLanguageMode = FanFanBaModels.normalizeTtsLanguageMode(changes.ttsLanguageMode.newValue, 'auto');
      if (changes.vocabularyHighlightMode) setVocabularyHighlightMode?.(changes.vocabularyHighlightMode.newValue);
    }
    if (area === 'local' && changes[getPauseStorageKey()]) {
      fanFanBaPaused = !!changes[getPauseStorageKey()].newValue;
      updateFloatingBallPausedState?.();
      if (fanFanBaPaused) hideAll();
    }
  });
}
