// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const MODELS = ModelRegistry.MODELS;

// ── 初始化 ────────────────────────────────────────────
initPopup();

async function initPopup() {
  const [sync, secrets] = await Promise.all([
    chrome.storage.sync.get(['model', 'obsidianVault', 'obsidianDefaultFolder']),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', ttsApiKey: '' })
  ]);
  const settings = { ...sync, ...secrets };
  const current = ModelRegistry.normalizeModel(sync.model);
  if (sync.model && current !== sync.model) chrome.storage.sync.set({ model: current });
  renderModels(current);
  renderApiStatus(current, settings);
  renderPopupOverview(current, settings);
}

// ── 渲染模型列表 ──────────────────────────────────────
function renderModels(currentId) {
  const list = document.getElementById('modelList');
  list.innerHTML = '';

  MODELS.forEach(m => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-item' + (m.id === currentId ? ' active' : '');
    // radiogroup 語意：鍵盤／螢幕閱讀器使用者也要能切換模型（review 2026-08-26）
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', m.id === currentId ? 'true' : 'false');

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

  // 清單超過可視高度時會自己捲，這裡把目前選用的模型帶進視野，
  // 否則選到第 6 個之後開 popup 會看不到自己選的是哪個。
  // 不用 scrollIntoView：它會沿祖先鏈一路捲，把 header 推出視野（實測過）。
  const active = list.querySelector('.model-item.active');
  if (active && list.scrollHeight > list.clientHeight) {
    const listBox   = list.getBoundingClientRect();
    const activeBox = active.getBoundingClientRect();
    list.scrollTop += activeBox.top - listBox.top - (list.clientHeight - activeBox.height) / 2;
  }
}

// ── 切換模型 ──────────────────────────────────────────
function selectModel(id, clickedItem) {
  chrome.storage.sync.set({ model: id }, async () => {
    document.querySelectorAll('.model-item').forEach(el => {
      el.classList.remove('active');
      el.setAttribute('aria-checked', 'false');
    });
    clickedItem.classList.add('active');
    clickedItem.setAttribute('aria-checked', 'true');

    const msg = document.getElementById('save-msg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 1500);

    const [sync, secrets] = await Promise.all([
      chrome.storage.sync.get(['obsidianVault', 'obsidianDefaultFolder']),
      Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', ttsApiKey: '' })
    ]);
    const settings = { ...sync, ...secrets };
    renderApiStatus(id, settings);
    renderPopupOverview(id, settings);
  });
}

function getApiKeyStatus(model, sync) {
  const provider = ModelRegistry.getProvider(model);
  // key 欄位名單一來源：ModelRegistry.PROVIDERS（WS-E M3''）
  const hasKey = !!sync[ModelRegistry.PROVIDERS[provider].apiKeyName];
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
  const providerLabel = ModelRegistry.PROVIDERS[provider]?.label || 'Model';
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

if (typeof module !== 'undefined' && module.exports) { module.exports = { initPopup, renderModels, selectModel, renderApiStatus, renderPopupOverview, getApiKeyStatus, MODELS }; }
