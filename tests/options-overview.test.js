// 設定頁：總覽首頁、卡片進出詳細頁、網址直達與未儲存提示
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
// 每次重新 require 都會在同一個 window 再掛一個 beforeunload；只拿這次載入的那個來測
let beforeUnloadHandler;

function mockLocalStorage(initial = {}) {
  store = { ...initial };
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys && typeof keys === 'object' && !Array.isArray(keys)) {
      return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, key in store ? store[key] : fallback]));
    }
    if (Array.isArray(keys)) return Object.fromEntries(keys.filter(key => key in store).map(key => [key, store[key]]));
    if (typeof keys === 'string') return keys in store ? { [keys]: store[keys] } : {};
    return { ...store };
  });
  chrome.storage.local.set.mockImplementation(async data => { Object.assign(store, data); });
}

async function loadOptions({ local = {}, sync = {}, hash = '' } = {}) {
  jest.resetModules();
  history.replaceState(null, '', `/options.html${hash}`);
  document.body.innerHTML = bodyHtml;
  mockLocalStorage(local);
  chrome.storage.sync.get.mockResolvedValue(sync);
  const addListener = jest.spyOn(window, 'addEventListener');
  options = require('../options');
  beforeUnloadHandler = addListener.mock.calls.filter(([type]) => type === 'beforeunload').pop()?.[1];
  addListener.mockRestore();
  for (let i = 0; i < 5; i++) await flush();
  return options;
}

const tile = name => document.querySelector(`.settings-tab.tile[data-panel="${name}"]`);
const panel = name => document.querySelector(`.settings-panel[data-panel-content="${name}"]`);
const overviewShown = () => !$('settingsOverview').hidden && $('settingsDetail').hidden;
const visiblePanels = () => [...document.querySelectorAll('.settings-panel[data-panel-content]')]
  .filter(item => !item.hidden).map(item => item.dataset.panelContent);
const DAY = 24 * 60 * 60 * 1000;

// 第一次 require options.js 要轉譯＋插樁，平行跑時可能超過預設逾時
beforeAll(() => loadOptions(), 30000);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  global.fetch = jest.fn();
});

describe('總覽與詳細頁切換', () => {
  it('打開設定先看到總覽；每個分類都有一張卡片', async () => {
    await loadOptions();
    expect(overviewShown()).toBe(true);
    const tiles = [...document.querySelectorAll('.settings-tab.tile')].map(item => item.dataset.panel).sort();
    const panels = [...document.querySelectorAll('.settings-panel[data-panel-content]')].map(item => item.dataset.panelContent).sort();
    expect(tiles).toEqual(panels);
    expect(tiles).toHaveLength(9);
  });

  it('每個分類的標題跟總覽卡片名稱一致', async () => {
    await loadOptions();
    document.querySelectorAll('.settings-tab[data-panel]').forEach(item => {
      const heading = document.querySelector(`[data-panel-content="${item.dataset.panel}"] h2`);
      expect(heading.textContent).toBe(options.settingsPanelTitle(item.dataset.panel));
    });
  });

  it('點卡片進詳細頁：只顯示該分類、網址帶 #分類', async () => {
    await loadOptions();
    tile('glossary').click();
    expect($('settingsOverview').hidden).toBe(true);
    expect($('settingsDetail').hidden).toBe(false);
    expect(visiblePanels()).toEqual(['glossary']);
    expect(location.hash).toBe('#glossary');
    expect(tile('glossary').getAttribute('aria-current')).toBe('true');
  });

  it('「儲存設定」只出現在要靠它存檔的分類', async () => {
    await loadOptions();
    for (const name of ['model', 'language', 'glossary', 'obsidian']) {
      tile(name).click();
      expect($('saveButtons').hidden).toBe(false);
    }
    for (const name of ['actions', 'compare', 'backup', 'cloud', 'privacy']) {
      tile(name).click();
      expect($('saveButtons').hidden).toBe(true);
    }
  });

  it('「← 總覽」回到總覽、清掉網址的 #，焦點回到剛才那張卡片', async () => {
    await loadOptions();
    tile('backup').click();
    $('btnBackToOverview').click();
    expect(overviewShown()).toBe(true);
    expect(location.hash).toBe('');
    expect(document.activeElement).toBe(tile('backup'));
    expect(document.querySelector('.settings-tab.is-active')).toBeNull();
  });

  it('網址帶 #分類 直接開到該分類；看不懂的 # 回總覽', async () => {
    await loadOptions({ hash: '#cloud' });
    expect(visiblePanels()).toEqual(['cloud']);

    await loadOptions({ hash: '#nope' });
    expect(overviewShown()).toBe(true);
  });

  it('瀏覽器上一頁／下一頁（popstate）照網址切換', async () => {
    await loadOptions();
    tile('language').click();
    history.replaceState(null, '', '/options.html');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(overviewShown()).toBe(true);
    history.replaceState(null, '', '/options.html#obsidian');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(visiblePanels()).toEqual(['obsidian']);
  });

  it('搜尋的分類名稱不含卡片上的狀態摘要', async () => {
    await loadOptions();
    await options.renderSettingsOverview();
    expect(document.querySelector('[data-summary-for="actions"]').textContent).toMatch(/啟用中/);
    expect(options.searchSettings('啟用中')).toEqual([]);
    expect(options.searchSettings('自訂動作')[0].panelTitle).toBe('自訂動作');
  });
});

describe('總覽狀態摘要（buildSettingsOverview）', () => {
  const NOW = Date.parse('2026-10-23T12:00:00+08:00');

  it('預設模型缺金鑰：提醒列說明後果，模型卡標黃色', async () => {
    await loadOptions();
    const overview = options.buildSettingsOverview({ settings: { model: 'groq:openai/gpt-oss-120b' } }, NOW);
    expect(overview.attention).toEqual([
      { panel: 'model', text: expect.stringContaining('缺 Groq API Key，翻譯會無法使用') }
    ]);
    expect(overview.tiles.model.status).toEqual(['warn', '缺 Groq API Key']);
    expect(overview.keys.filter(key => key.filled)).toHaveLength(0);
  });

  it('金鑰都在：沒有提醒，模型卡標「金鑰已設定」，大卡片逐家列出', async () => {
    await loadOptions();
    const overview = options.buildSettingsOverview({
      settings: { model: 'groq:openai/gpt-oss-120b' },
      secrets: { groqApiKey: 'gsk_dummy', apiKey: 'AIza_dummy' }
    }, NOW);
    expect(overview.attention).toEqual([]);
    expect(overview.tiles.model.status).toEqual(['ok', '金鑰已設定']);
    expect(overview.keys.filter(key => key.filled)).toHaveLength(2);
    expect(overview.keys).toEqual(expect.arrayContaining([
      { label: 'Groq', filled: true },
      { label: 'Gemini', filled: true },
      { label: 'OpenRouter', filled: false }
    ]));
    // 自訂端點沒設網址就不列
    expect(overview.keys.map(key => key.label)).not.toContain('自訂端點');
  });

  it('瀏覽器內建翻譯不需金鑰', async () => {
    await loadOptions();
    const builtin = options.buildSettingsOverview({ settings: { model: 'builtin:translator' } }, NOW);
    expect(builtin.attention).toEqual([]);
    expect(builtin.tiles.model.status).toEqual(['ok', '不需金鑰']);
  });

  it('字典或全文翻譯選了另一家缺金鑰的模型也要提醒；跟主模型同一家就不重複', async () => {
    await loadOptions();
    const other = options.buildSettingsOverview({
      settings: { model: 'groq:openai/gpt-oss-120b', dictionaryModel: 'gemini-3.8-flash' },
      secrets: { groqApiKey: 'gsk_dummy' }
    }, NOW);
    expect(other.attention.map(item => item.text)).toEqual([expect.stringMatching(/^字典選的模型缺 Gemini API Key/)]);

    const same = options.buildSettingsOverview({
      settings: { model: 'groq:openai/gpt-oss-120b', pageTranslationModel: 'groq:openai/gpt-oss-120b' }
    }, NOW);
    expect(same.attention).toHaveLength(1);
  });

  it('備份：沒備份過標灰色、超過 30 天標黃色、最近備份只寫日期', async () => {
    await loadOptions();
    const tileOf = lastBackupAt => options.buildSettingsOverview({ lastBackupAt }, NOW).tiles.backup;
    expect(tileOf('')).toEqual({ summary: '單字本還沒匯出過備份', status: ['off', '未備份'] });
    expect(tileOf(new Date(NOW - 31 * DAY).toISOString())).toEqual({ summary: '單字本上次備份：31 天前', status: ['warn', '超過 30 天'] });
    expect(tileOf(new Date(NOW - 2 * 60 * 60 * 1000).toISOString())).toEqual({ summary: '單字本上次備份：今天' });
  });

  it('術語表、動作、雲端同步與讀取失敗的寫法', async () => {
    await loadOptions();
    const ok = options.buildSettingsOverview({
      actions: [{ enabled: true }, { enabled: false }, { enabled: true }],
      glossary: { terms: [{}, {}, {}], sites: ['example.com'] },
      cloud: { configured: true, meta: { signedIn: true } }
    }, NOW);
    expect(ok.tiles.actions.summary).toBe('2 個動作啟用中');
    expect(ok.tiles.glossary.summary).toBe('3 筆術語，限 1 個網站');
    expect(ok.tiles.cloud.status).toEqual(['ok', '已登入']);

    const failed = options.buildSettingsOverview({}, NOW);
    expect(failed.tiles.actions.summary).toBe('動作清單讀取失敗');
    expect(failed.tiles.glossary.summary).toBe('術語表讀取失敗');
    expect(failed.tiles.cloud.summary).toBe('同步狀態讀取失敗');

    const unset = options.buildSettingsOverview({ cloud: { configured: false, meta: {} } }, NOW);
    expect(unset.tiles.cloud.status).toEqual(['off', '未設定']);
  });
});

describe('總覽畫面（renderSettingsOverview）', () => {
  it('讀 storage 畫出數字、卡片摘要、提醒列；按「去設定」進模型分類', async () => {
    await loadOptions({
      sync: { model: 'groq:openai/gpt-oss-120b', obsidianVault: 'My Notes' },
      local: { lastVocabularyBackupAt: new Date().toISOString() }
    });
    await options.renderSettingsOverview();
    expect(document.querySelector('[data-summary-for="obsidian"]').textContent).toBe('Vault：My Notes');
    expect(document.querySelector('[data-status-for="backup"]').hidden).toBe(true);
    expect(document.querySelector('[data-status-for="model"]').dataset.kind).toBe('warn');
    expect($('overviewKeys').textContent).toContain('Groq 金鑰未填');
    expect($('overviewAttention').hidden).toBe(false);

    $('overviewAttention').querySelector('button').click();
    expect(visiblePanels()).toEqual(['model']);
  });

  it('金鑰齊全時收起提醒列', async () => {
    await loadOptions({
      sync: { model: 'groq:openai/gpt-oss-120b' },
      local: { groqApiKey: 'gsk_dummy' }
    });
    await options.renderSettingsOverview();
    expect($('overviewAttention').hidden).toBe(true);
    expect($('overviewKeys').textContent).toContain('Groq 金鑰已填');
  });
});

describe('未儲存提示', () => {
  const edit = (id, value) => {
    const el = $(id);
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('改了要按儲存的欄位：儲存列顯示提示，回總覽後列出分類並可跳回去', async () => {
    await loadOptions();
    tile('language').click();
    edit('vocabularyHighlightMode', 'auto');
    expect($('saveState').textContent).toBe('有未儲存的變更');

    $('btnBackToOverview').click();
    expect($('overviewUnsaved').hidden).toBe(false);
    expect($('overviewUnsaved').textContent).toContain('「語言與朗讀」有未儲存的變更');
    $('overviewUnsaved').querySelector('button').click();
    expect(visiblePanels()).toEqual(['language']);
  });

  it('有沒存的改動時關頁會被攔下；沒有就不攔', async () => {
    await loadOptions();
    const fire = () => {
      const event = new Event('beforeunload', { cancelable: true });
      beforeUnloadHandler(event);
      return event.defaultPrevented;
    };
    expect(fire()).toBe(false);
    edit('obsidianVault', 'Notes');
    expect(fire()).toBe(true);
    options.clearSettingsDirty();
    expect(fire()).toBe(false);
  });

  it('不經「儲存設定」的欄位（模型比較、搜尋框）不算未儲存', async () => {
    await loadOptions();
    $('compareText').value = 'hello';
    $('compareText').dispatchEvent(new Event('input', { bubbles: true }));
    $('settingsSearch').value = 'vault';
    $('settingsSearch').dispatchEvent(new Event('input', { bubbles: true }));
    expect($('saveState').textContent).toBe('');
    expect($('overviewUnsaved').hidden).toBe(true);
  });

  it('按「儲存設定」成功後清掉提示', async () => {
    await loadOptions({ local: { groqApiKey: 'gsk_dummy' }, sync: { model: 'groq:openai/gpt-oss-120b' } });
    tile('language').click();
    edit('targetLanguage', 'ja');
    expect($('saveState').textContent).toBe('有未儲存的變更');
    $('btnSave').click();
    for (let i = 0; i < 10; i++) await flush();
    expect($('status').textContent).toMatch(/設定已儲存/);
    expect($('saveState').textContent).toBe('');
  });

  it('存檔被擋下（缺金鑰又不移除）時提示留著', async () => {
    await loadOptions({ sync: { model: 'groq:openai/gpt-oss-120b' } });
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    tile('obsidian').click();
    edit('obsidianVault', 'Notes');
    $('btnSave').click();
    for (let i = 0; i < 10; i++) await flush();
    expect($('status').className).toBe('err');
    expect($('saveState').textContent).toBe('有未儲存的變更');
    confirmSpy.mockRestore();
  });
});

describe('說明精簡後的欄位狀態', () => {
  const keyState = name => document.querySelector(`[data-key-state-for="${name}"]`);
  const change = el => el.dispatchEvent(new Event('change', { bubbles: true }));

  it('金鑰標籤依目前選的模型顯示：用到的標使用中／缺 Key，沒用到的標已填／未填', async () => {
    await loadOptions({ sync: { model: 'groq:openai/gpt-oss-120b' }, local: { groqApiKey: 'gsk_dummy' } });
    expect([keyState('groq').dataset.state, keyState('groq').textContent]).toEqual(['in-use', '使用中']);
    expect([keyState('gemini').dataset.state, keyState('gemini').textContent]).toEqual(['empty', '未填']);

    // 字典改用 Gemini，但還沒填 Gemini 金鑰
    $('dictionaryModel').value = 'gemini-3.8-flash';
    change($('dictionaryModel'));
    expect(keyState('gemini').textContent).toBe('缺 Key');

    // 主模型換掉後，Groq 沒人用了只剩「已填」
    $('model').value = 'gemini-3.8-flash';
    change($('model'));
    expect(keyState('groq').textContent).toBe('已填');

    $('apiKey').value = 'AIza_dummy';
    $('apiKey').dispatchEvent(new Event('input', { bubbles: true }));
    expect(keyState('gemini').textContent).toBe('使用中');
  });

  it('自訂端點要網址、模型名稱、金鑰都填才算已填', async () => {
    await loadOptions();
    expect(keyState('custom').textContent).toBe('未填');
    $('customApiBase').value = 'https://example.com/v1';
    $('customModelName').value = 'm';
    $('customApiKey').value = 'k';
    $('customApiKey').dispatchEvent(new Event('input', { bubbles: true }));
    expect(keyState('custom').textContent).toBe('已填');
  });

  it('備份密碼欄只在勾選加密匯出時出現', async () => {
    await loadOptions();
    expect($('backupPasswordField').hidden).toBe(true);
    $('includeSecretsExport').checked = true;
    change($('includeSecretsExport'));
    expect($('backupPasswordField').hidden).toBe(false);
    $('includeSecretsExport').checked = false;
    change($('includeSecretsExport'));
    expect($('backupPasswordField').hidden).toBe(true);
  });

  it('匯入加密備份但沒填密碼：打開密碼欄、說明原因，什麼都不寫入', async () => {
    await loadOptions();
    const file = { text: async () => JSON.stringify({
      app: 'fan-fan-ba', schemaVersion: 1, settings: { model: 'gemini-3.8-flash' },
      secretsEncrypted: { version: 1, algorithm: 'AES-GCM', salt: '', iv: '', data: '' }
    }) };
    Object.defineProperty($('settingsImportFile'), 'files', { value: [file], configurable: true });
    change($('settingsImportFile'));
    for (let i = 0; i < 5; i++) await flush();
    expect($('backupPasswordField').hidden).toBe(false);
    expect(document.activeElement).toBe($('backupPassword'));
    expect($('status').textContent).toMatch(/有加密，請輸入備份密碼/);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
  });
});

describe('報告補做：選項、變數、快捷鍵、內建動作', () => {
  it('解釋語言選單第一項就標出建議值', async () => {
    await loadOptions();
    expect($('explanationLanguage').options[0].textContent).toBe('跟隨翻譯語言（建議）');
  });

  it('動作編輯器的變數按鈕與 AI 說明都不列 {{pageUrl}}', async () => {
    await loadOptions();
    const vars = [...$('actionVarButtons').querySelectorAll('button')].map(button => button.textContent);
    expect(vars).toEqual(['{{selection}}', '{{context}}', '{{pageTitle}}', '{{targetLanguage}}']);
    expect(options.buildActionAiGuideText()).not.toContain('pageUrl');
  });

  it('內建動作列有鎖頭標籤，滑過說明能改什麼', async () => {
    await loadOptions();
    tile('actions').click();
    for (let i = 0; i < 3; i++) await flush();
    const badge = document.querySelector('#actionList .action-row[data-id="translate"] .action-badge');
    expect(badge.classList.contains('is-locked')).toBe(true);
    expect(badge.title).toMatch(/只能停用或調整順序/);
    expect($('btnCopyAiGuide').textContent).toBe('複製給 AI 的說明');
  });

  it('總覽頁尾顯示瀏覽器實際綁定的快捷鍵；沒綁的寫未設定，讀不到就整列收起', async () => {
    chrome.commands.getAll.mockResolvedValueOnce([
      { name: 'translate-selection', description: '翻譯選取文字', shortcut: 'Alt+S' },
      { name: 'toggle-page-translation', description: '切換全文翻譯', shortcut: '' },
      { name: '_execute_action', description: '', shortcut: 'Alt+F' }
    ]);
    await loadOptions();
    expect($('overviewShortcuts').hidden).toBe(false);
    expect($('overviewShortcutList').textContent).toBe('翻譯選取文字 Alt+S切換全文翻譯 未設定');
    expect($('overviewShortcutList').querySelector('kbd.is-unset').textContent).toBe('未設定');

    $('btnOpenShortcuts').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });

    options.renderOverviewShortcuts([]);
    expect($('overviewShortcuts').hidden).toBe(true);
  });
});
