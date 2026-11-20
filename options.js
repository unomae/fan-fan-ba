// options.js — 設定頁入口協調器：載入各領域模組、管理模型／金鑰／語言表單與連線測試

'use strict';

const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const CloudSync = globalThis.FanFanBaCloudSync || require('./cloud-sync');
const VocabBackup = globalThis.FanFanBaVocabularyBackup || require('./vocabulary-backup');
const CustomActions = globalThis.FanFanBaCustomActions || require('./custom-actions');
const Glossary = globalThis.FanFanBaGlossary || require('./content/glossary');
// 設定頁與 content 共用 DOM helper 與自訂動作版面（瀏覽器端由 <script> 掛在全域）
const Dom = typeof globalThis.ffbEl === 'function' ? globalThis : require('./content/dom');
const ActionRender = typeof globalThis.buildCustomActionContent === 'function'
  ? globalThis
  : require('./content/custom-action-render');

// Node/Jest 環境優先走 require 以完整支援 jest.isolateModules()；瀏覽器端讀 options.html 預先載入的工廠
function loadOptionsModule(name, relPath) {
  return typeof require === 'function' ? require(relPath) : globalThis.FanFanBaOptionsModules[name];
}

const ctx = {
  ModelRegistry,
  Storage,
  CloudSync,
  VocabBackup,
  CustomActions,
  Glossary,
  Dom,
  ActionRender
};

ctx.shared = loadOptionsModule('shared', './options/shared')(ctx);
const {
  $,
  SYNC_SETTING_KEYS,
  providerName,
  setModelSelectValue,
  showStatus,
  fetchWithTimeout
} = ctx.shared;

// 先建立全部領域模組並掛回 ctx，再進行初始化，杜絕跨模組 TDZ 相依
ctx.vocabulary = loadOptionsModule('vocabularyBackup', './options/vocabulary-backup-ui')(ctx);
ctx.diagnostics = loadOptionsModule('diagnostics', './options/diagnostics')(ctx);
ctx.navigation = loadOptionsModule('navigation', './options/navigation')(ctx);
ctx.backup = loadOptionsModule('backupCrypto', './options/backup-crypto')(ctx);
ctx.cloud = loadOptionsModule('cloudSyncUi', './options/cloud-sync-ui')(ctx);
ctx.glossary = loadOptionsModule('glossaryEditor', './options/glossary-editor')(ctx);
ctx.compare = loadOptionsModule('modelCompare', './options/model-compare')(ctx);
ctx.actions = loadOptionsModule('actionEditor', './options/action-editor')(ctx);

// ── 核心模型／金鑰／語言表單 ──────────────────────────────
function renderModelSelect() {
  const select = $('model');
  if (!select || select.tagName !== 'SELECT') return;

  const providerLabels = {
    groq: 'Groq（需 Groq API Key）',
    gemini: 'Gemini（需 Gemini API Key）',
    openrouter: 'OpenRouter（需 OpenRouter API Key）',
    custom: '自訂端點（需在下方填寫網址、模型與金鑰）'
  };

  // pageTranslationOnly 的模型（瀏覽器內建）刻意不進主選單：它給不出詞典要的結構化 JSON
  Dom.ffbClear(select).append(...['groq', 'gemini', 'openrouter', 'custom'].map(provider => {
    const options = ModelRegistry.MODELS
      .filter(model => model.provider === provider && !model.pageTranslationOnly)
      .map(model => Dom.ffbEl('option', { value: model.id }, `${model.name}（${model.desc}）`));
    return Dom.ffbEl('optgroup', { label: providerLabels[provider] }, options);
  }));
}

function renderPageTranslationModelSelect() {
  const select = $('pageTranslationModel');
  if (!select || select.tagName !== 'SELECT') return;

  Dom.ffbClear(select).append(
    Dom.ffbEl('option', { value: '' }, '跟隨主模型'),
    ...ModelRegistry.MODELS.map(model => Dom.ffbEl('option', { value: model.id }, `${model.name}（${model.desc}）`))
  );
}

function buildFeatureModelOptions(defaultValue) {
  return [
    Dom.ffbEl('option', { value: defaultValue }, '跟隨主模型'),
    ...ModelRegistry.MODELS
      .filter(model => !model.pageTranslationOnly)
      .map(model => Dom.ffbEl('option', { value: model.id }, `${model.name}（${providerName(model.provider)}）`))
  ];
}

function renderDictionaryModelSelect() {
  const select = $('dictionaryModel');
  if (select) Dom.ffbClear(select).append(...buildFeatureModelOptions(''));
}

function renderLanguageSelects() {
  const targetSelect = $('targetLanguage');
  const explanationSelect = $('explanationLanguage');
  const ttsSelect = $('ttsLanguageMode');
  if (targetSelect) {
    Dom.ffbClear(targetSelect).append(...ModelRegistry.LANGUAGE_OPTIONS.map(lang => Dom.ffbEl('option', { value: lang.id }, lang.name)));
  }
  if (explanationSelect) {
    Dom.ffbClear(explanationSelect).append(...ModelRegistry.EXPLANATION_LANGUAGE_OPTIONS.map(lang => Dom.ffbEl('option', { value: lang.id }, lang.name)));
  }
  if (ttsSelect) {
    Dom.ffbClear(ttsSelect).append(...ModelRegistry.TTS_LANGUAGE_OPTIONS.map(mode => Dom.ffbEl('option', { value: mode.id }, mode.name)));
  }
}

// 缺什麼才能用這個模型；回傳 null 表示可用。focusId 是「前往填寫」要聚焦的欄位
function getFeatureModelGap(modelId) {
  if (!modelId || modelId === 'default') return null;
  const model = ModelRegistry.MODELS.find(item => item.id === modelId);
  const provider = model && ModelRegistry.PROVIDERS[model.provider];
  if (!provider || provider.keyless) return null;
  const valueOf = id => String($(id)?.value || '').trim();
  if (provider.userConfigured) {
    const missing = ['customApiBase', 'customModelName', provider.apiKeyName].find(id => !valueOf(id));
    return missing ? { message: '自訂端點的網址、模型名稱或金鑰還沒填', focusId: missing } : null;
  }
  return valueOf(provider.apiKeyName) ? null : { message: `缺 ${provider.label} API Key`, focusId: provider.apiKeyName };
}

function updateFeatureModelHints() {
  document.querySelectorAll('select[data-feature-model]').forEach(select => {
    const hintId = `${select.id}-hint`;
    let hint = $(hintId);
    const gap = getFeatureModelGap(select.value);
    if (!gap) {
      hint?.remove();
      select.removeAttribute('aria-describedby');
      return;
    }
    if (!hint) {
      hint = Dom.ffbEl('div', { id: hintId, class: 'feature-model-hint' });
      select.after(hint);
    }
    const go = Dom.ffbEl('button', { type: 'button' }, '前往填寫');
    go.addEventListener('click', () => {
      const target = $(gap.focusId);
      target?.scrollIntoView?.({ block: 'center' });
      target?.focus();
    });
    Dom.ffbClear(hint).append(
      Dom.ffbEl('span', { class: 'diagnostics-dot warn', 'aria-hidden': 'true' }),
      Dom.ffbEl('span', null, [`${gap.message}，這個功能會無法使用。`, go])
    );
    select.setAttribute('aria-describedby', hintId);
  });
  renderProviderKeyStates();
}

function getProvidersInUse() {
  const mainModel = $('model')?.value || '';
  const ids = [mainModel, ...[...document.querySelectorAll('select[data-feature-model]')]
    .map(select => (!select.value || select.value === 'default' ? mainModel : select.value))];
  return new Set(ids.map(id => ModelRegistry.MODELS.find(model => model.id === id)?.provider).filter(Boolean));
}

function renderProviderKeyStates() {
  const KEY_STATE_TEXT = { 'in-use': '使用中', missing: '缺 Key', filled: '已填', empty: '未填' };
  const inUse = getProvidersInUse();
  const valueOf = id => String($(id)?.value || '').trim();
  document.querySelectorAll('[data-key-state-for]').forEach(el => {
    const name = el.dataset.keyStateFor;
    const provider = ModelRegistry.PROVIDERS[name];
    if (!provider) return;
    const fieldIds = provider.userConfigured ? ['customApiBase', 'customModelName', provider.apiKeyName] : [provider.apiKeyName];
    const filled = fieldIds.every(id => valueOf(id));
    const state = inUse.has(name) ? (filled ? 'in-use' : 'missing') : (filled ? 'filled' : 'empty');
    el.dataset.state = state;
    el.textContent = KEY_STATE_TEXT[state];
  });
}

function initFeatureModelHints() {
  document.addEventListener('change', event => {
    if (event.target?.matches?.('#model, select[data-feature-model]')) updateFeatureModelHints();
  });
  ['apiKey', 'groqApiKey', 'openrouterApiKey', 'customApiKey', 'customApiBase', 'customModelName'].forEach(id => {
    $(id)?.addEventListener('input', updateFeatureModelHints);
  });
}

async function loadSettings() {
  const [
    { model, pageTranslationModel, dictionaryModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, obsidianVault, obsidianDefaultFolder, customApiBase, customModelName },
    { apiKey, groqApiKey, openrouterApiKey, customApiKey, ttsApiKey }
  ] = await Promise.all([
    chrome.storage.sync.get(SYNC_SETTING_KEYS),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', customApiKey: '', ttsApiKey: '' })
  ]);

  if (apiKey)                 $('apiKey').value                 = apiKey;
  if (groqApiKey)             $('groqApiKey').value             = groqApiKey;
  if (openrouterApiKey)       $('openrouterApiKey').value       = openrouterApiKey;
  if (customApiBase && $('customApiBase'))     $('customApiBase').value   = customApiBase;
  if (customModelName && $('customModelName')) $('customModelName').value = customModelName;
  if (customApiKey && $('customApiKey'))       $('customApiKey').value    = customApiKey;
  const currentModel = ModelRegistry.normalizeModel(model);
  setModelSelectValue($('model'), currentModel);
  if ($('pageTranslationModel')) setModelSelectValue($('pageTranslationModel'), pageTranslationModel ? ModelRegistry.normalizeModel(pageTranslationModel) : '');
  if ($('dictionaryModel')) setModelSelectValue($('dictionaryModel'), dictionaryModel || '');
  if (model && currentModel !== model) chrome.storage.sync.set({ model: currentModel });
  if ($('targetLanguage')) $('targetLanguage').value = ModelRegistry.normalizeLanguage(targetLanguage, 'zh-TW');
  if ($('explanationLanguage')) $('explanationLanguage').value = ModelRegistry.normalizeExplanationLanguage(explanationLanguage, 'target');
  if ($('ttsLanguageMode')) $('ttsLanguageMode').value = ModelRegistry.normalizeTtsLanguageMode(ttsLanguageMode, 'auto');
  if ($('vocabularyHighlightMode')) $('vocabularyHighlightMode').value = vocabularyHighlightMode === 'auto' ? 'auto' : 'off';
  if (obsidianVault)          $('obsidianVault').value          = obsidianVault;
  if (ttsApiKey)              $('ttsApiKey').value              = ttsApiKey;
  if (obsidianDefaultFolder)  $('obsidianDefaultFolder').value  = obsidianDefaultFolder;
  updateFeatureModelHints();
  ctx.navigation.clearSettingsDirty(['model', 'language', 'obsidian']);
}

ctx.core = {
  buildFeatureModelOptions,
  updateFeatureModelHints,
  loadSettings
};

// ── 顯示 / 隱藏 API Key 共用函式 ─────────────────────
function bindToggleVis(btnId, inputId, showId, hideId) {
  $(btnId).addEventListener('click', () => {
    const input = $(inputId);
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    $(showId).style.display = isHidden ? 'none' : '';
    $(hideId).style.display = isHidden ? '' : 'none';
  });
}

// ── 自訂 OpenAI 相容端點 ─────────────────────────────
async function prepareCustomEndpointSettings({ apiBase = '', modelName = '', required = false } = {}) {
  const rawBase = String(apiBase || '').trim();
  const customModelName = String(modelName || '').trim();
  if (!rawBase) {
    if (required) return { ok: false, error: '使用自訂端點請先填寫 API 網址與模型名稱' };
    return { ok: true, settings: { customApiBase: '', customModelName } };
  }
  let endpoint;
  try {
    endpoint = ModelRegistry.normalizeCustomEndpoint(rawBase);
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!customModelName) return { ok: false, error: '請填寫自訂端點的模型名稱' };
  const granted = await requestCustomEndpointPermission(endpoint.originPattern);
  if (!granted) return { ok: false, error: formatCustomEndpointTestResult({ kind: 'permission' }).message };
  return { ok: true, settings: { customApiBase: endpoint.base, customModelName } };
}

async function requestCustomEndpointPermission(originPattern) {
  try {
    return await chrome.permissions.request({ origins: [originPattern] });
  } catch {
    return false;
  }
}

function classifyCustomEndpointResponse({ status = 0, ok = false, body = null, modelName = '' } = {}) {
  if (status === 401 || status === 403) return formatCustomEndpointTestResult({ kind: 'auth' });
  if (!ok && status >= 500) return formatCustomEndpointTestResult({ kind: 'server', status });
  if (!ok) return formatCustomEndpointTestResult({ kind: 'incompatible', status });
  const models = Array.isArray(body?.data) ? body.data : null;
  if (!models) return formatCustomEndpointTestResult({ kind: 'incompatible' });
  const found = !modelName || models.some(item => item?.id === modelName);
  return formatCustomEndpointTestResult({ kind: found ? 'ok' : 'model-missing', modelName });
}

function formatCustomEndpointTestResult({ kind, status = 0, modelName = '' }) {
  const messages = {
    network: '連線失敗（網路）：無法連到自訂端點，請檢查網址是否正確、網路是否正常',
    permission: '連線失敗（權限不足）：沒有取得連到這個網域的權限，請在瀏覽器詢問時選擇「允許」',
    auth: '連線失敗（認證失敗）：自訂端點拒絕這把 API Key，請檢查金鑰或帳號權限',
    server: `連線失敗：自訂端點暫時無法回應（HTTP ${status}），請稍後再試`,
    incompatible: status
      ? `連線失敗（回應格式不相容）：端點回應 HTTP ${status}，請確認網址是 OpenAI 相容 API 的根路徑（通常以 /v1 結尾）`
      : '連線失敗（回應格式不相容）：/models 沒有回傳模型清單，請確認這是 OpenAI 相容的 API',
    'model-missing': `已連上自訂端點，但模型清單裡找不到「${modelName}」，請確認模型名稱`,
    ok: `✓ 連線成功！模型：${modelName || '（未填模型名稱）'}`
  };
  const level = kind === 'ok' ? 'ok' : kind === 'model-missing' ? 'info' : 'err';
  return { kind, level, message: messages[kind] };
}

async function testCustomEndpoint() {
  const apiKey = $('customApiKey')?.value.trim() || '';
  const modelName = $('customModelName')?.value.trim() || '';
  let endpoint;
  try {
    endpoint = ModelRegistry.normalizeCustomEndpoint($('customApiBase')?.value);
  } catch (error) {
    showStatus('err', error.message);
    return;
  }
  if (!apiKey) { showStatus('err', '請先輸入自訂端點 API Key'); return; }
  const granted = await requestCustomEndpointPermission(endpoint.originPattern);
  const show = result => showStatus(result.level, result.message);
  if (!granted) { show(formatCustomEndpointTestResult({ kind: 'permission' })); return; }

  showStatus('info', '測試中...');
  const button = $('btnTestCustom');
  if (button) button.disabled = true;
  try {
    let res;
    try {
      res = await fetchWithTimeout(`${endpoint.base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch {
      show(formatCustomEndpointTestResult({ kind: 'network' }));
      return;
    }
    const body = res.ok ? await res.json().catch(() => null) : null;
    show(classifyCustomEndpointResponse({ status: res.status, ok: res.ok, body, modelName }));
  } finally {
    if (button) button.disabled = false;
  }
}

// 不把上游錯誤原文直接回顯到 UI（比照 background.js 的 T3 原則）
function formatConnectionTestError(status, providerLabel) {
  const provider = String(providerLabel || '').trim() || 'AI 服務';
  if (status === 401 || status === 403) return `連線失敗：${provider}驗證失敗，請檢查 API Key 或模型存取權限`;
  if (status === 429) return `連線失敗：${provider}請求過於頻繁或額度已達上限，請稍後再試`;
  if (status >= 500) return `連線失敗：${provider}目前忙碌或暫時不可用（HTTP ${status}）`;
  return `連線失敗：${provider}回應錯誤（HTTP ${status}）`;
}

function buildOpenAICompatTestBody(modelId) {
  return JSON.stringify({ model: modelId, messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
}

// ── 啟動與事件綁定 ────────────────────────────────────
renderModelSelect();
renderPageTranslationModelSelect();
renderDictionaryModelSelect();
renderLanguageSelects();
ctx.navigation.initSettingsTabs();
ctx.navigation.initSettingsSearch();
initFeatureModelHints();
ctx.navigation.initSettingsDirtyTracking();

loadSettings();
ctx.diagnostics.initDiagnosticsPanel();
ctx.vocabulary.initVocabularyBackup();
ctx.actions.initActionEditor();
ctx.glossary.initGlossaryEditor();
ctx.compare.initModelCompare();
ctx.navigation.initFeatureBadges();
ctx.navigation.initSettingsOverview();
ctx.navigation.initOverviewShortcuts();

bindToggleVis('toggleVis',    'apiKey',           'eye-show',      'eye-hide');
bindToggleVis('toggleGroqVis','groqApiKey',        'groq-eye-show', 'groq-eye-hide');
bindToggleVis('toggleOrVis',  'openrouterApiKey',  'or-eye-show',   'or-eye-hide');
bindToggleVis('toggleTtsVis', 'ttsApiKey',         'tts-eye-show',  'tts-eye-hide');
if ($('toggleCustomVis')) bindToggleVis('toggleCustomVis', 'customApiKey', 'custom-eye-show', 'custom-eye-hide');
$('btnTestCustom')?.addEventListener('click', () => testCustomEndpoint());
ctx.backup.bindBackupControls();
ctx.cloud.bindCloudSyncControls();
ctx.cloud.loadCloudWebAuthClientId();
ctx.cloud.renderCloudSyncStatus();

// ── 儲存設定 ─────────────────────────────────────────
$('btnSave').addEventListener('click', async () => {
  const apiKey           = $('apiKey').value.trim();
  const groqApiKey       = $('groqApiKey').value.trim();
  const openrouterApiKey = $('openrouterApiKey').value.trim();
  const model            = $('model').value;
  const pageTranslationValue = $('pageTranslationModel')?.value || '';
  const pageTranslationModel = pageTranslationValue ? ModelRegistry.normalizeModel(pageTranslationValue) : '';
  const dictionaryModel  = $('dictionaryModel')?.value || '';
  const targetLanguage   = ModelRegistry.normalizeLanguage($('targetLanguage')?.value, 'zh-TW');
  const explanationLanguage = ModelRegistry.normalizeExplanationLanguage($('explanationLanguage')?.value, 'target');
  const ttsLanguageMode  = ModelRegistry.normalizeTtsLanguageMode($('ttsLanguageMode')?.value, 'auto');
  const vocabularyHighlightMode = $('vocabularyHighlightMode')?.value === 'auto' ? 'auto' : 'off';
  const customApiKey     = $('customApiKey')?.value.trim() || '';

  // 自訂端點要先做：chrome.permissions.request 必須在使用者點擊後立刻呼叫
  const custom = await prepareCustomEndpointSettings({
    apiBase: $('customApiBase')?.value,
    modelName: $('customModelName')?.value,
    required: ModelRegistry.getProvider(model) === 'custom'
  });
  if (!custom.ok) { showStatus('err', custom.error); return; }

  const glossaryState = ctx.glossary.getGlossaryState();
  const glossaryDraft = glossaryState.loaded ? ctx.glossary.readGlossaryEditor() : null;
  if (glossaryDraft?.errors.length) {
    ctx.navigation.activateSettingsPanel('glossary');
    showStatus('err', `術語表：${glossaryDraft.errors[0]}`);
    return;
  }

  let removedProviderLabel = '';
  {
    const provider = ModelRegistry.getProvider(model);
    const info = ModelRegistry.PROVIDERS[provider];
    const keyValue = { groq: groqApiKey, openrouter: openrouterApiKey, custom: customApiKey }[provider] ?? apiKey;
    if (info.keyless) { /* 無需驗證 */ }
    else if (!keyValue) {
      const savedSecrets = await Storage.getSecrets({});
      if (!savedSecrets[info.apiKeyName]) { /* 主模型仍保留缺金鑰提示 */ }
      else if (ctx.backup.confirmRemoveProviderKey(info.label)) {
        removedProviderLabel = info.label;
      } else {
        showStatus('err', `使用 ${info.label} 模型請輸入 ${info.label} API Key`);
        return;
      }
    } else if (!keyValue.startsWith(info.keyPrefix)) { showStatus('err', `${info.label} API Key 格式不正確，應以 ${info.keyPrefix} 開頭`); return; }
  }

  const obsidianVault         = $('obsidianVault').value.trim();
  const ttsApiKey             = $('ttsApiKey').value.trim();
  const obsidianDefaultFolder = $('obsidianDefaultFolder').value.trim();

  await Promise.all([
    chrome.storage.sync.set({ model, pageTranslationModel, dictionaryModel, targetLanguage, explanationLanguage, ttsLanguageMode, vocabularyHighlightMode, obsidianVault, obsidianDefaultFolder, ...custom.settings }),
    Storage.setSecrets({ apiKey, groqApiKey, openrouterApiKey, customApiKey, ttsApiKey })
  ]);
  try {
    await ctx.actions.saveFeatureActionModels();
  } catch (error) {
    showStatus('err', `各動作的模型沒有存成功：${error.message}`);
    return;
  }
  let glossaryConflict = false;
  if (glossaryDraft && ctx.glossary.isGlossaryDraftChanged(glossaryDraft.glossary)) {
    try {
      const stored = await ctx.glossary.loadStoredGlossary();
      if (JSON.stringify(stored) !== ctx.glossary.getGlossaryState().baseline) glossaryConflict = true;
      else await ctx.glossary.writeGlossary(glossaryDraft.glossary);
    } catch (error) {
      showStatus('err', `術語表沒有存成功：${error.message}`);
      return;
    }
  }
  const savedText = removedProviderLabel ? `✓ 設定已儲存（${removedProviderLabel} API Key 已移除）` : '✓ 設定已儲存';
  ctx.navigation.clearSettingsDirty(glossaryConflict || glossaryState.loadFailed ? ['model', 'language', 'obsidian'] : undefined);
  if (glossaryConflict) {
    showStatus('err', `${savedText}；但術語表已在其他分頁修改，這頁的術語表沒有存。請先複製需要的內容，重新整理頁面後再改`);
  } else if (glossaryState.loadFailed) {
    showStatus('err', `${savedText}；但術語表讀取失敗，術語表沒有儲存，請重新整理頁面再試`);
  } else {
    showStatus('ok', savedText);
  }
});

// ── 測試連線 ─────────────────────────────────────────
$('btnTest').addEventListener('click', async () => {
  const model = $('model').value || ModelRegistry.DEFAULT_MODEL;
  if (ModelRegistry.getProvider(model) === 'custom') return testCustomEndpoint();
  const isGroq = model.startsWith('groq:');
  const isOpenRouter = model.startsWith('openrouter:');
  const P = ModelRegistry.PROVIDERS;

  let apiKey, displayName, providerLabel, fetchUrl, fetchBody, fetchHeaders;

  if (isGroq) {
    apiKey = $('groqApiKey').value.trim();
    providerLabel = P.groq.label;
    displayName = `${ModelRegistry.getModel(model).name} (${P.groq.label})`;
    fetchUrl = `${P.groq.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    fetchBody = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else if (isOpenRouter) {
    apiKey = $('openrouterApiKey').value.trim();
    providerLabel = P.openrouter.label;
    displayName = ModelRegistry.toApiModelId(model);
    fetchUrl = `${P.openrouter.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...P.openrouter.extraHeaders };
    fetchBody = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else {
    apiKey = $('apiKey').value.trim();
    providerLabel = P.gemini.label;
    displayName = model;
    fetchUrl = `${P.gemini.apiBase}/${model}:generateContent`;
    fetchHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
    fetchBody = JSON.stringify({ contents: [{ parts: [{ text: '回覆 OK 即可' }] }], generationConfig: { maxOutputTokens: 10 } });
  }

  if (!apiKey) {
    showStatus('err', `請先輸入 ${providerLabel} API Key`);
    return;
  }

  showStatus('info', '測試中...');
  $('btnTest').disabled = true;

  try {
    let res = await fetchWithTimeout(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
    let fallbackUsed = false;
    if ((isGroq || isOpenRouter) && !res.ok) {
      const err = await res.clone().json().catch(() => ({}));
      const fallbackModelId = ModelRegistry.getFallbackModelId(model);
      if (ModelRegistry.shouldFallbackModel(model, res.status, err.error?.message)) {
        fallbackUsed = true;
        displayName = fallbackModelId;
        fetchBody = buildOpenAICompatTestBody(fallbackModelId);
        res = await fetchWithTimeout(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
      }
    }
    if (res.ok) {
      showStatus('ok', `✓ 連線成功！模型：${displayName}${fallbackUsed ? '（備援）' : ''}`);
    } else {
      showStatus('err', formatConnectionTestError(res.status, providerLabel));
    }
  } catch (e) {
    showStatus('err', e?.name === 'AbortError' ? '連線失敗：請求逾時，請稍後重試' : '網路錯誤：無法連線到 AI 服務');
  } finally {
    $('btnTest').disabled = false;
  }
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showStatus,
    bindToggleVis,
    renderModelSelect,
    renderPageTranslationModelSelect,
    renderDictionaryModelSelect,
    renderFeatureActionModelRows: ctx.actions.renderFeatureActionModelRows,
    updateFeatureModelHints,
    renderOverviewShortcuts: ctx.navigation.renderOverviewShortcuts,
    getFeatureModelGap,
    renderLanguageSelects,
    initSettingsTabs: ctx.navigation.initSettingsTabs,
    activateSettingsPanel: ctx.navigation.activateSettingsPanel,
    settingsPanelTitle: ctx.navigation.settingsPanelTitle,
    showSettingsOverview: ctx.navigation.showSettingsOverview,
    routeSettingsFromHash: ctx.navigation.routeSettingsFromHash,
    buildSettingsOverview: ctx.navigation.buildSettingsOverview,
    renderSettingsOverview: ctx.navigation.renderSettingsOverview,
    markSettingsDirty: ctx.navigation.markSettingsDirty,
    clearSettingsDirty: ctx.navigation.clearSettingsDirty,
    readGlossaryEditor: ctx.glossary.readGlossaryEditor,
    renderCompareModels: ctx.compare.renderCompareModels,
    runModelCompare: ctx.compare.runModelCompare,
    loadGlossaryEditor: ctx.glossary.loadGlossaryEditor,
    importGlossaryCsvFile: ctx.glossary.importGlossaryCsvFile,
    exportGlossaryCsv: ctx.glossary.exportGlossaryCsv,
    searchSettings: ctx.navigation.searchSettings,
    jumpToSettingsSearchResult: ctx.navigation.jumpToSettingsSearchResult,
    markFeatureSeen: ctx.navigation.markFeatureSeen,
    initFeatureBadges: ctx.navigation.initFeatureBadges,
    loadSettings,
    buildSettingsBackupPayload: ctx.backup.buildSettingsBackupPayload,
    encryptBackupSecrets: ctx.backup.encryptBackupSecrets,
    decryptBackupSecrets: ctx.backup.decryptBackupSecrets,
    pickBackupSettings: ctx.backup.pickBackupSettings,
    pickBackupSecrets: ctx.backup.pickBackupSecrets,
    buildSettingsBackupFilename: ctx.backup.buildSettingsBackupFilename,
    parseSettingsBackup: ctx.backup.parseSettingsBackup,
    normalizeImportedSettings: ctx.backup.normalizeImportedSettings,
    importSettingsBackupFile: ctx.backup.importSettingsBackupFile,
    resolveImportedBackupSecrets: ctx.backup.resolveImportedBackupSecrets,
    formatImportSettingsStatus: ctx.backup.formatImportSettingsStatus,
    confirmSecretsExport: ctx.backup.confirmSecretsExport,
    confirmRemoveProviderKey: ctx.backup.confirmRemoveProviderKey,
    prepareCustomEndpointSettings,
    classifyCustomEndpointResponse,
    formatCustomEndpointTestResult,
    testCustomEndpoint,
    confirmCloudUploadOverwrite: ctx.backup.confirmCloudUploadOverwrite,
    confirmCloudDownloadOverwrite: ctx.backup.confirmCloudDownloadOverwrite,
    bindCloudSyncControls: ctx.cloud.bindCloudSyncControls,
    loadCloudWebAuthClientId: ctx.cloud.loadCloudWebAuthClientId,
    buildCloudSettingsPayload: ctx.cloud.buildCloudSettingsPayload,
    renderCloudSyncStatus: ctx.cloud.renderCloudSyncStatus,
    formatCloudSyncTime: ctx.cloud.formatCloudSyncTime,
    renderDiagnostics: ctx.diagnostics.renderDiagnostics,
    renderDiagnosticsSelfCheck: ctx.diagnostics.renderDiagnosticsSelfCheck,
    formatDiagnosticsSummary: ctx.diagnostics.formatDiagnosticsSummary,
    buildDiagnosticsChecklist: ctx.diagnostics.buildDiagnosticsChecklist,
    getVocabularyItemsMap: ctx.vocabulary.getVocabularyItemsMap,
    importVocabularyBackup: ctx.vocabulary.importVocabularyBackup,
    formatVocabularyBackupReminder: ctx.vocabulary.formatVocabularyBackupReminder,
    formatSnapshotLabel: ctx.vocabulary.formatSnapshotLabel,
    renderVocabularySnapshots: ctx.vocabulary.renderVocabularySnapshots,
    restoreVocabularySnapshot: ctx.vocabulary.restoreVocabularySnapshot,
    initActionEditor: ctx.actions.initActionEditor,
    loadActionEditorList: ctx.actions.loadActionEditorList,
    moveAction: ctx.actions.moveAction,
    setActionEnabled: ctx.actions.setActionEnabled,
    openActionEditor: ctx.actions.openActionEditor,
    saveActionFromEditor: ctx.actions.saveActionFromEditor,
    deleteActionFromEditor: ctx.actions.deleteActionFromEditor,
    createBlankCustomAction: ctx.actions.createBlankCustomAction,
    createActionFromBuiltin: ctx.actions.createActionFromBuiltin,
    duplicateCustomAction: ctx.actions.duplicateCustomAction,
    insertActionVariable: ctx.actions.insertActionVariable,
    buildActionAiGuideText: ctx.actions.buildActionAiGuideText,
    copyActionAiGuide: ctx.actions.copyActionAiGuide,
    setActionPreviewWidth: ctx.actions.setActionPreviewWidth
  };
}
