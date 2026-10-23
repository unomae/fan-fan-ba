// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const MODELS = ModelRegistry.MODELS;

// ── 初始化 ────────────────────────────────────────────
initPopup();

async function initPopup() {
  const [sync, secrets] = await Promise.all([
    chrome.storage.sync.get(['model']),
    Storage.getSecrets(getKeyDefaults())
  ]);
  const current = ModelRegistry.normalizeModel(sync.model);
  if (sync.model && current !== sync.model) chrome.storage.sync.set({ model: current });
  renderModels(current);
  renderKeyAlert(current, secrets);
  renderShortcuts(await loadShortcuts());
}

function getKeyDefaults() {
  return Object.fromEntries(Object.values(ModelRegistry.PROVIDERS)
    .map(info => info.apiKeyName).filter(Boolean).map(name => [name, '']));
}

// ── 渲染模型列表 ──────────────────────────────────────
function renderModels(currentId) {
  const list = document.getElementById('modelList');
  list.innerHTML = '';

  // 只能全文翻譯的模型（瀏覽器內建）不給選成主模型，否則選字翻譯等功能全部失敗；同設定頁主選單
  MODELS.filter(m => !m.pageTranslationOnly).forEach(m => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'model-item' + (m.id === currentId ? ' active' : '');
    // radiogroup 語意：鍵盤／螢幕閱讀器使用者也要能切換模型（review 2026-08-26）
    item.setAttribute('role', 'radio');
    item.setAttribute('aria-checked', m.id === currentId ? 'true' : 'false');

    item.innerHTML = `
      <span class="model-dot"></span>
      <span class="model-info">
        <span class="model-title">
          <span class="model-name">${m.name}</span>
          <span class="model-badge">${m.badge}</span>
        </span>
        <span class="model-desc">${m.desc}</span>
      </span>
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
// 選中狀態本身就是回饋，不另外跳「已切換」
function selectModel(id, clickedItem) {
  chrome.storage.sync.set({ model: id }, async () => {
    document.querySelectorAll('.model-item').forEach(el => {
      el.classList.remove('active');
      el.setAttribute('aria-checked', 'false');
    });
    clickedItem.classList.add('active');
    clickedItem.setAttribute('aria-checked', 'true');
    renderKeyAlert(id, await Storage.getSecrets(getKeyDefaults()));
  });
}

function getApiKeyStatus(model, secrets) {
  const provider = ModelRegistry.getProvider(model);
  // key 欄位名單一來源：ModelRegistry.PROVIDERS（WS-E M3''）
  // keyless provider（瀏覽器內建）沒有 key 可言，一律視為就緒，否則會顯示假的「缺 key」
  const info = ModelRegistry.PROVIDERS[provider] || ModelRegistry.PROVIDERS.gemini;
  const hasKey = info.keyless ? true : !!secrets[info.apiKeyName];
  return { provider, hasKey };
}

// ── 缺金鑰提醒：只有選的模型用不了時才出現 ──────────────
function renderKeyAlert(model, secrets = {}) {
  const alert = document.getElementById('keyAlert');
  const text = document.getElementById('keyAlertText');
  if (!alert || !text) return;
  const { provider, hasKey } = getApiKeyStatus(model, secrets);
  alert.hidden = hasKey;
  text.textContent = hasKey ? '' : `缺少 ${ModelRegistry.PROVIDERS[provider]?.label || ''} API Key`;
}

// ── 快捷鍵 ────────────────────────────────────────────
// 顯示瀏覽器實際綁定的鍵：預設鍵可能跟其他擴充衝突而沒綁上，使用者也可能自己改過
const SHORTCUT_COMMANDS = ['translate-selection', 'toggle-page-translation'];
const SHORTCUTS_PAGE_URL = 'chrome://extensions/shortcuts';

async function loadShortcuts() {
  try {
    return await chrome.commands.getAll();
  } catch {
    return [];
  }
}

function renderShortcuts(commands = []) {
  const list = document.getElementById('shortcutList');
  if (!list) return;
  list.textContent = '';
  const byName = new Map(commands.map(command => [command.name, command]));
  SHORTCUT_COMMANDS.forEach(name => {
    const command = byName.get(name);
    if (!command) return;
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    const label = document.createElement('span');
    label.textContent = command.description || name;
    const key = document.createElement('span');
    key.className = 'shortcut-key' + (command.shortcut ? '' : ' unset');
    key.textContent = command.shortcut || '未設定';
    row.append(label, key);
    list.appendChild(row);
  });
}

// chrome:// 頁面不能用一般連結開，要走 tabs.create
document.getElementById('openShortcuts')?.addEventListener('click', () => {
  chrome.tabs.create({ url: SHORTCUTS_PAGE_URL });
});

// ── 開啟設定頁 ────────────────────────────────────────
document.getElementById('openOptions').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// 直接開到「模型與金鑰」分類（設定頁認網址 #分類）
document.getElementById('keyAlertAction')?.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('options.html#model') });
});

if (typeof module !== 'undefined' && module.exports) { module.exports = { initPopup, renderModels, selectModel, renderKeyAlert, getApiKeyStatus, renderShortcuts, loadShortcuts, SHORTCUTS_PAGE_URL, MODELS }; }
