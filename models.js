(function initFanFanBaModels(global) {
  'use strict';

  const DEFAULT_MODEL = 'groq:openai/gpt-oss-120b';
  const OPENROUTER_PRIMARY_MODEL = 'openrouter:google/gemma-4-31b-it:free';
  const OPENROUTER_FALLBACK_MODEL_ID = 'openrouter/free';
  // Groq 會定期清掉舊模型（2026-07 Scout、2026-08 llama-3.3/3.1 陸續下架），
  // 主模型 404 時退到同家另一個 production 模型，翻譯不至於整條斷掉
  const GROQ_FALLBACK_MODEL_ID = 'openai/gpt-oss-20b';

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
      fallbackModelId: GROQ_FALLBACK_MODEL_ID,
      name: 'GPT-OSS 120B',
      desc: 'OpenAI 開源 · Groq 極速・免費',
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
      id: 'gemini-3.5-flash-lite',
      provider: 'gemini',
      apiKeyName: 'apiKey',
      name: 'Gemini 3.5 Flash-Lite',
      desc: '輕量極速 · 與 Flash 共用同一把 Key',
      badge: '極速',
      badgeClass: 'badge-fast'
    },
    {
      id: OPENROUTER_PRIMARY_MODEL,
      provider: 'openrouter',
      apiKeyName: 'openrouterApiKey',
      fallbackModelId: OPENROUTER_FALLBACK_MODEL_ID,
      name: 'Gemma 4 31B',
      desc: 'OpenRouter 免費 · Google 多語',
      badge: 'OR',
      badgeClass: 'badge-or'
    }
  ];

  const MODEL_MIGRATIONS = {
    'gemini-3-flash-preview': 'gemini-3.5-flash',
    'gemini-3.1-flash-lite-preview': 'gemini-3.5-flash',
    // Groq 於 2026-07-17 下架 Llama 4 Scout（打舊 id 直接 HTTP 404），
    // 官方建議替代即 gpt-oss-120b；已存 storage 的舊值必須在這裡接住
    'groq:meta-llama/llama-4-scout-17b-16e-instruct': DEFAULT_MODEL,
    'groq:meta-llama/llama-4-maverick-17b-128e-instruct': DEFAULT_MODEL,
    // OpenRouter 已無 DeepSeek 的 :free 變體（只剩付費版），同樣會 404
    'openrouter:deepseek/deepseek-v4-flash:free': OPENROUTER_PRIMARY_MODEL,
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

  // 在冊模型的備援 id（沒設＝該模型不做備援，例如 Gemini 兩家 endpoint 形狀不同）
  function getFallbackModelId(model) {
    return MODELS.find(item => item.id === normalizeModel(model))?.fallbackModelId || '';
  }

  // Groq 與 OpenRouter 共用：免費模型池變動頻繁（2026-07 Groq 下架 Llama 4 Scout、
  // 2026-08 OpenRouter 的 DeepSeek :free 整個消失），主模型掛掉時退到同家備援模型。
  // 404＝模型已下架／改名；baseUrl 是常數，所以 404 只會來自 model id。
  // 401/429 不在此列：key 無效與額度用完必須如實回報，不能被備援蓋掉。
  function shouldFallbackModel(model, status, message) {
    const fallbackModelId = getFallbackModelId(model);
    if (!fallbackModelId) return false;
    // 備援模型自己掛掉不再往下備援。要用「未 normalize 的原值」也比一次：
    // openrouter/free 既是備援 id、又是 MODEL_MIGRATIONS 裡會被遷回主模型的舊 id，
    // 只比 normalize 後的值會讓備援模型被誤判成主模型
    if (model === fallbackModelId || toApiModelId(model) === fallbackModelId) return false;
    const text = (message || '').toLowerCase();
    return status === 404 ||
           status === 502 ||
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
    GROQ_FALLBACK_MODEL_ID,
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
    getFallbackModelId,
    shouldFallbackModel,
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
