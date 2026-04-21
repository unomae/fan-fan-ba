'use strict';

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
      <div class="g-obs-dropdown"></div>
      <div class="g-obs-status"></div>
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

  // ── 複製按鈕 ───────────────────────────────────────
  el.querySelector('.g-copy').addEventListener('click', e => {
    e.stopPropagation();
    const text = el.querySelector('.g-rc-body').innerText;
    navigator.clipboard.writeText(text).catch(() => {});
    const btn = el.querySelector('.g-copy');
    btn.classList.add('g-copied');
    setTimeout(() => btn.classList.remove('g-copied'), 1500);
  });

  // ── 關閉按鈕 ───────────────────────────────────────
  el.querySelector('.g-close-rc').addEventListener('click', e => {
    e.stopPropagation();
    hideResultCard();
  });

  // ── 寶石按鈕：展開 / 收合 Obsidian 面板 ──────────
  el.querySelector('.g-save-obs').addEventListener('click', async e => {
    e.stopPropagation();
    const panel  = el.querySelector('.g-obs-panel');
    const isOpen = panel.classList.contains('g-obs-open');
    if (isOpen) {
      panel.classList.remove('g-obs-open');
      el.querySelector('.g-obs-dropdown').classList.remove('g-obs-dd-open');
      el.querySelector('.g-obs-status').classList.remove('g-obs-status-show');
      return;
    }
    const folders = await loadRecentFolders();
    const input   = el.querySelector('.g-obs-input');
    if (folders.length > 0 && !input.value) input.value = folders[0];
    panel.classList.add('g-obs-open');
    input.focus();

    // 面板展開後自動往上移，避免超出視窗下緣
    setTimeout(() => {
      const rect     = el.getBoundingClientRect();
      const overflow = rect.bottom - (window.innerHeight - 8);
      if (overflow > 0) {
        const newTop = Math.max(8, parseFloat(el.style.top || rect.top) - overflow);
        el.style.top = `${newTop}px`;
        userDragged  = true;
      }
    }, 240);
  });

  // ── 下拉箭頭：最近資料夾清單 ──────────────────────
  el.querySelector('.g-obs-chevron-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const dropdown = el.querySelector('.g-obs-dropdown');
    const isOpen   = dropdown.classList.contains('g-obs-dd-open');
    if (isOpen) { dropdown.classList.remove('g-obs-dd-open'); return; }

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

  // ── 存入按鈕 ──────────────────────────────────────
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

    const gemBtn = el.querySelector('.g-save-obs');
    gemBtn.classList.add('g-saved');
    setTimeout(() => gemBtn.classList.remove('g-saved'), 1800);

    confirmBtn.textContent = '已傳送 ✓';
    confirmBtn.disabled    = true;
    statusEl.textContent   = '✓ 已傳送至 Obsidian';
    statusEl.classList.add('g-obs-status-show', 'g-obs-status-ok');

    setTimeout(() => {
      el.querySelector('.g-obs-panel').classList.remove('g-obs-open');
      statusEl.classList.remove('g-obs-status-show', 'g-obs-status-ok');
      confirmBtn.textContent = '新增到 Obsidian';
      confirmBtn.disabled    = false;
    }, 2000);
  });

  // 面板內 mousedown 不往上冒泡（避免觸發 hideAll）
  el.querySelector('.g-obs-panel').addEventListener('mousedown', e => e.stopPropagation());

  // ── 拖曳（按住 header 移動結果卡）────────────────
  el.querySelector('.g-rc-header').addEventListener('mousedown', e => {
    if (e.target.closest('.g-icon-btn')) return;
    e.preventDefault();
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

function hideResultCard() {
  resultCard?.classList.remove('g-show');
}

function positionResultCard() {
  if (!savedSel || !resultCard) return;
  if (userDragged) return;
  try {
    const rect  = savedSel.range.getBoundingClientRect();
    const margin = 8;
    const cardW  = 500;
    const cardH  = resultCard.offsetHeight || 200;
    const th     = toolbar?.offsetHeight || 40;

    let top  = rect.bottom + th + margin * 2;
    let left = rect.left + rect.width / 2 - cardW / 2;

    if (top + cardH > window.innerHeight - margin) top = rect.top - cardH - th - margin * 2;
    if (top < margin) top = margin;

    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));

    resultCard.style.top  = `${top}px`;
    resultCard.style.left = `${left}px`;
  } catch { /* 靜默忽略 */ }
}

function renderResult(action, rawResult, selectedText) {
  lastDictData  = null;
  lastRawResult = rawResult;
  const body = resultCard.querySelector('.g-rc-body');

  if (action === 'translate' && selectedText.length <= 20) {
    try {
      const data = parseJSON(rawResult);
      lastDictData = data;
      body.innerHTML = buildDictHTML(data);
      body.querySelector('.g-speak-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        speakWord(data.word || selectedText, e.currentTarget, data.lang);
      });
      return;
    } catch { /* JSON 解析失敗 → fallback 純文字 */ }
  }

  body.innerHTML = `<div class="g-text-body">${formatMarkdown(rawResult)}</div>`;
}

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

function setError(msg) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (body) body.innerHTML = `<span class="g-error">${escapeHtml(msg)}</span>`;
}

// 發音（優先 Google Cloud TTS Chirp HD，fallback 瀏覽器語音）
function speakWord(word, btn, lang) {
  btn?.classList.add('g-speaking');

  if (!chrome.runtime?.id) { speakFallback(word, btn); return; }

  chrome.runtime.sendMessage({ type: 'TTS_REQUEST', text: word, lang: lang || 'en' }, response => {
    if (chrome.runtime.lastError || !response || response.fallback || response.error) {
      speakFallback(word, btn);
      return;
    }
    const audio = new Audio(`data:audio/mp3;base64,${response.audioContent}`);
    audio.onended = () => btn?.classList.remove('g-speaking');
    audio.onerror = () => { btn?.classList.remove('g-speaking'); speakFallback(word, btn); };
    audio.play().catch(() => btn?.classList.remove('g-speaking'));
  });
}

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
      <div class="g-rpd-bar-wrap"><div class="g-rpd-bar-fill"></div></div>
      <div class="g-rpd-count">${current} / ${limit} 次</div>
      <button class="g-rpd-settings-btn">調整上限設定 →</button>
    </div>
  `;
  body.querySelector('.g-rpd-settings-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    if (chrome.runtime?.id) chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS' });
  });
}
