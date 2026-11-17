// popup.js — 工具列圖示點擊後的快選彈窗

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const MODELS = ModelRegistry.MODELS;

let popupPageTranslation = {};
let pageActionPending = false;
let pageStatusTimer = null;
let pageStatusRevision = 0;

async function initPopup() {
  void refreshPopupPageTranslation();
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
    void refreshPopupPageTranslation();
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
  text.textContent = hasKey ? '' : `選字等功能缺少 ${ModelRegistry.PROVIDERS[provider]?.label || ''} API Key`;
}

// ── 目前分頁的全文翻譯 ────────────────────────────────
const activeTabId = async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

async function readPopupPageTranslation() {
  const tabId = await activeTabId();
  if (!Number.isInteger(tabId)) return {};
  const status = await chrome.tabs.sendMessage(tabId, { type: 'FFB_POPUP_PAGE', action: 'status' }, { frameId: 0 })
    .catch(() => null);
  if (!status || status.paused || status.active) return { tabId, status };
  const route = await chrome.runtime.sendMessage({ type: 'POPUP_PAGE_TRANSLATION_ROUTE' });
  return { tabId, status, route };
}

function renderPopupPageTranslation(target, notice = '') {
  popupPageTranslation = target;
  const { status, route } = target;
  const action = document.getElementById('pageTranslationAction');
  const routeText = document.getElementById('pageTranslationRoute');
  const statusText = document.getElementById('pageTranslationStatus');
  const model = status?.active ? status.model : route?.model;
  const provider = model && ModelRegistry.PROVIDERS[ModelRegistry.getProvider(model)];
  action.textContent = status?.active ? '還原原文' : '翻譯這一頁';
  action.disabled = !status || status.paused || (!status.active && (!route?.model || !!route.error));
  routeText.textContent = provider?.keyless ? '裝置端 · 瀏覽器內建翻譯' : (provider ? `雲端 · ${provider.label}` : '');
  let detail = route?.error || '';
  if (!status) detail = '目前無法在這個分頁翻譯。一般網頁可重新整理後再試。';
  else if (status.paused) detail = '翻翻吧已在這個網站停用。';
  else if (status.active) detail = status.message;
  else if (!route?.model && !detail) detail = '無法讀取翻譯設定，請重開彈窗。';
  const nextStatus = [notice, detail].filter(Boolean).join(' ');
  if (statusText.textContent !== nextStatus) statusText.textContent = nextStatus;
}

function schedulePopupPageStatus() {
  clearTimeout(pageStatusTimer);
  if (popupPageTranslation.status?.active) {
    pageStatusTimer = setTimeout(refreshPopupPageTranslation, 750);
  }
}

async function refreshPopupPageTranslation() {
  if (pageActionPending || !document.getElementById('pageTranslationAction')) return;
  clearTimeout(pageStatusTimer);
  const revision = ++pageStatusRevision;
  const target = await readPopupPageTranslation().catch(() => ({}));
  if (revision !== pageStatusRevision) return;
  renderPopupPageTranslation(target);
  schedulePopupPageStatus();
}

async function runPopupPageTranslation() {
  const button = document.getElementById('pageTranslationAction');
  if (pageActionPending || button.disabled) return;
  pageActionPending = true;
  pageStatusRevision += 1;
  clearTimeout(pageStatusTimer);
  button.setAttribute('aria-busy', 'true');

  const shown = popupPageTranslation;
  try {
    const current = await readPopupPageTranslation();
    const { status, route, tabId } = current;
    if (!status || status.paused || (await activeTabId()) !== tabId
      || tabId !== shown.tabId || status.documentKey !== shown.status.documentKey
      || status.active !== shown.status.active || route?.model !== shown.route?.model || route?.error) {
      renderPopupPageTranslation(current, '分頁或翻譯設定已變更，請再確認。');
      return;
    }
    const updated = await chrome.tabs.sendMessage(tabId, {
      type: 'FFB_POPUP_PAGE',
      action: status.active ? 'restore' : 'start',
      documentKey: status.documentKey,
      model: route?.model
    }, { frameId: 0 });
    if (!updated) {
      renderPopupPageTranslation(await readPopupPageTranslation(), '頁面已變更，請再確認。');
    } else if (updated.active || updated.paused) {
      renderPopupPageTranslation({ tabId, status: updated });
    } else {
      const notice = status.active ? '已還原原文。' : '未能啟動翻譯，請重試。';
      renderPopupPageTranslation(await readPopupPageTranslation(), notice);
    }
  } catch {
    renderPopupPageTranslation(await readPopupPageTranslation().catch(() => ({})), '無法操作目前分頁，請重試。');
  } finally {
    button.removeAttribute('aria-busy');
    pageActionPending = false;
    schedulePopupPageStatus();
  }
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

async function openPdfFromPopup(current, button) {
  button.disabled = true;
  const status = document.getElementById('pdfPopupStatus');
  status.hidden = true;
  try {
    if (current) {
      const tabId = await activeTabId();
      const response = await chrome.runtime.sendMessage({ type: 'OPEN_CURRENT_PDF', tabId });
      if (!response?.ok) throw new Error('無法開啟目前 PDF');
    } else {
      await chrome.tabs.create({ url: chrome.runtime.getURL('reader/pdf.html') });
    }
  } catch {
    status.textContent = '無法開啟 PDF 閱讀器，請重試。';
    status.hidden = false;
  } finally {
    button.disabled = false;
  }
}

document.getElementById('openCurrentPdf')?.addEventListener('click', event => openPdfFromPopup(true, event.currentTarget));
document.getElementById('openLocalPdf')?.addEventListener('click', event => openPdfFromPopup(false, event.currentTarget));
document.getElementById('pageTranslationAction')?.addEventListener('click', runPopupPageTranslation);
initPopup();

if (typeof module !== 'undefined' && module.exports) { module.exports = { initPopup, renderModels, selectModel, renderKeyAlert, getApiKeyStatus, renderShortcuts, loadShortcuts, refreshPopupPageTranslation, runPopupPageTranslation, SHORTCUTS_PAGE_URL, MODELS }; }
