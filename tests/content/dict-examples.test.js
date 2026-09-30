const fs = require('fs');
const path = require('path');
const vm = require('vm');

// utils 的格式化函式在執行時才找 ffbEl 等 DOM helper（瀏覽器端由 dom.js 提供），測試端掛到 global
Object.assign(global, require('../../content/dom'));
const utils = require('../../content/utils');
const { highlightExample, normalizeCefr } = utils;
const { buildPrompt } = require('../../background');
const FanFanBaModels = require('../../models');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

// 用真實 utils 載入 result-card.js，驗字典卡的例句加粗與 CEFR 標籤
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
    ...utils,
    loadRecentFolders: jest.fn(async () => []),
    hideAutoSaveToast: jest.fn()
  });
  context.globalThis = context;
  runContentScript('content/dom.js', context);
  runContentScript('content/result-card.js', context);
  return context;
}

function renderDict(data) {
  const ctx = loadResultCard();
  const wrapper = document.createElement('div');
  wrapper.appendChild(ctx.buildDictContent(data));
  return wrapper;
}

// 把回傳的 DOM 節點序列化，沿用原本逐字比對 HTML 的斷言
function highlightExampleHtml(src, surface) {
  const wrapper = document.createElement('div');
  wrapper.appendChild(highlightExample(src, surface));
  return wrapper.innerHTML;
}

describe('字典例句：查詢詞加粗', () => {
  it('surface 存在於例句時，只加粗第一個大小寫不敏感的完整比對', () => {
    const html = highlightExampleHtml('Running late, she kept running.', 'running');
    expect(html).toBe('<strong class="g-ex-hit">Running</strong> late, she kept running.');
  });

  it('沒有 surface 欄位（舊格式）時整句純文字', () => {
    const wrapper = renderDict({ word: 'run', examples: [{ src: 'I run daily.', zh: '我每天跑步。', type: 'general' }] });
    expect(wrapper.querySelector('.g-ex-hit')).toBeNull();
    expect(wrapper.querySelector('.g-ex-en').textContent).toBe('I run daily.');
  });

  it('surface 不在例句中、或只出現在別的詞裡面時不猜', () => {
    expect(highlightExampleHtml('She walked home.', 'ran')).toBe('She walked home.');
    // "art" 不可命中 "start"，但要命中後面獨立的 art
    expect(highlightExampleHtml('Start with art.', 'art')).toBe('Start with <strong class="g-ex-hit">art</strong>.');
    expect(highlightExampleHtml('Start now.', 'art')).toBe('Start now.');
  });

  it('surface 含 regex 特殊字元時照字面比對', () => {
    expect(highlightExampleHtml('I write C++ at work.', 'c++'))
      .toBe('I write <strong class="g-ex-hit">C++</strong> at work.');
    expect(highlightExampleHtml('Price is $5 (approx.)', '(approx.)'))
      .toBe('Price is $5 <strong class="g-ex-hit">(approx.)</strong>');
    expect(highlightExampleHtml('a.b', '.*')).toBe('a.b');
  });

  it('中日文沒有空格也能比對', () => {
    expect(highlightExampleHtml('毎日走ります', '走り')).toBe('毎日<strong class="g-ex-hit">走り</strong>ます');
  });

  it('例句與 surface 中的 HTML 一律跳脫', () => {
    const wrapper = renderDict({
      word: 'x',
      examples: [{ src: '<img src=x onerror=alert(1)> hi', surface: '<img src=x onerror=alert(1)>', zh: '', type: 'general' }]
    });
    expect(wrapper.querySelector('img')).toBeNull();
    expect(wrapper.querySelector('.g-ex-hit').textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('卡片上的例句會套用 surface 加粗', () => {
    const wrapper = renderDict({
      word: 'run',
      examples: [{ src: 'He ran fast.', surface: 'ran', zh: '他跑得很快。', type: 'context' }]
    });
    expect(wrapper.querySelector('.g-ex-hit').textContent).toBe('ran');
  });
});

describe('字典卡：CEFR 難度標籤', () => {
  it('只接受 A1–C2（大小寫、空白容忍）', () => {
    expect(normalizeCefr(' b2 ')).toBe('B2');
    expect(normalizeCefr('C1')).toBe('C1');
    ['', 'B3', 'D1', 'intermediate', null, undefined, 3].forEach(value => {
      expect(normalizeCefr(value)).toBe('');
    });
  });

  it('合法值顯示在標題列，非法值不顯示', () => {
    expect(renderDict({ word: 'run', cefr: 'a2' }).querySelector('.g-dict-cefr').textContent).toBe('A2');
    expect(renderDict({ word: 'run', cefr: '<b>C3</b>' }).querySelector('.g-dict-cefr')).toBeNull();
    expect(renderDict({ word: 'run' }).querySelector('.g-dict-cefr')).toBeNull();
  });
});

describe('字典 prompt 與快取', () => {
  it('字典 JSON 規格要求 cefr 與每個例句的 surface', () => {
    const prompt = buildPrompt('translate', 'apple', 'I eat an apple.', 'Page Title');
    expect(prompt).toContain('"cefr"');
    expect(prompt.match(/"surface"/g)).toHaveLength(2);
  });

  it('非字典的翻譯 prompt 不帶新欄位', () => {
    const prompt = buildPrompt('translate', 'This sentence is definitely longer than twenty characters.', '', 't');
    expect(prompt).not.toContain('"surface"');
  });

  it('快取 key 帶 prompt 版本號，舊格式結果不會再命中', () => {
    const key = FanFanBaModels.buildCacheKey({ action: 'translate', text: 'apple', model: FanFanBaModels.DEFAULT_MODEL });
    expect(key.startsWith(`p${FanFanBaModels.PROMPT_VERSION}:`)).toBe(true);
    expect(FanFanBaModels.PROMPT_VERSION).toBeGreaterThanOrEqual(2);
  });
});
