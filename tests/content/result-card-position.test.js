const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

describe('result card positioning', () => {
  it('opens below the selection toolbar anchor when one is available', () => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

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
      escapeHtml: value => String(value),
      loadRecentFolders: jest.fn(async () => []),
      hideAutoSaveToast: jest.fn()
    });
    context.globalThis = context;

    runContentScript('content/result-card.js', context);
    context.resultCard = context.createResultCard();
    Object.defineProperty(context.resultCard, 'offsetWidth', { value: 500, configurable: true });
    Object.defineProperty(context.resultCard, 'offsetHeight', { value: 220, configurable: true });
    context.savedSel = {
      range: {
        getBoundingClientRect: () => ({
          left: 120,
          right: 200,
          top: 180,
          bottom: 202,
          width: 80,
          height: 22
        })
      }
    };

    context.positionResultCard({ left: 268, right: 388, top: 110, bottom: 152 });

    expect(context.resultCard.style.top).toBe('160px');
    expect(context.resultCard.style.left).toBe('268px');
  });

  it('adds accessible names to compact result-card actions', () => {
    document.body.innerHTML = '';

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
      responseCache: new Map(),
      escapeHtml: value => String(value),
      loadRecentFolders: jest.fn(async () => []),
      hideAutoSaveToast: jest.fn()
    });
    context.globalThis = context;

    runContentScript('content/result-card.js', context);
    const card = context.createResultCard();

    expect(card.querySelector('.g-pin').getAttribute('aria-label')).toBe('釘住結果卡');
    expect(card.querySelector('.g-save-obs').getAttribute('aria-label')).toBe('存到 Obsidian');
    expect(card.querySelector('.g-history').getAttribute('aria-label')).toBe('最近查詢紀錄');
    expect(card.querySelector('.g-copy').getAttribute('aria-label')).toBe('複製結果');
    expect(card.querySelector('.g-close-rc').getAttribute('aria-label')).toBe('關閉結果卡');
  });

  it('stays below the toolbar (left-aligned) and clamps vertically when space is tight', () => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 320, configurable: true });

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
      escapeHtml: value => String(value),
      loadRecentFolders: jest.fn(async () => []),
      hideAutoSaveToast: jest.fn()
    });
    context.globalThis = context;

    runContentScript('content/result-card.js', context);
    context.resultCard = context.createResultCard();
    Object.defineProperty(context.resultCard, 'offsetWidth', { value: 500, configurable: true });
    Object.defineProperty(context.resultCard, 'offsetHeight', { value: 220, configurable: true });
    context.savedSel = {
      range: {
        getBoundingClientRect: () => ({
          left: 120,
          right: 200,
          top: 180,
          bottom: 202,
          width: 80,
          height: 22
        })
      }
    };

    context.positionResultCard({ left: 268, right: 388, top: 110, bottom: 152 });

    // 即使工具列下方放不下整張卡，也維持左緣對齊工具列，只把 top 夾回視窗內
    expect(context.resultCard.style.top).toBe('92px');
    expect(context.resultCard.style.left).toBe('268px');
  });

  it('positions below the toolbar anchor even when the selection has no DOM range', () => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

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
      escapeHtml: value => String(value),
      loadRecentFolders: jest.fn(async () => []),
      hideAutoSaveToast: jest.fn()
    });
    context.globalThis = context;

    runContentScript('content/result-card.js', context);
    context.resultCard = context.createResultCard();
    Object.defineProperty(context.resultCard, 'offsetWidth', { value: 500, configurable: true });
    Object.defineProperty(context.resultCard, 'offsetHeight', { value: 220, configurable: true });
    context.savedSel = {
      text: 'Selected text from Google Docs',
      range: null,
      point: { clientX: 240, clientY: 180 }
    };

    context.positionResultCard({ left: 268, right: 388, top: 110, bottom: 152 });

    expect(context.resultCard.style.top).toBe('160px');
    expect(context.resultCard.style.left).toBe('268px');
  });

  it('ignores a non-rect anchor (rAF timestamp) and falls back to the stored anchor', () => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

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
      // 觸發時已存好的工具列錨點
      resultCardAnchorRect: { left: 268, right: 388, top: 110, bottom: 152 },
      responseCache: new Map(),
      escapeHtml: value => String(value),
      loadRecentFolders: jest.fn(async () => []),
      hideAutoSaveToast: jest.fn()
    });
    context.globalThis = context;

    runContentScript('content/result-card.js', context);
    context.resultCard = context.createResultCard();
    Object.defineProperty(context.resultCard, 'offsetWidth', { value: 500, configurable: true });
    Object.defineProperty(context.resultCard, 'offsetHeight', { value: 220, configurable: true });
    context.savedSel = {
      range: {
        getBoundingClientRect: () => ({ left: 120, right: 200, top: 180, bottom: 202, width: 80, height: 22 })
      }
    };

    // 模擬 requestAnimationFrame(positionResultCard) 會傳進來的 timestamp 數字
    context.positionResultCard(1234.56);

    // 應沿用 resultCardAnchorRect（工具列下方、左緣對齊），不可掉進選字置中分支
    expect(context.resultCard.style.top).toBe('160px');
    expect(context.resultCard.style.left).toBe('268px');
  });
});
