// background.js — 處理所有 AI API 呼叫（Gemini / Groq / OpenRouter）
// 在 Service Worker 執行，避免 API Key 暴露在前端

'use strict';

if (typeof importScripts === 'function') {
  if (!globalThis.FanFanBaModels) importScripts('models.js');
  if (!globalThis.FanFanBaStorage) importScripts('storage.js');
}
const ModelRegistry = globalThis.FanFanBaModels || require('./models');
const Storage = globalThis.FanFanBaStorage || require('./storage');

// ── 首次安裝時開啟 Welcome 頁面 ──────────────────────
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

const GEMINI_API_BASE     = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_BASE       = 'https://api.groq.com/openai/v1';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL       = ModelRegistry.DEFAULT_MODEL; // 預設 Groq（免費額度最大方）
const ALLOWED_AI_ACTIONS  = new Set(['translate', 'explain', 'optimize']);
const MAX_SELECTED_TEXT_CHARS = 6000;
const MAX_CONTEXT_CHARS = 4000;
const MAX_PAGE_TITLE_CHARS = 300;
const MAX_TTS_TEXT_CHARS = 160;
const MAX_OBSIDIAN_URIS = 50;
const MAX_OBSIDIAN_URI_CHARS = 4096;
const ALLOWED_MESSAGE_TYPES = new Set(['GEMINI_REQUEST', 'TTS_REQUEST', 'OPEN_OPTIONS', 'OBSIDIAN_URI']);

// ── Exponential Backoff with Full Jitter ──────────
function createAbortError() {
  const err = new Error('AbortError');
  err.name = 'AbortError';
  return err;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(createAbortError());
    }, { once: true });
  }, signal);
}

function jitteredDelay(attempt) {
  return Math.random() * Math.min(8000, 1000 * (2 ** attempt));
}

function isRetryable(err) {
  return err.status === 429 || err.status === 503;
}

async function withRetry(fn, maxAttempts = 3, signal) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (signal?.aborted) throw createAbortError();
      return await fn();
    } catch (err) {
      if (i === maxAttempts - 1 || !isRetryable(err)) throw err;
      await sleep(jitteredDelay(i), signal);
    }
  }
}

// fetch + 狀態碼檢查，回傳 Response 或 throw 帶 status 屬性的 Error
async function checkedFetch(url, options, label = '') {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const rawMessage = body.error?.message || '';
    const err  = new Error(formatApiErrorMessage(res.status, rawMessage, label));
    err.status = res.status;
    err.rawMessage = rawMessage;
    throw err;
  }
  return res;
}

function formatApiErrorMessage(status, rawMessage = '', label = '') {
  const provider = String(label || '').trim() || 'AI 服務';
  const detail = rawMessage ? `（${rawMessage}）` : '';

  if (status === 401 || status === 403) {
    return `${provider}驗證失敗，請檢查 API Key 或模型存取權限${detail}`;
  }
  if (status === 429) {
    return `${provider}請求過於頻繁或額度已達上限，請稍後再試${detail}`;
  }
  if (status === 500) {
    return `${provider}暫時無法處理請求，請稍後重試${detail}`;
  }
  if (status === 502 || status === 503 || status === 504) {
    return `${provider}目前忙碌或暫時不可用，請稍後重試${detail}`;
  }
  return rawMessage || `${provider}API 錯誤 (HTTP ${status})`;
}

// ── 訊息監聽（一次性請求，用於字典模式 + TTS）────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const reply = (data) => {
    if (chrome.runtime.lastError) return;
    sendResponse(data);
  };
  // 訊息 schema 基本檢查：必須是帶已知 type 的物件，否則直接忽略
  if (!request || typeof request !== 'object' || !ALLOWED_MESSAGE_TYPES.has(request.type)) {
    return false;
  }
  if (request.type === 'GEMINI_REQUEST') {
    if (!isTrustedExtensionSender(sender)) {
      reply({ error: '請求來源不正確' });
      return false;
    }
    handleAIRequest(validateAIRequest(request))
      .then(result => { recordAiDiagnostics(request); reply(result); })
      .catch(err => { recordDiagnosticError(); reply({ error: err.message }); });
    return true;
  }
  if (request.type === 'TTS_REQUEST') {
    if (!isTrustedExtensionSender(sender)) {
      reply({ error: '請求來源不正確' });
      return false;
    }
    handleTtsRequest(validateTtsRequest(request))
      .then(reply)
      .catch(err => reply({ error: err.message }));
    return true;
  }
  if (request.type === 'OPEN_OPTIONS') {
    if (!isTrustedExtensionSender(sender)) {
      reply({ error: '請求來源不正確' });
      return false;
    }
    chrome.runtime.openOptionsPage();
    sendResponse({});
  }
  if (request.type === 'OBSIDIAN_URI') {
    if (!isTrustedExtensionSender(sender)) {
      reply({ ok: false, error: '請求來源不正確' });
      return false;
    }
    let urls;
    try {
      urls = validateObsidianUriRequest(request);
    } catch (error) {
      reply({ ok: false, error: error?.message || '無法開啟 Obsidian URI' });
      return false;
    }
    (async () => {
      try {
        // 記錄目前的分頁與視窗，存入後拉回原始分頁
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const originalTabId = activeTab?.id;
        const winId         = activeTab?.windowId;
        await openObsidianUris(urls);
        // 明確切回原始分頁，避免 Chrome 自動切到旁邊的分頁
        if (originalTabId) chrome.tabs.update(originalTabId, { active: true }).catch(() => {});
        if (winId) chrome.windows.update(winId, { focused: true }).catch(() => {});
        reply({ ok: true, count: urls.length });
      } catch (error) {
        reply({ ok: false, error: error?.message || '無法開啟 Obsidian URI' });
      }
    })();
    return true;
  }
});

// 只允許 obsidian:// scheme，並限制數量與長度，避免被當成任意開分頁的跳板
function validateObsidianUriRequest(request = {}) {
  const raw = Array.isArray(request.urls)
    ? request.urls
    : (request.url != null ? [request.url] : []);
  const urls = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_OBSIDIAN_URI_CHARS) throw new Error('Obsidian 連結過長');
    if (!/^obsidian:\/\//i.test(trimmed)) throw new Error('只允許 obsidian:// 連結');
    urls.push(trimmed);
    if (urls.length >= MAX_OBSIDIAN_URIS) break;
  }
  if (!urls.length) throw new Error('沒有可開啟的 Obsidian URI');
  return urls;
}

async function openObsidianUris(urls) {
  if (!urls.length) throw new Error('沒有可開啟的 Obsidian URI');
  const isMac = /Mac/.test(navigator.userAgent);
  const dispatchDelay = isMac ? 3000 : 1800;
  for (const url of urls) {
    // active:true 才能觸發 URI scheme handler
    const newTab = await chrome.tabs.create({ url, active: true });
    await delay(dispatchDelay);
    if (newTab?.id) await chrome.tabs.remove(newTab.id).catch(() => {});
    await delay(250);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Port 監聽（長連線 streaming，用於段落翻譯 / 解釋 / 優化）──
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ai-stream') return;

  port.onMessage.addListener(async (request) => {
    const controller = new AbortController();
    let timedOut = false;
    let completed = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 30000);
    const abortOnDisconnect = () => {
      if (!completed) controller.abort();
    };
    port.onDisconnect.addListener(abortOnDisconnect);

    try {
      if (!isTrustedExtensionSender(port.sender)) throw new Error('請求來源不正確');
      const safeRequest = validateAIRequest(request);
      await _streamAIRequest(
        safeRequest,
        chunk => {
          try { port.postMessage({ requestId: safeRequest.requestId, chunk }); } catch { /* port 已關閉 */ }
        },
        status => {
          try { port.postMessage({ requestId: safeRequest.requestId, status }); } catch { /* port 已關閉 */ }
        },
        controller.signal
      );
      completed = true;
      recordAiDiagnostics(safeRequest);
      try { port.postMessage({ requestId: safeRequest.requestId, done: true }); } catch {}
    } catch (err) {
      if (!(err.name === 'AbortError' || timedOut)) recordDiagnosticError();
      const message = timedOut || err.name === 'AbortError'
        ? '請求逾時或已取消，請稍後重試'
        : err.message;
      try { port.postMessage({ requestId: request.requestId, error: message }); } catch {}
    } finally {
      completed = true;
      clearTimeout(timeoutId);
      port.onDisconnect.removeListener?.(abortOnDisconnect);
    }
  });
});

// 本機診斷：依操作類型累計成功次數（pageTranslation 與一般操作分開計）
function recordAiDiagnostics(request) {
  const kind = request?.pageTranslation ? 'pageTranslation' : request?.action;
  Storage.recordDiagnosticEvent?.(kind)?.catch?.(() => {});
}

function recordDiagnosticError() {
  Storage.recordDiagnosticEvent?.('error')?.catch?.(() => {});
}

function isTrustedExtensionSender(sender = {}) {
  if (!sender || !sender.id) return true;
  return sender.id === chrome.runtime.id;
}

function validateAIRequest(request = {}) {
  if (!ALLOWED_AI_ACTIONS.has(request.action)) throw new Error('未知的操作類型');
  const selectedText = normalizeBoundedString(request.selectedText, MAX_SELECTED_TEXT_CHARS, '選取文字');
  if (!selectedText.trim()) throw new Error('沒有可處理的文字');

  return {
    ...request,
    action: request.action,
    selectedText,
    context: normalizeOptionalBoundedString(request.context, MAX_CONTEXT_CHARS, '上下文'),
    pageTitle: normalizeOptionalBoundedString(request.pageTitle, MAX_PAGE_TITLE_CHARS, '網頁標題'),
    targetLanguage: normalizeOptionalBoundedString(request.targetLanguage, 32, '目標語言'),
    explanationLanguage: normalizeOptionalBoundedString(request.explanationLanguage, 32, '解釋語言'),
    browserLanguage: normalizeOptionalBoundedString(request.browserLanguage, 32, '瀏覽器語言'),
    model: normalizeOptionalBoundedString(request.model, 160, '模型'),
    requestId: normalizeOptionalBoundedString(request.requestId, 80, '請求 ID'),
    pageTranslation: normalizePageTranslationMeta(request.pageTranslation)
  };
}

function validateTtsRequest(request = {}) {
  return {
    ...request,
    text: normalizeBoundedString(request.text, MAX_TTS_TEXT_CHARS, '朗讀文字'),
    lang: normalizeOptionalBoundedString(request.lang, 32, '朗讀語言')
  };
}

function normalizeBoundedString(value, maxChars, label) {
  if (typeof value !== 'string') throw new Error(`${label}格式不正確`);
  if (value.length > maxChars) throw new Error(`${label}過長`);
  return value;
}

function normalizeOptionalBoundedString(value, maxChars, label) {
  if (value == null) return '';
  return normalizeBoundedString(value, maxChars, label);
}

function normalizePageTranslationMeta(value) {
  if (!value) return false;
  if (value === true) return true;
  if (typeof value !== 'object') throw new Error('全文翻譯參數格式不正確');
  return {
    batch: value.batch === true,
    count: Math.max(0, Math.min(20, Number.parseInt(value.count || 0, 10) || 0))
  };
}

// ── 非 streaming：維持原有邏輯（字典 JSON 需要完整回應）──
async function handleAIRequest({ action, selectedText, context, pageTitle, model, targetLanguage, explanationLanguage, browserLanguage, pageTranslation }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    return await _handleAIRequest({ action, selectedText, context, pageTitle, model, targetLanguage, explanationLanguage, browserLanguage, pageTranslation }, controller.signal);
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('請求逾時或已取消，請稍後重試');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function _handleAIRequest({ action, selectedText, context, pageTitle, model: requestedModel, targetLanguage, explanationLanguage, browserLanguage, pageTranslation }, signal) {
  const [{ model = DEFAULT_MODEL }, { apiKey = '', groqApiKey = '', openrouterApiKey = '' }] = await Promise.all([
    chrome.storage.sync.get({ model: DEFAULT_MODEL }),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '' })
  ]);
  const selectedModel = ModelRegistry.normalizeModel(requestedModel || model);

  if (selectedModel.startsWith('groq:')) {
    if (!groqApiKey) throw new Error('請先在設定頁面輸入 Groq API Key');
    return handleOpenAICompatRequest({
      action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage, pageTranslation,
      modelId: ModelRegistry.toApiModelId(selectedModel),
      apiKey:  groqApiKey,
      baseUrl: `${GROQ_API_BASE}/chat/completions`,
      label:   'Groq',
      signal
    });
  }

  if (selectedModel.startsWith('openrouter:')) {
    if (!openrouterApiKey) throw new Error('請先在設定頁面輸入 OpenRouter API Key');
    const modelId = ModelRegistry.toApiModelId(selectedModel);
    return handleOpenRouterRequestWithFallback({
      action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage, pageTranslation,
      modelId,
      apiKey:  openrouterApiKey,
      baseUrl: `${OPENROUTER_API_BASE}/chat/completions`,
      label:   'OpenRouter',
      extraHeaders: { 'X-Title': 'Fan Fan Ba' },  // HTTP header 僅允許 ASCII
      signal
    });
  }

  if (!apiKey) throw new Error('請先在擴充功能設定頁面輸入 Gemini API Key');

  const prompt   = buildPrompt(action, selectedText, context, pageTitle, { targetLanguage, explanationLanguage, browserLanguage, pageTranslation });
  const maxOutputTokens = getPromptMaxOutputTokens(action, pageTranslation);
  const response = await withRetry(() => checkedFetch(
    `${GEMINI_API_BASE}/${selectedModel}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     action === 'optimize' ? 0.7 : 0.3,
          maxOutputTokens
        }
      })
    }
  ), 3, signal);

  const data   = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!result) throw new Error('AI 無回應，請重試');
  return { result };
}

async function handleOpenRouterRequestWithFallback(params) {
  try {
    return await handleOpenAICompatRequest(params);
  } catch (err) {
    if (!ModelRegistry.shouldFallbackOpenRouter(err.status, err.message, params.modelId)) throw err;
    const result = await handleOpenAICompatRequest({
      ...params,
      modelId: ModelRegistry.OPENROUTER_FALLBACK_MODEL_ID
    });
    return {
      ...result,
      notice: 'DeepSeek 免費節點忙碌，已改用 OpenRouter Free 備援。'
    };
  }
}

async function handleOpenAICompatRequest({ action, selectedText, context, pageTitle, targetLanguage, explanationLanguage, browserLanguage, pageTranslation, modelId, apiKey, baseUrl, label, extraHeaders = {}, signal }) {
  const prompt   = buildPrompt(action, selectedText, context, pageTitle, { targetLanguage, explanationLanguage, browserLanguage, pageTranslation });
  const maxOutputTokens = getPromptMaxOutputTokens(action, pageTranslation);
  const response = await withRetry(() => checkedFetch(baseUrl, {
    method:  'POST',
    signal,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: prompt }],
      temperature: action === 'optimize' ? 0.7 : 0.3,
      max_tokens:  maxOutputTokens
    })
  }, `${label} `), 3, signal);

  const data   = await response.json();
  if (data.error) {
    const err = new Error(data.error.message || `${label}API 錯誤`);
    err.status = data.error.code;
    throw err;
  }
  const result = data.choices?.[0]?.message?.content;
  if (!result) throw new Error('AI 無回應，請重試');
  return { result };
}

// ── Streaming 分流 ─────────────────────────────────
async function _streamAIRequest({ action, selectedText, context, pageTitle, model: requestedModel, targetLanguage, explanationLanguage, browserLanguage, pageTranslation }, onChunk, onStatus = () => {}, signal) {
  const [{ model = DEFAULT_MODEL }, { apiKey = '', groqApiKey = '', openrouterApiKey = '' }] = await Promise.all([
    chrome.storage.sync.get({ model: DEFAULT_MODEL }),
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '' })
  ]);
  const selectedModel = ModelRegistry.normalizeModel(requestedModel || model);

  const prompt = buildPrompt(action, selectedText, context, pageTitle, { targetLanguage, explanationLanguage, browserLanguage, pageTranslation });

  if (selectedModel.startsWith('groq:')) {
    if (!groqApiKey) throw new Error('請先在設定頁面輸入 Groq API Key');
    return streamOpenAICompat({
      prompt, action,
      modelId:   ModelRegistry.toApiModelId(selectedModel),
      apiKey:    groqApiKey,
      baseUrl:   `${GROQ_API_BASE}/chat/completions`,
      label:     'Groq',
      pageTranslation,
      onChunk,
      signal
    });
  }

  if (selectedModel.startsWith('openrouter:')) {
    if (!openrouterApiKey) throw new Error('請先在設定頁面輸入 OpenRouter API Key');
    const modelId = ModelRegistry.toApiModelId(selectedModel);
    return streamOpenRouterWithFallback({
      prompt, action,
      modelId,
      apiKey:       openrouterApiKey,
      baseUrl:      `${OPENROUTER_API_BASE}/chat/completions`,
      label:        'OpenRouter',
      extraHeaders: { 'X-Title': 'Fan Fan Ba' },
      pageTranslation,
      onChunk,
      onStatus,
      signal
    });
  }

  if (!apiKey) throw new Error('請先在擴充功能設定頁面輸入 Gemini API Key');
  return streamGemini({ prompt, apiKey, model: selectedModel, action, pageTranslation, onChunk, signal });
}

async function streamOpenRouterWithFallback(params) {
  let streamed = false;
  try {
    return await streamOpenAICompat({
      ...params,
      onChunk: chunk => {
        streamed = true;
        params.onChunk(chunk);
      }
    });
  } catch (err) {
    if (streamed || !ModelRegistry.shouldFallbackOpenRouter(err.status, err.message, params.modelId)) throw err;
    params.onStatus?.('DeepSeek 免費節點忙碌，已改用 OpenRouter Free 備援。');
    return streamOpenAICompat({
      ...params,
      modelId: ModelRegistry.OPENROUTER_FALLBACK_MODEL_ID
    });
  }
}

// ── Gemini SSE Streaming（?alt=sse）───────────────
async function streamGemini({ prompt, apiKey, model, action, pageTranslation, onChunk, signal }) {
  const maxOutputTokens = getPromptMaxOutputTokens(action, pageTranslation);
  const response = await withRetry(() => checkedFetch(
    `${GEMINI_API_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method:  'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     action === 'optimize' ? 0.7 : 0.3,
          maxOutputTokens
        }
      })
    }
  ), 3, signal);

  await parseSseStream(response.body, line => {
    try {
      const obj  = JSON.parse(line);
      const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) onChunk(text);
    } catch { /* 忽略非 JSON 行（如空行）*/ }
  }, signal);
}

// ── OpenAI 相容 SSE Streaming（Groq / OpenRouter）─
async function streamOpenAICompat({ prompt, action, pageTranslation, modelId, apiKey, baseUrl, label = '', extraHeaders = {}, onChunk, signal }) {
  const maxOutputTokens = getPromptMaxOutputTokens(action, pageTranslation);
  const response = await withRetry(() => checkedFetch(baseUrl, {
    method:  'POST',
    signal,
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: prompt }],
      temperature: action === 'optimize' ? 0.7 : 0.3,
      max_tokens:  maxOutputTokens,
      stream:      true
    })
  }, `${label} `), 3, signal);

  await parseSseStream(response.body, line => {
    if (line === '[DONE]') return;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch { return; }
    if (obj.error) {
      const status = Number(obj.error.code || obj.error.status) || 0;
      const err = new Error(status
        ? formatApiErrorMessage(status, obj.error.message, label)
        : (obj.error.message || `${label}串流錯誤`));
      err.status = obj.error.code || obj.error.status;
      throw err;
    }
    const text = obj.choices?.[0]?.delta?.content;
    if (text) onChunk(text);
  }, signal);
}

// ── SSE 通用解析器（Gemini + OpenAI 相容格式共用）─
async function parseSseStream(body, onData, signal) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';
  const cancelReader = () => reader.cancel().catch(() => {});
  signal?.addEventListener('abort', cancelReader, { once: true });

  try {
    while (true) {
      if (signal?.aborted) throw createAbortError();
      const { done, value } = await reader.read();
      if (signal?.aborted) throw createAbortError();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最後一段不完整的行

      for (const line of lines) {
        if (line.startsWith('data: ')) onData(line.slice(6).trim());
      }
    }

    // 處理最後剩餘的 buffer
    if (signal?.aborted) throw createAbortError();
    if (buffer.startsWith('data: ')) onData(buffer.slice(6).trim());
  } finally {
    signal?.removeEventListener?.('abort', cancelReader);
  }
}

// ── Google Cloud TTS（Chirp HD，依語言自動切換語音）──
const CHIRP_VOICE_MAP = {
  en: { lang: 'en-US', name: 'en-US-Chirp-HD-D' },
  ja: { lang: 'ja-JP', name: 'ja-JP-Chirp-HD-D' },
  de: { lang: 'de-DE', name: 'de-DE-Chirp-HD-D' },
  fr: { lang: 'fr-FR', name: 'fr-FR-Chirp-HD-D' },
  ko: { lang: 'ko-KR', name: 'ko-KR-Chirp-HD-D' },
  es: { lang: 'es-US', name: 'es-US-Chirp-HD-D' },
  it: { lang: 'it-IT', name: 'it-IT-Chirp-HD-D' },
  pt: { lang: 'pt-BR', name: 'pt-BR-Chirp-HD-D' },
};

async function handleTtsRequest({ text, lang }) {
  const { ttsApiKey } = await Storage.getSecrets({ ttsApiKey: '' });
  if (!ttsApiKey) return { fallback: true };

  const langCode = (lang || 'en').split('-')[0].toLowerCase();
  const voice    = CHIRP_VOICE_MAP[langCode] || CHIRP_VOICE_MAP['en'];

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ttsApiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input:       { text },
        voice:       { languageCode: voice.lang, name: voice.name },
        audioConfig: { audioEncoding: 'MP3' }
      })
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(formatApiErrorMessage(res.status, err.error?.message, 'Google TTS'));
  }

  const data = await res.json();
  return { audioContent: data.audioContent };
}

// ── Prompt 建構（依文字長度區分策略）──────────────
function getPromptMaxOutputTokens(action, pageTranslation) {
  if (action === 'translate' && pageTranslation?.batch) return 2048;
  return 1024;
}

function buildPrompt(action, selectedText, context, pageTitle, settings = {}) {
  const len    = selectedText.length;
  const isWord = len <= 20 && !settings.pageTranslation;
  const isMid  = len > 20 && len <= 150;
  const targetLanguage = ModelRegistry.getPromptLanguageName(settings.targetLanguage || 'zh-TW', settings.browserLanguage || '');
  const explanationLanguage = ModelRegistry.resolveExplanationLanguage(
    settings.explanationLanguage || 'target',
    settings.targetLanguage || 'zh-TW',
    settings.browserLanguage || ''
  );

  switch (action) {

    case 'translate':
      if (settings.pageTranslation?.batch) {
        return `你是專業翻譯助手，請將下方 JSON 陣列中每個 text 翻譯成${targetLanguage}。
必須嚴格輸出 JSON，不要 markdown，不要加說明。
輸出格式必須是：{"translations":[{"id":1,"translation":"譯文"}]}
id 與輸入相同，順序不要改變，translation 只放譯文正文。
請保留可見格式：標題維持為標題文字，條列項目保留項目符號或編號，不要任意合併段落。

網頁標題：${pageTitle}
上下文 digest：${context}

待翻譯 JSON：
${selectedText}`;
      }
      if (isWord) {
        return `你是專業多語詞典助手。請針對以下單字或片語提供完整詞典條目，自動判斷輸入語言。
所有翻譯、釋義、用法說明、近義詞差異與例句翻譯，請使用：${targetLanguage}。

必須嚴格以下方 JSON 格式回覆，不要加任何多餘文字、說明或 markdown：
{
  "word": "原始單字或片語",
  "lang": "該語言的 BCP 47 代碼，如 en / ja / de / fr / ko / es / it / pt",
  "phonetic": "適合該語言的發音標注（英文用 IPA /…/；日文用平假名讀音；韓文用諺文讀音；其他語言用羅馬拼音或當地標音）",
  "pos": "詞性縮寫（adj. / n. / v. / adv. 等，依原語言慣例）",
  "targetLang": "翻譯與說明使用的 BCP 47 語言代碼",
  "translations": ["${targetLanguage}翻譯1", "翻譯2", "翻譯3"],
  "definition": "一句話的${targetLanguage}釋義",
  "usage": "含義、語感與使用語境的延伸說明（2 句，${targetLanguage}）",
  "synonym": { "word": "最相近的近義詞（原語言）", "diff": "一句話說明兩者差別（${targetLanguage}）" },
  "examples": [
    { "src": "通用例句（不限語境）", "zh": "${targetLanguage}翻譯", "type": "general" },
    { "src": "基於下方網頁語境的原創例句", "zh": "${targetLanguage}翻譯", "type": "context" }
  ]
}

網頁標題：${pageTitle}
上下文：${context}
目標單字／片語：「${selectedText}」`;
      }
      return `你是專業翻譯助手，請將以下內容翻譯成${targetLanguage}，保持原文語氣與風格。
只輸出譯文正文，不要重複原文，不要加入「原文：」「譯文：」「翻譯：」等標籤，也不要加說明。
請保留原文的可見格式：標題仍輸出為標題文字，換行維持換行，條列項目保留每一項的項目符號或編號，段落不要任意合併。
如果待翻譯內容本身是標題、清單項目、編號項目或多行文字，譯文也必須使用相同結構輸出。

網頁標題：${pageTitle}
上下文：${context}

待翻譯內容：
「${selectedText}」`;

    case 'explain':
      if (isWord) {
        return `你是知識解說助手，請以${explanationLanguage}回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}
目標詞彙：「${selectedText}」

請依序輸出以下四點：

**詞彙含義：** 這個詞彙本身的意思是什麼（1 句）
**在此上下文中：** 在這段內容裡的用意（1 句）
**比喻：** 用一個日常生活類比解釋此詞彙（1 句）
**延伸：** {{相關術語1}} {{相關術語2}}`;
      }
      if (isMid) {
        return `你是知識解說助手，請以${explanationLanguage}回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}

目標句子：
「${selectedText}」

請依序輸出以下四點：

**句意解析：** 這句話的字面意思（1 句）
**表達的意義：** 作者想傳達的深層含義（1 句）
**比喻：** 用一個日常生活類比解釋（1 句）
**延伸：** {{相關術語1}} {{相關術語2}}`;
      }
      return `你是知識解說助手，請以${explanationLanguage}回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}

目標段落：
「${selectedText}」

請依序輸出以下四點：

**核心概念：** 這段話圍繞的主要概念（2 句）
**重要術語：** 列出關鍵詞彙並簡短解釋（條列式）
**比喻：** 用一個日常生活類比解釋整段內容（1 句）
**延伸：** {{相關術語1}} {{相關術語2}}`;

    case 'optimize':
      if (isWord) {
        return `你是寫作優化助手，請以${explanationLanguage}回覆。

目標詞彙：「${selectedText}」
上下文：${context}

請提供 2–3 個更精準或更有力的替換選項，並簡短說明各自適合的使用情境。`;
      }
      return `你是專業文案編輯。請優化以下文字，輸出語言必須與原文相同（英文輸入 → 英文輸出；中文輸入 → 中文輸出）。

請嚴格依以下格式輸出（標題完整保留）：

**優化後版本：**
（直接輸出優化後的文字，語言與原文相同，不加引號或說明）

**改動說明：**
（用${explanationLanguage}條列說明調整項目與原因，每點以 - 開頭）

原始內容：
「${selectedText}」`;

    default:
      throw new Error('未知的操作類型');
  }
}

if (typeof module !== 'undefined' && module.exports) { module.exports = { sleep, jitteredDelay, isRetryable, withRetry, checkedFetch, formatApiErrorMessage, validateAIRequest, validateTtsRequest, validateObsidianUriRequest, handleAIRequest, _handleAIRequest, handleOpenAICompatRequest, _streamAIRequest, streamGemini, streamOpenAICompat, parseSseStream, handleTtsRequest, buildPrompt }; }
