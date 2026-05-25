// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const MODELS = ModelRegistry.MODELS;

// ── 初始化 ────────────────────────────────────────────
chrome.storage.sync.get(['model', 'apiKey', 'groqApiKey', 'openrouterApiKey']).then(sync => {
  const current = ModelRegistry.normalizeModel(sync.model);
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
  const provider = ModelRegistry.getProvider(model);
  if (provider === 'groq')             hasKey = !!sync.groqApiKey;
  else if (provider === 'openrouter')  hasKey = !!sync.openrouterApiKey;
  else                                 hasKey = !!sync.apiKey;
  dot.className = 'api-dot ' + (hasKey ? 'ok' : 'err');
  label.textContent = hasKey ? 'API Key 已設定' : '尚未設定 API Key';
}

// ── 開啟完整設定頁 ────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

if (typeof module !== 'undefined' && module.exports) { module.exports = { renderModels, selectModel, renderApiStatus, MODELS }; }
