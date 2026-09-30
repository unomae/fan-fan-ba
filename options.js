// options.js — 設定頁邏輯：儲存 / 載入 API Key、測試連線

'use strict';

const $ = id => document.getElementById(id);
const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');
const CloudSync = globalThis.FanFanBaCloudSync || require('./cloud-sync');
const VocabBackup = globalThis.FanFanBaVocabularyBackup || require('./vocabulary-backup');
const CustomActions = globalThis.FanFanBaCustomActions || require('./custom-actions');
// 設定頁與 content 共用 DOM helper 與自訂動作版面（瀏覽器端由 <script> 掛在全域）
const Dom = typeof globalThis.ffbEl === 'function' ? globalThis : require('./content/dom');
const ActionRender = typeof globalThis.buildCustomActionContent === 'function'
  ? globalThis
  : require('./content/custom-action-render');
const SETTINGS_BACKUP_APP = 'fan-fan-ba';
const SETTINGS_BACKUP_SCHEMA_VERSION = 1;
const SECRET_BACKUP_CRYPTO_VERSION = 1;
const SECRET_BACKUP_KDF_ITERATIONS = 210000;
const SYNC_SETTING_KEYS = [
  'model',
  'pageTranslationModel',
  'dictionaryModel',
  'targetLanguage',
  'explanationLanguage',
  'ttsLanguageMode',
  'vocabularyHighlightMode',
  'obsidianVault',
  'obsidianDefaultFolder',
  // 自訂端點的網址與模型名稱不是機密，跟著備份與雲端同步；金鑰 customApiKey 另存本機
  'customApiBase',
  'customModelName'
];
const DIAGNOSTICS_SETTING_KEYS = [
  'model',
  'pageTranslationModel',
  'targetLanguage',
  'vocabularyHighlightMode'
];
// A1''' 補償控制（最小版）：mirror-only 後 storage.local 是單一副本，
// 損毀即全滅。這裡只做「上次備份多久前」的 staleness 提醒，推使用者定期
// JSON 匯出（完整可還原）。跨裝置 Drive 備份留待另一張 KAKA 決策工單。
// 常數必須宣告在下方 initVocabularyBackup() 之前，否則 async 的
// renderVocabularyBackupStaleness() 會在 TDZ 讀到它而炸掉（QA-P2-002）。
const LAST_VOCAB_BACKUP_KEY = 'lastVocabularyBackupAt';
const VOCAB_BACKUP_STALE_DAYS = 30;
// provider 顯示名／key 欄位名／前綴統一取自 ModelRegistry.PROVIDERS（WS-E M3''）

renderModelSelect();
renderPageTranslationModelSelect();
renderDictionaryModelSelect();
renderLanguageSelects();
initSettingsTabs();
initFeatureModelHints();

loadSettings();
initDiagnosticsPanel();
initVocabularyBackup();
initActionEditor();

// ── 單字本備份 / 還原（Phase B）──────────────────────
function initVocabularyBackup() {
  $('btnExportVocabulary')?.addEventListener('click', exportVocabularyBackup);
  $('btnExportVocabularyCsv')?.addEventListener('click', exportVocabularyCsv);
  const fileInput = $('vocabularyImportFile');
  $('btnImportVocabulary')?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', importVocabularyBackup);
  renderVocabularyBackupStaleness();
  renderVocabularySnapshots();
}

// ── 本機自動快照還原（red-team F3）─────────────────────
// 快照本身在 vocabulary-store.js 自動輪替；這裡只給讀取與還原入口。
// **一律走 mergeBackup 合併、絕不 replace**：快照是過去狀態，replace 會把快照
// 之後新增的單字砍掉。合併方向由 mergeEntry 的時鐘決定，所以現有較新的複習進度
// 不會被快照回滾（見 vocabulary-backup.js mergeClock）。
function formatSnapshotLabel({ slot, savedAt, count }) {
  const when = Date.parse(savedAt || '') ? new Date(savedAt).toLocaleString() : '時間未知';
  const which = slot === 'prev' ? '較舊' : '最近';
  return `還原${which}快照（${when}・${count} 個單字）`;
}

async function renderVocabularySnapshots() {
  const container = $('vocabularySnapshotActions');
  const note = $('vocabularySnapshotNote');
  if (!container) return;
  let snapshots = [];
  try {
    const response = await requestVocabularyStore('snapshots');
    snapshots = Array.isArray(response.snapshots) ? response.snapshots : [];
  } catch {
    snapshots = []; // 讀不到就當沒有快照可還原，不吵使用者
  }
  container.textContent = '';
  snapshots.forEach(snapshot => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-test';
    button.textContent = formatSnapshotLabel(snapshot);
    button.addEventListener('click', () => restoreVocabularySnapshot(snapshot.slot));
    container.appendChild(button);
  });
  container.hidden = snapshots.length === 0;
  if (note) note.hidden = snapshots.length === 0;
}

async function restoreVocabularySnapshot(slot) {
  try {
    const { snapshot } = await requestVocabularyStore('snapshot', { slot });
    const incoming = VocabBackup.normalizeItemsMap(snapshot?.items || {});
    if (!Object.keys(incoming).length) {
      setVocabularyBackupStatus('這份快照沒有可還原的單字。');
      await renderVocabularySnapshots();
      return;
    }
    // 與匯入同一條路：existing 讀取失敗必須中止（空集會讓 mergeBackup 退化成 replace）
    const existing = await getVocabularyItemsMap();
    const { items, summary } = VocabBackup.mergeBackup(existing, incoming, 'merge');
    // 還原不備份前態：不然這一下就把好快照擠到 prev、壞狀態寫進 current（red-team F4）
    await replaceVocabularyItemsMap(items, { snapshot: false });
    setVocabularyBackupStatus(`已從快照還原：補回 ${summary.added}、更新 ${summary.updated}，目前共 ${summary.total} 個單字。`);
    await renderVocabularySnapshots();
  } catch (error) {
    setVocabularyBackupStatus(`還原失敗：${error?.message || '請再試一次'}`);
  }
}

async function renderVocabularyBackupStaleness() {
  const el = $('vocabularyBackupReminder');
  if (!el) return;
  const { [LAST_VOCAB_BACKUP_KEY]: last } = await chrome.storage.local.get(LAST_VOCAB_BACKUP_KEY);
  el.textContent = formatVocabularyBackupReminder(last);
}

function formatVocabularyBackupReminder(lastIso) {
  const last = Date.parse(lastIso || '');
  if (!last) return '尚未匯出過單字本備份，建議定期匯出 JSON 以免資料遺失。';
  const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  const when = days <= 0 ? '今天' : `${days} 天前`;
  const tail = days >= VOCAB_BACKUP_STALE_DAYS ? '（已超過 30 天，建議重新匯出）' : '';
  return `上次備份：${when}${tail}`;
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
    // 只在 JSON 匯出（完整可還原）成功後蓋章；CSV 是 lossy 不算備份
    await chrome.storage.local.set({ [LAST_VOCAB_BACKUP_KEY]: new Date().toISOString() });
    renderVocabularyBackupStaleness();
    setVocabularyBackupStatus(`已匯出 ${backup.count} 個單字。`);
  } catch {
    setVocabularyBackupStatus('匯出失敗，請再試一次。');
  }
}

// 檢視用的單向匯出（2026-09-13 由 XLSX 換成 CSV）。刻意不在這裡蓋
// 「已備份」的章——那只屬於 JSON 匯出，CSV 是 lossy 的，不能還原。
async function exportVocabularyCsv() {
  try {
    const items = await getVocabularyItemsMap();
    const normalized = VocabBackup.normalizeItemsMap(items);
    const count = Object.keys(normalized).length;
    if (!count) { setVocabularyBackupStatus('單字本是空的，沒有可匯出的單字。'); return; }
    const csv = VocabBackup.buildVocabularyCsv(normalized);
    const blob = new Blob([csv], { type: VocabBackup.CSV_MIME_TYPE });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fan-fan-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setVocabularyBackupStatus(`已匯出 ${count} 個單字成 CSV。`);
  } catch {
    setVocabularyBackupStatus('CSV 匯出失敗，請再試一次。');
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

// snapshot=false 只給還原用：還原是非破壞性的合併，備份它的前態沒有價值，
// 卻會佔掉一個救援槽（red-team F4）。匯入維持預設 true——匯入會帶進外部資料，
// 前態值得留一份。
async function replaceVocabularyItemsMap(items, { snapshot = true } = {}) {
  await requestVocabularyStore('replaceAll', { items, snapshot });
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
  // 無儲存紀錄時預設 Groq（免費額度最大方）
  const currentModel = ModelRegistry.normalizeModel(model);
  setModelSelectValue($('model'), currentModel);
  // 沒存過（或存成空字串）＝跟隨主模型
  if ($('pageTranslationModel')) setModelSelectValue($('pageTranslationModel'), pageTranslationModel ? ModelRegistry.normalizeModel(pageTranslationModel) : '');
  if ($('dictionaryModel')) setModelSelectValue($('dictionaryModel'), dictionaryModel || '');
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
  updateFeatureModelHints();
}

function renderModelSelect() {
  const select = $('model');
  if (!select || select.tagName !== 'SELECT') return;

  const providerLabels = {
    groq: 'Groq（需 Groq API Key）',
    gemini: 'Gemini（需 Gemini API Key）',
    openrouter: 'OpenRouter（需 OpenRouter API Key）',
    custom: '自訂端點（需在下方填寫網址、模型與金鑰）'
  };

  // pageTranslationOnly 的模型（瀏覽器內建）刻意不進主選單：它給不出詞典要的結構化 JSON，
  // 讓人選得到只會換來必定失敗的操作。它只出現在下方的頁面翻譯專用選單。
  select.innerHTML = ['groq', 'gemini', 'openrouter', 'custom'].map(provider => {
    const options = ModelRegistry.MODELS
      .filter(model => model.provider === provider && !model.pageTranslationOnly)
      .map(model => `<option value="${model.id}">${model.name}（${model.desc}）</option>`)
      .join('');
    return `<optgroup label="${providerLabels[provider]}">${options}</optgroup>`;
  }).join('');
}

function renderPageTranslationModelSelect() {
  const select = $('pageTranslationModel');
  if (!select || select.tagName !== 'SELECT') return;

  select.innerHTML = '<option value="">跟隨主模型</option>' + ModelRegistry.MODELS
    .map(model => `<option value="${model.id}">${model.name}（${model.desc}）</option>`)
    .join('');
}

// ── 各功能使用的模型 ─────────────────────────────────
// 字典與各動作可選的模型：不含只做全文翻譯的模型（給不出結構化 JSON）
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

// 動作清單的每個動作一列；值寫在動作的 model 欄位，按「儲存設定」才寫回
function renderFeatureActionModelRows() {
  const body = $('featureActionModelRows');
  if (!body) return;
  // 清單被別處改動而重畫時，保留使用者在表上還沒存的選擇
  const unsaved = new Map(readUnsavedActionModels());
  Dom.ffbClear(body).append(...actionListState.map(action => {
    const id = `featureModel-${action.id}`;
    const savedModel = action.model || 'default';
    const select = Dom.ffbEl('select', { id, dataset: { featureModel: '', actionId: action.id, savedModel } }, buildFeatureModelOptions('default'));
    setModelSelectValue(select, unsaved.get(action.id) || savedModel);
    return Dom.ffbEl('tr', null, [
      Dom.ffbEl('th', { scope: 'row' }, Dom.ffbEl('label', { for: id }, action.builtin ? action.name : `自訂：${action.name}`)),
      Dom.ffbEl('td', null, select)
    ]);
  }));
  updateFeatureModelHints();
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

// 每個功能下拉選到缺金鑰的模型時，就地顯示提示與「前往填寫」
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
}

function initFeatureModelHints() {
  document.addEventListener('change', event => {
    if (event.target?.matches?.('select[data-feature-model]')) updateFeatureModelHints();
  });
  ['apiKey', 'groqApiKey', 'openrouterApiKey', 'customApiKey', 'customApiBase', 'customModelName'].forEach(id => {
    $(id)?.addEventListener('input', updateFeatureModelHints);
  });
}

// 表上改過、還沒存的動作模型：[[動作 id, 模型], …]
function readUnsavedActionModels() {
  return [...document.querySelectorAll('select[data-action-id]')]
    .filter(select => (select.value || 'default') !== select.dataset.savedModel)
    .map(select => [select.dataset.actionId, select.value || 'default']);
}

// 按「儲存設定」時把表上改過的動作模型寫回動作清單；沒有變動就不寫。
// 先重讀 storage 裡最新的清單，只改這幾個動作的 model，不蓋掉別的分頁剛改的釘選或順序
async function saveFeatureActionModels() {
  const changed = new Map(readUnsavedActionModels());
  if (!changed.size) return;
  const latest = await CustomActions.loadActionList();
  actionListState = await CustomActions.saveActionList(latest.map(action => (
    changed.has(action.id) ? { ...action, model: changed.get(action.id) } : action
  )));
  renderActionList();
}

// 網頁「⋯」選單或其他設定分頁改了動作清單：換上最新清單，之後的排序、啟用、存檔才不會拿舊資料蓋回去。
// 內容跟手上一樣（多半是這頁自己剛存的）就不重畫，以免打斷鍵盤焦點
function initActionListSync() {
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !changes[CustomActions.STORAGE_KEY]) return;
    const next = CustomActions.normalizeActionList(changes[CustomActions.STORAGE_KEY].newValue);
    if (JSON.stringify(next) === JSON.stringify(CustomActions.normalizeActionList(actionListState))) return;
    actionListState = next;
    renderActionList();
  });
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
if ($('toggleCustomVis')) bindToggleVis('toggleCustomVis', 'customApiKey', 'custom-eye-show', 'custom-eye-hide');
$('btnTestCustom')?.addEventListener('click', () => testCustomEndpoint());
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
  const pageTranslationValue = $('pageTranslationModel')?.value || '';
  const pageTranslationModel = pageTranslationValue ? ModelRegistry.normalizeModel(pageTranslationValue) : '';
  const dictionaryModel  = $('dictionaryModel')?.value || '';
  const targetLanguage   = ModelRegistry.normalizeLanguage($('targetLanguage')?.value, 'zh-TW');
  const explanationLanguage = ModelRegistry.normalizeExplanationLanguage($('explanationLanguage')?.value, 'target');
  const ttsLanguageMode  = ModelRegistry.normalizeTtsLanguageMode($('ttsLanguageMode')?.value, 'auto');
  const vocabularyHighlightMode = $('vocabularyHighlightMode')?.value === 'auto' ? 'auto' : 'off';
  const customApiKey     = $('customApiKey')?.value.trim() || '';

  // 自訂端點要先做：chrome.permissions.request 必須在使用者點擊後立刻呼叫，
  // 前面若先 await 別的東西或跳 confirm，瀏覽器可能判定不是使用者操作而拒絕
  const custom = await prepareCustomEndpointSettings({
    apiBase: $('customApiBase')?.value,
    modelName: $('customModelName')?.value,
    required: ModelRegistry.getProvider(model) === 'custom'
  });
  if (!custom.ok) { showStatus('err', custom.error); return; }

  // 依選擇的模型驗證對應 API Key（前綴與顯示名來源：ModelRegistry.PROVIDERS）
  let removedProviderLabel = '';
  {
    const provider = ModelRegistry.getProvider(model);
    const info = ModelRegistry.PROVIDERS[provider];
    const keyValue = { groq: groqApiKey, openrouter: openrouterApiKey, custom: customApiKey }[provider] ?? apiKey;
    // keyless provider（瀏覽器內建）沒有 key，跳過整段驗證；否則會拿別家的空欄位去問「要不要移除金鑰」
    if (info.keyless) { /* 無需驗證 */ }
    else if (!keyValue) {
      if (confirmRemoveProviderKey(info.label)) {
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
    await saveFeatureActionModels();
  } catch (error) {
    showStatus('err', `各動作的模型沒有存成功：${error.message}`);
    return;
  }
  showStatus('ok', removedProviderLabel ? `✓ 設定已儲存（${removedProviderLabel} API Key 已移除）` : '✓ 設定已儲存');
});

// ── 測試連線 ─────────────────────────────────────────
$('btnTest').addEventListener('click', async () => {
  const model        = $('model').value || ModelRegistry.DEFAULT_MODEL;
  if (ModelRegistry.getProvider(model) === 'custom') return testCustomEndpoint();
  const isGroq       = model.startsWith('groq:');
  const isOpenRouter = model.startsWith('openrouter:');
  const P            = ModelRegistry.PROVIDERS; // URL / 顯示名單一來源（WS-E M3''）

  let apiKey, displayName, fetchUrl, fetchBody, fetchHeaders;

  if (isGroq) {
    apiKey      = $('groqApiKey').value.trim();
    displayName = `${ModelRegistry.getModel(model).name} (${P.groq.label})`;
    fetchUrl    = `${P.groq.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    fetchBody    = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else if (isOpenRouter) {
    apiKey      = $('openrouterApiKey').value.trim();
    displayName = ModelRegistry.toApiModelId(model);
    fetchUrl    = `${P.openrouter.apiBase}/chat/completions`;
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, ...P.openrouter.extraHeaders };
    fetchBody    = buildOpenAICompatTestBody(ModelRegistry.toApiModelId(model));
  } else {
    apiKey      = $('apiKey').value.trim();
    displayName = model;
    fetchUrl    = `${P.gemini.apiBase}/${model}:generateContent`;
    fetchHeaders = { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
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
    // Groq／OpenRouter 共用：主模型被下架時測試連線也要試備援，
    // 否則會出現「測試連線失敗、實際翻譯卻正常」的分裂結果
    if ((isGroq || isOpenRouter) && !res.ok) {
      const err = await res.clone().json().catch(() => ({}));
      const fallbackModelId = ModelRegistry.getFallbackModelId(model);
      if (ModelRegistry.shouldFallbackModel(model, res.status, err.error?.message)) {
        fallbackUsed = true;
        displayName = fallbackModelId;
        fetchBody = buildOpenAICompatTestBody(fallbackModelId);
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

// ── 自訂 OpenAI 相容端點 ─────────────────────────────
// 儲存前的檢查與網域授權。網址留空＝不使用自訂端點（主模型選它時才必填）；
// 有填就只收 https，並只請求這一個網域的存取權，使用者拒絕就整個不儲存
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
  } catch (error) {
    return false;
  }
}

// 測試連線打 {base}/models。上游錯誤訊息不顯示給使用者（同 background 的 formatApiErrorMessage 原則）
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
  // 權限請求要在使用者點擊後立刻做，所以排在任何 await 之前
  const granted = await requestCustomEndpointPermission(endpoint.originPattern);
  const show = result => showStatus(result.level, result.message);
  if (!granted) { show(formatCustomEndpointTestResult({ kind: 'permission' })); return; }

  showStatus('info', '測試中...');
  const button = $('btnTestCustom');
  if (button) button.disabled = true;
  try {
    let res;
    try {
      res = await fetch(`${endpoint.base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (error) {
      show(formatCustomEndpointTestResult({ kind: 'network' }));
      return;
    }
    const body = res.ok ? await res.json().catch(() => null) : null;
    show(classifyCustomEndpointResponse({ status: res.status, ok: res.ok, body, modelName }));
  } finally {
    if (button) button.disabled = false;
  }
}

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

  // 動作清單只進本機設定檔、不進雲端同步（雲端 payload 只取 settings）；沒存過就不帶這個鍵
  const { [CustomActions.STORAGE_KEY]: storedActions } = await chrome.storage.local.get({ [CustomActions.STORAGE_KEY]: [] });
  if (Array.isArray(storedActions) && storedActions.length) payload.actions = storedActions;

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
  const hasActions = Array.isArray(payload.actions);

  if (!Object.keys(settings).length && !Object.keys(secrets).length && !hasActions) {
    throw new Error('設定檔沒有可匯入的設定');
  }

  const writes = [];
  if (Object.keys(settings).length) writes.push(chrome.storage.sync.set(settings));
  if (Object.keys(secrets).length) writes.push(Storage.setSecrets(secrets));
  // 動作清單整份取代：讀取端容錯（壞掉的自訂動作略過），再走嚴格存檔
  let actions = null;
  if (hasActions) writes.push(CustomActions.saveActionList(CustomActions.normalizeActionList(payload.actions)).then(list => { actions = list; }));
  await Promise.all(writes);
  await loadSettings();
  const result = { settingsCount: Object.keys(settings).length, secretsCount: Object.keys(secrets).length };
  if (actions) {
    result.actionsCount = actions.filter(action => !action.builtin).length;
    actionListState = actions;
    renderActionList();
  }
  return result;
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
  if (key === 'customApiBase') {
    try {
      return ModelRegistry.normalizeCustomEndpoint(value).base;
    } catch (error) {
      return '';
    }
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

function formatImportSettingsStatus({ settingsCount = 0, secretsCount = 0, actionsCount = null } = {}) {
  const parts = [];
  if (settingsCount) parts.push(`${settingsCount} 個設定`);
  if (secretsCount) parts.push(`${secretsCount} 個 API Key`);
  if (actionsCount !== null) parts.push(`動作清單（${actionsCount} 個自訂動作）`);
  return `✓ 設定檔已匯入${parts.length ? `：${parts.join('、')}` : ''}`;
}

function confirmSecretsExport() {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
  return window.confirm('API Keys 會用你輸入的密碼加密後匯出。請記住密碼，忘記後無法還原。確定要匯出嗎？');
}

function confirmRemoveProviderKey(label) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
  return window.confirm(`${label} API Key 欄位目前是空的。要移除已儲存的 ${label} API Key 嗎？移除後翻譯功能會要求重新設定金鑰。`);
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


// ── 自訂動作：清單、編輯器與預覽 ──────────────────────
// 資料模型與驗證都在 custom-actions.js；這裡只負責畫面。預覽用範例資料，不發任何網路請求。

const ACTION_LAYOUT_NOTES = {
  fields: '每個欄位一段，依序顯示欄位名與內容。',
  annotate: '第一個欄位要回傳陣列：[{ "text": 原文片段, "type": 類型, "note": 說明 }]，片段會標在原文上。',
  compare: '欄位代號用 before／after／notes；沒有 before 時以選取原文當修改前。'
};

// 內建動作的範本：prompt 是另外寫的簡化版，不是內建動作的原始 prompt
const BUILTIN_ACTION_TEMPLATES = {
  translate: {
    name: '翻譯（自訂）', icon: 'globe', layout: 'fields',
    userPrompt: '請把下面的文字翻成{{targetLanguage}}，語氣自然。\n\n{{selection}}',
    fields: [{ key: 'translation', label: '譯文', description: '' }]
  },
  explain: {
    name: '解釋（自訂）', icon: 'bulb', layout: 'fields',
    userPrompt: '用{{targetLanguage}}解釋下面這段文字的意思與重點，必要時參考上下文。\n\n文字：{{selection}}\n\n上下文：{{context}}',
    fields: [
      { key: 'meaning', label: '意思', description: '' },
      { key: 'points', label: '重點', description: '條列' }
    ]
  },
  analyze: {
    name: '長難句分析（自訂）', icon: 'list', layout: 'annotate',
    systemPrompt: '說明一律使用{{targetLanguage}}。',
    userPrompt: '分析下面這段文字的句子結構：把主詞、動詞、受詞、子句、修飾語、連接詞標出來，片段要逐字取自原文，並附上整段譯文。\n\n{{selection}}',
    fields: [
      { key: 'marks', label: '句子成分', description: '陣列：text 取自原文，type 用 subject／predicate／object／clause／modifier／connector' },
      { key: 'translation', label: '譯文', description: '' }
    ]
  },
  optimize: {
    name: '優化（自訂）', icon: 'pen', layout: 'compare',
    userPrompt: '把下面的文字改得更通順自然，保留原意，並說明改了什麼。\n\n{{selection}}',
    fields: [
      { key: 'after', label: '修改後', description: '' },
      { key: 'notes', label: '說明', description: '' }
    ]
  }
};

let actionListState = [];
let actionEditorState = null; // { action, isNew }

function initActionEditor() {
  if (!$('actionList') || !$('actionEditor')) return undefined;
  renderActionIconPicker();
  renderActionVarButtons();
  renderActionModelSelect();

  $('btnNewAction').addEventListener('click', () => openActionEditor(createBlankCustomAction(), { isNew: true }));
  $('btnCopyAiGuide').addEventListener('click', copyActionAiGuide);
  $('btnAddActionField').addEventListener('click', () => {
    const fields = readActionFieldRows();
    if (fields.length >= CustomActions.MAX_FIELDS) {
      setActionEditorError(`輸出欄位最多 ${CustomActions.MAX_FIELDS} 個`);
      return;
    }
    renderActionFieldRows([...fields, { key: '', label: '', description: '' }]);
    $('actionFields').querySelector('.action-field-row:last-child input')?.focus();
    renderActionPreview();
  });
  $('actionEditor').addEventListener('submit', event => {
    event.preventDefault();
    saveActionFromEditor();
  });
  $('actionEditor').addEventListener('input', renderActionPreview);
  $('actionEditor').addEventListener('change', renderActionPreview);
  $('actionEditor').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeActionEditor(); }
  });
  $('btnCancelAction').addEventListener('click', closeActionEditor);
  $('btnDeleteAction').addEventListener('click', deleteActionFromEditor);
  document.querySelectorAll('[data-preview-width]').forEach(button => {
    button.addEventListener('click', () => setActionPreviewWidth(Number(button.dataset.previewWidth)));
  });

  initActionListSync();
  return loadActionEditorList();
}

async function loadActionEditorList() {
  actionListState = await CustomActions.loadActionList();
  renderActionList();
  return actionListState;
}

function setActionListStatus(message, isError = false) {
  const el = $('actionListStatus');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#b3261e' : '';
}

function renderActionList() {
  const list = $('actionList');
  if (!list) return;
  const last = actionListState.length - 1;
  Dom.ffbClear(list).append(...actionListState.map((action, index) => {
    const moveButton = (delta, text) => Dom.ffbEl('button', {
      class: 'btn-test', type: 'button', 'aria-label': `${text}：${action.name}`,
      disabled: (delta < 0 && index === 0) || (delta > 0 && index === last)
    }, delta < 0 ? '↑' : '↓');
    const up = moveButton(-1, '上移');
    const down = moveButton(1, '下移');
    up.addEventListener('click', () => moveAction(action.id, -1));
    down.addEventListener('click', () => moveAction(action.id, 1));

    const enabled = Dom.ffbEl('input', { type: 'checkbox', 'aria-label': `啟用：${action.name}` });
    enabled.checked = action.enabled;
    enabled.addEventListener('change', () => setActionEnabled(action.id, enabled.checked));

    const buttons = action.builtin
      ? [Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'template' } }, '以此為範本')]
      : [
        Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'edit' } }, '編輯'),
        Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'duplicate' } }, '複製')
      ];
    buttons.forEach(button => button.addEventListener('click', () => {
      const act = button.dataset.act;
      if (act === 'edit') openActionEditor(action, { isNew: false });
      else if (act === 'duplicate') openActionEditor(duplicateCustomAction(action), { isNew: true });
      else openActionEditor(createActionFromBuiltin(action.id), { isNew: true });
    }));

    return Dom.ffbEl('li', { class: `action-row${action.enabled ? '' : ' is-disabled'}`, dataset: { id: action.id } }, [
      enabled,
      Dom.ffbEl('span', { class: 'action-row-name' }, [
        ActionRender.buildCustomActionIcon(action.builtin ? builtinIconName(action.id) : action.icon, 16),
        Dom.ffbEl('span', null, action.name),
        action.builtin && Dom.ffbEl('span', { class: 'action-badge' }, '內建')
      ]),
      up, down, ...buttons
    ]);
  }));
  renderFeatureActionModelRows();
}

function builtinIconName(id) {
  return { translate: 'globe', explain: 'bulb', optimize: 'pen', analyze: 'list' }[id] || ActionRender.getDefaultCustomActionIcon();
}

// 存檔一律走 saveActionList（嚴格驗證）；失敗時畫面維持原狀並顯示原因
async function persistActionList(list, message) {
  try {
    actionListState = await CustomActions.saveActionList(list);
    renderActionList();
    setActionListStatus(message);
    return true;
  } catch (error) {
    setActionListStatus(`儲存失敗：${error.message}`, true);
    renderActionList();
    return false;
  }
}

function reorderActions(list) {
  return list.map((action, index) => ({ ...action, order: index }));
}

async function moveAction(id, delta) {
  const index = actionListState.findIndex(action => action.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= actionListState.length) return false;
  const list = actionListState.slice();
  [list[index], list[target]] = [list[target], list[index]];
  const moved = await persistActionList(reorderActions(list), '✓ 已調整順序');
  // 重畫後把焦點放回同一個動作的同方向按鈕，鍵盤可以連按
  if (moved) {
    const row = [...$('actionList').querySelectorAll('.action-row')].find(item => item.dataset.id === id);
    const buttons = row ? [...row.querySelectorAll('button')].slice(0, 2) : [];
    const preferred = buttons[delta < 0 ? 0 : 1];
    (preferred && !preferred.disabled ? preferred : buttons[delta < 0 ? 1 : 0])?.focus();
  }
  return moved;
}

function setActionEnabled(id, enabled) {
  const list = actionListState.map(action => (action.id === id ? { ...action, enabled } : action));
  return persistActionList(list, enabled ? '✓ 已啟用' : '✓ 已停用');
}

function generateCustomActionId() {
  const random = Math.random().toString(36).slice(2, 8);
  return `custom-${Date.now().toString(36)}-${random}`;
}

function nextActionOrder() {
  return Math.min(999, actionListState.reduce((max, action) => Math.max(max, action.order), -1) + 1);
}

function createBlankCustomAction() {
  return {
    id: generateCustomActionId(), name: '新動作', icon: ActionRender.getDefaultCustomActionIcon(),
    builtin: false, enabled: true, pinned: false, order: nextActionOrder(), model: 'default',
    systemPrompt: '', userPrompt: '{{selection}}',
    fields: [{ key: 'result', label: '結果', description: '' }],
    layout: 'fields', saveTo: 'none'
  };
}

function createActionFromBuiltin(builtinId) {
  const template = BUILTIN_ACTION_TEMPLATES[builtinId];
  return {
    ...createBlankCustomAction(),
    ...template,
    fields: template.fields.map(field => ({ ...field }))
  };
}

function duplicateCustomAction(action) {
  return {
    ...action,
    id: generateCustomActionId(),
    name: `${action.name}（副本）`.slice(0, 40),
    pinned: false,
    order: nextActionOrder(),
    fields: action.fields.map(field => ({ ...field }))
  };
}

function renderActionIconPicker() {
  const picker = $('actionIconPicker');
  const legend = picker.querySelector('legend');
  Dom.ffbClear(picker).append(legend, ...ActionRender.listCustomActionIcons().map(({ name, label }) => {
    const input = Dom.ffbEl('input', { type: 'radio', name: 'actionIcon', value: name });
    return Dom.ffbEl('label', { class: 'action-icon-option' }, [input, ActionRender.buildCustomActionIcon(name, 16), label]);
  }));
}

function renderActionVarButtons() {
  Dom.ffbClear($('actionVarButtons')).append(...CustomActions.VARIABLES.map(name => {
    const button = Dom.ffbEl('button', { class: 'btn-test', type: 'button', 'aria-label': `插入變數 ${name}` }, `{{${name}}}`);
    button.addEventListener('click', () => insertActionVariable(name));
    return button;
  }));
}

function renderActionModelSelect() {
  const models = ModelRegistry.MODELS.filter(model => !model.pageTranslationOnly);
  Dom.ffbClear($('actionModel')).append(
    Dom.ffbEl('option', { value: 'default' }, '跟隨主模型'),
    ...models.map(model => Dom.ffbEl('option', { value: model.id }, model.name || model.id))
  );
}

// 插在游標位置，插完游標停在變數後面
function insertActionVariable(name) {
  const textarea = $('actionUserPrompt');
  const token = `{{${name}}}`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
  textarea.focus();
  textarea.setSelectionRange(start + token.length, start + token.length);
  renderActionPreview();
}

function renderActionFieldRows(fields) {
  Dom.ffbClear($('actionFields')).append(...fields.map((field, index) => {
    const input = (className, value, label, maxlength, placeholder) => {
      const el = Dom.ffbEl('input', {
        type: 'text', class: className, 'aria-label': `第 ${index + 1} 個欄位的${label}`,
        maxlength, placeholder, autocomplete: 'off', spellcheck: 'false'
      });
      el.value = value || '';
      return el;
    };
    const remove = Dom.ffbEl('button', { class: 'btn-test', type: 'button', 'aria-label': `刪除第 ${index + 1} 個欄位` }, '刪除');
    remove.addEventListener('click', () => {
      const rows = readActionFieldRows();
      rows.splice(index, 1);
      renderActionFieldRows(rows);
      renderActionPreview();
    });
    return Dom.ffbEl('div', { class: 'action-field-row' }, [
      input('action-field-key', field.key, '代號', 32, '代號，如 summary'),
      input('action-field-label', field.label, '名稱', 40, '名稱'),
      input('action-field-description', field.description, '說明', 200, '說明（選填，會寫進 prompt）'),
      remove
    ]);
  }));
}

function readActionFieldRows() {
  return [...$('actionFields').querySelectorAll('.action-field-row')].map(row => ({
    key: row.querySelector('.action-field-key').value.trim(),
    label: row.querySelector('.action-field-label').value.trim(),
    description: row.querySelector('.action-field-description').value.trim()
  }));
}

function openActionEditor(action, { isNew }) {
  actionEditorState = { action, isNew };
  $('actionEditorTitle').textContent = isNew ? '新增自訂動作' : `編輯：${action.name}`;
  $('actionName').value = action.name;
  $('actionModel').value = action.model || 'default';
  const icons = [...$('actionIconPicker').querySelectorAll('input[name="actionIcon"]')];
  (icons.find(input => input.value === action.icon)
    || icons.find(input => input.value === ActionRender.getDefaultCustomActionIcon())).checked = true;
  $('actionSystemPrompt').value = action.systemPrompt || '';
  $('actionUserPrompt').value = action.userPrompt || '';
  $('actionLayout').value = action.layout || 'fields';
  $('actionSaveTo').value = action.saveTo || 'none';
  $('btnDeleteAction').hidden = isNew;
  renderActionFieldRows(action.fields || []);
  setActionEditorError('');
  $('actionEditor').hidden = false;
  renderActionPreview();
  $('actionName').focus();
}

function closeActionEditor() {
  actionEditorState = null;
  $('actionEditor').hidden = true;
  setActionEditorError('');
  $('btnNewAction')?.focus();
}

function setActionEditorError(message) {
  const el = $('actionEditorError');
  if (el) el.textContent = message;
}

function readActionEditorDraft() {
  const base = actionEditorState?.action || createBlankCustomAction();
  return {
    ...base,
    name: $('actionName').value.trim(),
    icon: $('actionIconPicker').querySelector('input[name="actionIcon"]:checked')?.value || ActionRender.getDefaultCustomActionIcon(),
    model: $('actionModel').value || 'default',
    systemPrompt: $('actionSystemPrompt').value,
    userPrompt: $('actionUserPrompt').value,
    fields: readActionFieldRows(),
    layout: $('actionLayout').value,
    saveTo: $('actionSaveTo').value
  };
}

async function saveActionFromEditor() {
  if (!actionEditorState) return false;
  let action;
  try {
    action = CustomActions.validateCustomAction(readActionEditorDraft());
  } catch (error) {
    setActionEditorError(error.message);
    return false;
  }
  const exists = actionListState.some(item => item.id === action.id);
  const list = exists
    ? actionListState.map(item => (item.id === action.id ? action : item))
    : [...actionListState, action];
  const saved = await persistActionList(list, `✓ 已儲存「${action.name}」`);
  if (!saved) {
    setActionEditorError($('actionListStatus').textContent);
    return false;
  }
  closeActionEditor();
  return true;
}

async function deleteActionFromEditor() {
  if (!actionEditorState || actionEditorState.isNew) return false;
  const { action } = actionEditorState;
  if (!window.confirm(`確定刪除「${action.name}」？刪除後無法復原。`)) return false;
  const saved = await persistActionList(
    reorderActions(actionListState.filter(item => item.id !== action.id)),
    `✓ 已刪除「${action.name}」`
  );
  if (saved) closeActionEditor();
  return saved;
}

// 預覽只用範例資料渲染所選版面；欄位還沒填好時只畫填好的那幾個
function renderActionPreview() {
  const preview = $('actionPreview');
  if (!preview || !actionEditorState) return;
  const draft = readActionEditorDraft();
  $('actionLayoutNote').textContent = ACTION_LAYOUT_NOTES[draft.layout] || '';
  const fields = draft.fields.filter(field => field.key && field.label);
  if (!fields.length) {
    Dom.ffbClear(preview).append(Dom.ffbEl('p', { class: 'field-note' }, '至少填一個欄位的代號與名稱，這裡會顯示預覽。'));
    return;
  }
  const action = { ...draft, fields };
  const sample = ActionRender.buildCustomActionSample(action);
  Dom.ffbClear(preview).append(
    Dom.ffbEl('div', { class: 'action-preview-tag' }, [ActionRender.buildCustomActionIcon(draft.icon, 13), ` ${draft.name || '未命名動作'}`]),
    ActionRender.buildCustomActionContent(action, sample.data, { selectedText: sample.selectedText })
  );
}

function setActionPreviewWidth(width) {
  const value = width === 500 ? 500 : 320;
  $('actionPreview').style.width = `${value}px`;
  document.querySelectorAll('[data-preview-width]').forEach(button => {
    button.setAttribute('aria-pressed', Number(button.dataset.previewWidth) === value ? 'true' : 'false');
  });
}

function buildActionAiGuideText() {
  return [
    '請幫我設計一個「翻翻吧」瀏覽器擴充功能的自訂動作。使用方式：在網頁上選取文字後執行這個動作，模型會回傳 JSON，擴充功能再依版面顯示。',
    '',
    '請依下面格式回覆，讓我逐欄貼進設定頁：',
    '- 名稱：最多 40 字',
    '- 系統提示（選填）：最多 4000 字，只能用變數 {{targetLanguage}}',
    `- 使用者提示：最多 4000 字，可用變數 ${CustomActions.VARIABLES.map(name => `{{${name}}}`).join('、')}`,
    '  （{{selection}} 是選取文字、{{context}} 是鄰近段落、{{pageTitle}} 是頁面標題、{{targetLanguage}} 是目標語言；{{pageUrl}} 目前一律是空白）',
    `- 輸出欄位：最多 ${CustomActions.MAX_FIELDS} 個，每個有「代號」（英文字母開頭，只能用英數與底線）、「名稱」、「說明」`,
    '- 版面三選一：',
    '  - 欄位卡：每個欄位一段',
    '  - 原文標註：第一個欄位回傳 [{ "text": 原文片段, "type": 類型, "note": 說明 }]，片段必須和原文一字不差',
    '  - 前後對照：欄位代號用 before／after／notes',
    '',
    '不需要在 prompt 裡要求輸出 JSON，擴充功能會自動加上格式要求。中文請用台灣慣用語。',
    '',
    '我想做的動作：'
  ].join('\n');
}

async function copyActionAiGuide() {
  try {
    await navigator.clipboard.writeText(buildActionAiGuideText());
    setActionListStatus('✓ 說明文字已複製，貼到任何 AI 並補上你想做的動作');
  } catch {
    setActionListStatus('複製失敗，請確認瀏覽器允許剪貼簿', true);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showStatus,
    bindToggleVis,
    renderModelSelect,
    renderPageTranslationModelSelect,
    renderDictionaryModelSelect,
    renderFeatureActionModelRows,
    updateFeatureModelHints,
    getFeatureModelGap,
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
    confirmRemoveProviderKey,
    prepareCustomEndpointSettings,
    classifyCustomEndpointResponse,
    formatCustomEndpointTestResult,
    testCustomEndpoint,
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
    getVocabularyItemsMap,
    importVocabularyBackup,
    formatVocabularyBackupReminder,
    formatSnapshotLabel,
    renderVocabularySnapshots,
    restoreVocabularySnapshot,
    initActionEditor,
    loadActionEditorList,
    moveAction,
    setActionEnabled,
    openActionEditor,
    saveActionFromEditor,
    deleteActionFromEditor,
    createBlankCustomAction,
    createActionFromBuiltin,
    duplicateCustomAction,
    insertActionVariable,
    buildActionAiGuideText,
    copyActionAiGuide,
    setActionPreviewWidth
  };
}
