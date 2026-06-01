const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

describe('selection toolbar positioning', () => {
  it('aligns the toolbar to the upper-right corner of the selection', () => {
    document.body.innerHTML = '<main>Selected text lives here</main>';
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });

    const context = vm.createContext({
      window,
      document,
      chrome,
      triggerAction: jest.fn(),
      requestAnimationFrame: cb => cb(),
      setTimeout,
      clearTimeout,
      console
    });
    context.globalThis = context;

    runContentScript('content/toolbar.js', context);
    context.toolbar = context.createToolbar();
    Object.defineProperty(context.toolbar, 'offsetWidth', { value: 120, configurable: true });
    Object.defineProperty(context.toolbar, 'offsetHeight', { value: 42, configurable: true });
    context.savedSel = {
      range: {
        getBoundingClientRect: () => ({
          left: 100,
          right: 260,
          top: 160,
          bottom: 180,
          width: 160,
          height: 20
        })
      }
    };

    context.positionToolbar();

    expect(context.toolbar.style.left).toBe('140px');
    expect(context.toolbar.style.top).toBe('110px');
  });
});
