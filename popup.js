// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const DEFAULT_MODEL = 'groq:meta-llama/llama-4-scout-17b-16e-instruct';
const OPENROUTER_DEFAULT_MODEL = 'openrouter:deepseek/deepseek-v4-flash:free';
const MODEL_MIGRATIONS = {
  'gemini-3-flash-preview':                              'gemini-3.5-flash',
  'gemini-3.1-flash-lite-preview':                       'gemini-3.5-flash',
  'openrouter/free':                                     OPENROUTER_DEFAULT_MODEL,
  'openrouter:deepseek/deepseek-chat-v3-0324':           OPENROUTER_DEFAULT_MODEL,
  'openrouter:qwen/qwen3-30b-a3b':                       OPENROUTER_DEFAULT_MODEL,
  'openrouter:mistralai/mistral-small-3.1-24b-instruct': OPENROUTER_DEFAULT_MODEL
};

function normalizeModel(model) {
  return MODEL_MIGRATIONS[model] || model || DEFAULT_MODEL;
}

const MODELS = [
  // Groq 優先（免費額度最大方，預設模型）
  {
    id:        'groq:meta-llama/llama-4-scout-17b-16e-instruct',
    name:      'Llama 4 Scout',
    desc:      'Meta 最新 · Groq 極速・免費',
    badge:     'Groq',
    badgeClass: 'badge-groq'
  },
  // Gemini
  {
    id:        'gemini-3.5-flash',
    name:      'Gemini 3.5 Flash',
    desc:      '最新穩定版 · 免費額度',
    badge:     '快速',
    badgeClass: 'badge-fast'
  },
  {
    id:        'openrouter:deepseek/deepseek-v4-flash:free',
    name:      'DeepSeek V4 Flash',
    desc:      'OpenRouter 免費 · 中文/推理強',
    badge:     'OR',
    badgeClass: 'badge-or'
  }
];

// ── 初始化 ────────────────────────────────────────────
chrome.storage.sync.get(['model', 'apiKey', 'groqApiKey', 'openrouterApiKey']).then(sync => {
  const current = normalizeModel(sync.model);
  if (sync.model && current !== sync.model) chrome.storage.sync.set({ model: current });
  renderModels(current);
  renderApiStatus(current, sync);
});

// ── 渲染模型列表 ──────────────────────────────────────
function renderModels(currentId) {
  const list = document.getElementById('modelList');
  list.innerHTML = '';

  MODELS.forEach(m => {
    const item = document.createElement('div');
    item.className = 'model-item' + (m.id === currentId ? ' active' : '');

    item.innerHTML = `
      <div class="model-dot"></div>
      <div class="model-info">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="model-name">${m.name}</span>
          <span class="model-badge ${m.badgeClass}">${m.badge}</span>
        </div>
        <div class="model-desc">${m.desc}</div>
      </div>
    `;

    item.addEventListener('click', () => selectModel(m.id, item));
    list.appendChild(item);
  });
}

// ── 切換模型 ──────────────────────────────────────────
function selectModel(id, clickedItem) {
  chrome.storage.sync.set({ model: id }, () => {
    document.querySelectorAll('.model-item').forEach(el => el.classList.remove('active'));
    clickedItem.classList.add('active');

    const msg = document.getElementById('save-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 1500);

    chrome.storage.sync.get(['apiKey', 'groqApiKey', 'openrouterApiKey'], s => {
      renderApiStatus(id, s);
    });
  });
}

// ── API Key 狀態指示燈 ────────────────────────────────
function renderApiStatus(model, sync) {
  const dot   = document.getElementById('apiDot');
  const label = document.getElementById('apiLabel');
  let hasKey;
  if (model.startsWith('groq:'))        hasKey = !!sync.groqApiKey;
  else if (model.startsWith('openrouter:')) hasKey = !!sync.openrouterApiKey;
  else                                   hasKey = !!sync.apiKey;
  dot.className = 'api-dot ' + (hasKey ? 'ok' : 'err');
  label.textContent = hasKey ? 'API Key 已設定' : '尚未設定 API Key';
}

// ── 開啟完整設定頁 ────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

if (typeof module !== 'undefined' && module.exports) { module.exports = { renderModels, selectModel, renderApiStatus, MODELS }; }
