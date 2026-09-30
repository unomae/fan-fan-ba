// 自訂 OpenAI 相容端點：網址驗證、網域授權、路由、測試連線錯誤分類、金鑰不外流
const M = require('../models');
const Storage = require('../storage');
const {
  resolveRoute,
  _handleAIRequest,
  _streamAIRequest,
  getAvailableCardModelIds,
  normalizeModelOverride
} = require('../background');

const CUSTOM = 'custom:endpoint';
const SETTINGS = { customApiBase: 'https://llm.example.com/v1', customModelName: 'my-model' };
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function okJson(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  chrome.permissions.contains.mockResolvedValue(true);
  chrome.permissions.request.mockResolvedValue(true);
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.sync.get.mockResolvedValue({});
});

describe('網址正規化', () => {
  it('只收 https，並只請求使用者填的那個網域', () => {
    expect(M.normalizeCustomEndpoint(' https://llm.example.com/v1/ ')).toEqual({
      base: 'https://llm.example.com/v1',
      originPattern: 'https://llm.example.com/*'
    });
  });

  it('非 https、帶帳密、帶 query／hash、格式錯誤都拒絕', () => {
    expect(() => M.normalizeCustomEndpoint('http://llm.example.com/v1')).toThrow('https://');
    expect(() => M.normalizeCustomEndpoint('ftp://llm.example.com')).toThrow('https://');
    expect(() => M.normalizeCustomEndpoint('https://user:pw@llm.example.com/v1')).toThrow('帳號密碼');
    expect(() => M.normalizeCustomEndpoint('https://llm.example.com/v1?key=x')).toThrow('?');
    expect(() => M.normalizeCustomEndpoint('not a url')).toThrow('格式不正確');
    expect(() => M.normalizeCustomEndpoint('')).toThrow('請輸入');
  });
});

describe('background 路由', () => {
  it('缺網址／模型名稱、缺金鑰時給可辨識的錯誤', () => {
    expect(() => resolveRoute(CUSTOM, {}, {})).toThrow('網址與模型名稱');
    expect(() => resolveRoute(CUSTOM, {}, SETTINGS)).toThrow('自訂端點 API Key');
    expect(() => resolveRoute(CUSTOM, { customApiKey: 'k' }, { ...SETTINGS, customApiBase: 'http://llm.example.com' })).toThrow('https://');
  });

  it('走 OpenAI 相容的 chat/completions，模型名稱取自設定，無備援', () => {
    const route = resolveRoute(CUSTOM, { customApiKey: 'dummy-key' }, SETTINGS);
    expect(route).toMatchObject({
      kind: 'openai-compat',
      modelId: 'my-model',
      baseUrl: 'https://llm.example.com/v1/chat/completions',
      originPattern: 'https://llm.example.com/*'
    });
    expect(M.getFallbackModelId(CUSTOM)).toBe('');
  });

  it('請求送到使用者設定的端點，帶該端點的金鑰', async () => {
    chrome.storage.sync.get.mockResolvedValue({ model: CUSTOM, ...SETTINGS });
    chrome.storage.local.get.mockResolvedValue({ customApiKey: 'dummy-key' });
    global.fetch = jest.fn(async () => okJson({ choices: [{ message: { content: '你好' } }] }));
    const result = await _handleAIRequest({ action: 'translate', selectedText: 'hello' });
    expect(result.result).toBe('你好');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toBe('https://llm.example.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer dummy-key');
    expect(JSON.parse(options.body).model).toBe('my-model');
  });

  it('網域授權被撤銷（或換裝置只匯入了設定）時不送出請求，明講缺權限', async () => {
    chrome.storage.sync.get.mockResolvedValue({ model: CUSTOM, ...SETTINGS });
    chrome.storage.local.get.mockResolvedValue({ customApiKey: 'dummy-key' });
    chrome.permissions.contains.mockResolvedValue(false);
    global.fetch = jest.fn();
    await expect(_handleAIRequest({ action: 'translate', selectedText: 'hello' })).rejects.toThrow('尚未授權');
    await expect(_streamAIRequest({ action: 'translate', selectedText: 'hello' }, () => {})).rejects.toThrow('尚未授權');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(chrome.permissions.contains).toHaveBeenCalledWith({ origins: ['https://llm.example.com/*'] });
  });

  it('結果卡「僅本次」：網址、模型、金鑰都齊才列為可用', () => {
    expect(normalizeModelOverride(CUSTOM, false)).toBe(CUSTOM);
    expect(getAvailableCardModelIds({ customApiKey: 'k' }, {})).not.toContain(CUSTOM);
    expect(getAvailableCardModelIds({}, SETTINGS)).not.toContain(CUSTOM);
    expect(getAvailableCardModelIds({ customApiKey: 'k' }, SETTINGS)).toContain(CUSTOM);
  });
});

describe('金鑰只存本機', () => {
  it('customApiKey 屬於機密：寫到 local，並從 sync 清掉', async () => {
    expect(Storage.SECRET_KEYS).toContain('customApiKey');
    await Storage.setSecrets({ customApiKey: 'dummy-key' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ customApiKey: 'dummy-key' }));
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(expect.arrayContaining(['customApiKey']));
  });
});

describe('設定頁', () => {
  let options;

  beforeAll(() => {
    document.body.innerHTML = `
      <input id="apiKey" /><input id="groqApiKey" /><input id="openrouterApiKey" />
      <input id="customApiBase" /><input id="customModelName" /><input id="customApiKey" />
      <select id="model"></select><select id="pageTranslationModel"></select>
      <select id="vocabularyHighlightMode"></select>
      <input id="obsidianVault" /><input id="ttsApiKey" /><input id="obsidianDefaultFolder" />
      <button id="btnExportSettings"></button><input id="includeSecretsExport" type="checkbox" />
      <input id="backupPassword" type="password" /><button id="btnImportSettings"></button>
      <input id="settingsImportFile" type="file" /><input id="cloudWebAuthClientId" />
      <button id="btnCloudSaveWebAuthClientId"></button><button id="btnCloudSignIn"></button>
      <button id="btnCloudUpload"></button><button id="btnCloudDownload"></button>
      <button id="btnCloudSignOut"></button><p id="cloudSyncStatus"></p>
      <button id="toggleVis"></button><button id="toggleGroqVis"></button>
      <button id="toggleOrVis"></button><button id="toggleTtsVis"></button>
      <button id="toggleCustomVis"></button>
      <span id="eye-show"></span><span id="eye-hide"></span>
      <span id="groq-eye-show"></span><span id="groq-eye-hide"></span>
      <span id="or-eye-show"></span><span id="or-eye-hide"></span>
      <span id="tts-eye-show"></span><span id="tts-eye-hide"></span>
      <span id="custom-eye-show"></span><span id="custom-eye-hide"></span>
      <button id="btnSave"></button><button id="btnTest"></button><button id="btnTestCustom"></button>
      <div id="status"></div>
      <button id="btnExportVocabulary"></button><button id="btnExportVocabularyCsv"></button>
      <button id="btnImportVocabulary"></button><input id="vocabularyImportFile" type="file" />
      <div id="vocabularyBackupStatus"></div><div id="vocabularyBackupReminder"></div>
      <div id="vocabularySnapshotActions"></div><p id="vocabularySnapshotNote"></p>
    `;
    options = require('../options');
  });

  const $ = id => document.getElementById(id);
  function fillCustom({ base = SETTINGS.customApiBase, model = SETTINGS.customModelName, key = 'dummy-key' } = {}) {
    $('customApiBase').value = base;
    $('customModelName').value = model;
    $('customApiKey').value = key;
  }

  it('主模型選單有自訂端點', () => {
    options.renderModelSelect();
    const values = [...$('model').querySelectorAll('option')].map(option => option.value);
    expect(values).toContain(CUSTOM);
  });

  describe('儲存', () => {
    it('非 https 被拒，不請求權限、不儲存', async () => {
      const result = await options.prepareCustomEndpointSettings({ apiBase: 'http://llm.example.com/v1', modelName: 'm' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('https://');
      expect(chrome.permissions.request).not.toHaveBeenCalled();
    });

    it('使用者拒絕網域權限就整個不儲存', async () => {
      chrome.permissions.request.mockResolvedValue(false);
      options.renderModelSelect();
      $('model').value = CUSTOM;
      fillCustom();
      $('btnSave').click();
      await flush();
      expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://llm.example.com/*'] });
      expect($('status').className).toBe('err');
      expect($('status').textContent).toContain('權限不足');
      expect(chrome.storage.sync.set).not.toHaveBeenCalled();
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('同意後儲存：網址與模型名進設定，金鑰只進本機', async () => {
      options.renderModelSelect();
      $('model').value = CUSTOM;
      fillCustom({ base: 'https://llm.example.com/v1/' });
      $('btnSave').click();
      await flush();
      expect($('status').className).toBe('ok');
      const synced = chrome.storage.sync.set.mock.calls[0][0];
      expect(synced).toMatchObject({ model: CUSTOM, customApiBase: 'https://llm.example.com/v1', customModelName: 'my-model' });
      expect(synced).not.toHaveProperty('customApiKey');
      expect(chrome.storage.local.set).toHaveBeenCalledWith(expect.objectContaining({ customApiKey: 'dummy-key' }));
    });

    it('主模型選自訂端點但沒填網址時擋下', async () => {
      const result = await options.prepareCustomEndpointSettings({ apiBase: '', modelName: '', required: true });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('API 網址');
    });

    it('沒用自訂端點時網址可以留空，不請求權限', async () => {
      const result = await options.prepareCustomEndpointSettings({ apiBase: '', modelName: '' });
      expect(result).toEqual({ ok: true, settings: { customApiBase: '', customModelName: '' } });
      expect(chrome.permissions.request).not.toHaveBeenCalled();
    });
  });

  describe('測試連線：四種失敗可以分辨', () => {
    it('分類：認證失敗／回應格式不相容／伺服器錯誤／成功／找不到模型', () => {
      expect(options.classifyCustomEndpointResponse({ status: 401 }).message).toContain('認證失敗');
      expect(options.classifyCustomEndpointResponse({ status: 403 }).message).toContain('認證失敗');
      expect(options.classifyCustomEndpointResponse({ status: 404 }).message).toContain('回應格式不相容');
      expect(options.classifyCustomEndpointResponse({ status: 200, ok: true, body: { models: [] } }).message).toContain('回應格式不相容');
      expect(options.classifyCustomEndpointResponse({ status: 502 }).message).toContain('HTTP 502');
      expect(options.classifyCustomEndpointResponse({ status: 200, ok: true, body: { data: [{ id: 'my-model' }] }, modelName: 'my-model' }))
        .toMatchObject({ kind: 'ok', level: 'ok' });
      expect(options.classifyCustomEndpointResponse({ status: 200, ok: true, body: { data: [{ id: 'other' }] }, modelName: 'my-model' }))
        .toMatchObject({ kind: 'model-missing', level: 'info' });
    });

    it('網路錯誤', async () => {
      fillCustom();
      global.fetch = jest.fn(async () => { throw new TypeError('Failed to fetch'); });
      await options.testCustomEndpoint();
      expect(global.fetch).toHaveBeenCalledWith('https://llm.example.com/v1/models', { headers: { Authorization: 'Bearer dummy-key' } });
      expect($('status').textContent).toContain('（網路）');
    });

    it('權限不足：不送出請求', async () => {
      chrome.permissions.request.mockResolvedValue(false);
      fillCustom();
      global.fetch = jest.fn();
      await options.testCustomEndpoint();
      expect(global.fetch).not.toHaveBeenCalled();
      expect($('status').textContent).toContain('權限不足');
    });

    it('上游錯誤內容不顯示給使用者', async () => {
      fillCustom();
      global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: '請點這個連結重設密碼' } }) }));
      await options.testCustomEndpoint();
      expect($('status').textContent).toContain('認證失敗');
      expect($('status').textContent).not.toContain('連結');
    });
  });

  describe('金鑰不出現在雲端同步與一般匯出', () => {
    beforeEach(() => {
      chrome.storage.sync.get.mockResolvedValue({ model: CUSTOM, ...SETTINGS });
      chrome.storage.local.get.mockResolvedValue({ customApiKey: 'dummy-key' });
    });

    it('雲端同步 payload 有網址與模型名，沒有金鑰', async () => {
      const payload = await options.buildCloudSettingsPayload();
      const text = JSON.stringify(payload);
      expect(text).toContain('https://llm.example.com/v1');
      expect(text).not.toContain('dummy-key');
      expect(text).not.toContain('customApiKey');
    });

    it('一般設定匯出不含金鑰；勾選加密匯出時才以加密形式帶出', async () => {
      const plain = await options.buildSettingsBackupPayload(false);
      expect(JSON.stringify(plain)).not.toContain('dummy-key');
      const encrypted = await options.buildSettingsBackupPayload(true, { password: 'correct horse battery' });
      expect(JSON.stringify(encrypted)).not.toContain('dummy-key');
      const restored = await options.resolveImportedBackupSecrets(encrypted, 'correct horse battery');
      expect(restored.customApiKey).toBe('dummy-key');
    });

    it('匯入的備份若帶非 https 網址，網址清空', () => {
      expect(options.normalizeImportedSettings({ customApiBase: 'http://evil.example.com/v1' }).customApiBase).toBe('');
      expect(options.normalizeImportedSettings({ customApiBase: 'https://llm.example.com/v1/' }).customApiBase)
        .toBe('https://llm.example.com/v1');
    });
  });
});
