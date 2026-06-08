// options.js — 設定頁邏輯：儲存 / 載入 API Key、測試連線

'use strict';

const $ = id => document.getElementById(id);
const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const CloudSync = globalThis.FanFanBaCloudSync || require('./cloud-sync');
const SETTINGS_BACKUP_APP = 'fan-fan-ba';
const SETTINGS_BACKUP_SCHEMA_VERSION = 1;
const SYNC_SETTING_KEYS = [
  'model',
  'pageTranslationModel',
  'targetLanguage',
  'explanationLanguage',
  'ttsLanguageMode',
  'vocabularyHighlightMode',
  'obsidianVault',
  'obsidianDefaultFolder'
];

renderModelSelect();
renderPageTranslationModelSelect();
renderLanguageSelects();
initSettingsTabs();

loadSettings();

// ── 載入已儲存的設定 ─────────────────────────────────
async function loadSettings() {
  const [
    { model, pageTranslationModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, obsidianVault, obsidianDefaultFolder },
    { apiKey, groqApiKey, openrouterApiKey, ttsApiKey }
  ] = await Promise.all([
    chrome.storage.sync.get(['model', 'pageTranslationModel', 'targetLanguage', 'explanationLanguage', 'ttsLanguageMode', 'vocabularyHighlightMode', 'obsidianVault', 'obsidianDefaultFolder']),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', ttsApiKey: '' })
  ]);

  if (apiKey)                 $('apiKey').value                 = apiKey;
  if (groqApiKey)             $('groqApiKey').value             = groqApiKey;
  if (openrouterApiKey)       $('openrouterApiKey').value       = openrouterApiKey;
  // 無儲存紀錄時預設 Groq（免費額度最大方）
  const currentModel = ModelRegistry.normalizeModel(model);
  $('model').value = currentModel;
  if ($('pageTranslationModel')) $('pageTranslationModel').value = ModelRegistry.normalizeModel(pageTranslationModel || currentModel);
  if (model && currentModel !== model) chrome.storage.sync.set({ model: currentModel });
  if ($('targetLanguage')) {
    $('targetLanguage').value = ModelRegistry.normalizeLanguage(targetLanguage, 'zh-TW');
  }
  if ($('explanationLanguage')) {
    $('explanationLanguage').value = ModelRegistry.normalizeExplanationLanguage(explanationLanguage, 'target');
  }
  if ($('ttsLanguageMode')) {
    $('ttsLanguageMode').value = ModelRegistry.normalizeTtsLanguageMode(ttsLanguageMode, 'auto');
  }
  if ($('vocabularyHighlightMode')) {
    $('vocabularyHighlightMode').value = vocabularyHighlightMode === 'auto' ? 'auto' : 'off';
  }
  if (obsidianVault)          $('obsidianVault').value          = obsidianVault;
  if (ttsApiKey)              $('ttsApiKey').value              = ttsApiKey;
  if (obsidianDefaultFolder)  $('obsidianDefaultFolder').value  = obsidianDefaultFolder;
}

function renderModelSelect() {
  const select = $('model');
  if (!select || select.tagName !== 'SELECT') return;

  const providerLabels = {
    groq: 'Groq（需 Groq API Key）',
    gemini: 'Gemini（需 Gemini API Key）',
    openrouter: 'OpenRouter（需 OpenRouter API Key）'
  };

  select.innerHTML = ['groq', 'gemini', 'openrouter'].map(provider => {
    const options = ModelRegistry.MODELS
      .filter(model => model.provider === provider)
      .map(model => `<option value="${model.id}">${model.name}（${model.desc}）</option>`)
      .join('');
    return `<optgroup label="${providerLabels[provider]}">${options}</optgroup>`;
  }).join('');
}

function renderPageTranslationModelSelect() {
  const select = $('pageTranslationModel');
  if (!select || select.tagName !== 'SELECT') return;

  select.innerHTML = ModelRegistry.MODELS
    .map(model => `<option value="${model.id}">${model.name}（${model.desc}）</option>`)
    .join('');
}

function renderLanguageSelects() {
  const targetSelect = $('targetLanguage');
  const explanationSelect = $('explanationLanguage');
  const ttsSelect = $('ttsLanguageMode');
  if (targetSelect) {
    targetSelect.innerHTML = ModelRegistry.LANGUAGE_OPTIONS
      .map(lang => `<option value="${lang.id}">${lang.name}</option>`)
      .join('');
  }
  if (explanationSelect) {
    explanationSelect.innerHTML = ModelRegistry.EXPLANATION_LANGUAGE_OPTIONS
      .map(lang => `<option value="${lang.id}">${lang.name}</option>`)
      .join('');
  }
  if (ttsSelect) {
    ttsSelect.innerHTML = ModelRegistry.TTS_LANGUAGE_OPTIONS
      .map(mode => `<option value="${mode.id}">${mode.name}</option>`)
      .join('');
  }
}

function initSettingsTabs() {
  const tabs = document.querySelectorAll('.settings-tab[data-panel]');
  const panels = document.querySelectorAll('.settings-panel[data-panel-content]');
  if (!tabs.length || !panels.length) return;

  function activatePanel(panelName) {
    tabs.forEach(tab => {
      const isActive = tab.dataset.panel === panelName;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    panels.forEach(panel => {
      panel.hidden = panel.dataset.panelContent !== panelName;
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => activatePanel(tab.dataset.panel));
  });
}

// ── 顯示 / 隱藏 API Key 共用函式 ─────────────────────
function bindToggleVis(btnId, inputId, showId, hideId) {
  $(btnId).addEventListener('click', () => {
    const input    = $(inputId);
    const isHidden = input.type === 'password';
    input.type               = isHidden ? 'text' : 'password';
    $(showId).style.display  = isHidden ? 'none' : '';
    $(hideId).style.display  = isHidden ? ''     : 'none';
  });
}

bindToggleVis('toggleVis',    'apiKey',           'eye-show',      'eye-hide');
bindToggleVis('toggleGroqVis','groqApiKey',        'groq-eye-show', 'groq-eye-hide');
bindToggleVis('toggleOrVis',  'openrouterApiKey',  'or-eye-show',   'or-eye-hide');
bindToggleVis('toggleTtsVis', 'ttsApiKey',         'tts-eye-show',  'tts-eye-hide');
bindBackupControls();
bindCloudSyncControls();
renderCloudSyncStatus();

// ── 儲存設定 ─────────────────────────────────────────
$('btnSave').addEventListener('click', async () => {
  const apiKey           = $('apiKey').value.trim();
  const groqApiKey       = $('groqApiKey').value.trim();
  const openrouterApiKey = $('openrouterApiKey').value.trim();
  const model            = $('model').value;
  const pageTranslationModel = ModelRegistry.normalizeModel($('pageTranslationModel')?.value || model);
  const targetLanguage   = ModelRegistry.normalizeLanguage($('targetLanguage')?.value, 'zh-TW');
  const explanationLanguage = ModelRegistry.normalizeExplanationLanguage($('explanationLanguage')?.value, 'target');
  const ttsLanguageMode  = ModelRegistry.normalizeTtsLanguageMode($('ttsLanguageMode')?.value, 'auto');
  const vocabularyHighlightMode = $('vocabularyHighlightMode')?.value === 'auto' ? 'auto' : 'off';
  const isGroq           = model.startsWith('groq:');
  const isOpenRouter     = model.startsWith('openrouter:');

  // 依選擇的模型驗證對應 API Key
  if (isGroq) {
    if (!groqApiKey) { showStatus('err', '使用 Groq 模型請輸入 Groq API Key'); return; }
    if (!groqApiKey.startsWith('gsk_')) { showStatus('err', 'Groq API Key 格式不正確，應以 gsk_ 開頭'); return; }
  } else if (isOpenRouter) {
    if (!openrouterApiKey) { showStatus('err', '使用 OpenRouter 模型請輸入 OpenRouter API Key'); return; }
    if (!openrouterApiKey.startsWith('sk-or-')) { showStatus('err', 'OpenRouter API Key 格式不正確，應以 sk-or- 開頭'); return; }
  } else {
    if (!apiKey) { showStatus('err', '請輸入 Gemini API Key'); return; }
    if (!apiKey.startsWith('AIza')) { showStatus('err', 'Gemini API Key 格式不正確，應以 AIza 開頭'); return; }
  }

  const obsidianVault         = $('obsidianVault').value.trim();
  const ttsApiKey             = $('ttsApiKey').value.trim();
  const obsidianDefaultFolder = $('obsidianDefaultFolder').value.trim();

  await Promise.all([
    chrome.storage.sync.set({ model, pageTranslationModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, obsidianVault, obsidianDefaultFolder }),
    Storage.setSecrets({ apiKey, groqApiKey, openrouterApiKey, ttsApiKey })
  ]);
  showStatus('ok', '✓ 設定已儲存');
});

// ── 測試連線 ─────────────────────────────────────────
$('btnTest').addEventListener('click', async () => {
  const model        = $('model').value || 'gemini-3.5-flash';
  const isGroq       = model.startsWith('groq:');
  const isOpenRouter = model.startsWith('openrouter:');

  let apiKey, displayName, fetchUrl, fetchBody, fetchHeaders;

  if (isGroq) {
    apiKey      = $('groqApiKey').value.trim();
    displayName = 'Llama 4 Scout (Groq)';
    fetchUrl    = 'https://api.groq.com/openai/v1/chat/completions';
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    fetchBody    = JSON.stringify({ model: model.replace('groq:', ''), messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
  } else if (isOpenRouter) {
    apiKey      = $('openrouterApiKey').value.trim();
    displayName = ModelRegistry.toApiModelId(model);
    fetchUrl    = 'https://openrouter.ai/api/v1/chat/completions';
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Title': 'Fan Fan Ba' };
    fetchBody    = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else {
    apiKey      = $('apiKey').value.trim();
    displayName = model;
    fetchUrl    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    fetchHeaders = { 'Content-Type': 'application/json' };
    fetchBody    = JSON.stringify({ contents: [{ parts: [{ text: '回覆 OK 即可' }] }], generationConfig: { maxOutputTokens: 10 } });
  }

  if (!apiKey) {
    showStatus('err', `請先輸入 ${isGroq ? 'Groq' : isOpenRouter ? 'OpenRouter' : 'Gemini'} API Key`);
    return;
  }

  showStatus('info', '測試中...');
  $('btnTest').disabled = true;

  try {
    let res = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
    let fallbackUsed = false;
    if (isOpenRouter && !res.ok) {
      const err = await res.clone().json().catch(() => ({}));
      const modelId = ModelRegistry.toApiModelId(model);
      if (ModelRegistry.shouldFallbackOpenRouter(res.status, err.error?.message, modelId)) {
        fallbackUsed = true;
        displayName = ModelRegistry.OPENROUTER_FALLBACK_MODEL_ID;
        fetchBody = buildOpenAICompatTestBody(ModelRegistry.OPENROUTER_FALLBACK_MODEL_ID);
        res = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
      }
    }
    if (res.ok) {
      showStatus('ok', `✓ 連線成功！模型：${displayName}${fallbackUsed ? '（備援）' : ''}`);
    } else {
      const err = await res.json().catch(() => ({}));
      showStatus('err', `連線失敗：${err.error?.message || `HTTP ${res.status}`}`);
    }
  } catch (e) {
    showStatus('err', `網路錯誤：${e.message}`);
  } finally {
    $('btnTest').disabled = false;
  }
});

// ── 工具函式 ─────────────────────────────────────────
function showStatus(type, msg) {
  const el = $('status');
  el.className   = type;
  el.textContent = msg;
  if (type === 'ok') setTimeout(() => { el.className = ''; el.textContent = ''; }, 3000);
}

function buildOpenAICompatTestBody(modelId) {
  return JSON.stringify({ model: modelId, messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
}

function bindBackupControls() {
  const exportButton = $('btnExportSettings');
  const includeSecretsCheckbox = $('includeSecretsExport');
  const importButton = $('btnImportSettings');
  const fileInput = $('settingsImportFile');

  if (exportButton) {
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try {
        const includeSecrets = !!includeSecretsCheckbox?.checked;
        if (includeSecrets && !confirmSecretsExport()) return;
        const payload = await buildSettingsBackupPayload(includeSecrets);
        downloadSettingsBackup(payload);
        showStatus('ok', includeSecrets ? '✓ 設定與 API Keys 已匯出' : '✓ 設定檔已匯出');
      } catch (e) {
        showStatus('err', `匯出失敗：${e.message}`);
      } finally {
        exportButton.disabled = false;
      }
    });
  }

  if (importButton && fileInput) {
    importButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      importButton.disabled = true;
      try {
        const result = await importSettingsBackupFile(file);
        showStatus('ok', formatImportSettingsStatus(result));
      } catch (e) {
        showStatus('err', `匯入失敗：${e.message}`);
      } finally {
        importButton.disabled = false;
        fileInput.value = '';
      }
    });
  }
}

function bindCloudSyncControls() {
  const signInButton = $('btnCloudSignIn');
  const uploadButton = $('btnCloudUpload');
  const downloadButton = $('btnCloudDownload');
  const signOutButton = $('btnCloudSignOut');
  if (!signInButton && !uploadButton && !downloadButton && !signOutButton) return;

  signInButton?.addEventListener('click', () => runCloudSyncAction(signInButton, async () => {
    await CloudSync.getAuthToken(true);
    await renderCloudSyncStatus('已登入 Google，可上傳或下載一般設定。');
    showStatus('ok', '✓ Google 登入成功');
  }));

  uploadButton?.addEventListener('click', () => runCloudSyncAction(uploadButton, async () => {
    const token = await CloudSync.getAuthToken(true);
    const existingFile = await CloudSync.findCloudSettingsFile(token);
    if (existingFile && !confirmCloudUploadOverwrite(existingFile)) {
      await renderCloudSyncStatus('已取消上傳，雲端設定未變更。');
      showStatus('info', '已取消雲端設定上傳');
      return;
    }
    const payload = await buildCloudSettingsPayload();
    const file = await CloudSync.uploadCloudSettings(token, payload);
    await renderCloudSyncStatus(`已上傳一般設定：${payload.updatedAt}`);
    showStatus('ok', `✓ 雲端設定已上傳${file?.id ? `（${file.id}）` : ''}`);
  }));

  downloadButton?.addEventListener('click', () => runCloudSyncAction(downloadButton, async () => {
    const token = await CloudSync.getAuthToken(true);
    const existingFile = await CloudSync.findCloudSettingsFile(token);
    if (!existingFile) throw new Error('找不到雲端設定檔');
    if (!confirmCloudDownloadOverwrite(existingFile)) {
      await renderCloudSyncStatus('已取消下載，本機設定未變更。');
      showStatus('info', '已取消雲端設定下載');
      return;
    }
    const payload = await CloudSync.downloadCloudSettings(token);
    const settings = normalizeImportedSettings(payload.settings || {});
    if (!Object.keys(settings).length) throw new Error('雲端設定檔沒有可還原的設定');
    await chrome.storage.sync.set(settings);
    await loadSettings();
    await renderCloudSyncStatus(`已下載雲端設定：${payload.updatedAt || '未知時間'}`);
    showStatus('ok', `✓ 已還原 ${Object.keys(settings).length} 個一般設定`);
  }));

  signOutButton?.addEventListener('click', () => runCloudSyncAction(signOutButton, async () => {
    const token = await CloudSync.getAuthToken(false).catch(() => '');
    await CloudSync.signOut(token);
    await renderCloudSyncStatus('已登出 Google。');
    showStatus('ok', '✓ 已登出 Google');
  }));
}

async function runCloudSyncAction(button, action) {
  const buttons = ['btnCloudSignIn', 'btnCloudUpload', 'btnCloudDownload', 'btnCloudSignOut']
    .map(id => $(id))
    .filter(Boolean);
  buttons.forEach(btn => { btn.disabled = true; });
  try {
    await action();
  } catch (e) {
    const info = CloudSync.classifyCloudSyncError?.(e) || { message: e.message, hint: '' };
    await CloudSync.recordCloudSyncError?.(e, button?.id || '');
    await renderCloudSyncStatus(`${info.message}${info.hint ? `｜${info.hint}` : ''}`);
    showStatus('err', `雲端同步失敗：${info.message}`);
  } finally {
    buttons.forEach(btn => { btn.disabled = false; });
    if (button) button.focus?.();
  }
}

async function buildCloudSettingsPayload() {
  const backup = await buildSettingsBackupPayload(false);
  return CloudSync.buildCloudSettingsPayload(backup.settings, {
    appVersion: chrome.runtime?.getManifest?.().version || ''
  });
}

async function renderCloudSyncStatus(message = '') {
  const el = $('cloudSyncStatus');
  if (!el) return;
  const config = CloudSync.getOAuthConfig();
  if (!CloudSync.isOAuthConfigured(config)) {
    el.textContent = '尚未設定 Google OAuth Client ID。請先在 manifest.json 換成正式 client ID；v1.7.0 不同步 API Key。';
    return;
  }

  const meta = await CloudSync.getCloudSyncMeta();
  const support = CloudSync.getOAuthSupport?.() || {};
  const authMode = support.nativeAuth && support.webAuthFlow
    ? 'Chrome native auth / cross-browser Web Auth fallback'
    : support.webAuthFlow
      ? 'cross-browser Web Auth'
      : 'Chrome native auth';
  const parts = ['Google OAuth 已設定', 'v1.7.x 僅同步一般設定，不含 API Key', `登入流程：${authMode}`];
  parts.push(`Native Client：${support.nativeAuthConfigured ? '已設定' : '未設定'}`);
  if (support.webAuthFlow) {
    parts.push(`Web Auth Client：${support.webAuthConfigured ? '已設定' : '未設定'}`);
  }
  const redirectUrl = CloudSync.getOAuthRedirectUrl?.();
  if (support.webAuthFlow && redirectUrl) parts.push(`Redirect URL：${redirectUrl}`);
  if (support.webAuthFlow && !support.webAuthConfigured) {
    parts.push('Edge / Chromium 需設定 Web Auth fallback OAuth Client ID');
  }
  if (meta.lastUploadAt) parts.push(`最後上傳：${meta.lastUploadAt}`);
  if (meta.lastDownloadAt) parts.push(`最後下載：${meta.lastDownloadAt}`);
  if (meta.lastErrorAt) parts.push(`最後錯誤：${meta.lastErrorCategory || 'unknown'} ${meta.lastErrorAt}`);
  if (message) parts.push(message);
  el.textContent = parts.join('｜');
}

async function buildSettingsBackupPayload(includeSecrets = false) {
  const syncSettings = await chrome.storage.sync.get(SYNC_SETTING_KEYS);
  const payload = {
    app: SETTINGS_BACKUP_APP,
    schemaVersion: SETTINGS_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: pickBackupSettings(syncSettings)
  };

  if (includeSecrets) {
    payload.secrets = pickBackupSecrets(await Storage.getSecrets({}));
  }

  return payload;
}

function pickBackupSettings(values = {}) {
  return SYNC_SETTING_KEYS.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      acc[key] = values[key] == null ? '' : values[key];
    }
    return acc;
  }, {});
}

function pickBackupSecrets(values = {}) {
  return Storage.SECRET_KEYS.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key]) {
      acc[key] = values[key];
    }
    return acc;
  }, {});
}

function downloadSettingsBackup(payload) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildSettingsBackupFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildSettingsBackupFilename(date = new Date()) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `fan-fan-ba-settings-${stamp}.json`;
}

async function importSettingsBackupFile(file) {
  const payload = parseSettingsBackup(await readTextFile(file));
  const settings = normalizeImportedSettings(payload.settings || {});
  const secrets = pickBackupSecrets(payload.secrets || {});

  if (!Object.keys(settings).length && !Object.keys(secrets).length) {
    throw new Error('設定檔沒有可匯入的設定');
  }

  const writes = [];
  if (Object.keys(settings).length) writes.push(chrome.storage.sync.set(settings));
  if (Object.keys(secrets).length) writes.push(Storage.setSecrets(secrets));
  await Promise.all(writes);
  await loadSettings();
  return { settingsCount: Object.keys(settings).length, secretsCount: Object.keys(secrets).length };
}

function parseSettingsBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('JSON 格式不正確');
  }

  if (!payload || payload.app !== SETTINGS_BACKUP_APP) {
    throw new Error('不是翻翻吧設定檔');
  }
  if (payload.schemaVersion !== SETTINGS_BACKUP_SCHEMA_VERSION) {
    throw new Error('設定檔版本不支援');
  }
  return payload;
}

function normalizeImportedSettings(values = {}) {
  const settings = {};
  SYNC_SETTING_KEYS.forEach(key => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return;
    settings[key] = normalizeImportedSetting(key, values[key]);
  });
  return settings;
}

function normalizeImportedSetting(key, value) {
  if (key === 'model' || key === 'pageTranslationModel') {
    return ModelRegistry.normalizeModel(String(value || ''));
  }
  if (key === 'targetLanguage') {
    return ModelRegistry.normalizeLanguage(value, 'zh-TW');
  }
  if (key === 'explanationLanguage') {
    return ModelRegistry.normalizeExplanationLanguage(value, 'target');
  }
  if (key === 'ttsLanguageMode') {
    return ModelRegistry.normalizeTtsLanguageMode(value, 'auto');
  }
  if (key === 'vocabularyHighlightMode') {
    return value === 'auto' ? 'auto' : 'off';
  }
  return String(value || '').trim();
}

async function readTextFile(file) {
  if (file && typeof file.text === 'function') return file.text();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('無法讀取設定檔'));
    reader.readAsText(file);
  });
}

function formatImportSettingsStatus({ settingsCount = 0, secretsCount = 0 } = {}) {
  const parts = [];
  if (settingsCount) parts.push(`${settingsCount} 個設定`);
  if (secretsCount) parts.push(`${secretsCount} 個 API Key`);
  return `✓ 設定檔已匯入${parts.length ? `：${parts.join('、')}` : ''}`;
}

function confirmSecretsExport() {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm('匯出的 JSON 會明文包含 API Keys。請只保存在可信任的位置，且不要分享給他人。確定要匯出嗎？');
}

function confirmCloudUploadOverwrite(file = {}) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const modifiedTime = file.modifiedTime ? `\n雲端檔案最後修改：${file.modifiedTime}` : '';
  return window.confirm(`雲端已經有翻翻吧設定檔。上傳目前設定會覆寫雲端版本，另一台裝置之後下載會拿到這份新設定。${modifiedTime}\n\n確定要上傳並覆寫嗎？`);
}

function confirmCloudDownloadOverwrite(file = {}) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  const modifiedTime = file.modifiedTime ? `\n雲端檔案最後修改：${file.modifiedTime}` : '';
  return window.confirm(`下載雲端設定會覆寫這台裝置目前的一般設定，但不會變更任何 API Key。${modifiedTime}\n\n確定要下載並套用嗎？`);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showStatus,
    bindToggleVis,
    renderModelSelect,
    renderPageTranslationModelSelect,
    renderLanguageSelects,
    initSettingsTabs,
    loadSettings,
    buildSettingsBackupPayload,
    pickBackupSettings,
    pickBackupSecrets,
    buildSettingsBackupFilename,
    parseSettingsBackup,
    normalizeImportedSettings,
    importSettingsBackupFile,
    formatImportSettingsStatus,
    confirmSecretsExport,
    confirmCloudUploadOverwrite,
    confirmCloudDownloadOverwrite,
    bindCloudSyncControls,
    buildCloudSettingsPayload,
    renderCloudSyncStatus
  };
}
