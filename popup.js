// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const MODELS = ModelRegistry.MODELS;

// ── 初始化 ────────────────────────────────────────────
chrome.storage.sync.get([
  'model',
  'apiKey',
  'groqApiKey',
  'openrouterApiKey',
  'ttsApiKey',
  'obsidianVault',
  'obsidianDefaultFolder'
]).then(sync => {
  const current = ModelRegistry.normalizeModel(sync.model);
  if (sync.model && current !== sync.model) chrome.storage.sync.set({ model: current });
  renderModels(current);
  renderApiStatus(current, sync);
  renderPopupOverview(current, sync);
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

    chrome.storage.sync.get(['apiKey', 'groqApiKey', 'openrouterApiKey', 'ttsApiKey', 'obsidianVault', 'obsidianDefaultFolder'], s => {
      renderApiStatus(id, s);
      renderPopupOverview(id, s);
    });
  });
}

function getApiKeyStatus(model, sync) {
  const provider = ModelRegistry.getProvider(model);
  let hasKey;
  if (provider === 'groq')             hasKey = !!sync.groqApiKey;
  else if (provider === 'openrouter')  hasKey = !!sync.openrouterApiKey;
  else                                 hasKey = !!sync.apiKey;
  return { provider, hasKey };
}

// ── API Key 狀態指示燈 ────────────────────────────────
function renderApiStatus(model, sync) {
  const dot   = document.getElementById('apiDot');
  const label = document.getElementById('apiLabel');
  const { hasKey } = getApiKeyStatus(model, sync);
  dot.className = 'api-dot ' + (hasKey ? 'ok' : 'err');
  label.textContent = hasKey ? 'API Key 已設定' : '尚未設定 API Key';
}

function setStatusElement(dotId, textId, state, text) {
  const dot = document.getElementById(dotId);
  const label = document.getElementById(textId);
  if (dot) dot.className = `health-dot ${state}`;
  if (label) {
    label.className = `health-value ${state}`;
    label.textContent = text;
  }
}

function renderPopupOverview(model, sync = {}) {
  const selected = ModelRegistry.getModel(model);
  const { provider, hasKey } = getApiKeyStatus(model, sync);
  const providerLabel = { groq: 'Groq', gemini: 'Gemini', openrouter: 'OpenRouter' }[provider] || 'Model';
  const hasTts = !!sync.ttsApiKey;
  const hasObsidian = !!(sync.obsidianVault || sync.obsidianDefaultFolder);

  const name = document.getElementById('currentModelName');
  const meta = document.getElementById('currentModelMeta');
  const providerEl = document.getElementById('currentProvider');
  if (name) name.textContent = selected.name;
  if (meta) meta.textContent = selected.desc;
  if (providerEl) providerEl.textContent = providerLabel;

  const state = document.getElementById('popupState');
  const stateText = document.getElementById('popupStateText');
  if (state && stateText) {
    state.className = `state-pill ${hasKey ? '' : 'err'}`.trim();
    stateText.textContent = hasKey ? '可正常使用' : `缺少 ${providerLabel} Key`;
  }

  setStatusElement('healthApiDot', 'healthApiText', hasKey ? 'ok' : 'err', hasKey ? 'OK' : '未設定');
  setStatusElement('healthTtsDot', 'healthTtsText', hasTts ? 'ok' : 'warn', hasTts ? 'Cloud' : '內建');
  setStatusElement('healthObsidianDot', 'healthObsidianText', hasObsidian ? 'ok' : 'warn', hasObsidian ? '已設定' : '未設定');
}

// ── 開啟完整設定頁 ────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

if (typeof module !== 'undefined' && module.exports) { module.exports = { renderModels, selectModel, renderApiStatus, renderPopupOverview, getApiKeyStatus, MODELS }; }
