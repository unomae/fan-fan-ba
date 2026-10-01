// 設定頁：搜尋（⌘K／Ctrl+K）與新功能標籤
// 用真的 options.html 內容建 DOM，鎖住 HTML 標記與 options.js 之間的對應。
const fs = require('fs');
const path = require('path');

Object.assign(global, require('../content/dom'));
Object.assign(global, require('../content/custom-action-render'));

const html = fs.readFileSync(path.join(__dirname, '../options.html'), 'utf8');
const bodyHtml = html.slice(html.indexOf('<body'), html.lastIndexOf('</body>'))
  .replace(/^<body[^>]*>/, '')
  .replace(/<script[\s\S]*?<\/script>/g, '');

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const $ = id => document.getElementById(id);

let store;
let options;

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

async function loadOptions(initialStore = {}) {
  jest.resetModules();
  document.body.innerHTML = bodyHtml;
  mockLocalStorage(initialStore);
  chrome.storage.sync.get.mockResolvedValue({});
  options = require('../options');
  await flush();
  await flush();
  return options;
}

const search = () => $('settingsSearch');
function typeQuery(text) {
  const input = search();
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event('input'));
}
function pressKey(target, key, init = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}
const resultItems = () => [...document.querySelectorAll('#settingsSearchResults .search-result')];
const resultTexts = () => resultItems().map(item => item.querySelector('span').textContent);
const panel = name => document.querySelector(`.settings-panel[data-panel-content="${name}"]`);
const tab = name => document.querySelector(`.settings-tab[data-panel="${name}"]`);
const visibleBadgeIds = () => [...document.querySelectorAll('.feature-badge[data-badge-for]:not([hidden])')]
  .map(badge => badge.dataset.badgeFor).sort();
const badge = id => document.querySelector(`.feature-badge[data-badge-for="${id}"]`);
const actionRow = id => document.querySelector(`#actionList .action-row[data-id="${id}"]`);

const ALL_BADGES = [
  'action-analyze', 'action-optimize', 'card-model', 'custom-endpoint',
  'dict-examples', 'feature-models', 'panel-actions', 'panel-compare', 'panel-glossary', 'shortcuts'
];

// 第一次 require options.js 要轉譯＋插樁（單跑約 2 秒），全套平行時可能超過 5 秒預設逾時；
// 先在這裡載入一次，成本不算進第一條測試
beforeAll(() => loadOptions(), 30000);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  global.fetch = jest.fn();
});

describe('設定頁搜尋', () => {
  it('比對欄位標籤，不分大小寫、多個詞都要出現；「必填」提示不算進文字', async () => {
    await loadOptions();
    typeQuery('groq api');
    expect(resultTexts()).toEqual(['Groq API Key']);
    expect(document.querySelector('#settingsSearchResults .search-result small').textContent).toBe('模型與金鑰');
    expect($('settingsSearchResults').hidden).toBe(false);
    expect(search().getAttribute('aria-expanded')).toBe('true');
  });

  it('選中結果會切到該分頁、高亮所在區塊，欄位標籤把焦點交給輸入框，並清空搜尋', async () => {
    await loadOptions();
    expect(panel('obsidian').hidden).toBe(true);
    typeQuery('vault');
    expect(resultTexts()).toEqual(['Obsidian Vault 名稱']);
    pressKey(search(), 'Enter');

    expect(panel('obsidian').hidden).toBe(false);
    expect(panel('model').hidden).toBe(true);
    expect(tab('obsidian').getAttribute('aria-selected')).toBe('true');
    expect(tab('model').classList.contains('is-active')).toBe(false);
    expect($('obsidianVault').closest('.field').classList.contains('search-hit')).toBe(true);
    expect(document.activeElement).toBe($('obsidianVault'));
    expect(search().value).toBe('');
    expect($('settingsSearchResults').hidden).toBe(true);
  });

  it('找得到功能說明與分頁名稱；點結果一樣會跳過去', async () => {
    await loadOptions();
    typeQuery('快捷鍵');
    const hit = resultItems().find(item => item.textContent.includes('Alt+S'));
    expect(hit).toBeTruthy();
    hit.click();
    expect(panel('privacy').hidden).toBe(false);
    expect(document.querySelector('[data-feature-item="shortcuts"]').classList.contains('search-hit')).toBe(true);

    typeQuery('備份還原');
    expect(resultTexts()).toContain('備份還原');
  });

  it('動態產生的列（功能 × 模型對照表）也找得到', async () => {
    await loadOptions();
    typeQuery('長難句');
    expect(resultTexts()).toContain('長難句分析');
  });

  it('關著的動作編輯器內容不會被搜到；沒有結果時顯示提示', async () => {
    await loadOptions();
    typeQuery('使用者提示');
    expect(resultItems()).toHaveLength(0);
    expect($('settingsSearchResults').textContent).toBe('沒有符合的設定');
  });

  it('標籤文字「新增」不算進可搜尋的文字', async () => {
    await loadOptions();
    expect(options.searchSettings('新增').every(entry => entry.text.includes('新增'))).toBe(true);
    expect(options.searchSettings('自訂端點').map(entry => entry.text)).toContain('自訂端點');
  });

  it('上下鍵移動選取，Enter 跳到選中的那筆', async () => {
    await loadOptions();
    typeQuery('api key');
    expect(resultItems().length).toBeGreaterThan(2);
    pressKey(search(), 'ArrowDown');
    expect(resultItems()[1].getAttribute('aria-selected')).toBe('true');
    expect(search().getAttribute('aria-activedescendant')).toBe('settingsSearchResult1');
    pressKey(search(), 'ArrowUp');
    pressKey(search(), 'ArrowUp'); // 從第一筆往上繞到最後一筆
    const items = resultItems();
    expect(items[items.length - 1].getAttribute('aria-selected')).toBe('true');
  });

  it('Esc 清空並收起結果', async () => {
    await loadOptions();
    typeQuery('模型');
    expect($('settingsSearchResults').hidden).toBe(false);
    const event = pressKey(search(), 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(search().value).toBe('');
    expect($('settingsSearchResults').hidden).toBe(true);
    expect(search().getAttribute('aria-expanded')).toBe('false');
  });

  it.each([
    ['Ctrl+K', { ctrlKey: true }],
    ['⌘K', { metaKey: true }]
  ])('%s 從頁面任何地方聚焦搜尋框', async (_name, modifiers) => {
    await loadOptions();
    $('groqApiKey').focus();
    const event = pressKey($('groqApiKey'), 'k', modifiers);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search());
  });

  it('沒按修飾鍵的 k 不攔', async () => {
    await loadOptions();
    $('groqApiKey').focus();
    const event = pressKey($('groqApiKey'), 'k');
    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe($('groqApiKey'));
  });

  it('高亮約 2 秒後移除', async () => {
    await loadOptions();
    jest.useFakeTimers();
    typeQuery('vault');
    pressKey(search(), 'Enter');
    const field = $('obsidianVault').closest('.field');
    expect(field.classList.contains('search-hit')).toBe(true);
    jest.advanceTimersByTime(2000);
    expect(field.classList.contains('search-hit')).toBe(false);
    jest.useRealTimers();
  });
});

describe('新功能標籤', () => {
  it('沒看過任何項目時顯示全部標籤；優化標「已更新」、其他標「新增」', async () => {
    await loadOptions();
    expect(visibleBadgeIds()).toEqual(ALL_BADGES);
    expect(badge('action-optimize').textContent).toBe('已更新');
    expect(badge('action-analyze').textContent).toBe('新增');
    expect(badge('custom-endpoint').textContent).toBe('新增');
    expect(actionRow('translate').querySelector('.feature-badge')).toBeNull();
  });

  it('分頁裡有沒看過的標籤就顯示圓點；分頁自己有標籤時不加圓點', async () => {
    await loadOptions();
    expect(tab('model').classList.contains('has-unseen')).toBe(true);
    expect(tab('privacy').classList.contains('has-unseen')).toBe(true);
    expect(tab('actions').classList.contains('has-unseen')).toBe(false);
    expect(tab('language').classList.contains('has-unseen')).toBe(false);
  });

  it('點開分頁後分頁標籤消失並存本機；分頁裡還有沒看過的動作就改顯示圓點', async () => {
    await loadOptions();
    tab('actions').click();
    await flush();
    expect(badge('panel-actions').hidden).toBe(true);
    expect(store.seenFeatureBadges).toEqual(['panel-actions']);
    expect(tab('actions').classList.contains('has-unseen')).toBe(true);
  });

  it('點了動作列裡任何地方，該列標籤才消失；其他列不受影響', async () => {
    await loadOptions();
    tab('actions').click();
    actionRow('analyze').querySelector('.action-row-name').click();
    await flush();
    expect(badge('action-analyze').hidden).toBe(true);
    expect(badge('action-optimize').hidden).toBe(false);
    expect(store.seenFeatureBadges).toEqual(['panel-actions', 'action-analyze']);
  });

  it('點說明文字或卡片內的欄位也算點開；只開分頁不算', async () => {
    await loadOptions();
    tab('privacy').click();
    expect(badge('dict-examples').hidden).toBe(false);
    document.querySelector('[data-feature-item="dict-examples"]').click();
    $('customApiBase').click();
    await flush();
    expect(badge('dict-examples').hidden).toBe(true);
    expect(badge('custom-endpoint').hidden).toBe(true);
    expect(badge('shortcuts').hidden).toBe(false);
  });

  it('用搜尋跳過去不算點開', async () => {
    await loadOptions();
    typeQuery('自訂端點');
    pressKey(search(), 'Enter');
    await flush();
    expect(badge('custom-endpoint').hidden).toBe(false);
    expect(store.seenFeatureBadges).toBeUndefined();
  });

  it('重新開啟設定頁後，看過的維持隱藏（動作清單重畫後也一樣）', async () => {
    await loadOptions({ seenFeatureBadges: ['action-analyze', 'panel-actions', 'shortcuts'] });
    expect(visibleBadgeIds()).toEqual(ALL_BADGES.filter(id => !['action-analyze', 'panel-actions', 'shortcuts'].includes(id)));
    // 改排序會重畫清單，標籤狀態要跟著套
    actionRow('translate').querySelectorAll('button')[1].click();
    await flush();
    await flush();
    expect(badge('action-analyze').hidden).toBe(true);
    expect(badge('action-optimize').hidden).toBe(false);
  });

  it('全部看過就沒有標籤也沒有圓點', async () => {
    await loadOptions({ seenFeatureBadges: ALL_BADGES });
    expect(visibleBadgeIds()).toEqual([]);
    expect(document.querySelectorAll('.settings-tab.has-unseen')).toHaveLength(0);
  });

  it('存的值格式不對時當作沒看過', async () => {
    await loadOptions({ seenFeatureBadges: 'panel-actions' });
    expect(visibleBadgeIds()).toEqual(ALL_BADGES);
  });
});
