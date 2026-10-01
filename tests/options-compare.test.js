// 設定頁「模型比較」：只列可用模型、並行送出、部分失敗不影響其他
const fs = require('fs');
const path = require('path');
const ModelRegistry = require('../models');

Object.assign(global, require('../content/dom'));
Object.assign(global, require('../content/custom-action-render'));

const html = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'))
  .replace(/^<body[^>]*>/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const $ = id => document.getElementById(id);

const GROQ = 'groq:openai/gpt-oss-120b';
const BUILTIN = ModelRegistry.BUILTIN_TRANSLATOR_MODEL;
const CUSTOM = ModelRegistry.CUSTOM_ENDPOINT_MODEL;
const ids = provider => ModelRegistry.MODELS.filter(model => model.provider === provider).map(model => model.id);

let options;

async function loadOptions({ local = {}, sync = {} } = {}) {
  jest.resetModules();
  document.body.innerHTML = bodyHtml;
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, key in local ? local[key] : fallback]));
    }
    if (typeof keys === 'string') return keys in local ? { [keys]: local[keys] } : {};
    return { ...local };
  });
  chrome.storage.sync.get.mockImplementation(async keys => {
    if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, key in sync ? sync[key] : fallback]));
    }
    return { ...sync };
  });
  options = require('../options');
  for (let i = 0; i < 4; i++) await flush();
  return options;
}

const listedIds = () => [...document.querySelectorAll('#compareModelList input')].map(input => input.value);
const check = (...modelIds) => modelIds.forEach(id => { document.querySelector(`#compareModelList input[value="${id}"]`).checked = true; });
const card = id => document.querySelector(`#compareResults .compare-card[data-model="${id}"]`);
const aiCalls = () => chrome.runtime.sendMessage.mock.calls.filter(([message]) => message?.type === 'GEMINI_REQUEST');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeAll(() => loadOptions(), 30000);

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('ModelRegistry.isModelConfigured', () => {
  const model = id => ModelRegistry.getModel(id);
  it('看對應金鑰；內建翻譯免金鑰；自訂端點還要網址與模型名稱', () => {
    expect(ModelRegistry.isModelConfigured(model(GROQ), {})).toBe(false);
    expect(ModelRegistry.isModelConfigured(model(GROQ), { groqApiKey: 'gsk_x' })).toBe(true);
    expect(ModelRegistry.isModelConfigured(model(GROQ), { apiKey: 'AIza' })).toBe(false);
    expect(ModelRegistry.isModelConfigured(model(BUILTIN), {})).toBe(true);
    expect(ModelRegistry.isModelConfigured(model(CUSTOM), { customApiKey: 'k' }, {})).toBe(false);
    expect(ModelRegistry.isModelConfigured(model(CUSTOM), { customApiKey: 'k' }, { customApiBase: 'https://x.com/v1', customModelName: 'm' })).toBe(true);
    expect(ModelRegistry.isModelConfigured({ provider: 'nope' }, { apiKey: 'x' })).toBe(false);
  });
});

describe('可比較的模型清單', () => {
  it('沒有任何金鑰時只列瀏覽器內建翻譯', async () => {
    await loadOptions();
    expect(listedIds()).toEqual([BUILTIN]);
    expect($('compareModelEmpty').hidden).toBe(true);
  });

  it('只列已儲存金鑰的供應商；未設金鑰的不列', async () => {
    await loadOptions({ local: { groqApiKey: 'gsk_dummy' } });
    expect(listedIds()).toEqual([...ids('groq'), BUILTIN]);
    expect(listedIds()).not.toContain(ids('gemini')[0]);
    expect(listedIds()).not.toContain(CUSTOM);
  });

  it('自訂端點要有金鑰、網址、模型名稱才列', async () => {
    await loadOptions({ local: { customApiKey: 'k' }, sync: { customApiBase: 'https://x.com/v1' } });
    expect(listedIds()).not.toContain(CUSTOM);
    await loadOptions({ local: { customApiKey: 'k' }, sync: { customApiBase: 'https://x.com/v1', customModelName: 'm' } });
    expect(listedIds()).toContain(CUSTOM);
  });

  it('重新列出時保留原本勾選', async () => {
    await loadOptions({ local: { groqApiKey: 'gsk_dummy' } });
    check(GROQ);
    await options.renderCompareModels();
    expect(document.querySelector(`#compareModelList input[value="${GROQ}"]`).checked).toBe(true);
    expect(document.querySelector(`#compareModelList input[value="${BUILTIN}"]`).checked).toBe(false);
  });
});

describe('執行比較', () => {
  it('勾選的模型同時送出，請求用全文翻譯模式與目前的目標語言', async () => {
    await loadOptions({ local: { groqApiKey: 'gsk_dummy' } });
    const pending = [deferred(), deferred()];
    let i = 0;
    chrome.runtime.sendMessage.mockImplementation(() => pending[i++].promise);
    $('compareText').value = 'The lead time is two weeks.';
    $('targetLanguage').value = 'ja';
    check(GROQ, BUILTIN);
    const run = options.runModelCompare();
    // 兩個都已送出，且還沒有任何一個回來
    expect(aiCalls()).toHaveLength(2);
    expect(aiCalls().map(([message]) => message.modelOverride)).toEqual([GROQ, BUILTIN]);
    expect(aiCalls()[0][0]).toMatchObject({ action: 'translate', selectedText: 'The lead time is two weeks.', pageTranslation: true, targetLanguage: 'ja' });
    expect($('btnRunCompare').disabled).toBe(true);

    // 後送的先回來：它的卡片先更新，另一張仍在翻譯中
    pending[1].resolve({ result: '内蔵の訳' });
    await flush();
    expect(card(BUILTIN).querySelector('.compare-output').textContent).toBe('内蔵の訳');
    expect(card(GROQ).querySelector('.compare-meta').textContent).toBe('翻譯中…');

    pending[0].resolve({ result: 'リードタイムは2週間です。', notice: '已改用備援模型' });
    const outcomes = await run;
    expect(outcomes.map(outcome => outcome.result)).toEqual(['リードタイムは2週間です。', '内蔵の訳']);
    expect(card(GROQ).querySelector('.compare-meta').textContent).toMatch(/^\d+\.\d 秒 · 已改用備援模型$/);
    expect($('compareStatus').textContent).toBe('完成：2 個模型都有結果。');
    expect($('btnRunCompare').disabled).toBe(false);
  });

  it('一個回錯誤、一個丟例外，其他照常顯示', async () => {
    await loadOptions({ local: { groqApiKey: 'gsk_dummy', apiKey: 'AIza-dummy' } });
    const gemini = ids('gemini')[0];
    chrome.runtime.sendMessage.mockImplementation(async message => {
      if (message.modelOverride === GROQ) return { error: 'Groq 目前忙碌' };
      if (message.modelOverride === gemini) throw new Error('Could not establish connection');
      return { result: '譯文' };
    });
    $('compareText').value = 'hello world, this is a test';
    check(GROQ, gemini, BUILTIN);
    await options.runModelCompare();
    expect(card(GROQ).classList.contains('is-error')).toBe(true);
    expect(card(GROQ).querySelector('.compare-output').textContent).toBe('Groq 目前忙碌');
    expect(card(GROQ).querySelector('.compare-meta').textContent).toMatch(/^失敗 · /);
    expect(card(gemini).querySelector('.compare-output').textContent).toBe('Could not establish connection');
    expect(card(BUILTIN).classList.contains('is-error')).toBe(false);
    expect(card(BUILTIN).querySelector('.compare-output').textContent).toBe('譯文');
    expect($('compareStatus').textContent).toBe('完成：1 個成功、2 個失敗。');
  });

  it('模型回傳的 HTML 只當文字', async () => {
    await loadOptions();
    chrome.runtime.sendMessage.mockResolvedValue({ result: '<img src=x onerror=alert(1)>譯文' });
    $('compareText').value = 'text';
    check(BUILTIN);
    await options.runModelCompare();
    expect(card(BUILTIN).querySelector('img')).toBeNull();
    expect(card(BUILTIN).querySelector('.compare-output').textContent).toBe('<img src=x onerror=alert(1)>譯文');
  });

  it('沒輸入文字、沒勾模型都不送出', async () => {
    await loadOptions();
    await options.runModelCompare();
    expect($('compareStatus').textContent).toBe('請先輸入要翻譯的文字。');
    $('compareText').value = 'hello';
    await options.runModelCompare();
    expect($('compareStatus').textContent).toBe('請至少勾選一個模型。');
    expect(aiCalls()).toHaveLength(0);
  });

  it('比較進行中再按一次不會重送', async () => {
    await loadOptions();
    const pending = deferred();
    chrome.runtime.sendMessage.mockImplementation(() => pending.promise);
    $('compareText').value = 'hello';
    check(BUILTIN);
    const first = options.runModelCompare();
    expect(await options.runModelCompare()).toBeNull();
    pending.resolve({ result: 'ok' });
    await first;
    expect(aiCalls()).toHaveLength(1);
  });
});

describe('background 接受比較的請求', () => {
  const { validateAIRequest } = require('../background');
  it('全文翻譯模式下可以指定瀏覽器內建翻譯當單次模型', () => {
    expect(validateAIRequest({ action: 'translate', selectedText: 'hi', modelOverride: BUILTIN, pageTranslation: true }).modelOverride).toBe(BUILTIN);
  });
});
