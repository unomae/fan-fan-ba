// 結果卡底部：「僅本次」模型選單與修改原文重查（content 端）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const GROQ = 'groq:openai/gpt-oss-120b';
const GEMINI = 'gemini-3.5-flash';

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function loadCard({ available = [GROQ, GEMINI], sync = {}, local = {} } = {}) {
  // jsdom 沒有 Web Animations API，工具列顯示動畫在這裡無關緊要
  if (!Element.prototype.animate) Element.prototype.animate = () => ({ cancel() {} });
  document.body.innerHTML = '<p id="para">apple pie</p>';
  const requests = [];
  const context = vm.createContext({
    window,
    document,
    location,
    navigator,
    chrome,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
    FanFanBaModels: require('../../models'),
    FanFanBaCustomActions: require('../../custom-actions'),
    setPageTranslationModel: jest.fn(),
    loadRecentFolders: jest.fn(async () => []),
    hideAutoSaveToast: jest.fn()
  });
  context.globalThis = context;
  chrome.storage.local.get.mockResolvedValue(local);
  chrome.storage.onChanged = { addListener: jest.fn() };
  // 主模型由 initContentSettings 非同步讀入，直接讓設定回傳 GEMINI
  chrome.storage.sync.get.mockResolvedValue({ model: GEMINI, ...sync });
  chrome.runtime.id = 'mock-id';
  chrome.runtime.sendMessage = jest.fn((message, callback) => {
    if (message.type === 'MODEL_AVAILABILITY') return Promise.resolve({ models: available });
    requests.push(message);
    if (typeof callback === 'function') callback({ result: '{"word":"apple"}' });
    return undefined;
  });
  // 長句與解釋走串流 port：送出的內容一樣記進 requests
  chrome.runtime.connect = jest.fn(() => ({
    postMessage: message => requests.push(message),
    onMessage: { addListener: jest.fn() },
    onDisconnect: { addListener: jest.fn() },
    disconnect: jest.fn()
  }));
  ['content/site-policy.js', 'content/state.js', 'content/utils.js', 'content/dom.js',
    'content/selection-controls.js', 'content/toolbar.js', 'content/result-card.js', 'content/main.js'].forEach(file => runContentScript(file, context));
  context.saveToHistory = jest.fn();
  context.initVocabularySaveButton = jest.fn();
  return { context, requests };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

async function openCardFor(context, text = 'apple') {
  await flush(); // 等 initContentSettings 讀完設定
  vm.runInContext(`savedSel = { text: ${JSON.stringify(text)}, range: null };`, context);
  context.showToolbar();
  context.triggerAction('translate');
  await flush();
  return document.getElementById('gemini-result-card');
}

function chooseModel(card, modelId) {
  const select = card.querySelector('.g-rc-model-select');
  select.value = modelId;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('結果卡：僅本次模型', () => {
  beforeEach(() => jest.clearAllMocks());

  it('標題列不再有模型選單，底部選單標示「僅本次」', async () => {
    const { context } = loadCard();
    const card = await openCardFor(context);
    expect(card.querySelector('.g-rc-header .g-rc-model-select')).toBeNull();
    expect(card.querySelector('.g-rc-footer .g-rc-model-select')).not.toBeNull();
    expect(card.querySelector('.g-rc-model-once').textContent).toBe('僅本次');
    expect(card.classList.contains('g-rc-query-mode')).toBe(true); // 選字查詢才顯示底部列
  });

  it('只列可用模型（外加目前使用中的），不列只做頁面翻譯的模型', async () => {
    const { context } = loadCard({ available: [GROQ] });
    const card = await openCardFor(context);
    const ids = [...card.querySelectorAll('.g-rc-model-select option')].map(option => option.value);
    expect(ids).toEqual([GROQ, GEMINI]); // GEMINI 是目前主模型，缺金鑰也要如實顯示
    expect(ids).not.toContain('builtin:translator');
  });

  it('卡內選 B 模型：請求帶 B，全域設定仍是 A', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    expect(requests.at(-1).modelOverride).toBe('');

    chooseModel(card, GROQ);
    await flush();
    expect(requests.at(-1).modelOverride).toBe(GROQ);
    expect(vm.runInContext('activeModel', context)).toBe(GEMINI);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(card.querySelector('.g-rc-model-once').classList.contains('g-rc-model-once-active')).toBe(true);
  });

  it('快取 key 納入單次模型：切回主模型時命中原本的結果，不重送', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    chooseModel(card, GROQ);
    await flush();
    const sent = requests.length;
    chooseModel(card, GEMINI);
    await flush();
    expect(requests.length).toBe(sent); // 主模型那份已在快取
    expect(vm.runInContext('cardModelOverride', context)).toBeNull();
  });

  it('關卡或換新選取後，單次模型不沿用', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    chooseModel(card, GROQ);
    await flush();
    context.hideResultCard();
    expect(vm.runInContext('cardModelOverride', context)).toBeNull();

    chooseModel(card, GROQ);
    await flush();
    context.getCurrentSelectionData = () => ({ text: 'banana', range: null });
    context.checkSelection();
    context.triggerAction('translate');
    await flush();
    expect(requests.at(-1).selectedText).toBe('banana');
    expect(requests.at(-1).modelOverride).toBe('');
  });
});

describe('結果卡：修改原文後重查', () => {
  beforeEach(() => jest.clearAllMocks());

  it('展開後帶入原文，送出即以新文字請求', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    const toggle = card.querySelector('.g-rc-edit-source');
    toggle.click();
    const input = card.querySelector('.g-rc-source-input');
    expect(card.querySelector('.g-rc-source').classList.contains('g-rc-source-open')).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(input.value).toBe('apple');

    input.value = 'apples';
    card.querySelector('.g-rc-source-submit').click();
    await flush();
    expect(requests.at(-1).selectedText).toBe('apples');
    expect(card.querySelector('.g-rc-source').classList.contains('g-rc-source-open')).toBe(false);
  });

  it('鍵盤：⌘／Ctrl+Enter 送出、Esc 關閉', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    card.querySelector('.g-rc-edit-source').click();
    const input = card.querySelector('.g-rc-source-input');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(card.querySelector('.g-rc-source').classList.contains('g-rc-source-open')).toBe(false);

    card.querySelector('.g-rc-edit-source').click();
    input.value = 'pear';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await flush();
    expect(requests.at(-1).selectedText).toBe('pear');
  });

  it('空白或沒改動時不重送', async () => {
    const { context, requests } = loadCard();
    const card = await openCardFor(context);
    const sent = requests.length;
    card.querySelector('.g-rc-edit-source').click();
    const input = card.querySelector('.g-rc-source-input');
    input.value = '   ';
    card.querySelector('.g-rc-source-submit').click();
    card.querySelector('.g-rc-edit-source').click();
    input.value = 'apple';
    card.querySelector('.g-rc-source-submit').click();
    await flush();
    expect(requests.length).toBe(sent);
  });

  it('在原文輸入框按方向鍵不會被當成新的選取而把卡片收掉', async () => {
    const { context } = loadCard();
    const card = await openCardFor(context);
    card.querySelector('.g-rc-edit-source').click();
    context.checkSelection = jest.fn();
    card.querySelector('.g-rc-source-input').dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(context.checkSelection).not.toHaveBeenCalled();
  });
});

describe('各功能使用的模型', () => {
  beforeEach(() => jest.clearAllMocks());

  const LONG = 'this sentence is clearly longer than twenty characters';
  const withList = list => ({ actionList: list });
  const lastModel = requests => [requests.at(-1).model, requests.at(-1).modelOverride];
  const onChanged = () => chrome.storage.onChanged.addListener.mock.calls[0][0];

  it('沒設定時 model 帶空字串（background 用主模型）', async () => {
    const { context, requests } = loadCard();
    await openCardFor(context);
    expect(lastModel(requests)).toEqual(['', '']);
  });

  it('動作設定的模型帶在 model，卡內下拉顯示它；快取 key 也用它', async () => {
    const { context, requests } = loadCard({ local: withList([{ id: 'explain', builtin: true, model: GROQ }]) });
    const card = await openCardFor(context, LONG);
    context.triggerAction('explain');
    await flush();
    expect(lastModel(requests)).toEqual([GROQ, '']);
    expect(card.querySelector('.g-rc-model-select').value).toBe(GROQ);
    expect(context.getEffectiveModel('explain', LONG)).toBe(GROQ);
  });

  it('20 字以內的翻譯用字典模型，長句翻譯用翻譯動作的模型', async () => {
    const { context, requests } = loadCard({
      sync: { dictionaryModel: GROQ },
      local: withList([{ id: 'translate', builtin: true, model: GEMINI }])
    });
    await openCardFor(context, 'apple');
    expect(requests.at(-1).model).toBe(GROQ);
    vm.runInContext(`savedSel = { text: ${JSON.stringify(LONG)}, range: null };`, context);
    context.triggerAction('translate');
    await flush();
    expect(requests.at(-1).model).toBe(GEMINI);
  });

  it('卡內僅本次優先：選回功能模型就取消覆寫', async () => {
    const { context, requests } = loadCard({ local: withList([{ id: 'explain', builtin: true, model: GROQ }]) });
    const card = await openCardFor(context, LONG);
    context.triggerAction('explain');
    await flush();
    chooseModel(card, GEMINI);
    await flush();
    expect(lastModel(requests)).toEqual([GROQ, GEMINI]);
    chooseModel(card, GROQ);
    expect(vm.runInContext('cardModelOverride', context)).toBeNull();
  });

  it('設定頁改了字典模型，已開的頁面直接換', async () => {
    const { context, requests } = loadCard();
    await openCardFor(context, 'apple');
    onChanged()({ dictionaryModel: { newValue: GROQ } }, 'sync');
    context.triggerAction('translate');
    await flush();
    expect(requests.at(-1).model).toBe(GROQ);
  });

  it('全文翻譯：指定了模型就不跟著主模型變；跟隨主模型才會變', async () => {
    const { context } = loadCard({ sync: { pageTranslationModel: 'builtin:translator' } });
    await flush();
    expect(context.setPageTranslationModel).toHaveBeenLastCalledWith('builtin:translator');
    onChanged()({ model: { newValue: GROQ } }, 'sync');
    expect(context.setPageTranslationModel).toHaveBeenLastCalledWith('builtin:translator');
    onChanged()({ pageTranslationModel: { newValue: '' } }, 'sync');
    expect(context.setPageTranslationModel).toHaveBeenLastCalledWith(GROQ);
    onChanged()({ model: { newValue: GEMINI } }, 'sync');
    expect(context.setPageTranslationModel).toHaveBeenLastCalledWith(GEMINI);
  });
});
