// content 端接收快捷鍵／右鍵選單觸發：站點停用不作用、沒選字不作用、
// 選取翻譯只由持有焦點的 frame 處理、全文翻譯只在最上層 frame 切換。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function loadMain({ paused = false } = {}) {
  document.body.innerHTML = '<p id="para">Hello world</p>';
  const context = vm.createContext({
    window,
    document,
    location,
    navigator,
    chrome,
    console,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: cb => cb(),
    FanFanBaModels: {
      DEFAULT_MODEL: 'gemini-3',
      normalizeModel: model => model || 'gemini-3',
      normalizeLanguage: value => value || 'zh-TW',
      normalizeExplanationLanguage: value => value || 'target',
      normalizeTtsLanguageMode: value => value || 'auto'
    }
  });
  context.globalThis = context;
  context.chrome.storage.local.get = jest.fn(async () => ({}));
  runContentScript('content/site-policy.js', context);
  runContentScript('content/state.js', context);
  runContentScript('content/main.js', context);

  const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
  // 替換成 spy：main.js 以全域查找呼叫這些函式
  context.showToolbar = jest.fn();
  context.triggerAction = jest.fn();
  context.getWindowSelectionData = jest.fn(() => null);
  context.getEditableSelectionData = jest.fn(() => null);
  context.startPageTranslationBeta = jest.fn();
  context.restorePageTranslationBeta = jest.fn();
  vm.runInContext(`fanFanBaPaused = ${paused};`, context);
  return { context, listener };
}

const trigger = (listener, extra) => listener({ type: 'FFB_TRIGGER', ...extra });

describe('快捷鍵／右鍵觸發（content 端）', () => {
  let hasFocus;

  beforeEach(() => {
    jest.clearAllMocks();
    hasFocus = jest.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    hasFocus.mockRestore();
  });

  it('有選取文字時直接以翻譯動作送出', () => {
    const { context, listener } = loadMain();
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    trigger(listener, { trigger: 'translate-selection' });
    expect(context.showToolbar).toHaveBeenCalled();
    expect(context.triggerAction).toHaveBeenCalledWith('translate');
    expect(vm.runInContext('savedSel.text', context)).toBe('Hello');
  });

  it('沒有選取文字就什麼都不做', () => {
    const { context, listener } = loadMain();
    trigger(listener, { trigger: 'translate-selection' });
    expect(context.triggerAction).not.toHaveBeenCalled();
    expect(context.showToolbar).not.toHaveBeenCalled();
  });

  it('站點已停用時，選取翻譯與全文翻譯都不作用', () => {
    const { context, listener } = loadMain({ paused: true });
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    trigger(listener, { trigger: 'translate-selection' });
    trigger(listener, { trigger: 'toggle-page-translation' });
    trigger(listener, { trigger: 'start-page-translation' });
    expect(context.triggerAction).not.toHaveBeenCalled();
    expect(context.startPageTranslationBeta).not.toHaveBeenCalled();
    expect(context.restorePageTranslationBeta).not.toHaveBeenCalled();
  });

  it('快捷鍵廣播時，沒有焦點的 frame 不處理', () => {
    const { context, listener } = loadMain();
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    hasFocus.mockReturnValue(false);
    trigger(listener, { trigger: 'translate-selection', requireFocus: true });
    expect(context.triggerAction).not.toHaveBeenCalled();
  });

  it('焦點在子 frame 時，上層 frame 讓給子 frame 處理', () => {
    const { context, listener } = loadMain();
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.focus();
    const active = jest.spyOn(document, 'activeElement', 'get').mockReturnValue(iframe);
    trigger(listener, { trigger: 'translate-selection', requireFocus: true });
    active.mockRestore();
    expect(context.triggerAction).not.toHaveBeenCalled();
  });

  it('右鍵選單（不要求焦點）即使 frame 沒焦點也照常翻譯', () => {
    const { context, listener } = loadMain();
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    hasFocus.mockReturnValue(false);
    trigger(listener, { trigger: 'translate-selection' });
    expect(context.triggerAction).toHaveBeenCalledWith('translate');
  });

  it('切換全文翻譯：未啟用就開始、已啟用就還原', () => {
    const { context, listener } = loadMain();
    vm.runInContext('var pageTranslationState = { activated: false };', context);
    trigger(listener, { trigger: 'toggle-page-translation' });
    expect(context.startPageTranslationBeta).toHaveBeenCalledTimes(1);

    vm.runInContext('pageTranslationState = { activated: true };', context);
    trigger(listener, { trigger: 'toggle-page-translation' });
    expect(context.restorePageTranslationBeta).toHaveBeenCalledTimes(1);
    expect(context.startPageTranslationBeta).toHaveBeenCalledTimes(1);
  });

  it('右鍵「翻譯整頁」在已啟用時不會反過來把翻譯收掉', () => {
    const { context, listener } = loadMain();
    vm.runInContext('var pageTranslationState = { activated: true };', context);
    trigger(listener, { trigger: 'start-page-translation' });
    expect(context.startPageTranslationBeta).toHaveBeenCalledTimes(1);
    expect(context.restorePageTranslationBeta).not.toHaveBeenCalled();
  });

  it('子 frame 不處理全文翻譯', () => {
    const { context, listener } = loadMain();
    context.fanFanBaIsTopFrame = () => false;
    trigger(listener, { trigger: 'toggle-page-translation' });
    expect(context.startPageTranslationBeta).not.toHaveBeenCalled();
  });

  it('其他類型的訊息一律忽略', () => {
    const { context, listener } = loadMain();
    context.getWindowSelectionData.mockReturnValue({ text: 'Hello', range: null });
    listener({ type: 'SOMETHING_ELSE', trigger: 'translate-selection' });
    listener(null);
    expect(context.triggerAction).not.toHaveBeenCalled();
  });
});
