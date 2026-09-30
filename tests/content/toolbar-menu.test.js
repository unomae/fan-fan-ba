// 工具列依動作清單顯示＋「⋯」更多動作選單（釘選、排序、鍵盤、視窗邊界）
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

const custom = (id, extra = {}) => ({
  id: `custom-${id}`, name: `自訂${id}`, icon: 'list', builtin: false, enabled: true, pinned: false, order: 10,
  model: 'default', systemPrompt: '', userPrompt: '{{selection}}',
  fields: [{ key: 'result', label: '結果', description: '' }], layout: 'fields', saveTo: 'none', ...extra
});

let store;

function loadToolbar() {
  document.body.innerHTML = '<p>text</p>';
  Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
  store = {};
  chrome.storage.local.get.mockImplementation(async keys => Object.fromEntries(
    Object.entries(keys).map(([key, fallback]) => [key, key in store ? store[key] : fallback])));
  chrome.storage.local.set.mockImplementation(async data => { Object.assign(store, data); });

  const context = vm.createContext({
    window, document, chrome, console, setTimeout, clearTimeout,
    FanFanBaModels: require('../../models'),
    triggerAction: jest.fn(),
    runCustomAction: jest.fn(),
    requestAnimationFrame: cb => cb()
  });
  context.globalThis = context;
  ['custom-actions.js', 'content/dom.js', 'content/custom-action-render.js', 'content/toolbar.js']
    .forEach(file => runContentScript(file, context));
  vm.runInContext('var toolbar = null; var savedSel = null;', context);
  vm.runInContext('toolbar = createToolbar();', context);
  return context;
}

const bar = () => document.getElementById('gemini-ai-toolbar');
const barLabels = () => [...bar().querySelectorAll(':scope > .g-btn')].map(btn => btn.getAttribute('aria-label'));
const menu = () => bar().querySelector('.g-action-menu');
const menuRows = () => [...menu().querySelectorAll('.g-am-row')];
const menuNames = () => menuRows().map(row => row.querySelector('.g-am-run').textContent);
const menuButton = (name, role) => menuRows()
  .find(row => row.querySelector('.g-am-run').textContent === name)
  .querySelector(`[data-role="${role}"]`);
const key = (target, keyName) => target.dispatchEvent(new KeyboardEvent('keydown', { key: keyName, bubbles: true }));

function setList(context, list) {
  const normalized = context.FanFanBaCustomActions.normalizeActionList(list);
  context.setToolbarActionList(normalized);
  return normalized;
}

describe('工具列：依動作清單顯示', () => {
  beforeEach(() => jest.clearAllMocks());

  it('還沒讀到清單時：內建三顆（提示文字不變）＋「⋯」', () => {
    loadToolbar();
    expect(barLabels()).toEqual(['翻譯', '解釋這個', '優化精進', '更多動作']);
    const more = bar().querySelector('.g-more');
    expect(more.getAttribute('aria-haspopup')).toBe('true');
    expect(more.getAttribute('aria-expanded')).toBe('false');
  });

  it('只放釘選且啟用的動作、最多 4 個；內建走 triggerAction，自訂走 runCustomAction', () => {
    const context = loadToolbar();
    setList(context, [
      { id: 'explain', builtin: true, enabled: false },
      custom('a', { pinned: true, order: 5 }),
      custom('b', { pinned: true, order: 6 }),
      custom('c', { pinned: true, order: 7 }),
      custom('d', { pinned: false, order: 8 })
    ]);
    expect(barLabels()).toEqual(['翻譯', '優化精進', '自訂a', '自訂b', '更多動作']);

    bar().querySelector('[data-action="translate"]').click();
    expect(context.triggerAction).toHaveBeenCalledWith('translate');
    bar().querySelector('[data-action-id="custom-a"]').click();
    expect(context.runCustomAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom-a', name: '自訂a' }));
  });
});

describe('「⋯」選單', () => {
  beforeEach(() => jest.clearAllMocks());

  it('列出全部已啟用動作，開啟後焦點在第一個；Esc 關閉並把焦點還給「⋯」', () => {
    const context = loadToolbar();
    setList(context, [{ id: 'optimize', builtin: true, enabled: false }, custom('a')]);
    bar().querySelector('.g-more').click();
    expect(menuNames()).toEqual(['翻譯', '解釋這個', '自訂a']);
    expect(bar().querySelector('.g-more').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(menuButton('翻譯', 'run'));

    key(document.activeElement, 'Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(bar().querySelector('.g-more'));
    expect(bar().querySelector('.g-more').getAttribute('aria-expanded')).toBe('false');
  });

  it('方向鍵在同一欄上下移動焦點，到底從頭；Enter（按鈕原生）執行並關閉選單', () => {
    const context = loadToolbar();
    setList(context, [custom('a')]);
    bar().querySelector('.g-more').click();
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(menuButton('解釋這個', 'run'));
    menuButton('解釋這個', 'pin').focus();
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(menuButton('優化精進', 'pin'));
    key(document.activeElement, 'ArrowDown');
    key(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(menuButton('翻譯', 'pin'));
    key(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(menuButton('自訂a', 'pin'));

    menuButton('自訂a', 'run').click();
    expect(context.runCustomAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'custom-a' }));
    expect(menu()).toBeNull();
  });

  it('釘選寫回 storage 並出現在工具列；超過 4 個顯示提示、不寫入', async () => {
    const context = loadToolbar();
    setList(context, [custom('a'), custom('b', { order: 11 })]);
    bar().querySelector('.g-more').click();
    expect(menuButton('自訂a', 'pin').getAttribute('aria-pressed')).toBe('false');

    menuButton('自訂a', 'pin').focus(); // jsdom 的 click() 不會移動焦點，實際點擊會
    menuButton('自訂a', 'pin').click();
    await flush(); await flush();
    expect(store.actionList.find(action => action.id === 'custom-a').pinned).toBe(true);
    expect(barLabels()).toContain('自訂a');
    expect(menuButton('自訂a', 'pin').getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(menuButton('自訂a', 'pin')); // 重畫後焦點留在原按鈕

    chrome.storage.local.set.mockClear();
    menuButton('自訂b', 'pin').click();
    await flush();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(menu().querySelector('.g-am-notice').textContent).toBe('工具列最多放 4 個動作，請先取消一個');
    expect(barLabels()).not.toContain('自訂b');
  });

  it('上移下移寫回順序，工具列跟著變，焦點留在同一個動作的同一顆按鈕', async () => {
    const context = loadToolbar();
    setList(context, []);
    bar().querySelector('.g-more').click();
    expect(menuButton('翻譯', 'up').disabled).toBe(true);
    expect(menuButton('優化精進', 'down').disabled).toBe(true);

    menuButton('優化精進', 'up').focus();
    menuButton('優化精進', 'up').click();
    await flush(); await flush();
    expect(menuNames()).toEqual(['翻譯', '優化精進', '解釋這個']);
    expect(barLabels()).toEqual(['翻譯', '優化精進', '解釋這個', '更多動作']);
    expect(store.actionList.map(action => [action.id, action.order]))
      .toEqual([['translate', 0], ['optimize', 1], ['explain', 2]]);
    expect(document.activeElement).toBe(menuButton('優化精進', 'up'));
  });

  it('停用的動作不在選單裡，上移會跳過它、跟選單上相鄰的交換', async () => {
    const context = loadToolbar();
    setList(context, [{ id: 'explain', builtin: true, enabled: false }]);
    bar().querySelector('.g-more').click();
    menuButton('優化精進', 'up').click();
    await flush(); await flush();
    expect(menuNames()).toEqual(['優化精進', '翻譯']);
    expect(store.actionList.map(action => action.id)).toEqual(['optimize', 'translate', 'explain']);
  });

  it('拖曳排序', async () => {
    const context = loadToolbar();
    setList(context, [custom('a')]);
    bar().querySelector('.g-more').click();
    const rowOf = name => menuRows().find(row => row.querySelector('.g-am-run').textContent === name);
    rowOf('自訂a').dispatchEvent(new Event('dragstart', { bubbles: true }));
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    rowOf('翻譯').dispatchEvent(drop);
    await flush(); await flush();
    expect(menuNames()).toEqual(['自訂a', '翻譯', '解釋這個', '優化精進']);
    expect(drop.defaultPrevented).toBe(true);
  });

  it('選單不超出視窗：下方放不下往上開，右邊超出就往左收', () => {
    const context = loadToolbar();
    bar().getBoundingClientRect = () => ({ left: 700, right: 880, top: 600, bottom: 640, width: 180, height: 40 });
    const realRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function rect() {
      if (this.classList?.contains('g-action-menu')) return { left: 660, right: 910, top: 646, bottom: 846, width: 250, height: 200 };
      return realRect.call(this);
    };
    try {
      bar().querySelector('.g-more').click();
      expect(menu().classList.contains('g-am-up')).toBe(true);
      expect(menu().style.right).toBe('-12px'); // 右緣 910 → 貼齊 892（視窗寬 900 − 邊距 8）
    } finally {
      HTMLElement.prototype.getBoundingClientRect = realRect;
    }
    context.hideToolbar();
    expect(menu()).toBeNull();
  });
});
