'use strict';

function createResultCard() {
  const el = document.createElement('div');
  el.id = 'gemini-result-card';
  el.innerHTML = `
    <div class="g-rc-header">
      <span class="g-rc-tag"></span>
      <select class="g-rc-model-select" title="切換模型" aria-label="切換模型"></select>
      <div class="g-rc-actions">
        <button class="g-icon-btn g-pin" type="button" title="釘住結果卡" aria-label="釘住結果卡">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
        </button>
        <button class="g-icon-btn g-save-obs" type="button" title="存到 Obsidian" aria-label="存到 Obsidian">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3h12l4 6-10 13L2 9Z"/>
            <path d="M11 3 8 9l4 13 4-13-3-6"/>
            <path d="M2 9h20"/>
          </svg>
        </button>
        <button class="g-icon-btn g-history" type="button" title="最近查詢紀錄" aria-label="最近查詢紀錄">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M12 7v5l4 2"/>
          </svg>
        </button>
        <button class="g-icon-btn g-copy" type="button" title="複製" aria-label="複製結果">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
        </button>
        <button class="g-icon-btn g-close-rc" type="button" title="關閉" aria-label="關閉結果卡">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 自動存入 Obsidian 成功提示列 -->
    <div class="g-autosave-bar">
      <span class="g-autosave-text"></span>
      <button class="g-autosave-change" type="button">更換資料夾</button>
    </div>

    <!-- 最近查詢紀錄下拉面板 -->
    <div class="g-history-panel"></div>

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
        <button class="g-obs-confirm-btn" type="button">新增到 Obsidian</button>
        <button class="g-obs-chevron-btn" type="button" title="最近使用的資料夾" aria-label="最近使用的資料夾">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  initModelSwitcher(el);

  // ── Pin 按鈕 ───────────────────────────────────────
  el.querySelector('.g-pin').addEventListener('click', e => {
    e.stopPropagation();
    isPinned = !isPinned;
    el.classList.toggle('g-pinned', isPinned);
    el.querySelector('.g-pin').classList.toggle('g-pin-active', isPinned);
  });

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
    isPinned = false;
    el.classList.remove('g-pinned');
    el.querySelector('.g-pin').classList.remove('g-pin-active');
    hideResultCard();
  });

  // ── 寶石按鈕：有記錄資料夾 → 自動存入；否則展開面板 ─
  el.querySelector('.g-save-obs').addEventListener('click', async e => {
    e.stopPropagation();

    const { obsidianDefaultFolder } = await chrome.storage.sync.get('obsidianDefaultFolder');
    const recentFolders = await loadRecentFolders();
    const autoFolder    = obsidianDefaultFolder?.trim() || recentFolders[0];

    if (autoFolder) {
      // 自動存入：不展開面板
      hideAutoSaveToast(el); // 先清除上一筆提示
      const result = await saveToObsidian(autoFolder);
      const gemBtn = el.querySelector('.g-save-obs');
      gemBtn.classList.add('g-saved');
      setTimeout(() => gemBtn.classList.remove('g-saved'), 1800);
      showAutoSaveToast(el, result?.filePath || autoFolder, result?.ok === false, result?.action);
    } else {
      // 第一次使用：展開面板讓使用者輸入資料夾
      openObsPanel(el);
    }
  });

  // ── autosave toast「更換資料夾」按鈕 ──────────────
  el.querySelector('.g-autosave-change').addEventListener('click', e => {
    e.stopPropagation();
    hideAutoSaveToast(el);
    openObsPanel(el);
  });

  // ── History 按鈕：toggle 歷史紀錄面板 ──────────────
  el.querySelector('.g-history').addEventListener('click', async e => {
    e.stopPropagation();
    const panel  = el.querySelector('.g-history-panel');
    const isOpen = panel.classList.contains('g-hist-open');

    // 關閉其他面板
    el.querySelector('.g-obs-panel')?.classList.remove('g-obs-open');
    hideAutoSaveToast(el);

    if (isOpen) {
      panel.classList.remove('g-hist-open');
      return;
    }

    const history = await loadHistory();

    if (history.length === 0) {
      ffbClear(panel).appendChild(ffbEl('div', { class: 'g-hist-empty' }, '尚無查詢紀錄'));
    } else {
      // 動作標籤文字與 CSS class 對應
      const ACTION_LABEL = { translate: '翻譯', explain: '解釋', optimize: '優化' };
      const ACTION_CLS   = { translate: 'g-hist-tag-translate', explain: 'g-hist-tag-explain', optimize: 'g-hist-tag-optimize' };

      panel.innerHTML = history.map((h, i) => {
        const label   = ACTION_LABEL[h.action] || h.action;
        const cls     = ACTION_CLS[h.action]   || '';
        const preview = h.text.length > 28 ? h.text.slice(0, 28) + '…' : h.text;
        const time    = formatHistoryTime(h.ts);
        return `
          <button class="g-hist-item" data-index="${i}">
            <span class="g-hist-tag ${cls}">${escapeHtml(label)}</span>
            <span class="g-hist-text">${escapeHtml(preview)}</span>
            <span class="g-hist-time">${escapeHtml(time)}</span>
          </button>`;
      }).join('');

      // ── 點擊歷史項目 → 還原結果卡 ──────────────────
      panel.querySelectorAll('.g-hist-item').forEach(btn => {
        btn.addEventListener('click', e2 => {
          e2.stopPropagation();
          const idx  = parseInt(btn.dataset.index, 10);
          const item = history[idx];
          if (!item) return;

          panel.classList.remove('g-hist-open');

          // savedSel / userDragged 必須更新，讓後續 Obsidian 存入可以正確取得文字
          // （lastDictData 不在此設定，renderResult 內部會重新解析並賦值）
          applyHistoryState(item.text);

          // 更新 header tag
          const ACTION_META_LABEL = { translate: '翻譯', explain: '解釋', optimize: '優化' };
          const ACTION_META_SVG   = {
            translate: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>`,
            explain:   `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
            optimize:  `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`
          };
          const tagSvg  = ACTION_META_SVG[item.action]   || '';
          const tagText = ACTION_META_LABEL[item.action]  || item.action;
          el.querySelector('.g-rc-tag').innerHTML = `${tagSvg}${tagText}`;

          // fromHistory: true → 不重複寫入 storage
          renderResult(item.action, item.result, item.text, { fromHistory: true });
        });
      });
    }

    panel.classList.add('g-hist-open');
  });

  // ── 下拉箭頭：最近資料夾清單 ──────────────────────
  el.querySelector('.g-obs-chevron-btn').addEventListener('click', async e => {
    e.stopPropagation();
    const dropdown = el.querySelector('.g-obs-dropdown');
    const isOpen   = dropdown.classList.contains('g-obs-dd-open');
    if (isOpen) { dropdown.classList.remove('g-obs-dd-open'); return; }

    const folders = await loadRecentFolders();
    if (folders.length === 0) {
      ffbClear(dropdown).appendChild(ffbEl('div', { class: 'g-obs-dd-empty' }, '尚無使用記錄'));
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

  // ── 面板存入按鈕 ───────────────────────────────────
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

    const result = await saveToObsidian(folder);

    const gemBtn = el.querySelector('.g-save-obs');
    gemBtn.classList.add('g-saved');
    setTimeout(() => gemBtn.classList.remove('g-saved'), 1800);

    confirmBtn.textContent = '已傳送 ✓';
    confirmBtn.disabled    = true;

    // 關閉面板並顯示持久提示列
    setTimeout(() => {
      el.querySelector('.g-obs-panel').classList.remove('g-obs-open');
      statusEl.classList.remove('g-obs-status-show', 'g-obs-status-ok');
      confirmBtn.textContent = '新增到 Obsidian';
      confirmBtn.disabled    = false;
      showAutoSaveToast(el, result?.filePath || folder, result?.ok === false, result?.action);
    }, 800);
  });

  // 面板內 mousedown 不往上冒泡
  el.querySelector('.g-obs-panel').addEventListener('mousedown', e => e.stopPropagation());

  // ── 拖曳（按住 header 移動結果卡）────────────────
  el.querySelector('.g-rc-header').addEventListener('mousedown', e => {
    if (e.target.closest('.g-icon-btn, select, input, button')) return;
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

// ── 歷史還原時更新必要的全域狀態 ─────────────────────────
// savedSel.text 供後續 saveToObsidian 使用；userDragged 保持卡片位置不跳動
// （刻意的 global mutation，原因見上方註解）
function applyHistoryState(text) {
  savedSel    = { text, range: null };
  userDragged = true;
}

// ── Obsidian 面板開關（供寶石按鈕「第一次」與「更換」共用）──
function openObsPanel(el) {
  const panel  = el.querySelector('.g-obs-panel');
  const isOpen = panel.classList.contains('g-obs-open');
  if (isOpen) {
    panel.classList.remove('g-obs-open');
    el.querySelector('.g-obs-dropdown').classList.remove('g-obs-dd-open');
    el.querySelector('.g-obs-status').classList.remove('g-obs-status-show');
    return;
  }
  loadRecentFolders().then(folders => {
    const input = el.querySelector('.g-obs-input');
    if (folders.length > 0 && !input.value) input.value = folders[0];
    panel.classList.add('g-obs-open');
    input.focus();

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
}

// ── 歷史紀錄工具函式 ────────────────────────────────────

// ── [Lock] Promise chain 保證 storage 寫入不會 race condition ──
let _histSaveChain = Promise.resolve();

// 儲存一筆查詢紀錄（去重、最多 5 筆，串接保證順序）
function saveToHistory(action, text, result, dictData) {
  _histSaveChain = _histSaveChain.then(async () => {
    try {
      const { queryHistory = [] } = await chrome.storage.local.get('queryHistory');
      const entry    = { action, text, result, dictData: dictData || null, ts: Date.now() };
      // 同 action + text 只保留最新一筆
      const filtered = queryHistory.filter(h => !(h.action === action && h.text === text));
      const updated  = [entry, ...filtered].slice(0, 5);
      await chrome.storage.local.set({ queryHistory: updated });
    } catch { /* 靜默忽略，不影響主流程 */ }
  });
}

// 讀取最近 5 筆紀錄
async function loadHistory() {
  try {
    const { queryHistory = [] } = await chrome.storage.local.get('queryHistory');
    return queryHistory;
  } catch { return []; }
}

// 格式化顯示時間（HH:MM）
function formatHistoryTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// ── Autosave Toast 顯示 / 隱藏 ────────────────────────
function showAutoSaveToast(el, path, failed = false, action = '') {
  const bar  = el.querySelector('.g-autosave-bar');
  const text = el.querySelector('.g-autosave-text');
  const verb = action === 'write' ? '已建立並送出到 Obsidian' : '已送出到 Obsidian';
  text.textContent = failed ? `⚠ Obsidian 送出失敗：${path}` : `✓ ${verb}：${path}`;
  bar.classList.add('show');
  clearTimeout(bar._hideTimer);
  bar._hideTimer = setTimeout(() => bar.classList.remove('show'), 4500);
}

function hideAutoSaveToast(el) {
  const bar = el.querySelector('.g-autosave-bar');
  clearTimeout(bar._hideTimer);
  bar.classList.remove('show');
}

// ── 以下函式與原版相同 ────────────────────────────────

function hideResultCard() {
  resultCard?.classList.remove('g-show');
}

function positionResultCard(anchorRect = resultCardAnchorRect) {
  if (!savedSel || !resultCard) return;
  if (userDragged) return;
  try {
    const margin = 8;
    const cardW  = resultCard.offsetWidth || Math.min(500, window.innerWidth - margin * 2);
    const cardH  = resultCard.offsetHeight || 200;
    // 防呆：anchorRect 必須是帶有有限 bottom 的 rect；若被傳成 timestamp 數字等垃圾值就忽略，改用儲存的錨點
    const validAnchor = anchorRect && Number.isFinite(anchorRect.bottom) ? anchorRect : null;
    const toolbarRect = validAnchor || resultCardAnchorRect || toolbar?.getBoundingClientRect?.();

    let top;
    let left;
    if (toolbarRect && Number.isFinite(toolbarRect.bottom)) {
      // 固定在工具列正下方、左緣對齊工具列；不再因內容變高溢出就跳到選取文字旁邊
      top = toolbarRect.bottom + margin;
      left = toolbarRect.left;
    } else {
      const rect = getSavedSelectionRect();
      if (!rect) return;
      const th = toolbar?.offsetHeight || 40;
      top = rect.bottom + th + margin * 2;
      left = rect.left + rect.width / 2 - cardW / 2;
    }

    if (top + cardH > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - cardH - margin);
    if (top < margin) top = margin;

    left = Math.max(margin, Math.min(left, window.innerWidth - cardW - margin));

    resultCard.style.top  = `${top}px`;
    resultCard.style.left = `${left}px`;
  } catch { /* 靜默忽略 */ }
}

function getSavedSelectionRect() {
  const rangeRect = savedSel?.range?.getBoundingClientRect?.();
  if (rangeRect && Number.isFinite(rangeRect.bottom)) return rangeRect;
  if (savedSel?.rect && Number.isFinite(savedSel.rect.bottom)) return savedSel.rect;
  if (savedSel?.point && Number.isFinite(savedSel.point.clientX) && Number.isFinite(savedSel.point.clientY)) {
    return {
      left: savedSel.point.clientX,
      right: savedSel.point.clientX,
      top: savedSel.point.clientY,
      bottom: savedSel.point.clientY,
      width: 0,
      height: 0
    };
  }
  return null;
}

// fromHistory：true 表示從歷史紀錄還原，不重複寫入 storage
function renderResult(action, rawResult, selectedText, { fromHistory = false } = {}) {
  lastDictData  = null;
  lastRawResult = rawResult;
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body) return;

  if (action === 'translate' && selectedText.length <= 20) {
    try {
      const data = parseJSON(rawResult);
      lastDictData = data;
      body.innerHTML = buildDictHTML(data);
      showResultMeta(getResultLanguage(action, data.targetLang));
      body.querySelector('.g-speak-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        speakWord(data.word || selectedText, e.currentTarget, data.lang);
      });
      initVocabularySaveButton(body, data, selectedText);
      if (!fromHistory) saveToHistory(action, selectedText, rawResult, data);
      return;
    } catch { /* JSON 解析失敗 → fallback 純文字 */ }
  }

  if (action === 'optimize' && selectedText.length > 20) {
    body.innerHTML = buildOptimizeHTML(rawResult, selectedText);
    showResultMeta(getResultLanguage(action));
    // 綁定「優化後」區塊的複製按鈕
    body.querySelector('.g-opt-copy-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const text = e.currentTarget.dataset.text || '';
      navigator.clipboard.writeText(text).catch(() => {});
      e.currentTarget.classList.add('g-opt-copied');
      setTimeout(() => e.currentTarget.classList.remove('g-opt-copied'), 1500);
    });
    if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
    return;
  }

  if (action === 'explain') {
    body.innerHTML = buildExplainHTML(rawResult);
    showResultMeta(getResultLanguage(action));
    initTagHandlers(body);
    if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
    return;
  }

  body.innerHTML = `<div class="g-text-body">${formatMarkdown(rawResult)}</div>`;
  showResultMeta(getResultLanguage(action));
  if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
}

function initModelSwitcher(el) {
  const select = el.querySelector('.g-rc-model-select');
  if (!select) return;
  select.innerHTML = FanFanBaModels.MODELS.map(model =>
    `<option value="${escapeHtml(model.id)}">${escapeHtml(model.name)}</option>`
  ).join('');
  syncResultCardModelSelect(el);

  select.addEventListener('mousedown', e => e.stopPropagation());
  select.addEventListener('click', e => e.stopPropagation());
  select.addEventListener('change', async e => {
    const nextModel = FanFanBaModels.normalizeModel(e.currentTarget.value);
    if (nextModel === activeModel) return;
    activeModel = nextModel;
    responseCache.clear();
    syncResultCardModelSelect(el);
    await chrome.storage.sync.set({ model: nextModel });
    if (activeAction && savedSel) triggerAction(activeAction);
  });
}

function syncResultCardModelSelect(el = resultCard) {
  const select = el?.querySelector('.g-rc-model-select');
  if (!select) return;
  const normalized = FanFanBaModels.normalizeModel(activeModel);
  if ([...select.options].some(option => option.value === normalized)) {
    select.value = normalized;
  }
}

const CHEVRON_SVG = `<svg class="g-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

function buildDictHTML(d) {
  const translations = normalizeTranslations(d.translations);

  const synonymHtml = d.synonym?.word ? `
    <div class="g-dict-divider"></div>
    <div class="g-synonym-row">
      <span class="g-synonym-label">近義詞</span>
      <span class="g-synonym-word">${escapeHtml(d.synonym.word)}</span>
      <span class="g-synonym-diff">${escapeHtml(d.synonym.diff || '')}</span>
    </div>` : '';

  const examplesHtml = (d.examples || []).map(ex => {
    const badge = ex.type === 'context'
      ? '<span class="g-ex-badge g-ex-context">語境</span>'
      : '<span class="g-ex-badge g-ex-general">通用</span>';
    return `
      <div class="g-example">
        <div class="g-ex-src">${badge}<span class="g-ex-en">${escapeHtml(ex.src || ex.en || '')}</span></div>
        <div class="g-ex-zh">${escapeHtml(ex.zh || '')}</div>
      </div>`;
  }).join('');

  const usageHtml = d.usage
    ? `<div class="g-dict-divider"></div><div class="g-dict-usage">${escapeHtml(d.usage)}</div>` : '';

  // 順序：單字說明區塊 → 詞彙涵義與用法 → 近義詞 → 例句
  return `
    <div class="g-dict-word-row">
      <span class="g-dict-word">${escapeHtml(d.word || '')}</span>
      <button class="g-speak-btn" type="button" title="發音" aria-label="播放發音">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      </button>
      <button class="g-vocab-save-btn" type="button" title="收藏到單字本" aria-label="收藏到單字本">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
        </svg>
        <span>收藏</span>
      </button>
    </div>
    ${d.phonetic ? `<div class="g-dict-phonetic">${escapeHtml(d.phonetic)}</div>` : ''}
    ${d.pos || d.definition ? `
      <div class="g-dict-pos-def">
        ${d.pos ? `<span class="g-pos ${getPosClass(d.pos)}">${escapeHtml(d.pos)}</span>` : ''}
        ${escapeHtml(d.definition || '')}
      </div>` : ''}
    ${translations.length ? `
      <div class="g-dict-divider"></div>
      <div class="g-dict-translations">${translations.map(text => `<span>${escapeHtml(text)}</span>`).join('')}</div>` : ''}
    ${d.usage ? `<div class="g-dict-usage">${escapeHtml(d.usage)}</div>` : ''}
    ${synonymHtml}
    ${examplesHtml ? `<div class="g-dict-divider"></div><div class="g-dict-examples-title">例句</div>${examplesHtml}` : ''}
  `;
}

function normalizeTranslations(translations) {
  const values = Array.isArray(translations) ? translations : String(translations || '').split(/[;；]/);
  return values.map(item => String(item || '').trim()).filter(Boolean);
}

async function initVocabularySaveButton(body, data, selectedText) {
  const button = body.querySelector('.g-vocab-save-btn');
  if (!button || typeof isVocabularySaved !== 'function') return;

  const word = data.word || selectedText;
  const lang = data.lang || '';
  const saved = await isVocabularySaved(word, lang);
  setVocabularyButtonState(button, saved ? 'saved' : 'idle');

  button.addEventListener('click', async e => {
    e.stopPropagation();
    if (button.disabled || typeof saveVocabularyEntry !== 'function') return;
    setVocabularyButtonState(button, 'saving');

    try {
      const { item } = await saveVocabularyEntry(data, selectedText);
      setVocabularyButtonState(button, 'saved');
    } catch {
      setVocabularyButtonState(button, 'error');
    }
  });
}

function setVocabularyButtonState(button, state, exported = false) {
  button.classList.remove('g-vocab-saving', 'g-vocab-saved', 'g-vocab-error');
  button.disabled = false;

  if (state === 'saving') {
    button.classList.add('g-vocab-saving');
    button.disabled = true;
    button.querySelector('span').textContent = '收藏中';
    button.title = '正在收藏到單字本';
    return;
  }

  if (state === 'saved') {
    button.classList.add('g-vocab-saved');
    button.disabled = true;
    button.querySelector('span').textContent = exported ? '已收藏並匯出' : '已收藏';
    button.title = exported ? '已收藏到單字本並匯出 Obsidian' : '已收藏到單字本';
    return;
  }

  if (state === 'error') {
    button.classList.add('g-vocab-error');
    button.querySelector('span').textContent = '重試收藏';
    button.title = '收藏失敗，點擊重試';
    return;
  }

  button.querySelector('span').textContent = '收藏';
  button.title = '收藏到單字本';
}

// ── 解釋模式：直接顯示全部內容 ─────────────────────
function buildExplainHTML(raw) {
  return `<div class="g-text-body">${formatMarkdown(raw)}</div>`;
}

// ── 優化模式：原文 → 優化後（綠底）→ 改動說明 ────
function buildOptimizeHTML(raw, original) {
  const optimizedMatch = raw.match(/\*\*優化後版本[：:]\*\*\s*([\s\S]*?)(?=\n\s*\*\*改動說明|$)/);
  const reasonsMatch   = raw.match(/\*\*改動說明[：:]\*\*\s*([\s\S]*)/);

  if (!optimizedMatch) {
    return `<div class="g-text-body">${formatMarkdown(raw)}</div>`;
  }

  const optimizedText = optimizedMatch[1].trim();
  const reasonsText   = reasonsMatch?.[1]?.trim() || '';

  return `
    <div class="g-optimize-block">
      <div class="g-optimize-label">原文</div>
      <div class="g-optimize-original">${escapeHtml(original)}</div>
    </div>
    <div class="g-optimize-block">
      <div class="g-optimize-label-row">
        <span class="g-optimize-label">優化後</span>
        <button class="g-opt-copy-btn" type="button" title="複製優化後文字" aria-label="複製優化後文字" data-text="${escapeHtml(optimizedText)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
        </button>
      </div>
      <div class="g-optimize-result">${escapeHtml(optimizedText)}</div>
    </div>
    ${reasonsText ? `<div class="g-optimize-reasons">
      <div class="g-optimize-label">改動說明</div>
      <div class="g-text-body">${formatMarkdown(reasonsText)}</div>
    </div>` : ''}
  `;
}

// ── 折疊 toggle 事件綁定 ──────────────────────────
function initDeepToggles(el) {
  el.querySelectorAll('.g-deep-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.g-deep-section').classList.toggle('g-deep-open');
    });
  });
}

// ── Tag 點擊事件綁定（點擊後觸發 explain 查詢）────
function initTagHandlers(el) {
  el.querySelectorAll('.g-tag').forEach(tag => {
    tag.addEventListener('click', e => {
      e.stopPropagation();
      const term = tag.dataset.term;
      if (!term) return;
      savedSel    = { text: term, range: null };
      userDragged = true;
      triggerAction('explain');
    });
  });
}

// onRetry 選填：傳入 callback 則顯示「重試」按鈕
function setError(msg, onRetry) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body) return;
  const retryHtml = onRetry
    ? `<button class="g-retry-btn" type="button" aria-label="重試">↺ 重試</button>`
    : '';
  body.innerHTML = `<div class="g-error-wrap"><span class="g-error">${escapeHtml(msg)}</span>${retryHtml}</div>`;
  if (onRetry) {
    body.querySelector('.g-retry-btn')?.addEventListener('click', onRetry);
  }
}

function showResultNotice(msg) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body || !msg) return;
  body.insertAdjacentHTML('afterbegin', `<div class="g-provider-notice">${escapeHtml(msg)}</div>`);
}

function showResultMeta(language) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body) return;
  const modelName = FanFanBaModels.getModelDisplayName(activeModel);
  const langName = FanFanBaModels.getLanguageName(language || targetLanguage, navigator.language || '');
  body.insertAdjacentHTML('afterbegin', `<div class="g-result-meta">${escapeHtml(modelName)} · ${escapeHtml(langName)}</div>`);
}

function getResultLanguage(action, responseLanguage) {
  if (action === 'translate') return responseLanguage || targetLanguage;
  return explanationLanguage === 'target' ? targetLanguage : explanationLanguage;
}

function speakWord(word, btn, lang) {
  btn?.classList.add('g-speaking');
  const speakLang = resolveSpeechLanguage(lang);
  if (!chrome.runtime?.id) { speakFallback(word, btn, speakLang); return; }
  chrome.runtime.sendMessage({ type: 'TTS_REQUEST', text: word, lang: speakLang }, response => {
    if (chrome.runtime.lastError || !response || response.fallback || response.error) {
      speakFallback(word, btn, speakLang);
      return;
    }
    const audio = new Audio(`data:audio/mp3;base64,${response.audioContent}`);
    audio.onended = () => btn?.classList.remove('g-speaking');
    audio.onerror = () => { btn?.classList.remove('g-speaking'); speakFallback(word, btn, speakLang); };
    audio.play().catch(() => btn?.classList.remove('g-speaking'));
  });
}

function resolveSpeechLanguage(sourceLang) {
  const mode = FanFanBaModels.normalizeTtsLanguageMode(ttsLanguageMode, 'auto');
  if (mode === 'target') return targetLanguage === 'browser' ? (navigator.language || 'en') : targetLanguage;
  if (mode === 'source' || mode === 'auto') return sourceLang || 'en';
  return sourceLang || 'en';
}

function speakFallback(word, btn, lang = 'en') {
  if (!window.speechSynthesis) { btn?.classList.remove('g-speaking'); return; }
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(word);
  utt.lang   = lang;
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
