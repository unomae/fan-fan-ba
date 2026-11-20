'use strict';

// 2026-11-20 Code Review 方案 A 回歸測試（content script 互動／串流／高亮／全文翻譯）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createVocabularyStoreResponder } = require('./vocab-store-responder');

function runScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function createBaseContext(overrides = {}) {
  const localStore = {};
  const syncStore = {};
  const portListeners = { message: [], disconnect: [] };
  const fakePort = {
    onMessage: { addListener: cb => portListeners.message.push(cb) },
    onDisconnect: { addListener: cb => portListeners.disconnect.push(cb) },
    postMessage: jest.fn(),
    disconnect: jest.fn(),
    emit: msg => portListeners.message.forEach(cb => cb(msg))
  };

  const mockChrome = {
    runtime: {
      id: 'ext-test',
      lastError: null,
      getURL: p => `chrome-extension://ext-test/${p}`,
      connect: jest.fn(() => fakePort),
      sendMessage: jest.fn(createVocabularyStoreResponder(localStore)),
      onMessage: { addListener: jest.fn() }
    },
    storage: {
      local: {
        get: jest.fn(async key => (typeof key === 'string' ? { [key]: localStore[key] } : { ...localStore })),
        set: jest.fn(async values => { Object.assign(localStore, values); })
      },
      sync: {
        get: jest.fn(async defaults => ({ ...(typeof defaults === 'object' ? defaults : {}), ...syncStore })),
        set: jest.fn(async values => { Object.assign(syncStore, values); })
      },
      onChanged: { addListener: jest.fn() }
    }
  };

  const context = vm.createContext({
    window,
    document,
    location,
    navigator: { language: 'zh-TW', clipboard: { writeText: jest.fn(async () => {}) } },
    chrome: mockChrome,
    console,
    Date,
    Node,
    NodeFilter,
    Map,
    Set,
    Promise,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: cb => cb(),
    Audio: jest.fn(),
    ...overrides
  });
  context.globalThis = context;
  return { context, mockChrome, fakePort, localStore, syncStore };
}

describe('Review 方案 A — content 互動與串流', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main><p>Hello world sample paragraph for testing.</p></main>';
  });

  it('Item 1: toolbar 為 null 時從歷史還原結果卡，點延伸標籤觸發 triggerAction 不崩潰且保留底部列', () => {
    const { context, fakePort } = createBaseContext();
    runScript('models.js', context);
    runScript('custom-actions.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/utils.js', context);
    runScript('content/dom.js', context);
    runScript('content/custom-action-render.js', context);
    runScript('content/obsidian.js', context);
    runScript('content/selection-controls.js', context);
    runScript('content/toolbar.js', context);
    runScript('content/result-card.js', context);
    runScript('content/main.js', context);

    expect(vm.runInContext('toolbar', context)).toBeNull();
    vm.runInContext(`
      resultCard = createResultCard();
      setResultCardQueryMode(false);
      applyHistoryState('supply chain', 'explain');
      renderResult('explain', '**延伸：** {{inventory}}', 'supply chain', { fromHistory: true });
    `, context);

    expect(document.querySelector('#gemini-result-card').classList.contains('g-rc-query-mode')).toBe(true);
    expect(() => document.querySelector('.g-tag').click()).not.toThrow();
    expect(fakePort.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'explain',
      selectedText: 'inventory'
    }));
  });

  it('Item 8: startStreaming 增量追加文字節點、處理跨 chunk ===DEEP===、防 connect 例外並限制 responseCache 上限', () => {
    const { context, mockChrome, fakePort } = createBaseContext();
    runScript('models.js', context);
    runScript('custom-actions.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/utils.js', context);
    runScript('content/dom.js', context);
    runScript('content/custom-action-render.js', context);
    runScript('content/obsidian.js', context);
    runScript('content/selection-controls.js', context);
    runScript('content/toolbar.js', context);
    runScript('content/result-card.js', context);
    runScript('content/main.js', context);

    vm.runInContext(`
      resultCard = createResultCard();
      savedSel = { text: 'A long paragraph to translate smoothly.', range: null };
      triggerAction('translate');
    `, context);

    const requestId = fakePort.postMessage.mock.calls[0][0].requestId;
    fakePort.emit({ requestId, chunk: '第一句' });
    const streamDiv = document.querySelector('#gemini-result-card .g-streaming');
    expect(streamDiv.textContent).toBe('第一句');

    fakePort.emit({ requestId, chunk: '接續\n第二行' });
    // 同一個 .g-streaming 容器被重用，不是整塊重建
    expect(document.querySelector('#gemini-result-card .g-streaming')).toBe(streamDiv);
    expect(streamDiv.querySelectorAll('br')).toHaveLength(1);
    expect(streamDiv.textContent).toBe('第一句接續第二行');

    // 跨 chunk 邊界的 ===DEEP=== 也能正確轉成分隔線
    fakePort.emit({ requestId, chunk: '\n===DE' });
    fakePort.emit({ requestId, chunk: 'EP===\n延伸內容' });
    expect(document.querySelector('#gemini-result-card .g-deep-divider')).not.toBeNull();

    // connect 拋錯（擴充更新失效）應顯示提示而非卡死 shimmer
    mockChrome.runtime.connect.mockImplementationOnce(() => { throw new Error('Extension context invalidated'); });
    vm.runInContext(`triggerAction('translate');`, context);
    expect(document.querySelector('#gemini-result-card .g-error').textContent).toContain('重新整理');

    // responseCache 上限 100 筆，超過會淘汰最舊項目
    vm.runInContext(`
      responseCache.clear();
      for (let i = 0; i < 120; i += 1) setResponseCache('k' + i, 'v' + i);
    `, context);
    expect(vm.runInContext('responseCache.size', context)).toBe(100);
    expect(vm.runInContext('responseCache.has("k0")', context)).toBe(false);
    expect(vm.runInContext('responseCache.has("k119")', context)).toBe(true);
  });

  it('Item 9d & 9e: Obsidian 失敗不亮綠勾並顯示錯誤原因；speakWord 連點會暫停前一段音訊', async () => {
    const audioInstances = [];
    const FakeAudio = jest.fn(() => {
      const inst = { pause: jest.fn(), play: jest.fn(() => Promise.resolve()) };
      audioInstances.push(inst);
      return inst;
    });
    const { context, mockChrome } = createBaseContext({ Audio: FakeAudio });
    runScript('models.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/utils.js', context);
    runScript('content/dom.js', context);
    runScript('content/obsidian.js', context);
    runScript('content/result-card.js', context);

    mockChrome.storage.sync.get.mockResolvedValue({ obsidianDefaultFolder: 'Notes' });
    mockChrome.runtime.sendMessage.mockImplementation(async msg => {
      if (msg.type === 'OBSIDIAN_URI') return { ok: false, error: 'Obsidian 連結過長' };
      return { ok: true };
    });

    const card = vm.runInContext(`
      savedSel = { text: 'hello', range: null };
      lastRawResult = '測試';
      resultCard = createResultCard();
      resultCard;
    `, context);

    card.querySelector('.g-save-obs').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(card.querySelector('.g-save-obs').classList.contains('g-saved')).toBe(false);
    expect(card.querySelector('.g-autosave-text').textContent).toContain('Obsidian 連結過長');

    // speakWord 連點應先暫停上一段音訊
    mockChrome.runtime.sendMessage.mockImplementation((msg, cb) => {
      if (msg.type === 'TTS_REQUEST') cb({ audioContent: 'AAAA' });
    });
    const btn = document.createElement('button');
    context.speakWord('apple', btn, 'en');
    context.speakWord('banana', btn, 'en');
    expect(audioInstances).toHaveLength(2);
    expect(audioInstances[0].pause).toHaveBeenCalledTimes(1);
  });

  it('Item 9a: 單字高亮在讀取期間被關閉時不會把 <mark> 畫到頁面上', async () => {
    let resolveItems;
    const { context } = createBaseContext({
      listVocabularyItems: () => new Promise(resolve => { resolveItems = resolve; })
    });
    runScript('content/dom.js', context);
    runScript('content/vocabulary-highlighter.js', context);

    document.body.innerHTML = '<article><p>A beacon shines brightly over the harbor.</p></article>';
    const applyPromise = context.setVocabularyHighlightMode('auto');
    // 先等 storage.set 完成、進入 listVocabularyItems 飛行狀態
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(typeof resolveItems).toBe('function');
    // 讀取單字本還在飛行中就關閉高亮
    await context.setVocabularyHighlightMode('off');
    resolveItems([{ id: 'en:beacon', word: 'beacon', translations: ['燈塔'], count: 1 }]);
    await applyPromise;

    expect(document.querySelectorAll('mark.g-vocab-highlight')).toHaveLength(0);
  });

  it('Item 11b: 單字面板切換熟悉度後直接更新記憶體清單，不再重呼叫 listVocabularyItems', async () => {
    const { context, localStore } = createBaseContext();
    localStore.fanFanBaVocabularyItems = {
      'en:beacon': { id: 'en:beacon', word: 'beacon', lang: 'en', translations: ['燈塔'], status: 'learning', count: 1, createdAt: '2026-11-20T00:00:00Z' }
    };
    runScript('models.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/utils.js', context);
    runScript('content/dom.js', context);
    runScript('content/vocabulary.js', context);
    runScript('content/result-card.js', context);
    runScript('content/floating-ball.js', context);

    const listSpy = jest.spyOn(context, 'listVocabularyItems');
    await context.showFloatingVocabularyPanel();
    expect(listSpy).toHaveBeenCalledTimes(1);

    document.querySelector('[data-filter="all"]').click();
    document.querySelector('[data-vocab-status="en:beacon"]').click();
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
    expect(listSpy).toHaveBeenCalledTimes(1);
    expect(localStore.fanFanBaVocabularyItems['en:beacon'].status).toBe('known');
  });
});

describe('Review 方案 A — page-translator 隱私、效能與批次錯誤處理', () => {
  let oldStyle;
  let oldRect;

  beforeEach(() => {
    oldStyle = window.getComputedStyle;
    oldRect = HTMLElement.prototype.getBoundingClientRect;
    window.getComputedStyle = jest.fn(() => ({
      display: 'block', visibility: 'visible', opacity: '1', fontSize: '16px', lineHeight: 'normal', backgroundColor: 'rgb(255, 255, 255)'
    }));
    HTMLElement.prototype.getBoundingClientRect = jest.fn(() => ({
      top: 100, bottom: 160, left: 20, right: 620, width: 600, height: 60
    }));
  });

  afterEach(() => {
    window.getComputedStyle = oldStyle;
    HTMLElement.prototype.getBoundingClientRect = oldRect;
  });

  it('Item 3: 高敏站點（銀行）的全文／單段翻譯 context 強制為空字串', async () => {
    const { context, fakePort } = createBaseContext();
    runScript('models.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/dom.js', context);
    runScript('content/page-translator-state.js', context);
    runScript('content/page-translator-collector.js', context);
    runScript('content/page-translator-client.js', context);
    runScript('content/page-translator-renderer.js', context);
    runScript('content/page-translator-single.js', context);

    // 模擬目前在銀行網域
    context.fanFanBaCurrentHostname = () => 'online.cathaybk.com.tw';
    document.body.innerHTML = '<main><p id="p1">Account balance is confidential financial data.</p><p id="p2">Another private statement line in the same page.</p></main>';

    const p1 = document.getElementById('p1');
    expect(context.buildPageTranslationContextDigest({ el: p1, text: p1.textContent }, [{ el: p1, text: p1.textContent }])).toBe('');
    expect(context.buildSinglePageContext({ el: p1, text: p1.textContent })).toBe('');

    const reqPromise = context.requestPageTranslation('Sensitive sentence', { context: 'should-be-omitted' });
    const sent = fakePort.postMessage.mock.calls[0][0];
    expect(sent.context).toBe('');
    fakePort.emit({ requestId: sent.requestId, chunk: '譯文' });
    fakePort.emit({ requestId: sent.requestId, done: true });
    await reqPromise;
  });

  it('Item 6: trackSingleTranslateTarget 在 mouseover 不觸發 getBoundingClientRect / getComputedStyle，按 Alt+T 才驗證', () => {
    const { context } = createBaseContext();
    runScript('models.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/dom.js', context);
    runScript('content/page-translator-state.js', context);
    runScript('content/page-translator-collector.js', context);
    runScript('content/page-translator-single.js', context);

    document.body.innerHTML = '<main><p id="valid">This is a real article paragraph long enough for translation.</p><nav><li id="nav-item">Home</li></nav></main>';
    window.getComputedStyle.mockClear();
    HTMLElement.prototype.getBoundingClientRect.mockClear();

    context.trackSingleTranslateTarget({ target: document.getElementById('valid') });
    context.trackSingleTranslateTarget({ target: document.getElementById('nav-item') });

    // mouseover 過程零排版查詢
    expect(HTMLElement.prototype.getBoundingClientRect).not.toHaveBeenCalled();
    expect(window.getComputedStyle).not.toHaveBeenCalled();

    // 按 Alt+T 時仍能解析出剛滑過的有效段落
    expect(context.getSingleTranslateShortcutTarget()).toBe(document.getElementById('valid'));
  });

  it('Item 10: translatePageBatch 遇認證失敗（401）不拆成逐段重送放大請求', async () => {
    const { context, mockChrome, fakePort } = createBaseContext();
    runScript('models.js', context);
    runScript('content/site-policy.js', context);
    runScript('content/state.js', context);
    runScript('content/dom.js', context);
    runScript('content/page-translator-state.js', context);
    runScript('content/page-translator-collector.js', context);
    runScript('content/page-translator-client.js', context);
    runScript('content/page-translator-renderer.js', context);
    context.bindPageTranslationSourceEvents = () => {};
    context.bindPageTranslationBlockEvents = () => {};
    context.updatePageTranslationPanel = () => {};

    document.body.innerHTML = '<main><p>First long paragraph about inventory control systems.</p><p>Second long paragraph about regional logistics network.</p></main>';
    const items = context.collectVisibleTranslatableBlocks();
    vm.runInContext('pageTranslationState.items = items; pageTranslationState.total = items.length;', Object.assign(context, { items }));

    fakePort.postMessage.mockImplementation(msg => {
      Promise.resolve().then(() => fakePort.emit({ requestId: msg.requestId, error: 'Groq驗證失敗，請檢查 API Key' }));
    });

    await context.translatePageBatch(items);
    // 只送過 1 次批次請求，沒有拆成 2 次 fallback 請求
    expect(mockChrome.runtime.connect).toHaveBeenCalledTimes(1);
    expect(items.every(item => item.status === 'error')).toBe(true);
    expect(vm.runInContext('pageTranslationState.errors', context)).toBe(2);
  });

  it('Item 11a: 同回合連續呼叫 detectEmbeddedTranslationTargets 與 collectEmbeddedTranslationTargets 只掃一次 *', () => {
    const { context } = createBaseContext();
    runScript('content/page-translator-state.js', context);
    runScript('content/page-translator-collector.js', context);

    document.body.innerHTML = '<main><div id="a"></div><div id="b"></div></main>';
    const spy = jest.spyOn(document, 'querySelectorAll');
    context.detectEmbeddedTranslationTargets(document);
    context.collectEmbeddedTranslationTargets(document);
    const starCalls = spy.mock.calls.filter(args => args[0] === '*');
    expect(starCalls).toHaveLength(1);
    spy.mockRestore();
  });
});
