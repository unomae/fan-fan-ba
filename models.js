(function initFanFanBaModels(global) {
  'use strict';

  const DEFAULT_MODEL = 'groq:meta-llama/llama-4-scout-17b-16e-instruct';
  const OPENROUTER_PRIMARY_MODEL = 'openrouter:deepseek/deepseek-v4-flash:free';
  const OPENROUTER_FALLBACK_MODEL_ID = 'openrouter/free';

  // provider 級靜態資料的單一事實來源（WS-E M3''）：
  // background 請求路徑、options 測試連線與 key 前綴驗證共用，
  // 消除 URL / label / apiKeyName / key 前綴的多處硬編碼。
  // 注意：Gemini 的實際請求 URL 是動態的（model 在 path、key 在 query、
  // 串流與非串流 endpoint 不同），這裡只共用 base。
  const PROVIDERS = {
    groq: {
      label: 'Groq',
      apiKeyName: 'groqApiKey',
      keyPrefix: 'gsk_',
      apiBase: 'https://api.groq.com/openai/v1'
    },
    openrouter: {
      label: 'OpenRouter',
      apiKeyName: 'openrouterApiKey',
      keyPrefix: 'sk-or-',
      apiBase: 'https://openrouter.ai/api/v1',
      extraHeaders: { 'X-Title': 'Fan Fan Ba' } // HTTP header 僅允許 ASCII
    },
    gemini: {
      label: 'Gemini',
      apiKeyName: 'apiKey',
      keyPrefix: 'AIza',
      apiBase: 'https://generativelanguage.googleapis.com/v1beta/models'
    }
  };

  const MODELS = [
    {
      id: DEFAULT_MODEL,
      provider: 'groq',
      apiKeyName: 'groqApiKey',
      name: 'Llama 4 Scout',
      desc: 'Meta 最新 · Groq 極速・免費',
      badge: 'Groq',
      badgeClass: 'badge-groq'
    },
    {
      id: 'gemini-3.5-flash',
      provider: 'gemini',
      apiKeyName: 'apiKey',
      name: 'Gemini 3.5 Flash',
      desc: '最新穩定版 · 免費額度',
      badge: '快速',
      badgeClass: 'badge-fast'
    },
    {
      id: OPENROUTER_PRIMARY_MODEL,
      provider: 'openrouter',
      apiKeyName: 'openrouterApiKey',
      fallbackModelId: OPENROUTER_FALLBACK_MODEL_ID,
      name: 'DeepSeek V4 Flash',
      desc: 'OpenRouter 免費 · 中文/推理強',
      badge: 'OR',
      badgeClass: 'badge-or'
    }
  ];

  const MODEL_MIGRATIONS = {
    'gemini-3-flash-preview': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite-preview': 'gemini-3.5-flash',
    'openrouter/free': OPENROUTER_PRIMARY_MODEL,
    'openrouter:deepseek/deepseek-chat-v3-0324': OPENROUTER_PRIMARY_MODEL,
    'openrouter:qwen/qwen3-30b-a3b': OPENROUTER_PRIMARY_MODEL,
    'openrouter:mistralai/mistral-small-3.1-24b-instruct': OPENROUTER_PRIMARY_MODEL
  };

  const MODEL_NAME_MAP = MODELS.reduce((acc, model) => {
    acc[model.id] = model.name;
    return acc;
  }, {
    'gemini-2.5-flash': 'Gemini 2.5 Flash'
  });

  const LANGUAGE_OPTIONS = [
    { id: 'browser', name: '跟隨瀏覽器', promptName: '使用者瀏覽器偏好的語言' },
    { id: 'zh-TW', name: '繁體中文', promptName: '繁體中文' },
    { id: 'zh-CN', name: '簡體中文', promptName: '簡體中文' },
    { id: 'en', name: '英文', promptName: 'English' },
    { id: 'ja', name: '日文', promptName: '日本語' },
    { id: 'ko', name: '韓文', promptName: '한국어' },
    { id: 'de', name: '德文', promptName: 'Deutsch' },
    { id: 'fr', name: '法文', promptName: 'Français' },
    { id: 'es', name: '西文', promptName: 'Español' },
    { id: 'pt', name: '葡文', promptName: 'Português' }
  ];

  const EXPLANATION_LANGUAGE_OPTIONS = [
    { id: 'target', name: '跟隨翻譯語言' },
    { id: 'zh-TW', name: '繁體中文' },
    { id: 'en', name: '英文' }
  ];

  const TTS_LANGUAGE_OPTIONS = [
    { id: 'auto', name: '自動偵測' },
    { id: 'target', name: '跟隨翻譯語言' },
    { id: 'source', name: '跟隨原文語言' }
  ];

  function getLanguageOption(language) {
    return LANGUAGE_OPTIONS.find(item => item.id === language);
  }

  function normalizeLanguage(language, fallback = 'zh-TW') {
    const value = language || fallback;
    return getLanguageOption(value) ? value : fallback;
  }

  function normalizeExplanationLanguage(language, fallback = 'target') {
    const value = language || fallback;
    return EXPLANATION_LANGUAGE_OPTIONS.some(item => item.id === value) ? value : fallback;
  }

  function normalizeTtsLanguageMode(mode, fallback = 'auto') {
    const value = mode || fallback;
    return TTS_LANGUAGE_OPTIONS.some(item => item.id === value) ? value : fallback;
  }

  function getPromptLanguageName(language, browserLanguage = '') {
    const normalized = normalizeLanguage(language, language || 'zh-TW');
    if (normalized === 'browser') {
      return browserLanguage || 'the user browser preferred language';
    }
    return getLanguageOption(normalized)?.promptName || normalized;
  }

  function resolveExplanationLanguage(explanationLanguage, targetLanguage, browserLanguage = '') {
    const value = normalizeExplanationLanguage(explanationLanguage);
    if (value === 'target') return getPromptLanguageName(targetLanguage, browserLanguage);
    return getPromptLanguageName(value, browserLanguage);
  }

  function normalizeModel(model) {
    return MODEL_MIGRATIONS[model] || model || DEFAULT_MODEL;
  }

  function getModel(model) {
    const normalized = normalizeModel(model);
    // 未在冊 id（史前遺留如 gemini-2.5-flash）依路由 provider 反查同家條目，
    // 與 getProvider／background 分流的「無前綴＝Gemini」約定同向，
    // 避免「顯示 Groq、實際打 Gemini」的同畫面分裂（WS-E M3''）
    return MODELS.find(item => item.id === normalized)
      || MODELS.find(item => item.provider === getProvider(normalized))
      || MODELS[0];
  }

  function getProvider(model) {
    const normalized = normalizeModel(model);
    if (normalized.startsWith('groq:')) return 'groq';
    if (normalized.startsWith('openrouter:')) return 'openrouter';
    return 'gemini';
  }

  function getModelDisplayName(model) {
    return MODEL_NAME_MAP[normalizeModel(model)] || model || MODEL_NAME_MAP[DEFAULT_MODEL];
  }

  function toApiModelId(model) {
    const normalized = normalizeModel(model);
    if (normalized.startsWith('groq:')) return normalized.slice('groq:'.length);
    if (normalized.startsWith('openrouter:')) return normalized.slice('openrouter:'.length);
    return normalized;
  }

  function shouldFallbackOpenRouter(status, message, modelId) {
    if (modelId !== toApiModelId(OPENROUTER_PRIMARY_MODEL)) return false;
    const text = (message || '').toLowerCase();
    return status === 502 ||
           status === 503 ||
           text.includes('provider') ||
           text.includes('no available model provider') ||
           text.includes('down');
  }

  function stableHash(value) {
    const input = String(value || '');
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
      hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function buildCacheKey({ action, text, model, targetLanguage = 'zh-TW', explanationLanguage = 'target', context = '', pageTitle = '' }) {
    return [
      normalizeModel(model),
      normalizeLanguage(targetLanguage, 'zh-TW'),
      normalizeExplanationLanguage(explanationLanguage, 'target'),
      action || 'unknown',
      stableHash(text),
      stableHash(context),
      stableHash(pageTitle)
    ].join(':');
  }

  const registry = {
    DEFAULT_MODEL,
    OPENROUTER_PRIMARY_MODEL,
    OPENROUTER_FALLBACK_MODEL_ID,
    PROVIDERS,
    MODELS,
    MODEL_MIGRATIONS,
    MODEL_NAME_MAP,
    LANGUAGE_OPTIONS,
    EXPLANATION_LANGUAGE_OPTIONS,
    TTS_LANGUAGE_OPTIONS,
    normalizeModel,
    getModel,
    getProvider,
    getModelDisplayName,
    toApiModelId,
    shouldFallbackOpenRouter,
    stableHash,
    buildCacheKey,
    getLanguageOption,
    normalizeLanguage,
    normalizeExplanationLanguage,
    normalizeTtsLanguageMode,
    getPromptLanguageName,
    resolveExplanationLanguage
  };

  global.FanFanBaModels = registry;
  if (typeof module !== 'undefined' && module.exports) module.exports = registry;
})(typeof globalThis !== 'undefined' ? globalThis : window);
