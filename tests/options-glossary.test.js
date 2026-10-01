// 設定頁「術語表」：編輯、驗證、儲存、CSV 匯入匯出、設定檔與雲端同步
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

async function loadOptions(initialStore = {}, { cloudSync } = {}) {
  jest.resetModules();
  document.body.innerHTML = bodyHtml;
  mockLocalStorage(initialStore);
  chrome.storage.sync.get.mockResolvedValue({});
  chrome.storage.sync.set.mockResolvedValue();
  if (cloudSync) global.FanFanBaCloudSync = cloudSync;
  else delete global.FanFanBaCloudSync;
  options = require('../options');
  await flush();
  await flush();
  return options;
}

const rows = () => [...document.querySelectorAll('#glossaryRows .glossary-row')];
const rowValues = () => rows().map(row => ['source', 'target', 'note'].map(field => row.querySelector(`.glossary-${field}`).value));
function fillRow(row, { source = '', target = '', note = '' }) {
  row.querySelector('.glossary-source').value = source;
  row.querySelector('.glossary-target').value = target;
  row.querySelector('.glossary-note').value = note;
}
async function clickSave() {
  $('btnSave').click();
  for (let i = 0; i < 6; i++) await flush();
}
const csvFile = text => ({ size: text.length, text: async () => text });

const STORED = {
  glossary: {
    terms: [{ source: 'lead time', target: '前置時間', note: '供應鏈' }, { source: 'MOQ', target: '最小訂購量' }],
    sites: ['example.com']
  }
};

beforeAll(() => loadOptions(), 30000);

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
  window.confirm = jest.fn(() => true);
});

afterAll(() => { delete global.FanFanBaCloudSync; });

describe('術語表編輯器', () => {
  it('載入已存的術語與網站；沒有存過時留一列空白', async () => {
    await loadOptions(STORED);
    expect(rowValues()).toEqual([['lead time', '前置時間', '供應鏈'], ['MOQ', '最小訂購量', '']]);
    expect($('glossarySites').value).toBe('example.com');

    await loadOptions();
    expect(rowValues()).toEqual([['', '', '']]);
  });

  it('新增一列、刪除一列；刪到最後一列時留一列空白', async () => {
    await loadOptions(STORED);
    $('btnAddGlossaryTerm').click();
    expect(rows()).toHaveLength(3);
    expect(document.activeElement).toBe(rows()[2].querySelector('.glossary-source'));
    rows().forEach(row => row.querySelector('button').click());
    expect(rowValues()).toEqual([['', '', '']]);
  });

  it('按「儲存設定」寫進本機術語表，空白列略過', async () => {
    await loadOptions();
    fillRow(rows()[0], { source: 'forecast', target: '預測' });
    $('btnAddGlossaryTerm').click();
    $('glossarySites').value = 'https://Docs.Example.com/path\n\n';
    await clickSave();
    expect(store.glossary).toEqual({ terms: [{ source: 'forecast', target: '預測' }], sites: ['docs.example.com'] });
  });

  it.each([
    ['缺譯文', row => fillRow(row, { source: 'MOQ' }), '術語表：第 1 列缺譯文'],
    ['缺原文', row => fillRow(row, { target: '預測' }), '術語表：第 1 列缺原文'],
    ['看不懂的網站', row => { fillRow(row, { source: 'a', target: 'b' }); $('glossarySites').value = 'not a site'; }, '術語表：看不懂的網站：not a site']
  ])('%s：不儲存、切到術語表分頁並說明原因', async (_name, arrange, message) => {
    await loadOptions(STORED);
    rows().slice(1).forEach(row => row.remove());
    arrange(rows()[0]);
    await clickSave();
    expect($('status').textContent).toContain(message);
    expect(store.glossary).toEqual(STORED.glossary);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(document.querySelector('.settings-panel[data-panel-content="glossary"]').hidden).toBe(false);
  });

  it('原文重複（不分大小寫）不儲存，標出那一列', async () => {
    await loadOptions(STORED);
    $('btnAddGlossaryTerm').click();
    fillRow(rows()[2], { source: 'Lead Time', target: '交期' });
    await clickSave();
    expect($('status').textContent).toContain('術語表：原文重複：Lead Time');
    expect(rows()[2].classList.contains('is-invalid')).toBe(true);
    expect(store.glossary).toEqual(STORED.glossary);
    // 改過那一列就先拿掉錯誤標示
    rows()[2].querySelector('.glossary-source').dispatchEvent(new Event('input', { bubbles: true }));
    expect(rows()[2].classList.contains('is-invalid')).toBe(false);
  });
});

describe('CSV 匯入匯出', () => {
  it('匯入接在現有列後面；原文重複與缺欄位的列略過並說明', async () => {
    await loadOptions(STORED);
    const result = await options.importGlossaryCsvFile(csvFile('source,target,note\nLEAD TIME,交期,\nSKU,庫存單位,\n,沒有原文,\n'));
    expect(result).toEqual({ added: 1, duplicated: 1, skipped: 1 });
    expect(rowValues().map(values => values[0])).toEqual(['lead time', 'MOQ', 'SKU']);
    expect($('glossaryStatus').textContent).toBe('已加入 1 筆，1 筆原文重複略過，1 列缺原文或譯文略過；按「儲存設定」才會生效。');
    // 只加進編輯器，還沒存
    expect(store.glossary).toEqual(STORED.glossary);
  });

  it('只有一列空白時，匯入會取代那列空白', async () => {
    await loadOptions();
    await options.importGlossaryCsvFile(csvFile('MOQ,最小訂購量'));
    expect(rowValues()).toEqual([['MOQ', '最小訂購量', '']]);
  });

  it('超過 1MB 的檔案擋下', async () => {
    await loadOptions(STORED);
    const result = await options.importGlossaryCsvFile({ size: 2 * 1024 * 1024, text: async () => '' });
    expect(result).toBeNull();
    expect($('glossaryStatus').textContent).toContain('檔案太大');
  });

  it('匯出用單字本同一套公式注入防護', async () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:x');
    global.URL.revokeObjectURL = jest.fn();
    await loadOptions();
    fillRow(rows()[0], { source: '=HYPERLINK("http://x")', target: '@cmd' });
    const csv = options.exportGlossaryCsv();
    expect(csv.split('\r\n')[1]).toBe('"\'=HYPERLINK(""http://x"")",\'@cmd,');
    expect($('glossaryStatus').textContent).toBe('已匯出 1 筆術語成 CSV。');
  });

  it('空的術語表不匯出', async () => {
    await loadOptions();
    expect(options.exportGlossaryCsv()).toBeNull();
    expect($('glossaryStatus').textContent).toContain('術語表是空的');
  });
});

describe('設定檔與雲端同步', () => {
  it('匯出設定檔帶術語表；空的不帶', async () => {
    await loadOptions(STORED);
    expect((await options.buildSettingsBackupPayload(false)).glossary).toEqual(STORED.glossary);
    await loadOptions();
    expect((await options.buildSettingsBackupPayload(false))).not.toHaveProperty('glossary');
  });

  it('雲端上傳的內容含術語表、不含 API Key', async () => {
    await loadOptions({ ...STORED, groqApiKey: 'gsk_secret' });
    const payload = await options.buildCloudSettingsPayload();
    expect(payload.settings.glossary).toEqual(STORED.glossary);
    expect(JSON.stringify(payload)).not.toContain('gsk_secret');
  });

  it('匯入設定檔：術語表整份取代、壞掉的列略過，狀態列出筆數', async () => {
    await loadOptions(STORED);
    const file = { text: async () => JSON.stringify({
      app: 'fan-fan-ba',
      schemaVersion: 1,
      settings: {},
      glossary: { terms: [{ source: 'SKU', target: '庫存單位' }, { source: '', target: 'x' }], sites: [] }
    }) };
    const result = await options.importSettingsBackupFile(file);
    expect(store.glossary).toEqual({ terms: [{ source: 'SKU', target: '庫存單位' }], sites: [] });
    expect(rowValues()).toEqual([['SKU', '庫存單位', '']]);
    expect(options.formatImportSettingsStatus(result)).toBe('✓ 設定檔已匯入：術語表（1 筆）');
  });

  function mockCloudSync(payloadSettings) {
    const real = require('../cloud-sync');
    return {
      ...real,
      getAuthToken: jest.fn(async () => 'token'),
      recordCloudSyncSignIn: jest.fn(async () => {}),
      findCloudSettingsFile: jest.fn(async () => ({ id: 'f', modifiedTime: 't' })),
      downloadCloudSettings: jest.fn(async () => ({ updatedAt: 't', settings: payloadSettings })),
      getCloudSyncMeta: jest.fn(async () => ({})),
      loadWebAuthClientId: jest.fn(async () => '')
    };
  }

  it('雲端下載：雲端檔有術語表就覆寫本機', async () => {
    await loadOptions(STORED, { cloudSync: mockCloudSync({ model: 'groq:openai/gpt-oss-120b', glossary: { terms: [{ source: 'SKU', target: '庫存單位' }], sites: [] } }) });
    $('btnCloudDownload').click();
    for (let i = 0; i < 10; i++) await flush();
    expect(store.glossary).toEqual({ terms: [{ source: 'SKU', target: '庫存單位' }], sites: [] });
    expect($('status').textContent).toContain('與術語表（1 筆）');
  });

  it('雲端下載：舊版上傳的檔案沒有術語表時，本機術語表不動', async () => {
    await loadOptions(STORED, { cloudSync: mockCloudSync({ model: 'groq:openai/gpt-oss-120b' }) });
    $('btnCloudDownload').click();
    for (let i = 0; i < 10; i++) await flush();
    expect(chrome.storage.sync.set).toHaveBeenCalled();
    expect(store.glossary).toEqual(STORED.glossary);
  });
});
