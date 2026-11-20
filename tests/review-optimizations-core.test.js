'use strict';

// 2026-11-20 Code Review 方案 A 回歸測試（核心／背景／資料／設定層）
const fs = require('fs');
const path = require('path');
const bg = require('../background');
const Storage = require('../storage');
const VocabularyStore = require('../vocabulary-store');
const CloudSync = require('../cloud-sync');
const Glossary = require('../content/glossary');
const ModelRegistry = require('../models');

describe('Review 方案 A — background.js', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = jest.fn();
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.sync.get.mockResolvedValue({});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete global.self.Translator;
    delete global.self.LanguageDetector;
  });

  it('Item 2: handleOpenAICompatRequest 不回顯上游 error.message 到 UI（T3）但保留 rawMessage', async () => {
    const phishing = 'Visit https://evil.example to unlock your account';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: '401', message: phishing } })
    });

    const err = await bg.handleOpenAICompatRequest({
      action: 'translate',
      selectedText: 'hello',
      modelId: 'test-model',
      apiKey: 'k',
      baseUrl: 'https://example.test/chat/completions',
      label: '自訂端點'
    }).catch(e => e);

    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(401);
    expect(err.rawMessage).toBe(phishing);
    expect(err.message).not.toContain('evil.example');
    expect(err.message).toContain('驗證失敗');
  });

  it('Item 2: handleOpenAICompatRequest 無數字 code 時同樣不回顯上游原始錯誤字串', async () => {
    const phishing = 'Call 555-SCAM immediately';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: { code: 'custom_err', message: phishing } })
    });

    const err = await bg.handleOpenAICompatRequest({
      action: 'translate',
      selectedText: 'hello',
      modelId: 'test-model',
      apiKey: 'k',
      baseUrl: 'https://example.test/chat/completions',
      label: '自訂端點'
    }).catch(e => e);

    expect(err.rawMessage).toBe(phishing);
    expect(err.message).not.toContain('555-SCAM');
    expect(err.message).toContain('API 錯誤');
  });

  it('Item 2: streamOpenAICompat 無數字 code 時不回顯上游 error.message 但保留 rawMessage', async () => {
    const phishing = 'Click https://phish.example now';
    const encoder = new TextEncoder();
    const payload = `data: ${JSON.stringify({ error: { code: 'provider_down', message: phishing } })}\n\n`;
    const body = {
      getReader: () => {
        let sent = false;
        return {
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: encoder.encode(payload) };
          },
          cancel: async () => {}
        };
      }
    };
    global.fetch.mockResolvedValueOnce({ ok: true, body });

    const err = await bg.streamOpenAICompat({
      prompt: 'p',
      action: 'translate',
      modelId: 'test-model',
      apiKey: 'k',
      baseUrl: 'https://example.test/chat/completions',
      label: '自訂端點',
      onChunk: () => {}
    }).catch(e => e);

    expect(err.rawMessage).toBe(phishing);
    expect(err.message).not.toContain('phish.example');
    expect(err.message).toContain('串流錯誤');
  });

  it('Item 10a: _streamAIRequest 走 builtin:translator 時不讀取術語表 storage', async () => {
    chrome.storage.sync.get.mockResolvedValue({ model: ModelRegistry.BUILTIN_TRANSLATOR_MODEL });
    chrome.storage.local.get.mockClear();
    global.self.LanguageDetector = {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
        destroy: () => {}
      })
    };
    global.self.Translator = {
      availability: async () => 'available',
      create: async () => ({
        translate: async () => '你好',
        destroy: () => {}
      })
    };

    const chunks = [];
    await bg._streamAIRequest(
      { action: 'translate', selectedText: 'hello', pageTranslation: true, targetLanguage: 'zh-TW' },
      chunk => chunks.push(chunk)
    );

    expect(chunks).toEqual(['你好']);
    const glossaryReads = chrome.storage.local.get.mock.calls.filter(args => args[0] === Glossary.STORAGE_KEY);
    expect(glossaryReads).toHaveLength(0);
  });

  it('Item 10b: handleBuiltinTranslateRequest 批次 JSON 損毀回傳友善錯誤且中途 abort 不續翻剩餘段落', async () => {
    global.self.Translator = { availability: async () => 'available', create: jest.fn() };
    await expect(bg.handleBuiltinTranslateRequest({
      action: 'translate',
      selectedText: '{not-valid-json',
      pageTranslation: { batch: true, count: 2 },
      targetLanguage: 'zh-TW'
    })).rejects.toThrow('批次翻譯資料格式不正確');

    const controller = new AbortController();
    const translate = jest.fn(async text => {
      controller.abort();
      return `譯:${text}`;
    });
    global.self.LanguageDetector = {
      create: async () => ({
        detect: async () => [{ detectedLanguage: 'en', confidence: 0.99 }],
        destroy: () => {}
      })
    };
    global.self.Translator = {
      availability: async () => 'available',
      create: async () => ({ translate, destroy: () => {} })
    };

    await expect(bg.handleBuiltinTranslateRequest({
      action: 'translate',
      selectedText: JSON.stringify([{ id: 1, text: 'First' }, { id: 2, text: 'Second' }]),
      pageTranslation: { batch: true, count: 2 },
      targetLanguage: 'zh-TW',
      signal: controller.signal
    })).rejects.toMatchObject({ name: 'AbortError' });

    expect(translate).toHaveBeenCalledTimes(1);
  });

  it('Item 10c: parseSseStream 支援 data: 後無空白格式並 flush 結尾位元組', async () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('data:{"a":1}\r\ndata: {"b":"中"}\n');
    const splitAt = bytes.length - 3; // 刻意切在多字節中文字中間
    const chunks = [bytes.slice(0, splitAt), bytes.slice(splitAt)];
    let idx = 0;
    const body = {
      getReader: () => ({
        read: async () => (idx < chunks.length ? { done: false, value: chunks[idx++] } : { done: true, value: undefined }),
        cancel: async () => {}
      })
    };

    const seen = [];
    await bg.parseSseStream(body, data => seen.push(data));
    expect(seen).toEqual(['{"a":1}', '{"b":"中"}']);
  });

  it('Item 10d: sleep 正常結束後會移除 signal 的 abort 監聽避免殘留', async () => {
    const controller = new AbortController();
    const removeSpy = jest.spyOn(controller.signal, 'removeEventListener');
    await bg.sleep(1, controller.signal);
    expect(removeSpy).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('Item 10e: handleTtsRequest 傳入 AbortSignal 並在逾時 abort 時回傳友善錯誤', async () => {
    chrome.storage.local.get.mockResolvedValue({ ttsApiKey: 'AIzaTestKey' });
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    global.fetch.mockRejectedValueOnce(abortErr);

    await expect(bg.handleTtsRequest({ text: 'hello', lang: 'en' })).rejects.toThrow('逾時');
    expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
  });
});

describe('Review 方案 A — storage.js / vocabulary-store.js / cloud-sync.js / glossary.js', () => {
  it('Item 9b: recordDiagnosticEvent 並發呼叫不會因讀改寫競態遺失計數', async () => {
    let store = {};
    chrome.storage.local.get.mockImplementation(async key => {
      await new Promise(resolve => setTimeout(resolve, 2));
      return typeof key === 'string' ? { [key]: store[key] } : { ...store };
    });
    chrome.storage.local.set.mockImplementation(async values => {
      await new Promise(resolve => setTimeout(resolve, 2));
      store = { ...store, ...values };
    });

    await Storage.clearDiagnostics();
    await Promise.all(Array.from({ length: 8 }, () => Storage.recordDiagnosticEvent('translate')));
    const diag = await Storage.getDiagnostics();
    expect(diag.actions.translate).toBe(8);
  });

  it('Item 9f: VocabularyStore.deleteItem 刪除不存在的 id 不觸發 storage 寫入', async () => {
    chrome.storage.local.get.mockResolvedValue({
      [VocabularyStore.VOCABULARY_STORAGE_KEY]: {
        'en:apple': { id: 'en:apple', word: 'apple' }
      }
    });
    chrome.storage.local.set.mockClear();

    const deleted = await VocabularyStore.deleteItem('en:nonexistent');
    expect(deleted).toBe(false);
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('Item 10e: CloudSync driveFetch 帶 AbortSignal 並將 AbortError 歸類為逾時', async () => {
    const originalFetch = global.fetch;
    const abortErr = new Error('Aborted');
    abortErr.name = 'AbortError';
    global.fetch = jest.fn().mockRejectedValueOnce(abortErr);
    try {
      await expect(CloudSync.findCloudSettingsFile('token-1')).rejects.toThrow(/逾時|timeout/i);
      expect(global.fetch.mock.calls[0][1].signal).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('Item 7: Glossary 批次比對正確處理詞界、surrogate pair 與顯式 \\ufeff BOM', () => {
    const terms = Array.from({ length: 120 }, (_, i) => ({ source: `term${i}`, target: `詞${i}` }));
    terms.push({ source: 'API', target: '介面' }, { source: '供應鏈', target: 'Supply Chain' });
    const text = '🚀API 串接與供應鏈管理，排除 rapid 与 term99！';
    const matched = Glossary.findMatchingTerms(terms, text).map(t => t.source);
    expect(matched).toContain('API');
    expect(matched).toContain('供應鏈');
    expect(matched).toContain('term99');
    expect(matched).not.toContain('term1');

    const sourceCode = fs.readFileSync(path.join(__dirname, '../content/glossary.js'), 'utf8');
    expect(sourceCode).toContain('\\ufeff');
    const csv = Glossary.buildGlossaryCsv([{ source: 'API', target: '介面', note: '' }], v => String(v));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(Glossary.parseGlossaryCsv(csv).terms).toEqual([{ source: 'API', target: '介面' }]);
  });
});

describe('Review 方案 A — options.js', () => {
  let options;

  beforeAll(() => {
    document.body.innerHTML = `
      <input id="apiKey" />
      <input id="groqApiKey" />
      <input id="openrouterApiKey" />
      <input id="customApiBase" />
      <input id="customModelName" />
      <input id="customApiKey" />
      <select id="model"></select>
      <select id="pageTranslationModel"></select>
      <select id="dictionaryModel"></select>
      <select id="vocabularyHighlightMode"></select>
      <input id="obsidianVault" />
      <input id="ttsApiKey" />
      <input id="obsidianDefaultFolder" />
      <button id="btnExportSettings"></button>
      <input id="includeSecretsExport" type="checkbox" />
      <input id="backupPassword" type="password" />
      <button id="btnImportSettings"></button>
      <input id="settingsImportFile" type="file" />
      <button id="toggleVis"></button>
      <button id="toggleGroqVis"></button>
      <button id="toggleOrVis"></button>
      <button id="toggleTtsVis"></button>
      <span id="eye-show"></span><span id="eye-hide"></span>
      <span id="groq-eye-show"></span><span id="groq-eye-hide"></span>
      <span id="or-eye-show"></span><span id="or-eye-hide"></span>
      <span id="tts-eye-show"></span><span id="tts-eye-hide"></span>
      <button id="btnSave"></button>
      <button id="btnTest"></button>
      <div id="status"></div>
    `;
    jest.isolateModules(() => {
      options = require('../options');
    });
  });

  beforeEach(() => {
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.sync.get.mockResolvedValue({});
  });

  it('Item 4: buildDiagnosticsChecklist 對 builtin:translator 報正常免金鑰，對 custom 檢查端點與金鑰', () => {
    const rows = options.buildDiagnosticsChecklist(
      Storage.emptyDiagnostics(),
      { model: 'groq:openai/gpt-oss-120b', pageTranslationModel: ModelRegistry.BUILTIN_TRANSLATOR_MODEL },
      { groqApiKey: 'gsk_ok' },
      '1.11.1'
    );
    const pageRow = rows.find(r => r.label === '全文翻譯模型');
    expect(pageRow.status).toBe('ok');
    expect(pageRow.value).toContain('免金鑰');
    expect(pageRow.value).not.toContain('缺 API Key');

    const customMissingRows = options.buildDiagnosticsChecklist(
      Storage.emptyDiagnostics(),
      { model: ModelRegistry.CUSTOM_ENDPOINT_MODEL, customApiBase: '', customModelName: '' },
      { customApiKey: 'sk-custom' },
      '1.11.1'
    );
    expect(customMissingRows.find(r => r.label === '單段翻譯模型').status).toBe('warn');
  });

  it('Item 5: decryptBackupSecrets 拒絕異常 PBKDF2 迭代數、importSettingsBackupFile 限 2MB、normalizeImportedSettings 正規化 dictionaryModel', async () => {
    await expect(options.decryptBackupSecrets({
      version: 1, algorithm: 'AES-GCM', iterations: 500, salt: 'AA==', iv: 'AA==', data: 'AA=='
    }, 'password123')).rejects.toThrow('不支援');

    await expect(options.decryptBackupSecrets({
      version: 1, algorithm: 'AES-GCM', iterations: 99999999, salt: 'AA==', iv: 'AA==', data: 'AA=='
    }, 'password123')).rejects.toThrow('不支援');

    const hugeFile = { size: 3 * 1024 * 1024, text: async () => '{}' };
    await expect(options.importSettingsBackupFile(hugeFile)).rejects.toThrow('上限 2MB');

    const normalized = options.normalizeImportedSettings({
      dictionaryModel: 'gemini-3.5-flash'
    });
    expect(normalized.dictionaryModel).toBe('gemini-3.8-flash');

    const rejectedPageOnly = options.normalizeImportedSettings({
      dictionaryModel: ModelRegistry.BUILTIN_TRANSLATOR_MODEL
    });
    expect(rejectedPageOnly.dictionaryModel).toBe('');
  });

  it('Item 9c: showStatus 新的 err 訊息不會被先前 ok 的 3 秒計時器清掉', () => {
    jest.useFakeTimers();
    try {
      options.showStatus('ok', '已儲存');
      jest.advanceTimersByTime(1500);
      options.showStatus('err', '連線失敗');
      jest.advanceTimersByTime(2000);
      const el = document.getElementById('status');
      expect(el.className).toBe('err');
      expect(el.textContent).toBe('連線失敗');
    } finally {
      jest.useRealTimers();
    }
  });

  it('Item 2: btnTest 失敗不回顯上游 provider 原始錯誤字串到 #status', async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 401,
      clone: () => ({ json: async () => ({ error: { message: 'Visit https://phish.example' } }) }),
      json: async () => ({ error: { message: 'Visit https://phish.example' } })
    });
    try {
      document.getElementById('model').value = 'groq:openai/gpt-oss-120b';
      document.getElementById('groqApiKey').value = 'gsk_test';
      document.getElementById('btnTest').click();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
      const statusText = document.getElementById('status').textContent;
      expect(statusText).toContain('驗證失敗');
      expect(statusText).not.toContain('phish.example');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
