'use strict';

// WS-E T-M3 前置鎖（red-team 條件）：三家 provider 的請求 URL 斷言。
// apiBase 集中到 models.js PROVIDERS 後，endpoint 打錯時這裡是第一道紅燈，
// 也鎖住「無前綴 id＝Gemini」的路由約定（史前遺留 id 依賴它）。

const { handleAIRequest, _streamAIRequest, resolveRoute } = require('../background');
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

  test('gemini 模型 → generativelanguage generateContent，key 走 header 不進 URL', async () => {
    global.fetch.mockResolvedValue(okGemini);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: 'gemini-3.5-flash' });
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.gemini.apiBase}/gemini-3.5-flash:generateContent`);
    expect(global.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza-dummy');
  });

  test('遺留 no-prefix id（gemini-2.5-flash）仍走 Gemini 端點（路由約定鎖）', async () => {
    global.fetch.mockResolvedValue(okGemini);
    await handleAIRequest({ action: 'translate', selectedText: 'hi', model: 'gemini-2.5-flash' });
    expect(global.fetch.mock.calls[0][0]).toContain(`${M.PROVIDERS.gemini.apiBase}/gemini-2.5-flash:generateContent`);
  });
});

// 串流軌原本零單元測試覆蓋（2026-09-12 抽 resolveRoute 前補的前置鎖）。
// 非串流與串流是兩段幾乎逐字相同的 provider if 鏈，只鎖一邊等於只有一半有護欄。
// 這裡只斷言「路由決策」——URL 與金鑰放哪——不驗串流內容，所以給空 body 就夠。
describe('串流軌 provider endpoint URL 斷言', () => {
  // jsdom 環境沒有 ReadableStream，所以不用真的串流。`parseSseStream` 只需要
  // body.getReader() 回傳有 read()／cancel() 的物件；URL 與 header 的斷言讀的是
  // fetch.mock.calls，跟 body 長什麼樣無關。
  const emptyStreamResponse = () => ({
    ok: true,
    body: {
      getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        cancel: async () => {}
      })
    }
  });

  beforeEach(() => {
    global.fetch.mockReset();
    global.fetch.mockImplementation(async () => emptyStreamResponse());
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.local.get.mockResolvedValue({
      apiKey: 'AIza-dummy', groqApiKey: 'gsk_dummy', openrouterApiKey: 'sk-or-dummy'
    });
  });

  const stream = model => _streamAIRequest(
    { action: 'translate', selectedText: 'hi', model }, () => {}, () => {}
  );

  test('groq 模型 → Groq chat/completions，key 走 Authorization', async () => {
    await stream(M.DEFAULT_MODEL);
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.groq.apiBase}/chat/completions`);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer gsk_dummy');
  });

  test('openrouter 模型 → OpenRouter chat/completions + X-Title', async () => {
    await stream(M.OPENROUTER_PRIMARY_MODEL);
    expect(global.fetch.mock.calls[0][0]).toBe(`${M.PROVIDERS.openrouter.apiBase}/chat/completions`);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer sk-or-dummy');
    expect(global.fetch.mock.calls[0][1].headers['X-Title']).toBe('Fan Fan Ba');
  });

  test('gemini 模型 → streamGenerateContent?alt=sse，key 走 header 不進 URL', async () => {
    await stream('gemini-3.5-flash');
    expect(global.fetch.mock.calls[0][0])
      .toBe(`${M.PROVIDERS.gemini.apiBase}/gemini-3.5-flash:streamGenerateContent?alt=sse`);
    expect(global.fetch.mock.calls[0][1].headers['x-goog-api-key']).toBe('AIza-dummy');
    expect(global.fetch.mock.calls[0][0]).not.toContain('AIza-dummy');
  });

  test('遺留 no-prefix id 仍走 Gemini 串流端點（路由約定鎖）', async () => {
    await stream('gemini-2.5-flash');
    expect(global.fetch.mock.calls[0][0])
      .toContain(`${M.PROVIDERS.gemini.apiBase}/gemini-2.5-flash:streamGenerateContent`);
  });
});

// resolveRoute 是兩軌共用的路由決策正本（2026-09-12 抽出）。上面兩個 describe 走
// 完整請求鎖住 URL；這裡直接測決策本身，補的是原本零覆蓋的「缺金鑰」錯誤路徑
// ——那三句是使用者真的會看到的字，改壞不會有任何測試變紅。
describe('resolveRoute 路由決策', () => {
  const allKeys = { apiKey: 'AIza-dummy', groqApiKey: 'gsk_dummy', openrouterApiKey: 'sk-or-dummy' };

  test('groq 前綴 → openai-compat 描述', () => {
    const route = resolveRoute(M.DEFAULT_MODEL, allKeys);
    expect(route.kind).toBe('openai-compat');
    expect(route.label).toBe('Groq');
    expect(route.apiKey).toBe('gsk_dummy');
  });

  test('openrouter 前綴 → openai-compat 描述，帶 PROVIDERS 的 extraHeaders', () => {
    const route = resolveRoute(M.OPENROUTER_PRIMARY_MODEL, allKeys);
    expect(route.kind).toBe('openai-compat');
    expect(route.label).toBe('OpenRouter');
    expect(route.extraHeaders).toBe(M.PROVIDERS.openrouter.extraHeaders);
  });

  test('無前綴 → gemini 描述（路由約定）', () => {
    const route = resolveRoute('gemini-2.5-flash', allKeys);
    expect(route.kind).toBe('gemini');
    expect(route.model).toBe('gemini-2.5-flash');
  });

  test('缺對應金鑰時各自拋出自己那句（原本零覆蓋）', () => {
    expect(() => resolveRoute(M.DEFAULT_MODEL, { ...allKeys, groqApiKey: '' }))
      .toThrow('請先在設定頁面輸入 Groq API Key');
    expect(() => resolveRoute(M.OPENROUTER_PRIMARY_MODEL, { ...allKeys, openrouterApiKey: '' }))
      .toThrow('請先在設定頁面輸入 OpenRouter API Key');
    expect(() => resolveRoute('gemini-2.5-flash', { ...allKeys, apiKey: '' }))
      .toThrow('請先在擴充功能設定頁面輸入 Gemini API Key');
  });
});
