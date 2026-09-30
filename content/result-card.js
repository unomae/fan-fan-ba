'use strict';

// 結果卡用的線條圖示（無填色、currentColor 描邊）
function resultCardIcon(size, shapes, { strokeWidth = 2, className = null } = {}) {
  return ffbSvgIcon({
    class: className, width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: 'currentColor', 'stroke-width': strokeWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  }, shapes);
}

const RESULT_CARD_ICON_OBSIDIAN = [['path', { d: 'M6 3h12l4 6-10 13L2 9Z' }], ['path', { d: 'M11 3 8 9l4 13 4-13-3-6' }], ['path', { d: 'M2 9h20' }]];
const RESULT_CARD_ICON_COPY = [['rect', { width: 14, height: 14, x: 8, y: 8, rx: 2 }], ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]];

// 內建查詢動作的標籤圖示（結果卡標題列；歷史還原與 main.js 新查詢共用）
const RESULT_CARD_ACTION_TAGS = {
  translate: {
    label: '翻譯',
    shapes: [['path', { d: 'm5 8 6 6' }], ['path', { d: 'm4 14 6-6 2-3' }], ['path', { d: 'M2 5h12' }], ['path', { d: 'M7 2h1' }], ['path', { d: 'm22 22-5-10-5 10' }], ['path', { d: 'M14 18h6' }]]
  },
  explain: {
    label: '解釋',
    shapes: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]]
  },
  optimize: {
    label: '優化',
    shapes: [['path', { d: 'm12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z' }]]
  },
  analyze: {
    label: '長難句分析',
    // 與工具列、設定頁同一個「清單」圖示，由 custom-action-render.js 畫
    iconName: 'list'
  }
};

// 標題列標籤：已知動作＝圖示＋中文名；其他（如自訂字串）只顯示原字
function setResultCardTag(tagEl, action) {
  const meta = RESULT_CARD_ACTION_TAGS[action];
  if (!meta) { ffbClear(tagEl).append(String(action)); return; }
  const icon = meta.shapes ? resultCardIcon(13, meta.shapes)
    : (typeof buildCustomActionIcon === 'function' ? buildCustomActionIcon(meta.iconName, 13) : null);
  ffbClear(tagEl).append(...[icon, meta.label].filter(Boolean));
}

function createResultCard() {
  const iconButton = (className, title, ariaLabel, shapes) => ffbEl('button',
    { class: `g-icon-btn ${className}`, type: 'button', title, 'aria-label': ariaLabel },
    resultCardIcon(13, shapes));

  const el = ffbEl('div', { id: 'gemini-result-card' }, [
    ffbEl('div', { class: 'g-rc-header' }, [
      ffbEl('span', { class: 'g-rc-tag' }),
      ffbEl('div', { class: 'g-rc-actions' }, [
        iconButton('g-pin', '釘住結果卡', '釘住結果卡', [
          ['line', { x1: 12, y1: 17, x2: 12, y2: 22 }],
          ['path', { d: 'M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z' }]
        ]),
        iconButton('g-save-obs', '存到 Obsidian', '存到 Obsidian', RESULT_CARD_ICON_OBSIDIAN),
        iconButton('g-history', '最近查詢紀錄', '最近查詢紀錄', [
          ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }], ['path', { d: 'M12 7v5l4 2' }]
        ]),
        iconButton('g-copy', '複製', '複製結果', RESULT_CARD_ICON_COPY),
        iconButton('g-close-rc', '關閉', '關閉結果卡', [['path', { d: 'M18 6 6 18M6 6l12 12' }]])
      ])
    ]),

    // 自動存入 Obsidian 成功提示列
    ffbEl('div', { class: 'g-autosave-bar' }, [
      ffbEl('span', { class: 'g-autosave-text' }),
      ffbEl('button', { class: 'g-autosave-change', type: 'button' }, '更換資料夾')
    ]),

    // 最近查詢紀錄下拉面板
    ffbEl('div', { class: 'g-history-panel' }),

    ffbEl('div', { class: 'g-rc-body' }),

    ffbEl('div', { class: 'g-obs-panel' }, [
      ffbEl('div', { class: 'g-obs-panel-title' }, [resultCardIcon(13, RESULT_CARD_ICON_OBSIDIAN), ' 存到 Obsidian']),
      ffbEl('div', { class: 'g-obs-input-row' },
        ffbEl('input', { class: 'g-obs-input', type: 'text', placeholder: '資料夾路徑，如：翻翻吧  或  Reading/AI' })),
      ffbEl('div', { class: 'g-obs-dropdown' }),
      ffbEl('div', { class: 'g-obs-status' }),
      ffbEl('div', { class: 'g-obs-split-wrap' }, [
        ffbEl('button', { class: 'g-obs-confirm-btn', type: 'button' }, '新增到 Obsidian'),
        ffbEl('button', { class: 'g-obs-chevron-btn', type: 'button', title: '最近使用的資料夾', 'aria-label': '最近使用的資料夾' },
          resultCardIcon(12, [['path', { d: 'm6 9 6 6 6-6' }]], { strokeWidth: 2.5 }))
      ])
    ]),

    // 修改原文後重查（僅影響這張卡，不改網頁內容）
    ffbEl('div', { class: 'g-rc-source' }, [
      ffbEl('textarea', { class: 'g-rc-source-input', rows: 3, 'aria-label': '修改要查詢的原文' }),
      ffbEl('div', { class: 'g-rc-source-actions' }, [
        ffbEl('span', { class: 'g-rc-source-hint' }, '⌘／Ctrl + Enter 送出'),
        ffbEl('button', { class: 'g-rc-source-cancel', type: 'button' }, '取消'),
        ffbEl('button', { class: 'g-rc-source-submit', type: 'button' }, '重新查詢')
      ])
    ]),

    ffbEl('div', { class: 'g-rc-footer' }, [
      ffbEl('button', { class: 'g-rc-edit-source', type: 'button', 'aria-expanded': 'false' }, '修改原文'),
      ffbEl('div', { class: 'g-rc-model-wrap' }, [
        ffbEl('select', { class: 'g-rc-model-select', title: '這張卡使用的模型', 'aria-label': '這張卡使用的模型（僅本次）' }),
        ffbEl('span', { class: 'g-rc-model-once' }, '僅本次')
      ])
    ])
  ]);

  initModelSwitcher(el);
  initSourceEditor(el);

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

      ffbClear(panel).append(...history.map((h, i) => {
        const label   = ACTION_LABEL[h.action] || h.action;
        const cls     = ACTION_CLS[h.action]   || '';
        const preview = h.text.length > 28 ? h.text.slice(0, 28) + '…' : h.text;
        return ffbEl('button', { class: 'g-hist-item', dataset: { index: i } }, [
          ffbEl('span', { class: `g-hist-tag ${cls}` }, label),
          ffbEl('span', { class: 'g-hist-text' }, preview),
          ffbEl('span', { class: 'g-hist-time' }, formatHistoryTime(h.ts))
        ]);
      }));

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
          setResultCardTag(el.querySelector('.g-rc-tag'), item.action);

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
      ffbClear(dropdown).append(...folders.map(f =>
        ffbEl('button', { class: 'g-obs-dd-item', dataset: { folder: f } }, f)));
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
  closeSourceEditor();
  cardModelOverride = null;
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
  lastCustomOutput = null;
  lastRawResult = rawResult;
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body) return;

  // 自訂動作與長難句分析：解析 JSON 後依版面渲染；不寫入最近紀錄（紀錄不存動作定義，無法還原版面），
  // 所以從紀錄還原的一律照舊走純文字
  const structuredAction = fromHistory ? null : getStructuredAction(action);
  if (structuredAction) {
    const parsed = FanFanBaCustomActions.parseCustomActionOutput(rawResult, structuredAction.fields);
    if (parsed.ok) {
      lastCustomOutput = { action: structuredAction, data: parsed.data };
      ffbClear(body).appendChild(buildCustomActionContent(structuredAction, parsed.data, { selectedText }));
    } else {
      ffbClear(body).appendChild(buildCustomFormatError(rawResult));
    }
    return;
  }

  if (action === 'translate' && selectedText.length <= 20) {
    try {
      const data = parseJSON(rawResult);
      lastDictData = data;
      ffbClear(body).appendChild(buildDictContent(data));
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
    ffbClear(body).appendChild(buildOptimizeContent(rawResult, selectedText));
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
    ffbClear(body).appendChild(buildExplainContent(rawResult));
    initTagHandlers(body);
    if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
    return;
  }

  ffbClear(body).appendChild(ffbEl('div', { class: 'g-text-body' }, formatMarkdown(rawResult)));
  if (!fromHistory) saveToHistory(action, selectedText, rawResult, null);
}

// 底部模型選單：只列有金鑰或免金鑰的模型（由 background 判斷，content 不讀金鑰），
// 改選只影響這張卡接下來的查詢，不寫回全域主模型。
let cardAvailableModelIds = null;

function initModelSwitcher(el) {
  const select = el.querySelector('.g-rc-model-select');
  if (!select) return;
  syncResultCardModelSelect(el);
  refreshCardModelOptions(el);

  select.addEventListener('mousedown', e => e.stopPropagation());
  select.addEventListener('click', e => e.stopPropagation());
  select.addEventListener('focus', () => refreshCardModelOptions(el));
  select.addEventListener('change', e => {
    const nextModel = e.currentTarget.value;
    cardModelOverride = nextModel === getCardDefaultModel() ? null : nextModel;
    syncResultCardModelSelect(el);
    if (activeAction && savedSel) triggerAction(activeAction);
  });
}

async function refreshCardModelOptions(el = resultCard) {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'MODEL_AVAILABILITY' });
    if (Array.isArray(response?.models)) cardAvailableModelIds = response.models;
  } catch { /* 擴充失效或背景未就緒：維持現有選項 */ }
  syncResultCardModelSelect(el);
}

// 沒有「僅本次」時這張卡會用的模型：這個功能設定的模型，沒設定就是主模型
function getCardDefaultModel() {
  const featureModel = typeof getFeatureModel === 'function' ? getFeatureModel(activeAction, savedSel?.text || '') : '';
  return FanFanBaModels.normalizeModel(featureModel || activeModel);
}

function getCardModelOptions() {
  const current = cardModelOverride || getCardDefaultModel();
  const ids = new Set(cardAvailableModelIds || []);
  ids.add(current); // 目前實際使用的模型一定要列出來，即使它缺金鑰（選單要反映真實狀態）
  return FanFanBaModels.MODELS.filter(model => ids.has(model.id) && !model.pageTranslationOnly);
}

function syncResultCardModelSelect(el = resultCard) {
  const select = el?.querySelector('.g-rc-model-select');
  if (!select) return;
  const current = cardModelOverride || getCardDefaultModel(); // 含各功能設定的模型，不只是主模型
  const options = getCardModelOptions();
  const signature = options.map(model => model.id).join('|');
  if (select.dataset.options !== signature) {
    select.textContent = '';
    options.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      select.appendChild(option);
    });
    select.dataset.options = signature;
  }
  if ([...select.options].some(option => option.value === current)) select.value = current;
  el.querySelector('.g-rc-model-once')?.classList.toggle('g-rc-model-once-active', !!cardModelOverride);
}

// ── 修改原文後重查 ─────────────────────────────────────
function initSourceEditor(el) {
  const panel = el.querySelector('.g-rc-source');
  const input = el.querySelector('.g-rc-source-input');
  const toggle = el.querySelector('.g-rc-edit-source');
  if (!panel || !input || !toggle) return;

  const submit = () => {
    const text = input.value.trim();
    if (!text || !savedSel) return;
    closeSourceEditor(el);
    if (text === savedSel.text) return;
    // 保留原本的 range：上下文與卡片定位仍以原選取位置為準
    savedSel = { ...savedSel, text, pendingGoogleDocsSelection: false };
    triggerAction(activeAction || 'translate');
  };

  toggle.addEventListener('click', e => {
    e.stopPropagation();
    if (panel.classList.contains('g-rc-source-open')) {
      closeSourceEditor(el);
      return;
    }
    input.value = savedSel?.text || '';
    panel.classList.add('g-rc-source-open');
    toggle.setAttribute('aria-expanded', 'true');
    input.focus();
  });
  el.querySelector('.g-rc-source-submit').addEventListener('click', e => { e.stopPropagation(); submit(); });
  el.querySelector('.g-rc-source-cancel').addEventListener('click', e => { e.stopPropagation(); closeSourceEditor(el); toggle.focus(); });
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // 不讓網頁自己的快捷鍵吃到打字
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); closeSourceEditor(el); toggle.focus(); }
  });
}

// 底部列只屬於「選字查詢」：浮球的收藏／最近查詢／單字本面板借用同一張卡時要收起
function setResultCardQueryMode(on, el = resultCard) {
  el?.classList.toggle('g-rc-query-mode', !!on);
  if (!on) closeSourceEditor(el);
}

function closeSourceEditor(el = resultCard) {
  el?.querySelector('.g-rc-source')?.classList.remove('g-rc-source-open');
  el?.querySelector('.g-rc-edit-source')?.setAttribute('aria-expanded', 'false');
}

const CHEVRON_SVG = `<svg class="g-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`;

// 字典卡內容（DocumentFragment）；AI 回傳欄位一律當純文字
function buildDictContent(d) {
  const translations = normalizeTranslations(d.translations);
  const cefr = normalizeCefr(d.cefr);
  const divider = () => ffbEl('div', { class: 'g-dict-divider' });

  const examples = (d.examples || []).map(ex => ffbEl('div', { class: 'g-example' }, [
    ffbEl('div', { class: 'g-ex-src' }, [
      ex.type === 'context'
        ? ffbEl('span', { class: 'g-ex-badge g-ex-context' }, '語境')
        : ffbEl('span', { class: 'g-ex-badge g-ex-general' }, '通用'),
      ffbEl('span', { class: 'g-ex-en' }, highlightExample(ex.src || ex.en || '', ex.surface))
    ]),
    ffbEl('div', { class: 'g-ex-zh' }, ex.zh || '')
  ]));

  // 順序：單字說明區塊 → 詞彙涵義與用法 → 近義詞 → 例句
  return ffbFragment([
    ffbEl('div', { class: 'g-dict-word-row' }, [
      ffbEl('span', { class: 'g-dict-word' }, d.word || ''),
      ffbEl('button', { class: 'g-speak-btn', type: 'button', title: '發音', 'aria-label': '播放發音' },
        resultCardIcon(15, [
          ['polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }],
          ['path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' }],
          ['path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }]
        ])),
      ffbEl('button', { class: 'g-vocab-save-btn', type: 'button', title: '收藏到單字本', 'aria-label': '收藏到單字本' }, [
        resultCardIcon(14, [['path', { d: 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z' }]], { strokeWidth: 2.2 }),
        ffbEl('span', null, '收藏')
      ]),
      cefr && ffbEl('span', { class: 'g-dict-cefr', title: `CEFR 難度 ${cefr}`, 'aria-label': `CEFR 難度 ${cefr}` }, cefr)
    ]),
    d.phonetic && ffbEl('div', { class: 'g-dict-phonetic' }, d.phonetic),
    (d.pos || d.definition) && ffbEl('div', { class: 'g-dict-pos-def' }, [
      d.pos && ffbEl('span', { class: `g-pos ${getPosClass(d.pos)}` }, d.pos),
      d.pos ? ` ${d.definition || ''}` : (d.definition || '')
    ]),
    translations.length > 0 && [
      divider(),
      ffbEl('div', { class: 'g-dict-translations' }, translations.map(text => ffbEl('span', null, text)))
    ],
    d.usage && ffbEl('div', { class: 'g-dict-usage' }, d.usage),
    d.synonym?.word && [
      divider(),
      ffbEl('div', { class: 'g-synonym-row' }, [
        ffbEl('span', { class: 'g-synonym-label' }, '近義詞'),
        ffbEl('span', { class: 'g-synonym-word' }, d.synonym.word),
        ffbEl('span', { class: 'g-synonym-diff' }, d.synonym.diff || '')
      ])
    ],
    examples.length > 0 && [divider(), ffbEl('div', { class: 'g-dict-examples-title' }, '例句'), examples]
  ]);
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
  let interacted = false; // 使用者已點擊過就不讓稍後回來的初始查詢覆寫按鈕狀態

  // 先綁 click 再查已收藏狀態：查詢失敗時按鈕仍可用，
  // 不再因 unhandled rejection 變成沒有任何反應的死按鈕（WS-E A1'''）
  button.addEventListener('click', async e => {
    e.stopPropagation();
    if (button.disabled || typeof saveVocabularyEntry !== 'function') return;
    interacted = true;
    setVocabularyButtonState(button, 'saving');

    try {
      const { item } = await saveVocabularyEntry(data, selectedText);
      setVocabularyButtonState(button, 'saved');
      // 匯出是收藏之後的加值步驟，成功才把按鈕升級成「已收藏並匯出」
      if (await exportSavedVocabularyEntryToObsidian(item)) {
        setVocabularyButtonState(button, 'saved', true);
      }
    } catch {
      setVocabularyButtonState(button, 'error');
    }
  });

  try {
    const saved = await isVocabularySaved(word, lang);
    // 查詢在飛行中若已被點擊觸發收藏，不得蓋掉 saving/saved 狀態（否則放行第二次收藏）
    if (!interacted) setVocabularyButtonState(button, saved ? 'saved' : 'idle');
  } catch {
    if (!interacted) setVocabularyButtonState(button, 'idle'); // 查詢失敗當未收藏，點擊收藏時再浮出真正錯誤
  }
}

// 收藏成功後才嘗試 Obsidian 匯出：沒設定資料夾就靜默跳過（vocabulary.js 回 missing-folder），
// 已匯出過的單字不重複 append，否則同一個字每次重新收藏都會再塞一次週記。
async function exportSavedVocabularyEntryToObsidian(item) {
  if (!item?.id || typeof exportVocabularyEntryToObsidianIfConfigured !== 'function') return false;
  if (item.obsidianExportedAt) return true;

  try {
    const result = await exportVocabularyEntryToObsidianIfConfigured(item);
    return Boolean(result?.exported);
  } catch {
    return false; // 匯出失敗不得把「已收藏」回捲成錯誤：單字本那筆已經寫進去了
  }
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
function buildExplainContent(raw) {
  return ffbEl('div', { class: 'g-text-body' }, formatMarkdown(raw));
}

// ── 優化模式：原文 → 優化後（綠底）→ 改動說明 ────
function buildOptimizeContent(raw, original) {
  const optimizedMatch = raw.match(/\*\*優化後版本[：:]\*\*\s*([\s\S]*?)(?=\n\s*\*\*改動說明|$)/);
  const reasonsMatch   = raw.match(/\*\*改動說明[：:]\*\*\s*([\s\S]*)/);

  if (!optimizedMatch) {
    return ffbEl('div', { class: 'g-text-body' }, formatMarkdown(raw));
  }

  const optimizedText = optimizedMatch[1].trim();
  const reasonsText   = reasonsMatch?.[1]?.trim() || '';

  return ffbFragment([
    ffbEl('div', { class: 'g-optimize-block' }, [
      ffbEl('div', { class: 'g-optimize-label' }, '原文'),
      ffbEl('div', { class: 'g-optimize-original' }, original)
    ]),
    ffbEl('div', { class: 'g-optimize-block' }, [
      ffbEl('div', { class: 'g-optimize-label-row' }, [
        ffbEl('span', { class: 'g-optimize-label' }, '優化後'),
        ffbEl('button', {
          class: 'g-opt-copy-btn', type: 'button', title: '複製優化後文字', 'aria-label': '複製優化後文字',
          dataset: { text: optimizedText }
        }, resultCardIcon(12, RESULT_CARD_ICON_COPY))
      ]),
      ffbEl('div', { class: 'g-optimize-result' }, optimizedText)
    ]),
    reasonsText && ffbEl('div', { class: 'g-optimize-reasons' }, [
      ffbEl('div', { class: 'g-optimize-label' }, '改動說明'),
      ffbEl('div', { class: 'g-text-body' }, formatMarkdown(reasonsText))
    ])
  ]);
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
  ffbClear(body).appendChild(ffbEl('div', { class: 'g-error-wrap' }, [
    ffbEl('span', { class: 'g-error' }, msg),
    onRetry && ffbEl('button', { class: 'g-retry-btn', type: 'button', 'aria-label': '重試' }, '↺ 重試')
  ]));
  if (onRetry) {
    body.querySelector('.g-retry-btn')?.addEventListener('click', onRetry);
  }
}

function showResultNotice(msg) {
  const body = resultCard?.querySelector('.g-rc-body');
  if (!body || !msg) return;
  body.prepend(ffbEl('div', { class: 'g-provider-notice' }, msg));
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

