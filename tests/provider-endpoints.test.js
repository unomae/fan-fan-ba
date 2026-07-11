'use strict';

// WS-E T-M3 前置鎖（red-team 條件）：三家 provider 的請求 URL 斷言。
// apiBase 集中到 models.js PROVIDERS 後，endpoint 打錯時這裡是第一道紅燈，
// 也鎖住「無前綴 id＝Gemini」的路由約定（史前遺留 id 依賴它）。

const { handleAIRequest } = require('../background');
const M = require('../models');

const okOpenAI = { ok: true, json: async () => ({ choices: [{ message: { content: 'OK' } }] }) };
const okGemini = { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }) };

describe('provider endpoint URL 斷言', () => {
  beforeEach(() => {
    global.fetch.mockReset();
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.local.get.mockResolvedValue({
      apiKey: 'AIza-dummy', groqApiKey: 'gsk_dummy', openrouterApiKey: 'sk-or-dummy'
    });
  });

  test('groq 模型 → Groq chat/completions', async () => {
    global.fetch.mockResolvedValue(okOpenAI);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: M.DEFAULT_MODEL });
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.groq.apiBase}/chat/completions`);
  });

  test('openrouter 模型 → OpenRouter chat/completions + X-Title header', async () => {
    global.fetch.mockResolvedValue(okOpenAI);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: M.OPENROUTER_PRIMARY_MODEL });
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.openrouter.apiBase}/chat/completions`);
    expect(global.fetch.mock.calls[0][1].headers['X-Title']).toBe('Fan Fan Ba');
  });

  test('gemini 模型 → generativelanguage generateContent', async () => {
    global.fetch.mockResolvedValue(okGemini);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: 'gemini-3.5-flash' });
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.gemini.apiBase}/gemini-3.5-flash:generateContent?key=AIza-dummy`);
  });

  test('遺留 no-prefix id（gemini-2.5-flash）仍走 Gemini 端點（路由約定鎖）', async () => {
    global.fetch.mockResolvedValue(okGemini);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: 'gemini-2.5-flash' });
    expect(global.fetch.mock.calls[0][0]).toContain(`${M.PROVIDERS.gemini.apiBase}/gemini-2.5-flash:generateContent`);
  });
});
