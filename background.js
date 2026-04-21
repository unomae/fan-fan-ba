// background.js — 處理所有 AI API 呼叫（Gemini / Groq / OpenRouter）
// 在 Service Worker 執行，避免 API Key 暴露在前端

'use strict';

const GEMINI_API_BASE     = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_API_BASE       = 'https://api.groq.com/openai/v1';
const OPENROUTER_API_BASE = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL       = 'gemini-3-flash-preview';

// ── 訊息監聽（一次性請求，用於字典模式 + TTS）────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const reply = (data) => {
    if (chrome.runtime.lastError) return;
    sendResponse(data);
  };
  if (request.type === 'GEMINI_REQUEST') {
    handleAIRequest(request)
      .then(reply)
      .catch(err => reply({ error: err.message }));
    return true;
  }
  if (request.type === 'TTS_REQUEST') {
    handleTtsRequest(request)
      .then(reply)
      .catch(err => reply({ error: err.message }));
    return true;
  }
  if (request.type === 'OPEN_OPTIONS') {
    chrome.runtime.openOptionsPage();
    sendResponse({});
  }
});

// ── Port 監聽（長連線 streaming，用於段落翻譯 / 解釋 / 優化）──
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'ai-stream') return;

  port.onMessage.addListener(async (request) => {
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('請求逾時，請稍後重試')), 30000)
    );
    try {
      await Promise.race([
        _streamAIRequest(request, chunk => {
          try { port.postMessage({ chunk }); } catch { /* port 已關閉 */ }
        }),
        timeout
      ]);
      try { port.postMessage({ done: true }); } catch {}
    } catch (err) {
      try { port.postMessage({ error: err.message }); } catch {}
    }
  });
});

// ── 非 streaming：維持原有邏輯（字典 JSON 需要完整回應）──
async function handleAIRequest({ action, selectedText, context, pageTitle }) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('請求逾時，請稍後重試')), 30000)
  );
  return Promise.race([_handleAIRequest({ action, selectedText, context, pageTitle }), timeout]);
}

async function _handleAIRequest({ action, selectedText, context, pageTitle }) {
  const { apiKey = '', groqApiKey = '', openrouterApiKey = '', model = DEFAULT_MODEL } =
    await chrome.storage.sync.get({ apiKey: '', groqApiKey: '', openrouterApiKey: '', model: DEFAULT_MODEL });

  if (model.startsWith('groq:')) {
    if (!groqApiKey) throw new Error('請先在設定頁面輸入 Groq API Key');
    return handleOpenAICompatRequest({
      action, selectedText, context, pageTitle,
      modelId: model.replace('groq:', ''),
      apiKey:  groqApiKey,
      baseUrl: `${GROQ_API_BASE}/chat/completions`,
      label:   'Groq'
    });
  }

  if (model.startsWith('openrouter:')) {
    if (!openrouterApiKey) throw new Error('請先在設定頁面輸入 OpenRouter API Key');
    return handleOpenAICompatRequest({
      action, selectedText, context, pageTitle,
      modelId: model.replace('openrouter:', ''),
      apiKey:  openrouterApiKey,
      baseUrl: `${OPENROUTER_API_BASE}/chat/completions`,
      label:   'OpenRouter',
      extraHeaders: { 'X-Title': 'Fan Fan Ba' }  // HTTP header 僅允許 ASCII
    });
  }

  if (!apiKey) throw new Error('請先在擴充功能設定頁面輸入 Gemini API Key');

  const prompt   = buildPrompt(action, selectedText, context, pageTitle);
  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     action === 'optimize' ? 0.7 : 0.3,
          maxOutputTokens: 1024
        }
      })
    }
  );

  if (!response.ok) {
    if (response.status === 503) throw new Error('伺服器暫時忙碌，請稍後再試');
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `API 錯誤 (HTTP ${response.status})`);
  }

  const data   = await response.json();
  const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!result) throw new Error('AI 無回應，請重試');
  return { result };
}

async function handleOpenAICompatRequest({ action, selectedText, context, pageTitle, modelId, apiKey, baseUrl, label, extraHeaders = {} }) {
  const prompt   = buildPrompt(action, selectedText, context, pageTitle);
  const response = await fetch(baseUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: prompt }],
      temperature: action === 'optimize' ? 0.7 : 0.3,
      max_tokens:  1024
    })
  });

  if (!response.ok) {
    if (response.status === 503) throw new Error(`${label} 伺服器暫時忙碌，請稍後再試`);
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `${label} API 錯誤 (HTTP ${response.status})`);
  }

  const data   = await response.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) throw new Error('AI 無回應，請重試');
  return { result };
}

// ── Streaming 分流 ─────────────────────────────────
async function _streamAIRequest({ action, selectedText, context, pageTitle }, onChunk) {
  const { apiKey = '', groqApiKey = '', openrouterApiKey = '', model = DEFAULT_MODEL } =
    await chrome.storage.sync.get({ apiKey: '', groqApiKey: '', openrouterApiKey: '', model: DEFAULT_MODEL });

  const prompt = buildPrompt(action, selectedText, context, pageTitle);

  if (model.startsWith('groq:')) {
    if (!groqApiKey) throw new Error('請先在設定頁面輸入 Groq API Key');
    return streamOpenAICompat({
      prompt, action,
      modelId:   model.replace('groq:', ''),
      apiKey:    groqApiKey,
      baseUrl:   `${GROQ_API_BASE}/chat/completions`,
      label:     'Groq',
      onChunk
    });
  }

  if (model.startsWith('openrouter:')) {
    if (!openrouterApiKey) throw new Error('請先在設定頁面輸入 OpenRouter API Key');
    return streamOpenAICompat({
      prompt, action,
      modelId:      model.replace('openrouter:', ''),
      apiKey:       openrouterApiKey,
      baseUrl:      `${OPENROUTER_API_BASE}/chat/completions`,
      label:        'OpenRouter',
      extraHeaders: { 'X-Title': 'Fan Fan Ba' },
      onChunk
    });
  }

  if (!apiKey) throw new Error('請先在擴充功能設定頁面輸入 Gemini API Key');
  return streamGemini({ prompt, apiKey, model, action, onChunk });
}

// ── Gemini SSE Streaming（?alt=sse）───────────────
async function streamGemini({ prompt, apiKey, model, action, onChunk }) {
  const response = await fetch(
    `${GEMINI_API_BASE}/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature:     action === 'optimize' ? 0.7 : 0.3,
          maxOutputTokens: 1024
        }
      })
    }
  );

  if (!response.ok) {
    if (response.status === 503) throw new Error('伺服器暫時忙碌，請稍後再試');
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `API 錯誤 (HTTP ${response.status})`);
  }

  await parseSseStream(response.body, line => {
    try {
      const obj  = JSON.parse(line);
      const text = obj.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) onChunk(text);
    } catch { /* 忽略非 JSON 行（如空行）*/ }
  });
}

// ── OpenAI 相容 SSE Streaming（Groq / OpenRouter）─
async function streamOpenAICompat({ prompt, action, modelId, apiKey, baseUrl, label = '', extraHeaders = {}, onChunk }) {
  const response = await fetch(baseUrl, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model:       modelId,
      messages:    [{ role: 'user', content: prompt }],
      temperature: action === 'optimize' ? 0.7 : 0.3,
      max_tokens:  1024,
      stream:      true
    })
  });

  if (!response.ok) {
    if (response.status === 503) throw new Error(`${label} 伺服器暫時忙碌，請稍後再試`);
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `${label} API 錯誤 (HTTP ${response.status})`);
  }

  await parseSseStream(response.body, line => {
    if (line === '[DONE]') return;
    try {
      const obj  = JSON.parse(line);
      const text = obj.choices?.[0]?.delta?.content;
      if (text) onChunk(text);
    } catch { /* 忽略 */ }
  });
}

// ── SSE 通用解析器（Gemini + OpenAI 相容格式共用）─
async function parseSseStream(body, onData) {
  const reader  = body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // 保留最後一段不完整的行

    for (const line of lines) {
      if (line.startsWith('data: ')) onData(line.slice(6).trim());
    }
  }

  // 處理最後剩餘的 buffer
  if (buffer.startsWith('data: ')) onData(buffer.slice(6).trim());
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
  const { ttsApiKey } = await chrome.storage.sync.get('ttsApiKey');
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
    throw new Error(err.error?.message || `TTS 錯誤 (HTTP ${res.status})`);
  }

  const data = await res.json();
  return { audioContent: data.audioContent };
}

// ── Prompt 建構（依文字長度區分策略）──────────────
function buildPrompt(action, selectedText, context, pageTitle) {
  const len    = selectedText.length;
  const isWord = len <= 20;
  const isMid  = len > 20 && len <= 150;

  switch (action) {

    case 'translate':
      if (isWord) {
        return `你是專業多語詞典助手。請針對以下單字或片語提供完整詞典條目，自動判斷輸入語言。

必須嚴格以下方 JSON 格式回覆，不要加任何多餘文字、說明或 markdown：
{
  "word": "原始單字或片語",
  "lang": "該語言的 BCP 47 代碼，如 en / ja / de / fr / ko / es / it / pt",
  "phonetic": "適合該語言的發音標注（英文用 IPA /…/；日文用平假名讀音；韓文用諺文讀音；其他語言用羅馬拼音或當地標音）",
  "pos": "詞性縮寫（adj. / n. / v. / adv. 等，依原語言慣例）",
  "translations": ["繁體中文翻譯1", "翻譯2", "翻譯3"],
  "definition": "一句話的繁體中文釋義",
  "usage": "含義、語感與使用語境的延伸說明（2–3 句，繁體中文）",
  "examples": [
    {"src": "原語言例句1", "zh": "繁體中文翻譯1"},
    {"src": "原語言例句2", "zh": "繁體中文翻譯2"}
  ]
}

網頁標題：${pageTitle}
上下文：${context}
目標單字／片語：「${selectedText}」`;
      }
      return `你是專業翻譯助手，請將以下內容翻譯成繁體中文，保持原文語氣與風格，直接輸出譯文，不加說明。

網頁標題：${pageTitle}
上下文：${context}

待翻譯內容：
「${selectedText}」`;

    case 'explain':
      if (isWord) {
        return `你是知識解說助手，請以繁體中文回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}
目標詞彙：「${selectedText}」

請依序說明：
**詞彙含義：** 這個詞彙本身的意思是什麼（1–2 句）
**在此上下文中：** 在這段內容裡，作者用這個詞想表達什麼（1–2 句）`;
      }
      if (isMid) {
        return `你是知識解說助手，請以繁體中文回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}

目標句子：
「${selectedText}」

請依序說明：
**句意解析：** 這句話的字面意思與結構（1–2 句）
**表達的意義：** 作者想傳達的深層含義或目的（1–2 句）
**總結：** 一句話概括這句話的核心`;
      }
      return `你是知識解說助手，請以繁體中文回覆，格式清晰簡潔。

網頁標題：${pageTitle}
上下文：${context}

目標段落：
「${selectedText}」

請依序說明：
**核心概念：** 這段話圍繞的主要概念或論點（2–3 句）
**重要術語：** 列出關鍵詞彙並簡短解釋（條列式）
**總結：** 一句話概括這段話的核心意旨`;

    case 'optimize':
      if (isWord) {
        return `你是寫作優化助手，請以繁體中文回覆。

目標詞彙：「${selectedText}」
上下文：${context}

請提供 2–3 個更精準或更有力的替換選項，並簡短說明各自適合的使用情境。`;
      }
      return `你是專業寫作助手。請優化以下文字，使其更清晰、流暢且具說服力，保持原意，可調整用字與結構，直接輸出優化後的版本，不加說明。

原始內容：
「${selectedText}」`;

    default:
      throw new Error('未知的操作類型');
  }
}
