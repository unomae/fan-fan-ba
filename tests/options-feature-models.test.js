// 設定頁「各功能使用的模型」：對照表、缺金鑰提示、儲存與載入
// 用真的 options.html 內容建 DOM，鎖住 HTML 與 options.js 之間的 id 對應。
const fs = require('fs');
const path = require('path');

Object.assign(global, require('../content/dom'));
Object.assign(global, require('../content/custom-action-render'));

const html = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'))
  .replace(/^<body[^>]*>/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const GROQ = 'groq:openai/gpt-oss-120b';
const GEMINI = 'gemini-3.5-flash';
const OPENROUTER = 'openrouter:google/gemma-4-31b-it:free';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const $ = id => document.getElementById(id);

let store;

function mockLocalStorage(initial = {}) {
  store = { ...initial };
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, key in store ? store[key] : fallback]));
    }
    if (typeof keys === 'string') return keys in store ? { [keys]: store[keys] } : {};
    return { ...store };
  });
  chrome.storage.local.set.mockImplementation(async data => { Object.assign(store, data); });
}

async function loadOptions({ local = {}, sync = {} } = {}) {
  jest.resetModules();
  document.body.innerHTML = bodyHtml;
  mockLocalStorage(local);
  chrome.storage.sync.get.mockResolvedValue(sync);
  const options = require('../options');
  await flush();
  await flush();
  return options;
}

const rowLabels = () => [...document.querySelectorAll('.feature-models tbody th label')].map(label => label.textContent);
const hintOf = id => $(`${id}-hint`);
const choose = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('change', { bubbles: true }));
};
const typeInto = (id, value) => {
  $(id).value = value;
  $(id).dispatchEvent(new Event('input', { bubbles: true }));
};

async function clickSave() {
  $('btnSave').click();
  for (let i = 0; i < 5; i++) await flush();
}

describe('設定頁：各功能使用的模型', () => {
  let originalConfirm;
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    originalConfirm = window.confirm;
    window.confirm = jest.fn(() => false);
  });
  afterEach(() => { window.confirm = originalConfirm; });

  it('列出字典、各動作（含自訂）與全文翻譯，預設都是跟隨主模型', async () => {
    await loadOptions({ local: { actionList: [
      { id: 'translate', builtin: true }, { id: 'explain', builtin: true }, { id: 'optimize', builtin: true },
      { id: 'custom-a', name: '重點摘要', icon: 'list', builtin: false, enabled: true, pinned: false, order: 3, model: 'default',
        systemPrompt: '', userPrompt: '{{selection}}', fields: [{ key: 'summary', label: '摘要', description: '' }], layout: 'fields', saveTo: 'none' }
    ] } });
    expect(rowLabels()).toEqual(['字典（20 字以內的翻譯）', '翻譯', '解釋', '優化', '自訂：重點摘要', '全文翻譯']);
    expect([...document.querySelectorAll('select[data-feature-model]')].map(select => select.value))
      .toEqual(['', 'default', 'default', 'default', 'default', '']);
    expect($('dictionaryModel').selectedOptions[0].textContent).toBe('跟隨主模型');
  });

  it('全文翻譯仍可選瀏覽器內建翻譯；字典與動作不列只做全文翻譯的模型', async () => {
    await loadOptions();
    const values = id => [...$(id).options].map(option => option.value);
    expect(values('pageTranslationModel')).toEqual(expect.arrayContaining(['', 'builtin:translator']));
    expect(values('dictionaryModel')).not.toContain('builtin:translator');
    expect(values('featureModel-explain')).not.toContain('builtin:translator');
    choose('pageTranslationModel', 'builtin:translator');
    expect(hintOf('pageTranslationModel')).toBeNull(); // 免金鑰，不提示
  });

  it('選到缺金鑰的模型就地提示；填了金鑰提示消失；跟隨主模型不提示', async () => {
    await loadOptions();
    choose('featureModel-explain', GROQ);
    expect(hintOf('featureModel-explain').textContent).toContain('缺 Groq API Key');
    expect($('featureModel-explain').getAttribute('aria-describedby')).toBe('featureModel-explain-hint');
    expect(hintOf('featureModel-explain').querySelector('.diagnostics-dot.warn')).not.toBeNull();

    typeInto('groqApiKey', 'gsk_test');
    expect(hintOf('featureModel-explain')).toBeNull();
    expect($('featureModel-explain').hasAttribute('aria-describedby')).toBe(false);

    choose('dictionaryModel', OPENROUTER);
    expect(hintOf('dictionaryModel').textContent).toContain('缺 OpenRouter API Key');
    choose('dictionaryModel', '');
    expect(hintOf('dictionaryModel')).toBeNull();
  });

  it('「前往填寫」把焦點移到對應的金鑰欄位', async () => {
    await loadOptions();
    choose('featureModel-translate', GEMINI);
    [...hintOf('featureModel-translate').querySelectorAll('button')].find(button => button.textContent === '前往填寫').click();
    expect(document.activeElement).toBe($('apiKey'));
  });

  it('自訂端點沒填完整時提示，焦點送到第一個空欄位', async () => {
    await loadOptions();
    const customModel = require('../models').MODELS.find(model => model.provider === 'custom');
    choose('featureModel-optimize', customModel.id);
    expect(hintOf('featureModel-optimize').textContent).toContain('自訂端點的網址、模型名稱或金鑰還沒填');
    hintOf('featureModel-optimize').querySelector('button').click();
    expect(document.activeElement).toBe($('customApiBase'));
  });

  it('儲存設定：字典與全文翻譯寫進一般設定，動作的模型寫回動作清單', async () => {
    await loadOptions();
    typeInto('groqApiKey', 'gsk_test');
    choose('model', GROQ);
    choose('dictionaryModel', GEMINI);
    choose('pageTranslationModel', '');
    choose('featureModel-explain', OPENROUTER);
    await clickSave();

    expect($('status').className).toBe('ok');
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
      model: GROQ, dictionaryModel: GEMINI, pageTranslationModel: ''
    }));
    expect(store.actionList.find(action => action.id === 'explain').model).toBe(OPENROUTER);
    expect(store.actionList.find(action => action.id === 'translate').model).toBe('default');
  });

  it('動作的模型沒改就不寫動作清單', async () => {
    await loadOptions();
    typeInto('groqApiKey', 'gsk_test');
    choose('model', GROQ);
    await clickSave();
    expect($('status').className).toBe('ok');
    expect(store.actionList).toBeUndefined();
  });

  it('載入時反映已存的字典、全文翻譯與動作模型', async () => {
    await loadOptions({
      sync: { model: GROQ, dictionaryModel: GEMINI, pageTranslationModel: 'builtin:translator' },
      local: { actionList: [{ id: 'explain', builtin: true, model: GROQ }] }
    });
    expect($('dictionaryModel').value).toBe(GEMINI);
    expect($('pageTranslationModel').value).toBe('builtin:translator');
    expect($('featureModel-explain').value).toBe(GROQ);
    expect(hintOf('dictionaryModel').textContent).toContain('缺 Gemini API Key');
  });
});
