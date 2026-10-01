// 設定頁「自訂動作」：清單、編輯器、預覽、設定檔匯出匯入
// 用真的 options.html 內容建 DOM，順便鎖住 HTML 與 options.js 之間的 id 對應。
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
  // 載入時的單字本快照查詢不算；之後的操作才檢查有沒有送請求
  chrome.runtime.sendMessage.mockClear();
  return options;
}

const listNames = () => [...document.querySelectorAll('#actionList .action-row .action-row-name > span:not(.action-badge):not(.feature-badge)')]
  .map(el => el.textContent);
const row = name => [...document.querySelectorAll('#actionList .action-row')]
  .find(item => item.querySelector('.action-row-name').textContent.startsWith(name));
const rowButton = (name, text) => [...row(name).querySelectorAll('button')].find(button => button.textContent === text);

function fillField(index, { key, label, description = '' }) {
  const fieldRow = document.querySelectorAll('#actionFields .action-field-row')[index];
  fieldRow.querySelector('.action-field-key').value = key;
  fieldRow.querySelector('.action-field-label').value = label;
  fieldRow.querySelector('.action-field-description').value = description;
}

async function submitEditor() {
  $('actionEditor').dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  await flush();
}

const storedCustoms = () => (store.actionList || []).filter(action => !action.builtin);

describe('設定頁：自訂動作清單', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('預設列出四個內建動作，標示內建、只有「以此為範本」、沒有編輯與刪除', async () => {
    await loadOptions();
    expect(listNames()).toEqual(['翻譯', '解釋', '優化', '長難句分析']);
    const translate = row('翻譯');
    expect(translate.querySelector('.action-badge').textContent).toBe('內建');
    const texts = [...translate.querySelectorAll('button')].map(button => button.textContent);
    expect(texts).toEqual(['↑', '↓', '以此為範本']);
    expect(rowButton('翻譯', '↑').disabled).toBe(true);
    expect(rowButton('長難句分析', '↓').disabled).toBe(true);
  });

  it('新增：填名稱、prompt、欄位後儲存，寫進 storage 並出現在清單最後', async () => {
    await loadOptions();
    $('btnNewAction').click();
    expect($('actionEditor').hidden).toBe(false);
    expect(document.activeElement).toBe($('actionName'));
    expect($('btnDeleteAction').hidden).toBe(true);

    $('actionName').value = '重點摘要';
    $('actionUserPrompt').value = '摘要：{{selection}}';
    fillField(0, { key: 'summary', label: '摘要' });
    $('actionIconPicker').querySelector('input[value="list"]').checked = true;
    $('actionSaveTo').value = 'obsidian';
    await submitEditor();

    expect($('actionEditor').hidden).toBe(true);
    expect(listNames()).toEqual(['翻譯', '解釋', '優化', '長難句分析', '重點摘要']);
    const [saved] = storedCustoms();
    expect(saved).toEqual(expect.objectContaining({
      name: '重點摘要', icon: 'list', userPrompt: '摘要：{{selection}}', saveTo: 'obsidian',
      layout: 'fields', model: 'default', fields: [{ key: 'summary', label: '摘要', description: '' }]
    }));
    expect(saved.id).toMatch(/^custom-[a-z0-9-]+$/);
    expect($('actionListStatus').textContent).toContain('已儲存');
  });

  it('驗證不過：顯示原因、不寫 storage、編輯器保持開啟', async () => {
    await loadOptions();
    $('btnNewAction').click();
    fillField(0, { key: '1bad', label: '壞代號' });
    await submitEditor();
    expect($('actionEditorError').textContent).toContain('英文字母開頭');
    expect($('actionEditor').hidden).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();

    fillField(0, { key: 'ok', label: '好' });
    $('actionUserPrompt').value = '{{unknown}}';
    await submitEditor();
    expect($('actionEditorError').textContent).toContain('不支援的變數');
  });

  it('欄位最多 8 個：第 9 個加不進去並提示', async () => {
    await loadOptions();
    $('btnNewAction').click();
    for (let i = 0; i < 10; i++) $('btnAddActionField').click();
    expect(document.querySelectorAll('#actionFields .action-field-row')).toHaveLength(8);
    expect($('actionEditorError').textContent).toBe('輸出欄位最多 8 個');
  });

  it('編輯與刪除：改名後儲存；刪除要確認，取消就不刪', async () => {
    const custom = {
      id: 'custom-a', name: '舊名', icon: 'pen', builtin: false, enabled: true, pinned: false, order: 3,
      model: 'default', systemPrompt: '', userPrompt: '{{selection}}',
      fields: [{ key: 'result', label: '結果', description: '' }], layout: 'fields', saveTo: 'none'
    };
    await loadOptions({ actionList: [custom] });
    rowButton('舊名', '編輯').click();
    expect($('actionName').value).toBe('舊名');
    expect($('btnDeleteAction').hidden).toBe(false);
    $('actionName').value = '新名';
    await submitEditor();
    expect(storedCustoms().map(action => action.name)).toEqual(['新名']);

    window.confirm = jest.fn(() => false);
    rowButton('新名', '編輯').click();
    $('btnDeleteAction').click();
    await flush();
    expect(storedCustoms()).toHaveLength(1);

    window.confirm = jest.fn(() => true);
    $('btnDeleteAction').click();
    await flush(); await flush();
    expect(storedCustoms()).toHaveLength(0);
    expect(listNames()).toEqual(['翻譯', '解釋', '優化', '長難句分析']);
  });

  it('以內建為範本：產生可編輯的自訂動作，內建動作不變', async () => {
    await loadOptions();
    rowButton('優化', '以此為範本').click();
    expect($('actionName').value).toBe('優化（自訂）');
    expect($('actionLayout').value).toBe('compare');
    await submitEditor();
    expect(listNames()).toEqual(['翻譯', '解釋', '優化', '長難句分析', '優化（自訂）']);
    expect(store.actionList.filter(action => action.builtin).every(action => !('userPrompt' in action))).toBe(true);
  });

  it('長難句分析也能當範本：版面是原文標註，存出的自訂動作通過驗證', async () => {
    await loadOptions();
    rowButton('長難句分析', '以此為範本').click();
    expect($('actionName').value).toBe('長難句分析（自訂）');
    expect($('actionLayout').value).toBe('annotate');
    await submitEditor();
    const [saved] = storedCustoms();
    expect(saved).toEqual(expect.objectContaining({ name: '長難句分析（自訂）', layout: 'annotate', icon: 'list' }));
    expect(saved.fields.map(field => field.key)).toEqual(['marks', 'translation']);
  });

  it('複製自訂動作：新 id、名稱加（副本）', async () => {
    await loadOptions();
    rowButton('翻譯', '以此為範本').click();
    await submitEditor();
    rowButton('翻譯（自訂）', '複製').click();
    await submitEditor();
    const customs = storedCustoms();
    expect(customs.map(action => action.name)).toEqual(['翻譯（自訂）', '翻譯（自訂）（副本）']);
    expect(new Set(customs.map(action => action.id)).size).toBe(2);
  });

  it('排序：上移寫回 storage，焦點留在同一個動作的上移鈕，可以連按', async () => {
    await loadOptions();
    rowButton('優化', '↑').click();
    await flush(); await flush();
    expect(listNames()).toEqual(['翻譯', '優化', '解釋', '長難句分析']);
    expect(store.actionList.map(action => [action.id, action.order]))
      .toEqual([['translate', 0], ['optimize', 1], ['explain', 2], ['analyze', 3]]);
    expect(document.activeElement).toBe(rowButton('優化', '↑'));
    document.activeElement.click();
    await flush(); await flush();
    expect(listNames()).toEqual(['優化', '翻譯', '解釋', '長難句分析']);
    // 到頂了：上移鈕停用，焦點改到下移鈕
    expect(document.activeElement).toBe(rowButton('優化', '↓'));
  });

  it('停用：勾掉後寫回 storage', async () => {
    await loadOptions();
    const checkbox = row('解釋').querySelector('input[type="checkbox"]');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change'));
    await flush(); await flush();
    expect(store.actionList.find(action => action.id === 'explain').enabled).toBe(false);
    expect(row('解釋').classList.contains('is-disabled')).toBe(true);
  });

  it('變數插入鈕：插在游標位置，系統提示不受影響', async () => {
    await loadOptions();
    $('btnNewAction').click();
    const textarea = $('actionUserPrompt');
    textarea.value = '前後';
    textarea.setSelectionRange(1, 1);
    [...$('actionVarButtons').querySelectorAll('button')].find(button => button.textContent === '{{context}}').click();
    expect(textarea.value).toBe('前{{context}}後');
    expect(textarea.selectionStart).toBe('前{{context}}'.length);
    expect($('actionSystemPrompt').value).toBe('');
  });

  it('Esc 關閉編輯器，焦點回到「新增」', async () => {
    await loadOptions();
    $('btnNewAction').click();
    $('actionName').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect($('actionEditor').hidden).toBe(true);
    expect(document.activeElement).toBe($('btnNewAction'));
  });
});

describe('設定頁：預覽', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  it('依所選版面用範例資料渲染，改版面即時更新；不發任何網路請求', async () => {
    await loadOptions();
    $('btnNewAction').click();
    expect($('actionPreview').querySelector('.g-ca-fields')).not.toBeNull();

    fillField(0, { key: 'marks', label: '標註' });
    $('actionLayout').value = 'annotate';
    $('actionLayout').dispatchEvent(new Event('change', { bubbles: true }));
    const marks = [...$('actionPreview').querySelectorAll('mark')].map(mark => mark.textContent);
    expect(marks).toEqual(['have been', 'since three years']);
    expect($('actionLayoutNote').textContent).toContain('陣列');

    $('actionLayout').value = 'compare';
    $('actionLayout').dispatchEvent(new Event('change', { bubbles: true }));
    expect($('actionPreview').querySelector('.g-ca-before')).not.toBeNull();

    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('欄位還沒填時顯示提示；320／500 寬切換', async () => {
    await loadOptions();
    $('btnNewAction').click();
    fillField(0, { key: '', label: '' });
    $('actionEditor').dispatchEvent(new Event('input', { bubbles: true }));
    expect($('actionPreview').textContent).toContain('至少填一個欄位');

    document.querySelector('[data-preview-width="500"]').click();
    expect($('actionPreview').style.width).toBe('500px');
    expect(document.querySelector('[data-preview-width="500"]').getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-preview-width="320"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('「用 AI 協助設定」只複製說明文字，不呼叫 API', async () => {
    await loadOptions();
    const writeText = jest.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    $('btnCopyAiGuide').click();
    await flush();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('{{selection}}');
    expect(writeText.mock.calls[0][0]).toContain('台灣慣用語');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('設定頁：設定檔匯出匯入帶動作清單', () => {
  const custom = {
    id: 'custom-b', name: '摘要', icon: 'list', builtin: false, enabled: true, pinned: false, order: 3,
    model: 'default', systemPrompt: '', userPrompt: '{{selection}}',
    fields: [{ key: 'summary', label: '摘要', description: '' }], layout: 'fields', saveTo: 'none'
  };

  beforeEach(() => jest.clearAllMocks());

  it('匯出帶 actions；雲端同步 payload 不含', async () => {
    await loadOptions({ actionList: [custom] });
    const payload = await options.buildSettingsBackupPayload(false);
    expect(payload.actions).toEqual([custom]);
    const cloud = await options.buildCloudSettingsPayload();
    expect(JSON.stringify(cloud)).not.toContain('custom-b');
  });

  it('沒存過動作清單時不帶 actions 鍵', async () => {
    await loadOptions();
    const payload = await options.buildSettingsBackupPayload(false);
    expect(payload).not.toHaveProperty('actions');
  });

  it('匯入整份取代清單，壞掉的自訂動作略過，狀態列出數量', async () => {
    await loadOptions({ actionList: [custom] });
    const file = {
      text: async () => JSON.stringify({
        app: 'fan-fan-ba', schemaVersion: 1, settings: {},
        actions: [
          { ...custom, id: 'custom-c', name: '新的' },
          { id: 'custom-bad', name: '', fields: [] },
          { id: 'explain', builtin: true, enabled: false, order: 0 }
        ]
      })
    };
    const result = await options.importSettingsBackupFile(file);
    expect(result.actionsCount).toBe(1);
    expect(options.formatImportSettingsStatus(result)).toBe('✓ 設定檔已匯入：動作清單（1 個自訂動作）');
    expect(storedCustoms().map(action => action.id)).toEqual(['custom-c']);
    expect(store.actionList.find(action => action.id === 'explain').enabled).toBe(false);
    // explain 的 order 0 與 translate 預設值相同，維持內建順序
    expect(listNames()).toEqual(['翻譯', '解釋', '優化', '長難句分析', '新的']);
  });
});
