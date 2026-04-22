'use strict';

function createResultCard() {
  const el = document.createElement('div');
  el.id = 'gemini-result-card';
  el.innerHTML = `
    <div class="g-rc-header">
      <span class="g-rc-tag"></span>
      <div class="g-rc-actions">
        <button class="g-icon-btn g-pin" title="釘住結果卡">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/>
            <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
        </button>
        <button class="g-icon-btn g-save-obs" title="存到 Obsidian">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 3h12l4 6-10 13L2 9Z"/>
            <path d="M11 3 8 9l4 13 4-13-3-6"/>
            <path d="M2 9h20"/>
          </svg>
        </button>
        <button class="g-icon-btn g-history" title="最近查詢紀錄">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
            <path d="M12 7v5l4 2"/>
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

    <!-- 自動存入 Obsidian 成功提示列 -->
    <div class="g-autosave-bar">
      <span class="g-autosave-text"></span>
      <button class="g-autosave-change">更換資料夾</button>
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
        <button class="g-obs-confirm-btn">新增到 Obsidian</button>
        <button class="g-obs-chevron-btn" title="最近使用的資料夾">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6"/>
          </svg>
        </button>
      </div>
    </div>
  `;

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
      await saveToObsidian(autoFolder);
      const gemBtn = el.querySelector('.g-save-obs');
      gemBtn.classList.add('g-saved');
      setTimeout(() => gemBtn.classList.remove('g-saved'), 1800);
      showAutoSaveToast(el, autoFolder);
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
      panel.innerHTML = '<div class="g-hist-empty">尚無查詢紀錄</div>';
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

    await saveToObsidian(folder);

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
      showAutoSaveToast(el, folder);
    }, 800);
  });

  // 面板內 mousedown 不往上冒泡
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
function showAutoSaveToast(el, folder) {
  const bar  = el.querySelector('.g-autosave-bar');
  const text = el.querySelector('.g-autosave-text');
  text.textContent = `✓ 已存入：${folder}`;
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

function positionResultCard() {
  if (!savedSel || !resultCard) return;
  if (userDragged) return;
  try {
    const rect   = savedSel.range.getBoundingClientRect();
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
      body.querySelector('.g-speak-btn')?.addEventListener('click', e => {
        e.stopPropagation();
        speakWord(data.word || selectedText, e.currentTarget, data.lang);
      });
      if (!fromHistory) saveToHistory(action, selectedText, rawResult, data);
      return;
    } catch { /* JSON 解析失敗 → fallback 純文字 */ }
  }

  if (action === 'optimize' && selectedText.length > 20) {
    body.innerHTML = buildOptimizeHTML(rawResult, selectedText);
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
    initTagHandlers(body);
    if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
    return;
  }

  body.innerHTML = `<div class="g-text-body">${formatMarkdown(rawResult)}</div>`;
  if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
}

const CHEVRON_SVG = `<svg class="g-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

function buildDictHTML(d) {
  const translations = Array.isArray(d.translations)
    ? d.translations.join('; ')
    : (d.translations || '');

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
      <button class="g-speak-btn" title="發音">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
        </svg>
      </button>
    </div>
    ${d.phonetic ? `<div class="g-dict-phonetic">${escapeHtml(d.phonetic)}</div>` : ''}
    ${d.pos || d.definition ? `
      <div class="g-dict-pos-def">
        ${d.pos ? `<span class="g-pos ${getPosClass(d.pos)}">${escapeHtml(d.pos)}</span>` : ''}
        ${escapeHtml(d.definition || '')}
      </div>` : ''}
    <div class="g-dict-divider"></div>
    <div class="g-dict-translations">${escapeHtml(translations)}</div>
    ${d.usage ? `<div class="g-dict-usage">${escapeHtml(d.usage)}</div>` : ''}
    ${synonymHtml}
    ${examplesHtml ? `<div class="g-dict-divider"></div><div class="g-dict-examples-title">例句</div>${examplesHtml}` : ''}
  `;
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
        <button class="g-opt-copy-btn" title="複製優化後文字" data-text="${escapeHtml(optimizedText)}">
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

function setError(msg) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (body) body.innerHTML = `<span class="g-error">${escapeHtml(msg)}</span>`;
}

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
