// content.js — 偵測文字選取，注入懸浮工具列 + 結果卡
// 工具列：純圖示 pill；結果卡：獨立 320px 浮動視窗

(function () {
  'use strict';

  // ── 狀態 ────────────────────────────────────────────
  let toolbar    = null;  // 圖示 pill
  let resultCard = null;  // 結果卡（獨立視窗）
  let savedSel   = null;  // { text, range }
  let activeAction = null;
  let userDragged  = false; // 使用者手動拖曳後不覆蓋位置
  let dragState    = null;  // { startX, startY, origLeft, origTop }
  let lastDictData  = null; // 字典模式：解析後的 JSON 物件（供 Obsidian 存入使用）
  let lastRawResult = null; // 一般模式：原始 AI 回傳文字

  // 模型 ID → 顯示名稱
  const MODEL_NAMES = {
    'gemini-3.1-flash-lite-preview':                            'Gemini 3.1 Flash Lite',
    'gemini-3-flash-preview':                                   'Gemini 3 Flash',
    'gemini-2.5-flash':                                         'Gemini 2.5 Flash',
    'groq:meta-llama/llama-4-scout-17b-16e-instruct':           'Llama 4 Scout',
    'openrouter:deepseek/deepseek-chat-v3-0324':                'DeepSeek V3',
    'openrouter:qwen/qwen3-30b-a3b':                            'Qwen3 30B',
    'openrouter:mistralai/mistral-small-3.1-24b-instruct':      'Mistral Small 3.1'
  };

  // ── 事件監聽 ────────────────────────────────────────
  document.addEventListener('mouseup',   (e) => { onDragEnd(e); onMouseUp(e); });
  document.addEventListener('keyup',     onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mousemove', onDragMove);

  // ── 頁面卸載時清理，避免 SPA 導航造成 memory leak ──
  window.addEventListener('beforeunload', () => {
    toolbar?.remove();
    resultCard?.remove();
    dragState = null;
    savedSel  = null;
  });

  // ── 拖曳處理 ────────────────────────────────────────────
  let dragPending = false;
  function onDragMove(e) {
    if (!dragState || !resultCard || dragPending) return;
    dragPending = true;
    requestAnimationFrame(() => {
      if (dragState) { // 可能在 rAF 回呼前就已結束拖曳
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

  // ── 工具列建立 ─────────────────────────────────────
  function createToolbar() {
    const el = document.createElement('div');
    el.id = 'gemini-ai-toolbar';
    el.innerHTML = `
      <button class="g-btn" data-action="translate" data-tooltip="翻譯">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/>
          <path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
        </svg>
      </button>
      <span class="g-sep"></span>
      <button class="g-btn" data-action="explain" data-tooltip="解釋這個">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>
        </svg>
      </button>
      <span class="g-sep"></span>
      <button class="g-btn" data-action="optimize" data-tooltip="優化精進">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
        </svg>
      </button>
    `;

    el.querySelectorAll('.g-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        triggerAction(btn.dataset.action);
      });
    });

    document.body.appendChild(el);
    return el;
  }

  // ── 結果卡建立 ─────────────────────────────────────
  function createResultCard() {
    const el = document.createElement('div');
    el.id = 'gemini-result-card';
    el.innerHTML = `
      <div class="g-rc-header">
        <span class="g-rc-tag"></span>
        <div class="g-rc-actions">
          <button class="g-icon-btn g-save-obs" title="存到 Obsidian">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6 3h12l4 6-10 13L2 9Z"/>
              <path d="M11 3 8 9l4 13 4-13-3-6"/>
              <path d="M2 9h20"/>
            </svg>
          </button>
          <button class="g-icon-btn g-copy" title="複製">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </button>
          <button class="g-icon-btn g-close-rc" title="關閉">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="g-rc-body"></div>

      <!-- Obsidian 儲存面板（點寶石圖示展開）-->
      <div class="g-obs-panel">
        <div class="g-obs-panel-title">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3h12l4 6-10 13L2 9Z"/>
            <path d="M11 3 8 9l4 13 4-13-3-6"/>
            <path d="M2 9h20"/>
          </svg>
          存到 Obsidian
        </div>
        <div class="g-obs-input-row">
          <input class="g-obs-input" type="text" placeholder="資料夾路徑，如：翻翻吧  或  Reading/AI">
        </div>
        <!-- 最近資料夾下拉清單（點 ▼ 展開）-->
        <div class="g-obs-dropdown"></div>
        <!-- 傳送後提示（預設隱藏）-->
        <div class="g-obs-status"></div>
        <!-- 分割按鈕：左邊存入、右邊展開選單 -->
        <div class="g-obs-split-wrap">
          <button class="g-obs-confirm-btn">新增到 Obsidian</button>
          <button class="g-obs-chevron-btn" title="最近使用的資料夾">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
        </div>
      </div>
    `;

    el.querySelector('.g-copy').addEventListener('click', e => {
      e.stopPropagation();
      const text = el.querySelector('.g-rc-body').innerText;
      navigator.clipboard.writeText(text).catch(() => {});
      const btn = el.querySelector('.g-copy');
      btn.classList.add('g-copied');
      setTimeout(() => btn.classList.remove('g-copied'), 1500);
    });

    el.querySelector('.g-close-rc').addEventListener('click', e => {
      e.stopPropagation();
      hideResultCard();
    });

    // ── Obsidian 面板事件 ───────────────────────────────

    // 點寶石按鈕：切換面板開關
    el.querySelector('.g-save-obs').addEventListener('click', async e => {
      e.stopPropagation();
      const panel = el.querySelector('.g-obs-panel');
      const isOpen = panel.classList.contains('g-obs-open');
      if (isOpen) {
        panel.classList.remove('g-obs-open');
        el.querySelector('.g-obs-dropdown').classList.remove('g-obs-dd-open');
        el.querySelector('.g-obs-status').classList.remove('g-obs-status-show');
        return;
      }
      // 預填最近一次使用的資料夾（若輸入框為空）
      const folders = await loadRecentFolders();
      const input   = el.querySelector('.g-obs-input');
      if (folders.length > 0 && !input.value) {
        input.value = folders[0];
      }
      panel.classList.add('g-obs-open');
      input.focus();

      // 面板展開動畫結束後（0.22s），自動往上移以避免超出視窗下緣
      setTimeout(() => {
        const rect     = el.getBoundingClientRect();
        const overflow = rect.bottom - (window.innerHeight - 8);
        if (overflow > 0) {
          const newTop = Math.max(8, parseFloat(el.style.top || rect.top) - overflow);
          el.style.top = `${newTop}px`;
          userDragged  = true; // 標記手動定位，不讓後續事件重設
        }
      }, 240);
    });

    // 下拉箭頭：展開 / 收合最近資料夾清單
    el.querySelector('.g-obs-chevron-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const dropdown = el.querySelector('.g-obs-dropdown');
      const isOpen   = dropdown.classList.contains('g-obs-dd-open');
      if (isOpen) {
        dropdown.classList.remove('g-obs-dd-open');
        return;
      }
      const folders = await loadRecentFolders();
      if (folders.length === 0) {
        dropdown.innerHTML = '<div class="g-obs-dd-empty">尚無使用記錄</div>';
      } else {
        dropdown.innerHTML = folders.map(f =>
          `<button class="g-obs-dd-item" data-folder="${escapeHtml(f)}">${escapeHtml(f)}</button>`
        ).join('');
        dropdown.querySelectorAll('.g-obs-dd-item').forEach(item => {
          item.addEventListener('click', e2 => {
            e2.stopPropagation();
            el.querySelector('.g-obs-input').value = item.dataset.folder;
            dropdown.classList.remove('g-obs-dd-open');
          });
        });
      }
      dropdown.classList.add('g-obs-dd-open');
    });

    // 主要存入按鈕（傳送後保留面板供重試）
    el.querySelector('.g-obs-confirm-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const input      = el.querySelector('.g-obs-input');
      const folder     = input.value.trim();
      const confirmBtn = el.querySelector('.g-obs-confirm-btn');
      const statusEl   = el.querySelector('.g-obs-status');

      if (!folder) {
        input.classList.add('g-obs-input-err');
        input.placeholder = '請先輸入資料夾路徑';
        input.focus();
        setTimeout(() => input.classList.remove('g-obs-input-err'), 1500);
        return;
      }

      await saveToObsidian(folder);

      // 寶石按鈕短暫亮紫色
      const gemBtn = el.querySelector('.g-save-obs');
      gemBtn.classList.add('g-saved');
      setTimeout(() => gemBtn.classList.remove('g-saved'), 1800);

      // 顯示成功訊息（obsidian:// URI 由 OS 處理，有開直接存、沒開則啟動後存）
      confirmBtn.textContent = '已傳送 ✓';
      confirmBtn.disabled    = true;
      statusEl.textContent   = '✓ 已傳送至 Obsidian';
      statusEl.classList.add('g-obs-status-show', 'g-obs-status-ok');

      // 2 秒後關閉面板，恢復按鈕
      setTimeout(() => {
        el.querySelector('.g-obs-panel').classList.remove('g-obs-open');
        statusEl.classList.remove('g-obs-status-show', 'g-obs-status-ok');
        confirmBtn.textContent = '新增到 Obsidian';
        confirmBtn.disabled    = false;
      }, 2000);
    });

    // 面板內的 mousedown 不往上冒泡（避免觸發 hideAll）
    el.querySelector('.g-obs-panel').addEventListener('mousedown', e => e.stopPropagation());

    // 按住 header 可拖曳移動結果卡（不干擾複製/關閉按鈕）
    el.querySelector('.g-rc-header').addEventListener('mousedown', e => {
      if (e.target.closest('.g-icon-btn')) return;
      e.preventDefault(); // 阻止拖曳時選取文字
      const rect = el.getBoundingClientRect();
      dragState = {
        startX:   e.clientX,
        startY:   e.clientY,
        origLeft: rect.left,
        origTop:  rect.top
      };
      userDragged = true;
      el.classList.add('g-dragging');
    });

    document.body.appendChild(el);
    return el;
  }

  // ── 顯示 / 隱藏 ─────────────────────────────────────
  function showToolbar() {
    if (!toolbar) toolbar = createToolbar();
    toolbar.querySelectorAll('.g-btn').forEach(b => b.classList.remove('g-active'));
    positionToolbar();
    toolbar.classList.add('g-show');

    // 簡約 fade-in：淡入 + 輕微上移，減少突兀感
    toolbar.style.transformOrigin = '';
    toolbar.animate([
      { opacity: 0, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)'   }
    ], {
      duration: 150,
      easing:   'ease-out',
      fill:     'none'
    });
  }

  function hideAll() {
    hideToolbar();
    hideResultCard();
  }

  function hideToolbar() {
    toolbar?.classList.remove('g-show');
  }

  function hideResultCard() {
    resultCard?.classList.remove('g-show');
  }

  // ── 定位工具列 ───────────────────────────────────────
  // left 計算實際左緣（不再依賴 translateX(-50%)）
  function positionToolbar() {
    if (!savedSel) return;
    try {
      const rect    = savedSel.range.getBoundingClientRect();
      const margin  = 8;
      const th      = toolbar.offsetHeight || 42;
      const tw      = toolbar.offsetWidth  || 120;

      const centerX = rect.left + rect.width / 2;
      let top  = rect.top - th - margin;
      let left = centerX - tw / 2;   // 實際左緣

      if (rect.top < th + margin) top = rect.bottom + margin;
      if (top + th > window.innerHeight - margin) top = margin;

      // 左右邊界（用實際寬度保護，不加 tw/2 偏移）
      left = Math.max(margin, Math.min(left, window.innerWidth - tw - margin));

      toolbar.style.top  = `${top}px`;
      toolbar.style.left = `${left}px`;
    } catch { /* 靜默忽略 */ }
  }

  // ── 定位結果卡 ───────────────────────────────────────
  function positionResultCard() {
    if (!savedSel || !resultCard) return;
    if (userDragged) return; // 使用者已手動拖曳，保留位置
    try {
      const rect    = savedSel.range.getBoundingClientRect();
      const margin  = 8;
      const cardW   = 500;
      const cardH   = resultCard.offsetHeight || 200;
      const th      = toolbar?.offsetHeight || 40;

      // 優先顯示在選取文字下方
      let top  = rect.bottom + th + margin * 2;
      let left = rect.left + rect.width / 2 - cardW / 2;

      // 下方空間不足 → 顯示在上方
      if (top + cardH > window.innerHeight - margin) {
        top = rect.top - cardH - th - margin * 2;
      }

      // 上方也不足 → 強制貼視窗上緣
      if (top < margin) top = margin;

      // 左右邊界保護
      left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));

      resultCard.style.top  = `${top}px`;
      resultCard.style.left = `${left}px`;
    } catch { /* 靜默忽略 */ }
  }

  // ── 觸發 AI 功能 ─────────────────────────────────────
  function triggerAction(action) {
    if (!savedSel) return;

    activeAction = action;
    userDragged  = false; // 新請求時重設，讓結果卡重新自動定位

    // 高亮工具列按鈕
    toolbar.querySelectorAll('.g-btn').forEach(b =>
      b.classList.toggle('g-active', b.dataset.action === action)
    );

    // 建立結果卡（若尚未存在）
    if (!resultCard) resultCard = createResultCard();

    // 新請求時收合 Obsidian 面板（避免上次開著的狀態殘留）
    const obsPanel    = resultCard.querySelector('.g-obs-panel');
    const obsDropdown = resultCard.querySelector('.g-obs-dropdown');
    obsPanel?.classList.remove('g-obs-open');
    obsDropdown?.classList.remove('g-obs-dd-open');

    // 設定標籤 + Loading（圖示與工具列對應）
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
    const meta = ACTION_META[action] || { label: action, svg: '' };
    resultCard.querySelector('.g-rc-tag').innerHTML = `${meta.svg}${meta.label}`;
    resultCard.querySelector('.g-rc-body').innerHTML =
      '<div class="g-shimmer-wrap"><div class="g-shimmer-line"></div><div class="g-shimmer-line"></div><div class="g-shimmer-line"></div></div>';

    // 結果卡出現，工具列收起避免遮擋
    hideToolbar();
    resultCard.classList.add('g-show');
    requestAnimationFrame(positionResultCard);

    // 確認 runtime 仍有效
    if (!chrome.runtime?.id) {
      setError('擴充功能已更新，請重新整理頁面（F5）');
      return;
    }

    const context   = extractContext(savedSel.text, savedSel.range);
    const pageTitle = document.title;

    try {
      chrome.runtime.sendMessage(
        { type: 'GEMINI_REQUEST', action, selectedText: savedSel.text, context, pageTitle },
        response => {
          if (chrome.runtime.lastError) {
            const msg = chrome.runtime.lastError.message || '';
            setError(msg.includes('context invalidated')
              ? '擴充功能已更新，請重新整理頁面（F5）'
              : '連線失敗，請重試');
            return;
          }
          if (!response)         { setError('無回應，請重試'); return; }
          if (response.error) {
            if (response.code === 'RPD_LIMIT') {
              showRpdLimitWarning(response);
            } else {
              setError(response.error);
            }
            return;
          }

          renderResult(action, response.result, savedSel.text);
          requestAnimationFrame(positionResultCard);
        }
      );
    } catch {
      setError('擴充功能已更新，請重新整理頁面（F5）');
    }
  }

  // ── 渲染結果 ─────────────────────────────────────────
  function renderResult(action, rawResult, selectedText) {
    lastDictData  = null;
    lastRawResult = rawResult;
    const body = resultCard.querySelector('.g-rc-body');

    // 翻譯 + 單字 → 嘗試解析字典 JSON
    if (action === 'translate' && selectedText.length <= 20) {
      try {
        const data = parseJSON(rawResult);
        lastDictData = data; // 保留結構化資料供 Obsidian 存入
        body.innerHTML = buildDictHTML(data);
        // 綁定發音按鈕
        body.querySelector('.g-speak-btn')?.addEventListener('click', e => {
          e.stopPropagation();
          speakWord(data.word || selectedText, e.currentTarget, data.lang);
        });
        return;
      } catch { /* JSON 解析失敗 → fallback 純文字 */ }
    }

    // 一般文字顯示
    body.innerHTML = `<div class="g-text-body">${formatMarkdown(rawResult)}</div>`;
  }

  // POS 詞性 → Badge CSS class
  function getPosClass(pos) {
    const p = (pos || '').toLowerCase().trim();
    if (/^n[\.\s]|^noun/.test(p))  return 'g-pos-n';
    if (/^v[\.\s]|^verb/.test(p))  return 'g-pos-v';
    if (/^adj/.test(p))            return 'g-pos-adj';
    if (/^adv/.test(p))            return 'g-pos-adv';
    if (/^prep/.test(p))           return 'g-pos-prep';
    return 'g-pos-default';
  }

  // ── 字典 HTML 組裝 ────────────────────────────────────
  function buildDictHTML(d) {
    const translations = Array.isArray(d.translations)
      ? d.translations.join('; ')
      : (d.translations || '');

    const examples = (d.examples || []).map(ex => `
      <div class="g-example">
        <span class="g-ex-en">${escapeHtml(ex.src || ex.en || '')}</span>
        <span class="g-ex-zh">${escapeHtml(ex.zh || '')}</span>
      </div>`).join('');

    return `
      <div class="g-dict-translations">${escapeHtml(translations)}</div>

      <div class="g-dict-word-row">
        <span class="g-dict-word">${escapeHtml(d.word || '')}</span>
        <button class="g-speak-btn" title="發音">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          </svg>
        </button>
      </div>

      ${d.phonetic ? `<div class="g-dict-phonetic">${escapeHtml(d.phonetic)}</div>` : ''}

      <div class="g-dict-divider"></div>

      ${d.pos || d.definition ? `
        <div class="g-dict-pos-def">
          ${d.pos ? `<span class="g-pos ${getPosClass(d.pos)}">${escapeHtml(d.pos)}</span>` : ''}
          ${escapeHtml(d.definition || '')}
        </div>` : ''}

      ${d.usage ? `<div class="g-dict-usage">${escapeHtml(d.usage)}</div>` : ''}

      ${examples ? `
        <div class="g-dict-divider"></div>
        <div class="g-dict-examples-title">例句</div>
        ${examples}` : ''}
    `;
  }

  // ── 發音（優先 Google Cloud TTS Chirp HD，fallback 瀏覽器語音）────
  // lang：BCP 47 語言代碼，如 en / ja / de，由字典 JSON 的 lang 欄位傳入
  function speakWord(word, btn, lang) {
    btn?.classList.add('g-speaking');

    if (!chrome.runtime?.id) {
      speakFallback(word, btn);
      return;
    }

    chrome.runtime.sendMessage({ type: 'TTS_REQUEST', text: word, lang: lang || 'en' }, response => {
      if (chrome.runtime.lastError || !response || response.fallback || response.error) {
        // TTS Key 未設定或呼叫失敗 → 改用瀏覽器內建語音
        speakFallback(word, btn);
        return;
      }
      // 用 base64 MP3 播放
      const audio = new Audio(`data:audio/mp3;base64,${response.audioContent}`);
      audio.onended = () => btn?.classList.remove('g-speaking');
      audio.onerror = () => {
        btn?.classList.remove('g-speaking');
        speakFallback(word, btn); // audio 播放失敗也 fallback
      };
      audio.play().catch(() => {
        btn?.classList.remove('g-speaking');
      });
    });
  }

  // 瀏覽器內建 Web Speech API（fallback）
  function speakFallback(word, btn) {
    if (!window.speechSynthesis) { btn?.classList.remove('g-speaking'); return; }
    window.speechSynthesis.cancel();
    const utt  = new SpeechSynthesisUtterance(word);
    utt.lang   = 'en-US';
    utt.rate   = 0.85;
    utt.pitch  = 1;
    utt.onend  = utt.onerror = () => btn?.classList.remove('g-speaking');
    window.speechSynthesis.speak(utt);
  }

  // ── 取得上下文 ───────────────────────────────────────
  function extractContext(selectedText, range) {
    const len        = selectedText.length;
    const contextLen = len <= 20 ? 100 : len <= 150 ? 200 : 500;

    try {
      const node   = range.commonAncestorContainer;
      const parent = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const full   = (parent.innerText || parent.textContent || '').trim();
      const idx    = full.indexOf(selectedText);
      if (idx === -1) return '';

      const start = Math.max(0, idx - contextLen);
      const end   = Math.min(full.length, idx + selectedText.length + contextLen);
      let   ctx   = full.slice(start, end);
      if (start > 0)         ctx = '...' + ctx;
      if (end < full.length) ctx = ctx   + '...';
      return ctx;
    } catch { return ''; }
  }

  // ── 工具函式 ─────────────────────────────────────────
  function setError(msg) {
    const body = resultCard?.querySelector('.g-rc-body');
    if (body) body.innerHTML = `<span class="g-error">${escapeHtml(msg)}</span>`;
  }

  // ══════════════════════════════════════════════════════
  //  Obsidian 儲存功能
  // ══════════════════════════════════════════════════════

  // 計算 ISO 週次標籤（台北時間），格式：2026-W16
  function getWeekLabel() {
    const now    = new Date();
    const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    // UTC 日期（ISO week 計算用）
    const d   = new Date(Date.UTC(taipei.getFullYear(), taipei.getMonth(), taipei.getDate()));
    const day = d.getUTCDay() || 7; // 週一 = 1
    d.setUTCDate(d.getUTCDate() + 4 - day); // 移到該週四（ISO 標準）
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  // 讀取最近使用的資料夾（最多 5 個）
  async function loadRecentFolders() {
    const { obsidianFolders } = await chrome.storage.local.get('obsidianFolders');
    return obsidianFolders || [];
  }

  // 儲存資料夾到最近清單（去重複、保留 5 個）
  async function saveRecentFolder(folder) {
    const { obsidianFolders } = await chrome.storage.local.get('obsidianFolders');
    const list    = obsidianFolders || [];
    const updated = [folder, ...list.filter(f => f !== folder)].slice(0, 5);
    await chrome.storage.local.set({ obsidianFolders: updated });
  }

  // （renderObsFolders 已整合至下拉箭頭事件，不再作為獨立函式）

  // 將結果卡資料組裝成 Obsidian markdown 區塊
  function buildObsidianBlock({ tag, hm, date, preview }) {
    const lines = [
      '',
      '---',
      '',
      `### ${tag} · ${hm}`,
      `**原文：** \`${preview}\``,
      `> 來源：[${document.title}](${window.location.href}) · ${date}`,
      ''
    ];

    if (lastDictData) {
      // ── 字典模式：結構化 markdown ───────────────────
      const d = lastDictData;
      const translations = Array.isArray(d.translations)
        ? d.translations.join('; ')
        : (d.translations || '');

      // 翻譯（大標題）
      if (translations) lines.push(`## ${translations}`, '');

      // 原文 + 音標
      const phonetic = d.phonetic ? ` \`${d.phonetic}\`` : '';
      lines.push(`**${d.word || ''}**${phonetic}`, '');

      // 詞性 + 釋義
      if (d.pos || d.definition) {
        lines.push(`\`${d.pos || ''}\`　${d.definition || ''}`, '');
      }

      // 語境說明
      if (d.usage) lines.push(d.usage, '');

      // 例句
      if (d.examples?.length) {
        lines.push('**例句**', '');
        d.examples.forEach(ex => {
          lines.push(`> *${ex.src || ex.en || ''}*`);
          lines.push(`> ${ex.zh || ''}`);
          lines.push('');
        });
      }
    } else {
      // ── 一般模式：保留 markdown 語法的原始文字 ──────
      lines.push(lastRawResult || '', '');
    }

    return lines.join('\n');
  }

  // 組裝筆記內容並透過 Advanced URI 存入 Obsidian
  async function saveToObsidian(folderPath) {
    if (!resultCard || !savedSel) return;

    const tag = resultCard.querySelector('.g-rc-tag')?.textContent || '';

    // 台北時間
    const now    = new Date();
    const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
    const hm     = taipei.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
    const date   = taipei.toLocaleDateString('zh-TW');

    // 週次 + 檔案路徑（去除尾部斜線避免雙斜線）
    const week     = getWeekLabel();
    const cleanDir = folderPath.replace(/\/+$/, '');
    const filePath = cleanDir ? `${cleanDir}/${week}.md` : `${week}.md`;

    // 原文預覽（最多 60 字）
    const preview = savedSel.text.length > 60
      ? savedSel.text.slice(0, 60) + '…'
      : savedSel.text;

    const block = buildObsidianBlock({ tag, hm, date, preview });

    // 讀取 Vault 名稱（選填）
    const { obsidianVault } = await chrome.storage.sync.get('obsidianVault');

    // 建立 Advanced URI（append 模式）
    // 注意：必須用 encodeURIComponent，URLSearchParams 會把空格變成 +，Obsidian 不認
    const encParts = [
      `filepath=${encodeURIComponent(filePath)}`,
      `data=${encodeURIComponent(block)}`,
      `mode=append`,
      `newline=true`
    ];
    if (obsidianVault?.trim()) encParts.push(`vault=${encodeURIComponent(obsidianVault.trim())}`);

    // 用 <a> 觸發 URI（避免 window.open 被 popup blocker 攔截）
    const a    = document.createElement('a');
    a.href     = `obsidian://advanced-uri?${encParts.join('&')}`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 記錄這次使用的資料夾
    await saveRecentFolder(folderPath);
  }

  // ── RPD 上限達到時的友善警告 UI ──────────────────────
  function showRpdLimitWarning({ current, limit, model }) {
    const body = resultCard?.querySelector('.g-rc-body');
    if (!body) return;
    const modelName = MODEL_NAMES[model] || model;
    body.innerHTML = `
      <div class="g-rpd-limit">
        <svg class="g-rpd-icon" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div class="g-rpd-title">今日已達使用上限</div>
        <div class="g-rpd-model">${escapeHtml(modelName)}</div>
        <div class="g-rpd-bar-wrap">
          <div class="g-rpd-bar-fill"></div>
        </div>
        <div class="g-rpd-count">${current} / ${limit} 次</div>
        <button class="g-rpd-settings-btn">調整上限設定 →</button>
      </div>
    `;
    // 點按鈕 → background 開啟 options 頁
    body.querySelector('.g-rpd-settings-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (chrome.runtime?.id) {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
      }
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // 強化 Markdown 渲染：支援段落、無序清單、有序清單、粗體
  function formatMarkdown(text) {
    const lines = text.split('\n');
    let html    = '';
    let inUl    = false;
    let inOl    = false;

    for (const raw of lines) {
      // 先跳脫 HTML 特殊字元，再套用 inline 格式
      const esc    = escapeHtml(raw);
      const inline = esc.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

      const isBullet  = /^[-*]\s+/.test(raw);
      const isOrdered = /^\d+\.\s+/.test(raw);

      if (isBullet) {
        if (inOl) { html += '</ol>'; inOl = false; }
        if (!inUl) { html += '<ul class="g-list">'; inUl = true; }
        html += `<li>${inline.replace(/^[-*]\s+/, '')}</li>`;
      } else if (isOrdered) {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (!inOl) { html += '<ol class="g-list">'; inOl = true; }
        html += `<li>${inline.replace(/^\d+\.\s+/, '')}</li>`;
      } else {
        if (inUl) { html += '</ul>'; inUl = false; }
        if (inOl) { html += '</ol>'; inOl = false; }
        html += raw.trim() === '' ? '<br>' : `<p class="g-p">${inline}</p>`;
      }
    }

    if (inUl) html += '</ul>';
    if (inOl) html += '</ol>';
    return html;
  }

  // 解析 Gemini 回傳的 JSON
  // Gemini 有時會加 ```json 包裝、有時直接回傳、有時前面帶說明文字
  // → 三層嘗試，確保都能正確解析
  function parseJSON(text) {
    const trimmed = text.trim();

    // 第一層：本身就是合法 JSON
    if (trimmed.startsWith('{')) {
      try { return JSON.parse(trimmed); } catch { /* 繼續嘗試 */ }
    }

    // 第二層：移除任意數量反引號的 markdown 包裝（```json / ``json / `json 都處理）
    const stripped = trimmed
      .replace(/^`{1,3}json\s*/i, '')
      .replace(/\s*`{1,3}$/, '')
      .trim();
    if (stripped.startsWith('{')) {
      try { return JSON.parse(stripped); } catch { /* 繼續嘗試 */ }
    }

    // 第三層：從文字中提取第一個 { 到最後一個 }（Gemini 前面加了說明文字的情況）
    const start = text.indexOf('{');
    const end   = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }

    throw new Error('無法解析 JSON');
  }

})();
