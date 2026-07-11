// options.js — 設定頁邏輯：儲存 / 載入 API Key、測試連線

'use strict';

const $ = id => document.getElementById(id);
const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const CloudSync = globalThis.FanFanBaCloudSync || require('./cloud-sync');
const VocabBackup = globalThis.FanFanBaVocabularyBackup || require('./vocabulary-backup');
const VOCAB_STORAGE_KEY = 'fanFanBaVocabularyItems';
const SETTINGS_BACKUP_APP = 'fan-fan-ba';
const SETTINGS_BACKUP_SCHEMA_VERSION = 1;
const SECRET_BACKUP_CRYPTO_VERSION = 1;
const SECRET_BACKUP_KDF_ITERATIONS = 210000;
const SYNC_SETTING_KEYS = [
  'model',
  'pageTranslationModel',
  'targetLanguage',
  'explanationLanguage',
  'ttsLanguageMode',
  'vocabularyHighlightMode',
  'singleHoverButton',
  'obsidianVault',
  'obsidianDefaultFolder'
];
const DIAGNOSTICS_SETTING_KEYS = [
  'model',
  'pageTranslationModel',
  'targetLanguage',
  'vocabularyHighlightMode',
  'singleHoverButton'
];
// provider 顯示名／key 欄位名／前綴統一取自 ModelRegistry.PROVIDERS（WS-E M3''）

renderModelSelect();
renderPageTranslationModelSelect();
renderLanguageSelects();
initSettingsTabs();

loadSettings();
initDiagnosticsPanel();
initVocabularyBackup();

// ── 單字本備份 / 還原（Phase B）──────────────────────
function initVocabularyBackup() {
  $('btnExportVocabulary')?.addEventListener('click', exportVocabularyBackup);
  $('btnExportVocabularyXlsx')?.addEventListener('click', exportVocabularyXlsx);
  const fileInput = $('vocabularyImportFile');
  $('btnImportVocabulary')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', importVocabularyBackup);
}

function setVocabularyBackupStatus(text) {
  const el = $('vocabularyBackupStatus');
  if (el) el.textContent = text;
}

async function exportVocabularyBackup() {
  try {
    const items = await getVocabularyItemsMap();
    const backup = VocabBackup.buildBackup(items);
    if (!backup.count) { setVocabularyBackupStatus('單字本是空的，沒有可匯出的單字。'); return; }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fan-fan-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setVocabularyBackupStatus(`已匯出 ${backup.count} 個單字。`);
  } catch {
    setVocabularyBackupStatus('匯出失敗，請再試一次。');
  }
}

async function exportVocabularyXlsx() {
  try {
    const items = await getVocabularyItemsMap();
    const normalized = VocabBackup.normalizeItemsMap(items);
    const count = Object.keys(normalized).length;
    if (!count) { setVocabularyBackupStatus('單字本是空的，沒有可匯出的單字。'); return; }
    const workbook = VocabBackup.buildXlsxWorkbook(normalized);
    const blob = new Blob([workbook], { type: VocabBackup.XLSX_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fan-fan-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setVocabularyBackupStatus(`已匯出 ${count} 個單字成 XLSX。`);
  } catch {
    setVocabularyBackupStatus('XLSX 匯出失敗，請再試一次。');
  }
}

const MAX_VOCAB_IMPORT_BYTES = 10 * 1024 * 1024; // 10MB，避免超大檔塞爆 storage

async function importVocabularyBackup(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (file.size > MAX_VOCAB_IMPORT_BYTES) {
    setVocabularyBackupStatus('檔案太大（上限 10MB），請確認是翻翻吧的單字本備份。');
    return;
  }
  try {
    const text = await file.text();
    const incoming = VocabBackup.parseBackup(text);
    const existing = await getVocabularyItemsMap();
    const { items, summary } = VocabBackup.mergeBackup(existing, incoming, 'merge');
    await replaceVocabularyItemsMap(items);
    setVocabularyBackupStatus(`匯入完成：新增 ${summary.added}、更新 ${summary.updated}，目前共 ${summary.total} 個單字。`);
  } catch (error) {
    setVocabularyBackupStatus(`匯入失敗：${error?.message || '檔案格式不正確'}`);
  }
}

// A1'''：不再 fallback 直讀/直寫 storage——匯入流程的 existing 讀取失敗必須
// 讓匯入整個中止（若降級成空集，mergeBackup 會退化成 replace、舊備份蓋掉活資料）。
// 失敗往上拋，由 importVocabularyBackup 的 catch 浮出錯誤。
async function getVocabularyItemsMap() {
  const response = await requestVocabularyStore('list');
  // 非陣列一律視為讀取失敗並中止（絕不降級成空集）：匯入流程若拿到空集，
  // mergeBackup 會退化成 replace，把舊備份蓋掉整個活單字本（WS-E A1'''）
  if (!Array.isArray(response.items)) throw new Error('單字本資料讀取失敗');
  return response.items.reduce((acc, item) => {
    if (item?.id) acc[item.id] = item;
    return acc;
  }, {});
}

async function replaceVocabularyItemsMap(items) {
  await requestVocabularyStore('replaceAll', { items });
}

async function requestVocabularyStore(action, payload = {}) {
  if (!chrome.runtime?.sendMessage) throw new Error('單字本資料層不可用');
  const response = await chrome.runtime.sendMessage({
    type: 'VOCABULARY_STORE',
    action,
    ...payload
  });
  if (!response || response.ok !== true) {
    throw new Error(response?.error || '單字本資料層不可用');
  }
  return response;
}

// ── 本機診斷摘要（v1.9.8）────────────────────────────
function initDiagnosticsPanel() {
  renderDiagnostics();
  $('btnClearDiagnostics')?.addEventListener('click', async () => {
    await Storage.clearDiagnostics();
    renderDiagnostics('已清除診斷資料。');
  });
}

async function renderDiagnostics(note = '') {
  const el = $('diagnosticsSummary');
  if (!el) return;
  try {
    const [diagnostics, settings, secrets] = await Promise.all([
      Storage.getDiagnostics(),
      chrome.storage.sync.get(DIAGNOSTICS_SETTING_KEYS),
      Storage.getSecrets({})
    ]);
    renderDiagnosticsSelfCheck(el, {
      note,
      diagnostics,
      rows: buildDiagnosticsChecklist(diagnostics, settings, secrets, getCurrentAppVersion())
    });
  } catch {
    el.textContent = note || '無法讀取本機診斷資料，請重新開啟設定頁再試一次。';
  }
}

function renderDiagnosticsSelfCheck(el, { note = '', diagnostics = Storage.emptyDiagnostics(), rows = [] } = {}) {
  el.textContent = '';
  const warningCount = rows.filter(row => row.status === 'warn').length;
  const overview = document.createElement('div');
  overview.className = `diagnostics-overview${warningCount ? ' is-warn' : ''}`;

  const title = document.createElement('strong');
  title.textContent = warningCount ? `自檢結果：${warningCount} 項需要處理` : '自檢結果：本機狀態正常';
  const summary = document.createElement('span');
  summary.textContent = formatDiagnosticsSummary(diagnostics, note);
  overview.append(title, summary);

  const list = document.createElement('ul');
  list.className = 'diagnostics-checklist';
  rows.forEach(row => {
    const item = document.createElement('li');
    const dot = document.createElement('span');
    const content = document.createElement('div');
    const label = document.createElement('strong');
    const value = document.createElement('span');
    dot.className = `diagnostics-dot ${row.status || 'info'}`;
    label.textContent = row.label || '';
    value.textContent = row.value || '';
    content.append(label, value);
    if (row.detail) {
      const detail = document.createElement('small');
      detail.textContent = row.detail;
      content.appendChild(detail);
    }
    item.append(dot, content);
    list.appendChild(item);
  });

  el.append(overview, list);
}

function formatDiagnosticsSummary(d = Storage.emptyDiagnostics(), note = '') {
  const total = d.actions.translate + d.actions.explain + d.actions.optimize + d.pageTranslations;
  if (!total && !d.errors) return note || '尚無使用紀錄。';
  const sinceText = formatDiagnosticsDate(d.since);
  const parts = [
    `翻譯 ${d.actions.translate}`,
    `解釋 ${d.actions.explain}`,
    `優化 ${d.actions.optimize}`,
    `全文翻譯 ${d.pageTranslations}`,
    `失敗 ${d.errors}`
  ];
  return `${note ? note + ' ' : ''}自 ${sinceText} 起：${parts.join(' · ')}`;
}

function formatDiagnosticsDate(value = '') {
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '未知日期';
}

function buildDiagnosticsChecklist(diagnostics = Storage.emptyDiagnostics(), settings = {}, secrets = {}, appVersion = '') {
  const model = ModelRegistry.getModel(settings.model);
  const pageTranslationModel = ModelRegistry.getModel(settings.pageTranslationModel || model.id);
  const modelKeyReady = hasProviderKey(model, secrets);
  const pageModelKeyReady = hasProviderKey(pageTranslationModel, secrets);
  const total = diagnostics.actions.translate + diagnostics.actions.explain + diagnostics.actions.optimize + diagnostics.pageTranslations;
  const targetLanguage = ModelRegistry.getLanguageOption?.(ModelRegistry.normalizeLanguage(settings.targetLanguage, 'zh-TW'))?.name || '繁體中文';
  const rows = [
    {
      status: modelKeyReady ? 'ok' : 'warn',
      label: '單段翻譯模型',
      value: `${providerName(model.provider)} / ${model.name}${modelKeyReady ? '：API Key 已設定' : '：缺 API Key'}`,
      detail: modelKeyReady ? '可按「測試連線」確認 API 是否可用。' : `目前選用 ${model.name}，請先填入 ${providerName(model.provider)} API Key。`
    },
    {
      status: pageModelKeyReady ? 'ok' : 'warn',
      label: '全文翻譯模型',
      value: `${providerName(pageTranslationModel.provider)} / ${pageTranslationModel.name}${pageModelKeyReady ? '：API Key 已設定' : '：缺 API Key'}`,
      detail: `目標語言：${targetLanguage}；此檢查不會發送測試請求。`
    },
    {
      status: settings.singleHoverButton === false ? 'info' : 'ok',
      label: '段落 hover 翻譯',
      value: settings.singleHoverButton === false ? '關閉' : '開啟',
      detail: settings.singleHoverButton === false ? '滑過段落不顯示「譯」浮鈕，但 Alt+T 仍可翻譯目前段落。' : '滑過一般段落時會顯示「譯」浮鈕，可按需翻譯單段文字。'
    },
    {
      status: settings.vocabularyHighlightMode === 'auto' ? 'ok' : 'info',
      label: '單字高亮',
      value: settings.vocabularyHighlightMode === 'auto' ? '自動標示已收藏單字' : '關閉',
      detail: settings.vocabularyHighlightMode === 'auto' ? '瀏覽網頁時會用本機單字本輔助提醒。' : '不影響翻譯，只是不在頁面上標示已收藏單字。'
    },
    {
      status: diagnostics.errors ? 'warn' : total ? 'ok' : 'info',
      label: '本機使用紀錄',
      value: diagnostics.errors ? `累計 ${diagnostics.errors} 次失敗` : total ? `累計 ${total} 次成功操作` : '尚無使用紀錄',
      detail: formatDiagnosticsSummary(diagnostics)
    },
    {
      status: 'ok',
      label: '隱私邊界',
      value: '僅保留本機計數，不含選取文字、網址或內容',
      detail: '不會上傳 telemetry；按下清除後會重設這份本機摘要。'
    }
  ];

  if (appVersion) {
    rows.unshift({
      status: 'ok',
      label: '擴充功能版本',
      value: `v${appVersion}`,
      detail: '從本機 manifest 讀取。'
    });
  }

  return rows;
}

function hasProviderKey(model = {}, secrets = {}) {
  const keyName = model.apiKeyName || providerApiKeyName(model.provider);
  return !!String(secrets[keyName] || '').trim();
}

function providerApiKeyName(provider = '') {
  return (ModelRegistry.PROVIDERS[provider] || ModelRegistry.PROVIDERS.gemini).apiKeyName;
}

function providerName(provider = '') {
  return ModelRegistry.PROVIDERS[provider]?.label || provider || '未知模型';
}

// 未在冊的舊版 model id（如 gemini-2.5-flash）：select 沒有對應選項時補一個
// 保留現行設定，避免 select 落回第一個選項、儲存時被靜默改掉（WS-E M3'' 附帶修復）
function setModelSelectValue(select, modelId) {
  if (!select) return;
  select.value = modelId;
  if (select.value !== modelId) {
    const opt = document.createElement('option');
    opt.value = modelId;
    opt.textContent = `${ModelRegistry.getModelDisplayName(modelId)}（舊版）`;
    select.appendChild(opt);
    select.value = modelId;
  }
}

// ── 載入已儲存的設定 ─────────────────────────────────
async function loadSettings() {
  const [
    { model, pageTranslationModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, singleHoverButton, obsidianVault, obsidianDefaultFolder },
    { apiKey, groqApiKey, openrouterApiKey, ttsApiKey }
  ] = await Promise.all([
    chrome.storage.sync.get(SYNC_SETTING_KEYS),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', ttsApiKey: '' })
  ]);

  if (apiKey)                 $('apiKey').value                 = apiKey;
  if (groqApiKey)             $('groqApiKey').value             = groqApiKey;
  if (openrouterApiKey)       $('openrouterApiKey').value       = openrouterApiKey;
  // 無儲存紀錄時預設 Groq（免費額度最大方）
  const currentModel = ModelRegistry.normalizeModel(model);
  setModelSelectValue($('model'), currentModel);
  if ($('pageTranslationModel')) setModelSelectValue($('pageTranslationModel'), ModelRegistry.normalizeModel(pageTranslationModel || currentModel));
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
  if ($('singleHoverButton')) {
    $('singleHoverButton').value = singleHoverButton === false ? 'off' : 'on';
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
loadCloudWebAuthClientId();
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
  const singleHoverButton = $('singleHoverButton')?.value !== 'off';
  const isGroq           = model.startsWith('groq:');
  const isOpenRouter     = model.startsWith('openrouter:');

  // 依選擇的模型驗證對應 API Key（前綴與顯示名來源：ModelRegistry.PROVIDERS）
  {
    const provider = ModelRegistry.getProvider(model);
    const info = ModelRegistry.PROVIDERS[provider];
    const keyValue = provider === 'groq' ? groqApiKey : provider === 'openrouter' ? openrouterApiKey : apiKey;
    if (!keyValue) { showStatus('err', `使用 ${info.label} 模型請輸入 ${info.label} API Key`); return; }
    if (!keyValue.startsWith(info.keyPrefix)) { showStatus('err', `${info.label} API Key 格式不正確，應以 ${info.keyPrefix} 開頭`); return; }
  }

  const obsidianVault         = $('obsidianVault').value.trim();
  const ttsApiKey             = $('ttsApiKey').value.trim();
  const obsidianDefaultFolder = $('obsidianDefaultFolder').value.trim();

  await Promise.all([
    chrome.storage.sync.set({ model, pageTranslationModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, singleHoverButton, obsidianVault, obsidianDefaultFolder }),
    Storage.setSecrets({ apiKey, groqApiKey, openrouterApiKey, ttsApiKey })
  ]);
  showStatus('ok', '✓ 設定已儲存');
});

// ── 測試連線 ─────────────────────────────────────────
$('btnTest').addEventListener('click', async () => {
  const model        = $('model').value || ModelRegistry.DEFAULT_MODEL;
  const isGroq       = model.startsWith('groq:');
  const isOpenRouter = model.startsWith('openrouter:');
  const P            = ModelRegistry.PROVIDERS; // URL / 顯示名單一來源（WS-E M3''）

  let apiKey, displayName, fetchUrl, fetchBody, fetchHeaders;

  if (isGroq) {
    apiKey      = $('groqApiKey').value.trim();
    displayName = `${ModelRegistry.getModel(model).name} (${P.groq.label})`;
    fetchUrl    = `${P.groq.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    fetchBody    = JSON.stringify({ model: ModelRegistry.toApiModelId(model), messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
  } else if (isOpenRouter) {
    apiKey      = $('openrouterApiKey').value.trim();
    displayName = ModelRegistry.toApiModelId(model);
    fetchUrl    = `${P.openrouter.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...P.openrouter.extraHeaders };
    fetchBody    = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else {
    apiKey      = $('apiKey').value.trim();
    displayName = model;
    fetchUrl    = `${P.gemini.apiBase}/${model}:generateContent?key=${apiKey}`;
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
  const passwordInput = $('backupPassword');

  if (exportButton) {
    exportButton.addEventListener('click', async () => {
      exportButton.disabled = true;
      try {
        const includeSecrets = !!includeSecretsCheckbox?.checked;
        if (includeSecrets && !confirmSecretsExport()) return;
        const payload = await buildSettingsBackupPayload(includeSecrets, {
          password: includeSecrets ? passwordInput?.value || '' : ''
        });
        downloadSettingsBackup(payload);
        showStatus('ok', includeSecrets ? '✓ 設定與加密 API Keys 已匯出' : '✓ 設定檔已匯出');
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
        const result = await importSettingsBackupFile(file, { password: passwordInput?.value || '' });
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
  const webAuthClientInput = $('cloudWebAuthClientId');
  const saveWebAuthClientButton = $('btnCloudSaveWebAuthClientId');
  const signInButton = $('btnCloudSignIn');
  const uploadButton = $('btnCloudUpload');
  const downloadButton = $('btnCloudDownload');
  const signOutButton = $('btnCloudSignOut');
  if (!saveWebAuthClientButton && !signInButton && !uploadButton && !downloadButton && !signOutButton) return;

  saveWebAuthClientButton?.addEventListener('click', () => runCloudSyncAction(saveWebAuthClientButton, async () => {
    const savedClientId = await CloudSync.setWebAuthClientId(webAuthClientInput?.value || '');
    await renderCloudSyncStatus(savedClientId ? 'Web Auth Client ID 已儲存。' : 'Web Auth Client ID 已清除。');
    showStatus('ok', savedClientId ? '✓ Web Auth Client ID 已儲存' : '✓ Web Auth Client ID 已清除');
  }));

  signInButton?.addEventListener('click', () => runCloudSyncAction(signInButton, async () => {
    await CloudSync.getAuthToken(true);
    await CloudSync.recordCloudSyncSignIn?.();
    await renderCloudSyncStatus('已登入 Google，可上傳或下載一般設定。');
    showStatus('ok', '✓ Google 登入成功');
  }));

  uploadButton?.addEventListener('click', () => runCloudSyncAction(uploadButton, async () => {
    const token = await CloudSync.getAuthToken(true);
    await CloudSync.recordCloudSyncSignIn?.();
    const existingFile = await CloudSync.findCloudSettingsFile(token);
    if (existingFile && !confirmCloudUploadOverwrite(existingFile)) {
      await renderCloudSyncStatus('已取消上傳，雲端設定未變更。');
      showStatus('info', '已取消雲端設定上傳');
      return;
    }
    const payload = await buildCloudSettingsPayload();
    const file = await CloudSync.uploadCloudSettings(token, payload);
    await renderCloudSyncStatus(`已上傳 ${Object.keys(payload.settings || {}).length} 個一般設定：版本 ${payload.appVersion || '未知'}，${formatCloudSyncTime(payload.updatedAt)}`);
    showStatus('ok', `✓ 雲端設定已上傳${file?.id ? `（${file.id}）` : ''}`);
  }));

  downloadButton?.addEventListener('click', () => runCloudSyncAction(downloadButton, async () => {
    const token = await CloudSync.getAuthToken(true);
    await CloudSync.recordCloudSyncSignIn?.();
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
    await CloudSync.recordCloudSyncSignOut?.();
    await renderCloudSyncStatus('已登出 Google。');
    showStatus('ok', '✓ 已登出 Google');
  }));
}

async function runCloudSyncAction(button, action) {
  const buttons = ['btnCloudSaveWebAuthClientId', 'btnCloudSignIn', 'btnCloudUpload', 'btnCloudDownload', 'btnCloudSignOut']
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
  await CloudSync.loadWebAuthClientId?.();
  const config = CloudSync.getOAuthConfig();
  if (!CloudSync.isOAuthConfigured(config)) {
    renderCloudSyncStatusRows(el, [
      ['登入狀態', '尚未完成 OAuth 設定'],
      ['目前版本', getCurrentAppVersion()],
      ['注意', '請先完成 Google OAuth Client ID 設定；API Key 不會同步。']
    ]);
    return;
  }

  const meta = await CloudSync.getCloudSyncMeta();
  const support = CloudSync.getOAuthSupport?.() || {};
  const authMode = support.nativeAuth && support.webAuthFlow
    ? 'Chrome native auth / cross-browser Web Auth fallback'
    : support.webAuthFlow
      ? 'cross-browser Web Auth'
      : 'Chrome native auth';
  const rows = [
    ['同步摘要', formatCloudSyncSummary(meta)],
    ['登入狀態', formatCloudSignedInStatus(meta)],
    ['目前版本', getCurrentAppVersion()],
    ['同步範圍', '一般設定，不含 API Key、單字本、查詢歷史'],
    ['儲存位置', 'Google Drive 隱藏 appDataFolder'],
    ['操作方向', '上傳：這台覆蓋雲端；下載：雲端覆蓋這台'],
    ['登入流程', authMode],
    ['Native Client', support.nativeAuthConfigured ? '已設定' : '未設定']
  ];
  if (support.webAuthFlow) rows.push(['Web Auth Client', support.webAuthConfigured ? '已設定' : '未設定']);
  const redirectUrl = CloudSync.getOAuthRedirectUrl?.();
  if (support.webAuthFlow && redirectUrl) rows.push(['Redirect URL', redirectUrl]);
  if (support.webAuthFlow && !support.webAuthConfigured) {
    rows.push(['提醒', 'Edge / Chromium 需設定 Web Auth fallback OAuth Client ID']);
  }
  if (meta.lastUploadAt) rows.push(['最後上傳', `${formatCloudSyncTime(meta.lastUploadAt)}${formatCloudSettingsCount(meta.lastUploadSettingsCount)}${meta.lastUploadAppVersion ? `，版本 ${meta.lastUploadAppVersion}` : ''}`]);
  if (meta.lastDownloadAt) rows.push(['最後下載', `${formatCloudSyncTime(meta.lastDownloadAt)}${formatCloudSettingsCount(meta.lastDownloadSettingsCount)}${meta.lastCloudAppVersion ? `，雲端版本 ${meta.lastCloudAppVersion}` : ''}`]);
  if (meta.lastErrorAt) rows.push(['最後錯誤', `${meta.lastErrorCategory || 'unknown'}，${formatCloudSyncTime(meta.lastErrorAt)}`]);
  if (message) rows.push(['最新訊息', message]);
  renderCloudSyncStatusRows(el, rows);
}

function renderCloudSyncStatusRows(el, rows = []) {
  el.textContent = '';
  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    const strong = document.createElement('strong');
    const span = document.createElement('span');
    strong.textContent = label;
    span.textContent = value || '-';
    row.append(strong, span);
    el.appendChild(row);
  });
}

function getCurrentAppVersion() {
  return chrome.runtime?.getManifest?.().version || '未知';
}

function formatCloudSyncSummary(meta = {}) {
  const uploadAt = parseCloudSyncTime(meta.lastUploadAt);
  const downloadAt = parseCloudSyncTime(meta.lastDownloadAt);
  if (uploadAt && (!downloadAt || uploadAt >= downloadAt)) {
    return `最近上傳：${formatCloudSyncTime(meta.lastUploadAt)}${formatCloudSettingsCount(meta.lastUploadSettingsCount)}`;
  }
  if (downloadAt) {
    return `最近下載：${formatCloudSyncTime(meta.lastDownloadAt)}${formatCloudSettingsCount(meta.lastDownloadSettingsCount)}`;
  }
  if (meta.signedIn) return '已登入，尚未上傳或下載設定';
  if (meta.lastSignOutAt) return '已登出，雲端同步暫停';
  return '尚未開始雲端同步';
}

function formatCloudSignedInStatus(meta = {}) {
  if (meta.signedIn) {
    return meta.lastSignInAt ? `已登入，${formatCloudSyncTime(meta.lastSignInAt)}` : '已登入';
  }
  if (meta.lastSignOutAt) return `已登出，${formatCloudSyncTime(meta.lastSignOutAt)}`;
  return '尚未登入';
}

function parseCloudSyncTime(value = '') {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCloudSettingsCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? `，${count} 個設定` : '';
}

function formatCloudSyncTime(value = '') {
  if (!value) return '未知時間';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
}

async function loadCloudWebAuthClientId() {
  const input = $('cloudWebAuthClientId');
  if (!input) return '';
  const clientId = await CloudSync.loadWebAuthClientId?.() || '';
  input.value = clientId;
  return clientId;
}

async function buildSettingsBackupPayload(includeSecrets = false, options = {}) {
  const syncSettings = await chrome.storage.sync.get(SYNC_SETTING_KEYS);
  const payload = {
    app: SETTINGS_BACKUP_APP,
    schemaVersion: SETTINGS_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings: pickBackupSettings(syncSettings)
  };

  if (includeSecrets) {
    payload.secretsEncrypted = await encryptBackupSecrets(pickBackupSecrets(await Storage.getSecrets({})), options.password || '');
  }

  return payload;
}

async function encryptBackupSecrets(secrets = {}, password = '') {
  const pickedSecrets = pickBackupSecrets(secrets);
  if (!Object.keys(pickedSecrets).length) return null;
  assertBackupPassword(password);
  const cryptoImpl = getCryptoImpl();
  const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
  const key = await deriveBackupSecretKey(password, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(pickedSecrets));
  const encrypted = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    version: SECRET_BACKUP_CRYPTO_VERSION,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2-SHA-256',
    iterations: SECRET_BACKUP_KDF_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted))
  };
}

async function decryptBackupSecrets(encrypted = {}, password = '') {
  if (!encrypted) return {};
  assertBackupPassword(password);
  if (encrypted.version !== SECRET_BACKUP_CRYPTO_VERSION || encrypted.algorithm !== 'AES-GCM') {
    throw new Error('API Key 加密備份格式不支援');
  }
  try {
    const cryptoImpl = getCryptoImpl();
    const salt = base64ToBytes(encrypted.salt);
    const iv = base64ToBytes(encrypted.iv);
    const key = await deriveBackupSecretKey(password, salt, encrypted.iterations || SECRET_BACKUP_KDF_ITERATIONS);
    const decrypted = await cryptoImpl.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      base64ToBytes(encrypted.data)
    );
    return pickBackupSecrets(JSON.parse(new TextDecoder().decode(decrypted)));
  } catch (error) {
    if (/API Key 加密備份格式不支援|API Key 備份密碼/.test(String(error?.message || error))) throw error;
    throw new Error('API Key 備份密碼不正確或檔案已損壞');
  }
}

async function deriveBackupSecretKey(password, salt, iterations = SECRET_BACKUP_KDF_ITERATIONS) {
  const cryptoImpl = getCryptoImpl();
  const baseKey = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return cryptoImpl.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function assertBackupPassword(password = '') {
  if (String(password).length < 8) {
    throw new Error('API Key 備份密碼至少需要 8 個字元');
  }
}

function getCryptoImpl() {
  const cryptoImpl = globalThis.crypto?.subtle
    ? globalThis.crypto
    : typeof require === 'function'
      ? require('crypto').webcrypto
      : null;
  if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function') {
    throw new Error('此環境不支援 API Key 加密備份');
  }
  return cryptoImpl;
}

function bytesToBase64(bytes) {
  if (typeof btoa === 'function') {
    return btoa(String.fromCharCode(...bytes));
  }
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(value = '') {
  if (typeof atob === 'function') {
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  }
  return Uint8Array.from(Buffer.from(value, 'base64'));
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

async function importSettingsBackupFile(file, options = {}) {
  const payload = parseSettingsBackup(await readTextFile(file));
  const settings = normalizeImportedSettings(payload.settings || {});
  const secrets = await resolveImportedBackupSecrets(payload, options.password || '');

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

async function resolveImportedBackupSecrets(payload = {}, password = '') {
  if (payload.secretsEncrypted) {
    return decryptBackupSecrets(payload.secretsEncrypted, password);
  }
  return pickBackupSecrets(payload.secrets || {});
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
  if (key === 'singleHoverButton') {
    return value !== false;
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
  return window.confirm('API Keys 會用你輸入的密碼加密後匯出。請記住密碼，忘記後無法還原。確定要匯出嗎？');
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
    encryptBackupSecrets,
    decryptBackupSecrets,
    pickBackupSettings,
    pickBackupSecrets,
    buildSettingsBackupFilename,
    parseSettingsBackup,
    normalizeImportedSettings,
    importSettingsBackupFile,
    resolveImportedBackupSecrets,
    formatImportSettingsStatus,
    confirmSecretsExport,
    confirmCloudUploadOverwrite,
    confirmCloudDownloadOverwrite,
    bindCloudSyncControls,
    loadCloudWebAuthClientId,
    buildCloudSettingsPayload,
    renderCloudSyncStatus,
    formatCloudSyncTime,
    renderDiagnostics,
    renderDiagnosticsSelfCheck,
    formatDiagnosticsSummary,
    buildDiagnosticsChecklist,
    getVocabularyItemsMap
  };
}
