// custom-actions.js — 動作清單的資料模型：內建翻譯／解釋／優化與使用者自訂動作共用同一份清單。
// background（送出前驗證、組 prompt）、設定頁與 content 之後都會用到，所以做成共用模組。
(function initFanFanBaCustomActions(global) {
  'use strict';

  const ModelRegistry = global.FanFanBaModels
    || (typeof require === 'function' ? require('./models') : null);

  const STORAGE_KEY = 'actionList'; // chrome.storage.local
  const MAX_CUSTOM_ACTIONS = 20;
  const MAX_FIELDS = 8;
  const MAX_PROMPT_CHARS = 4000;
  const MAX_NAME_CHARS = 40;
  const MAX_FIELD_LABEL_CHARS = 40;
  const MAX_FIELD_DESCRIPTION_CHARS = 200;
  const LAYOUTS = ['fields', 'annotate', 'compare'];
  const SAVE_TARGETS = ['none', 'obsidian'];
  const CUSTOM_ID_PATTERN = /^custom-[a-z0-9-]{1,40}$/;
  const FIELD_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
  const ICON_PATTERN = /^[a-z0-9-]{0,32}$/;

  // 內建動作的 prompt 由 background 的 buildPrompt 產生，不存在清單裡；
  // 清單只記使用者能調的部分（啟用、釘選、排序、模型）
  const BUILTIN_ACTIONS = [
    { id: 'translate', name: '翻譯', icon: 'translate' },
    { id: 'explain', name: '解釋', icon: 'explain' },
    { id: 'optimize', name: '優化', icon: 'optimize' }
  ];
  const BUILTIN_IDS = BUILTIN_ACTIONS.map(action => action.id);

  // 可用變數。網頁來源的四個在組 prompt 時會包進防注入框；targetLanguage 來自設定
  const VARIABLES = ['selection', 'context', 'pageTitle', 'pageUrl', 'targetLanguage'];
  const WEB_VARIABLES = ['selection', 'context', 'pageTitle', 'pageUrl'];
  // 系統提示只允許設定來源的變數，網頁內容不進系統提示
  const SYSTEM_VARIABLES = ['targetLanguage'];
  const PLACEHOLDER_PATTERN = /\{\{([^{}]*)\}\}/g;

  function fail(message) {
    throw new Error(message);
  }

  function readString(value, maxChars, label, { required = false } = {}) {
    if (value == null) value = '';
    if (typeof value !== 'string') fail(`${label}格式不正確`);
    if (value.length > maxChars) fail(`${label}過長（上限 ${maxChars} 字）`);
    if (required && !value.trim()) fail(`${label}不可空白`);
    return value;
  }

  function readBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function readOrder(value, fallback) {
    return Number.isInteger(value) && value >= 0 && value <= 999 ? value : fallback;
  }

  function normalizeActionModel(value) {
    if (value == null || value === '' || value === 'default') return 'default';
    if (typeof value !== 'string') fail('模型格式不正確');
    const model = ModelRegistry?.MODELS?.find(item => item.id === value);
    if (!model) fail('不支援的模型');
    if (model.pageTranslationOnly) fail('此模型只能用於全文翻譯');
    return model.id;
  }

  // 回傳範本裡所有 {{…}} 的變數名（原樣，不修剪）
  function listPlaceholders(template) {
    return Array.from(String(template).matchAll(PLACEHOLDER_PATTERN), match => match[1]);
  }

  function assertPlaceholders(template, allowed, label) {
    for (const name of listPlaceholders(template)) {
      if (!allowed.includes(name)) {
        fail(`${label}含有不支援的變數 {{${name}}}，可用：${allowed.map(item => `{{${item}}}`).join('、')}`);
      }
    }
  }

  function validateFields(fields) {
    if (!Array.isArray(fields) || fields.length === 0) fail('至少要有 1 個輸出欄位');
    if (fields.length > MAX_FIELDS) fail(`輸出欄位最多 ${MAX_FIELDS} 個`);
    const seen = new Set();
    return fields.map((field, index) => {
      if (!field || typeof field !== 'object') fail(`第 ${index + 1} 個欄位格式不正確`);
      const key = readString(field.key, 32, '欄位代號', { required: true });
      if (!FIELD_KEY_PATTERN.test(key)) fail(`欄位代號「${key}」只能用英文字母開頭，接英數或底線`);
      if (seen.has(key)) fail(`欄位代號「${key}」重複`);
      seen.add(key);
      return {
        key,
        label: readString(field.label, MAX_FIELD_LABEL_CHARS, '欄位名稱', { required: true }),
        description: readString(field.description, MAX_FIELD_DESCRIPTION_CHARS, '欄位說明')
      };
    });
  }

  // 單一自訂動作的完整驗證；送出請求與存檔前都走這裡。不合法直接丟錯。
  function validateCustomAction(action) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('自訂動作格式不正確');
    if (action.builtin === true) fail('內建動作不能當自訂動作送出');
    const id = readString(action.id, 60, '動作代號', { required: true });
    if (!CUSTOM_ID_PATTERN.test(id)) fail('動作代號格式不正確');
    const icon = readString(action.icon, 32, '圖示');
    if (!ICON_PATTERN.test(icon)) fail('圖示格式不正確');
    const systemPrompt = readString(action.systemPrompt, MAX_PROMPT_CHARS, '系統提示');
    const userPrompt = readString(action.userPrompt, MAX_PROMPT_CHARS, '使用者提示', { required: true });
    assertPlaceholders(systemPrompt, SYSTEM_VARIABLES, '系統提示');
    assertPlaceholders(userPrompt, VARIABLES, '使用者提示');
    const layout = action.layout == null ? 'fields' : action.layout;
    if (!LAYOUTS.includes(layout)) fail('版面格式不正確');
    const saveTo = action.saveTo == null ? 'none' : action.saveTo;
    if (!SAVE_TARGETS.includes(saveTo)) fail('存檔目的地格式不正確');

    return {
      id,
      name: readString(action.name, MAX_NAME_CHARS, '動作名稱', { required: true }).trim(),
      icon,
      builtin: false,
      enabled: readBoolean(action.enabled, true),
      pinned: readBoolean(action.pinned, false),
      order: readOrder(action.order, 0),
      model: normalizeActionModel(action.model),
      systemPrompt,
      userPrompt,
      fields: validateFields(action.fields),
      layout,
      saveTo
    };
  }

  function buildBuiltinEntry(definition, stored = {}, index) {
    let model = 'default';
    try { model = normalizeActionModel(stored.model); } catch { /* 舊資料不合法就回預設 */ }
    return {
      id: definition.id,
      name: definition.name,
      icon: definition.icon,
      builtin: true,
      enabled: readBoolean(stored.enabled, true),
      pinned: readBoolean(stored.pinned, true),
      order: readOrder(stored.order, index),
      model
    };
  }

  function sortByOrder(list) {
    // 同 order 時維持原本相對位置（Array.prototype.sort 是穩定排序）
    return list.slice().sort((a, b) => a.order - b.order);
  }

  // 讀取用：容錯。內建三個一定在（刪不掉），內建的 prompt／名稱一律取程式定義；
  // 不合法或超過上限的自訂動作丟掉，不讓一筆壞資料拖垮整份清單。
  function normalizeActionList(stored) {
    const entries = Array.isArray(stored) ? stored : [];
    const storedBuiltins = new Map();
    const customs = [];
    const seenIds = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      if (BUILTIN_IDS.includes(entry.id)) {
        if (!storedBuiltins.has(entry.id)) storedBuiltins.set(entry.id, entry);
        continue;
      }
      if (customs.length >= MAX_CUSTOM_ACTIONS || seenIds.has(entry.id)) continue;
      try {
        customs.push(validateCustomAction(entry));
        seenIds.add(entry.id);
      } catch { /* 略過壞資料 */ }
    }
    const builtins = BUILTIN_ACTIONS.map((definition, index) =>
      buildBuiltinEntry(definition, storedBuiltins.get(definition.id), index));
    return sortByOrder([...builtins, ...customs]);
  }

  // 存檔用：嚴格。任何一筆不合法、代號重複或超過上限都整份拒絕，並回報原因。
  function validateActionList(list) {
    if (!Array.isArray(list)) fail('動作清單格式不正確');
    const customs = list.filter(entry => !BUILTIN_IDS.includes(entry?.id));
    if (customs.length > MAX_CUSTOM_ACTIONS) fail(`自訂動作最多 ${MAX_CUSTOM_ACTIONS} 個`);
    const ids = new Set();
    for (const entry of list) {
      if (ids.has(entry?.id)) fail(`動作代號「${entry?.id}」重複`);
      ids.add(entry?.id);
    }
    const storedBuiltins = new Map(list.filter(entry => BUILTIN_IDS.includes(entry?.id)).map(entry => [entry.id, entry]));
    const builtins = BUILTIN_ACTIONS.map((definition, index) => {
      const stored = storedBuiltins.get(definition.id) || {};
      normalizeActionModel(stored.model);
      return buildBuiltinEntry(definition, stored, index);
    });
    return sortByOrder([...builtins, ...customs.map(validateCustomAction)]);
  }

  async function loadActionList() {
    const data = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
    return normalizeActionList(data[STORAGE_KEY]);
  }

  // 內建動作只存使用者可調的欄位，prompt 等內容不落地
  function toStoredEntry(entry) {
    if (!entry.builtin) return entry;
    const { id, enabled, pinned, order, model } = entry;
    return { id, builtin: true, enabled, pinned, order, model };
  }

  async function saveActionList(list) {
    const validated = validateActionList(list);
    await chrome.storage.local.set({ [STORAGE_KEY]: validated.map(toStoredEntry) });
    return validated;
  }

  // 單次替換：值裡就算出現 {{context}} 之類字樣也不會再被展開
  function renderTemplate(template, values) {
    return String(template).replace(PLACEHOLDER_PATTERN, (whole, name) =>
      (Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole));
  }

  function stripCodeFence(text) {
    const match = /^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/.exec(text);
    return match ? match[1].trim() : text;
  }

  function parseJsonObject(text) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch {
      return null;
    }
  }

  // 模型輸出 → 只取宣告過的欄位。格式不符時回傳 ok:false 與原始文字，
  // 讓卡片可以顯示原文加「格式不符」。
  function parseCustomActionOutput(text, fields) {
    const raw = typeof text === 'string' ? text : '';
    const trimmed = stripCodeFence(raw.trim());
    let object = parseJsonObject(trimmed);
    if (!object) {
      // 模型有時會在 JSON 前後多講一句話：退一步取第一個 { 到最後一個 }
      const start = trimmed.indexOf('{');
      const end = trimmed.lastIndexOf('}');
      if (start !== -1 && end > start) object = parseJsonObject(trimmed.slice(start, end + 1));
    }
    const keys = (Array.isArray(fields) ? fields : []).map(field => field.key);
    const found = object ? keys.filter(key => Object.prototype.hasOwnProperty.call(object, key)) : [];
    if (!object || found.length === 0) return { ok: false, error: '格式不符', raw };
    const data = {};
    for (const key of keys) data[key] = Object.prototype.hasOwnProperty.call(object, key) ? object[key] : '';
    return { ok: true, data };
  }

  // 字典與全文翻譯不是動作清單裡的動作，用獨立的一般設定；長度規則與 background 的字典判斷一致
  const DICTIONARY_MAX_CHARS = 20;

  // 這次請求的「功能模型」：回傳模型 id，'' 表示跟隨主模型。
  // 完整優先序是 卡內單次覆寫 > 這裡的功能模型 > 主模型；單次覆寫由呼叫端放在最前面。
  // 存的值過期或不合法時一律當成跟隨主模型，不讓舊設定擋住請求。
  function resolveFeatureModel({ action, customAction = null, selectedText = '' } = {}, { actionList = null, dictionaryModel = '' } = {}) {
    const safeModel = value => {
      let model = 'default';
      try { model = normalizeActionModel(value); } catch { /* 不合法就跟隨主模型 */ }
      return model === 'default' ? '' : model;
    };
    if (action === 'custom') return safeModel(customAction?.model);
    if (action === 'translate' && String(selectedText).length <= DICTIONARY_MAX_CHARS) return safeModel(dictionaryModel);
    const entry = Array.isArray(actionList) ? actionList.find(item => item?.builtin && item.id === action) : null;
    return safeModel(entry?.model);
  }

  const api = {
    STORAGE_KEY,
    DICTIONARY_MAX_CHARS,
    MAX_CUSTOM_ACTIONS,
    MAX_FIELDS,
    MAX_PROMPT_CHARS,
    LAYOUTS,
    SAVE_TARGETS,
    BUILTIN_ACTIONS,
    BUILTIN_IDS,
    VARIABLES,
    WEB_VARIABLES,
    SYSTEM_VARIABLES,
    listPlaceholders,
    validateCustomAction,
    normalizeActionList,
    validateActionList,
    loadActionList,
    saveActionList,
    renderTemplate,
    parseCustomActionOutput,
    resolveFeatureModel
  };

  global.FanFanBaCustomActions = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
