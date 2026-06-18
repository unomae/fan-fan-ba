const fs = require('fs');
const path = require('path');
const vm = require('vm');

const { escapeHtml, getPosClass, formatMarkdown, renderDiff } = require('../../content/utils');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

// 用真實的 escapeHtml 載入 result-card.js，驗證 AI 字典輸出的每個欄位
// 即使塞入 XSS payload，也只會被當文字渲染，不會產生可執行標籤。
function loadResultCard() {
  const context = vm.createContext({
    window,
    document,
    navigator,
    chrome,
    console,
    setTimeout,
    clearTimeout,
    FanFanBaModels: {
      MODELS: [{ id: 'gemini-3', name: 'Gemini 3' }],
      normalizeModel: model => model || 'gemini-3'
    },
    activeModel: 'gemini-3',
    userDragged: false,
    resultCardAnchorRect: null,
    responseCache: new Map(),
    escapeHtml,
    getPosClass,
    formatMarkdown,
    renderDiff,
    loadRecentFolders: jest.fn(async () => []),
    hideAutoSaveToast: jest.fn()
  });
  context.globalThis = context;
  runContentScript('content/dom.js', context);
  runContentScript('content/result-card.js', context);
  return context;
}

describe('XSS regression — AI dictionary card render', () => {
  const PAYLOAD = '<img src=x onerror=alert(1)><script>alert(2)</script>';

  it('renders malicious AI fields as inert text only', () => {
    const ctx = loadResultCard();
    const html = ctx.buildDictHTML({
      word: PAYLOAD,
      phonetic: PAYLOAD,
      pos: PAYLOAD,
      definition: PAYLOAD,
      usage: PAYLOAD,
      translations: [PAYLOAD],
      synonym: { word: PAYLOAD, diff: PAYLOAD },
      examples: [{ type: 'context', src: PAYLOAD, zh: PAYLOAD }]
    });

    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    // 不可生出任何可執行 / 可觸發事件的元素
    expect(wrapper.querySelector('img')).toBeNull();
    expect(wrapper.querySelector('script')).toBeNull();
    expect(wrapper.querySelector('[onerror]')).toBeNull();

    // payload 仍以文字形式存在（代表有被渲染、只是被中和）
    expect(wrapper.textContent).toContain('onerror=alert(1)');
  });

  it('keeps an attribute-breakout payload inside the data-term attribute', () => {
    const ctx = loadResultCard();
    // word 內含可能想跳出屬性的引號 payload
    const html = ctx.buildDictHTML({ word: '" onload="alert(1)', definition: 'x' });
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;

    expect(wrapper.querySelector('[onload]')).toBeNull();
    expect(wrapper.querySelector('.g-dict-word').textContent).toContain('onload="alert(1)');
  });
});
