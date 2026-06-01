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

  it('falls back to the right side of the selected word when toolbar-below space is insufficient', () => {
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

    expect(context.resultCard.style.top).toBe('92px');
    expect(context.resultCard.style.left).toBe('208px');
  });
});
