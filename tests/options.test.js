const CloudSync = require('../cloud-sync');

describe('Options module', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <input id="apiKey" />
      <input id="groqApiKey" />
      <input id="openrouterApiKey" />
      <select id="model"></select>
      <select id="pageTranslationModel"></select>
      <select id="vocabularyHighlightMode"></select>
      <input id="obsidianVault" />
      <input id="ttsApiKey" />
      <input id="obsidianDefaultFolder" />
      <button id="btnExportSettings"></button>
      <input id="includeSecretsExport" type="checkbox" />
      <input id="backupPassword" type="password" />
      <button id="btnImportSettings"></button>
      <input id="settingsImportFile" type="file" />
      <input id="cloudWebAuthClientId" />
      <button id="btnCloudSaveWebAuthClientId"></button>
      <button id="btnCloudSignIn"></button>
      <button id="btnCloudUpload"></button>
      <button id="btnCloudDownload"></button>
      <button id="btnCloudSignOut"></button>
      <p id="cloudSyncStatus"></p>
      <button id="toggleVis"></button>
      <button id="toggleGroqVis"></button>
      <button id="toggleOrVis"></button>
      <button id="toggleTtsVis"></button>
      <span id="eye-show"></span>
      <span id="eye-hide"></span>
      <span id="groq-eye-show"></span>
      <span id="groq-eye-hide"></span>
      <span id="or-eye-show"></span>
      <span id="or-eye-hide"></span>
      <span id="tts-eye-show"></span>
      <span id="tts-eye-hide"></span>
      <button id="btnSave"></button>
      <button id="btnTest"></button>
      <div id="status"></div>
      <button id="btnExportVocabulary"></button>
      <button id="btnExportVocabularyXlsx"></button>
      <button id="btnImportVocabulary"></button>
      <input id="vocabularyImportFile" type="file" />
      <div id="vocabularyBackupStatus"></div>
      <div id="vocabularyBackupReminder"></div>
    `;
    global.optionsModule = require('../options');
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    document.getElementById('cloudWebAuthClientId').value = '';
    await CloudSync.setWebAuthClientId('');
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.sync.get.mockResolvedValue({});
    chrome.storage.sync.set.mockClear();
    chrome.storage.sync.remove.mockClear();
    chrome.storage.local.set.mockClear();
    chrome.storage.local.remove.mockClear();
    chrome.runtime.getManifest.mockReturnValue({
      version: '1.8.6',
      oauth2: {
        client_id: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
      }
    });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('showStatus', () => {
    it('should set error class and message', () => {
      global.optionsModule.showStatus('err', 'An error occurred');
      const el = document.getElementById('status');
      expect(el.className).toBe('err');
      expect(el.textContent).toBe('An error occurred');
    });

    it('should clear ok message after 3 seconds', () => {
      global.optionsModule.showStatus('ok', 'Success');
      const el = document.getElementById('status');
      expect(el.className).toBe('ok');

      jest.advanceTimersByTime(3000);
      expect(el.className).toBe('');
    });

  });

  describe('vocabulary backup startup', () => {
    // QA-P2-002 回歸：initVocabularyBackup() 若在 LAST_VOCAB_BACKUP_KEY 宣告前跑，
    // 會在 TDZ 炸掉，提醒欄位就永遠是空字串（開 options 頁噴 uncaught error）
    it('renders the backup staleness reminder on startup', () => {
      expect(document.getElementById('vocabularyBackupReminder').textContent)
        .toBe('尚未匯出過單字本備份，建議定期匯出 JSON 以免資料遺失。');
    });
  });

  describe('settings backup', () => {
    it('exports whitelisted settings without secrets by default', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        targetLanguage: 'zh-TW',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary',
        unrelated: 'ignored'
      });

      const payload = await global.optionsModule.buildSettingsBackupPayload(false);

      expect(payload.app).toBe('fan-fan-ba');
      expect(payload.schemaVersion).toBe(1);
      expect(payload.settings).toEqual({
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        targetLanguage: 'zh-TW',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
      });
      expect(payload.secrets).toBeUndefined();
    });

    it('normalizes imported settings and drops unsupported fields', () => {
      const settings = global.optionsModule.normalizeImportedSettings({
        model: 'openrouter/free',
        targetLanguage: 'xx',
        explanationLanguage: 'en',
        ttsLanguageMode: 'invalid',
        vocabularyHighlightMode: 'auto',
        obsidianVault: '  0xKAKA-のう  ',
        unsupported: 'ignored'
      });

      expect(settings).toEqual({
        model: 'openrouter:deepseek/deepseek-v4-flash:free',
        targetLanguage: 'zh-TW',
        explanationLanguage: 'en',
        ttsLanguageMode: 'auto',
        vocabularyHighlightMode: 'auto',
        obsidianVault: '0xKAKA-のう'
      });
    });

    it('exports API keys as encrypted secrets when a backup password is provided', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({ model: 'gemini-3.5-flash' });
      chrome.storage.local.get.mockResolvedValueOnce({
        groqApiKey: 'gsk-test',
        openrouterApiKey: ''
      });

      const payload = await global.optionsModule.buildSettingsBackupPayload(true, {
        password: 'safe-passphrase'
      });

      expect(payload.secrets).toBeUndefined();
      expect(payload.secretsEncrypted).toEqual(expect.objectContaining({
        version: 1,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256',
        data: expect.any(String)
      }));

      const decrypted = await global.optionsModule.decryptBackupSecrets(payload.secretsEncrypted, 'safe-passphrase');
      expect(decrypted).toEqual({ groqApiKey: 'gsk-test' });
    });

    it('requires a password before exporting API keys', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({});
      chrome.storage.local.get.mockResolvedValueOnce({ groqApiKey: 'gsk-test' });

      await expect(global.optionsModule.buildSettingsBackupPayload(true, {
        password: 'short'
      })).rejects.toThrow('API Key 備份密碼至少需要 8 個字元');
    });

    it('imports encrypted API keys from a backup file', async () => {
      chrome.storage.sync.set.mockResolvedValueOnce();
      chrome.storage.local.set.mockResolvedValueOnce();
      chrome.storage.sync.remove.mockResolvedValueOnce();
      const encrypted = await global.optionsModule.encryptBackupSecrets({
        groqApiKey: 'gsk-test',
        openrouterApiKey: ''
      }, 'safe-passphrase');
      const file = {
        text: jest.fn().mockResolvedValue(JSON.stringify({
          app: 'fan-fan-ba',
          schemaVersion: 1,
          settings: {
            model: 'gemini-3.5-flash'
          },
          secretsEncrypted: encrypted
        }))
      };

      const result = await global.optionsModule.importSettingsBackupFile(file, {
        password: 'safe-passphrase'
      });

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ groqApiKey: 'gsk-test' });
      expect(result).toEqual({ settingsCount: 1, secretsCount: 1 });
    });

    it('rejects encrypted API key backups with a wrong password', async () => {
      const encrypted = await global.optionsModule.encryptBackupSecrets({
        groqApiKey: 'gsk-test'
      }, 'safe-passphrase');
      const file = {
        text: jest.fn().mockResolvedValue(JSON.stringify({
          app: 'fan-fan-ba',
          schemaVersion: 1,
          settings: {},
          secretsEncrypted: encrypted
        }))
      };

      await expect(global.optionsModule.importSettingsBackupFile(file, {
        password: 'wrong-password'
      })).rejects.toThrow('API Key 備份密碼不正確或檔案已損壞');
    });

    it('imports legacy plaintext API keys from a backup file', async () => {
      chrome.storage.sync.set.mockResolvedValueOnce();
      chrome.storage.local.set.mockResolvedValueOnce();
      chrome.storage.sync.remove.mockResolvedValueOnce();
      const file = {
        text: jest.fn().mockResolvedValue(JSON.stringify({
          app: 'fan-fan-ba',
          schemaVersion: 1,
          settings: {
            model: 'gemini-3.5-flash',
            obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
          },
          secrets: {
            groqApiKey: 'gsk-test',
            openrouterApiKey: ''
          }
        }))
      };

      const result = await global.optionsModule.importSettingsBackupFile(file);

      expect(chrome.storage.sync.set).toHaveBeenCalledWith({
        model: 'gemini-3.5-flash',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
      });
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ groqApiKey: 'gsk-test' });
      expect(result).toEqual({ settingsCount: 2, secretsCount: 1 });
      expect(global.optionsModule.formatImportSettingsStatus(result)).toBe('✓ 設定檔已匯入：2 個設定、1 個 API Key');
    });

    it('asks for confirmation before exporting API keys', () => {
      const originalConfirm = window.confirm;
      window.confirm = jest.fn(() => false);

      expect(global.optionsModule.confirmSecretsExport()).toBe(false);
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('密碼加密'));

      window.confirm = originalConfirm;
    });
  });

  describe('local diagnostics self-check', () => {
    it('builds a checklist with actionable warnings for missing provider keys', () => {
      const rows = global.optionsModule.buildDiagnosticsChecklist({
        since: '2026-06-25T08:00:00.000Z',
        actions: { translate: 2, explain: 1, optimize: 0 },
        pageTranslations: 1,
        errors: 0
      }, {
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        pageTranslationModel: 'openrouter:deepseek/deepseek-v4-flash:free',
        targetLanguage: 'en',
        vocabularyHighlightMode: 'auto'
      }, {
        groqApiKey: 'gsk_test'
      }, '1.9.8');

      expect(rows[0]).toEqual(expect.objectContaining({
        label: '擴充功能版本',
        value: 'v1.9.8',
        status: 'ok'
      }));
      expect(rows.find(row => row.label === '單段翻譯模型')).toEqual(expect.objectContaining({
        status: 'ok',
        value: expect.stringContaining('API Key 已設定')
      }));
      expect(rows.find(row => row.label === '全文翻譯模型')).toEqual(expect.objectContaining({
        status: 'warn',
        value: expect.stringContaining('缺 API Key'),
        detail: expect.stringContaining('不會發送測試請求')
      }));
      expect(rows.find(row => row.label === '隱私邊界').value).toContain('不含選取文字、網址或內容');
    });

    it('renders the diagnostics checklist with warning count and local summary', () => {
      const el = document.createElement('div');
      global.optionsModule.renderDiagnosticsSelfCheck(el, {
        diagnostics: {
          since: '2026-06-25T08:00:00.000Z',
          actions: { translate: 0, explain: 0, optimize: 0 },
          pageTranslations: 0,
          errors: 1
        },
        rows: [
          { status: 'warn', label: '單段翻譯模型', value: 'Groq：缺 API Key', detail: '請先填入 Groq API Key。' },
          { status: 'ok', label: '隱私邊界', value: '僅保留本機計數，不含選取文字、網址或內容' }
        ]
      });

      expect(el.textContent).toContain('自檢結果：1 項需要處理');
      expect(el.textContent).toContain('失敗 1');
      expect(el.textContent).toContain('Groq：缺 API Key');
      expect(el.querySelectorAll('.diagnostics-checklist li')).toHaveLength(2);
    });

    it('keeps the empty diagnostics summary clear after reset', () => {
      const summary = global.optionsModule.formatDiagnosticsSummary({
        since: '2026-06-25T08:00:00.000Z',
        actions: { translate: 0, explain: 0, optimize: 0 },
        pageTranslations: 0,
        errors: 0
      }, '已清除診斷資料。');

      expect(summary).toBe('已清除診斷資料。');
    });
  });

  describe('cloud sync', () => {
    it('builds a cloud payload from general settings only', async () => {
      chrome.storage.sync.get.mockResolvedValueOnce({
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
      });
      chrome.storage.local.get.mockResolvedValueOnce({});
      chrome.storage.local.set.mockResolvedValueOnce();

      const payload = await global.optionsModule.buildCloudSettingsPayload();

      expect(payload.app).toBe('fan-fan-ba');
      expect(payload.cloudSchemaVersion).toBe(1);
      expect(payload.appVersion).toBe('1.8.6');
      expect(payload.settings).toEqual({
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
      });
      expect(payload.secrets).toBeUndefined();
    });

    it('shows the cross-browser auth fallback when OAuth is configured', async () => {
      chrome.runtime.getManifest.mockReturnValueOnce({
        version: '1.8.6',
        oauth2: {
          client_id: '1234567890-example.apps.googleusercontent.com',
          scopes: ['https://www.googleapis.com/auth/drive.appdata']
        }
      });
      chrome.storage.local.get.mockResolvedValueOnce({});

      await global.optionsModule.renderCloudSyncStatus();

      expect(document.getElementById('cloudSyncStatus').textContent).toContain('cross-browser Web Auth fallback');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('同步摘要');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('尚未開始雲端同步');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('Google Drive 隱藏 appDataFolder');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('Web Auth Client');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('未設定');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('Redirect URL');
    });

    it('saves the Web Auth client id from the cloud sync panel', async () => {
      jest.useRealTimers();
      document.getElementById('cloudWebAuthClientId').value = 'web-client-example.apps.googleusercontent.com';
      chrome.runtime.getManifest.mockReturnValue({
        version: '1.8.6',
        oauth2: {
          client_id: '1234567890-example.apps.googleusercontent.com',
          scopes: ['https://www.googleapis.com/auth/drive.appdata']
        }
      });
      chrome.storage.local.get.mockResolvedValue({
        [CloudSync.CLOUD_WEB_AUTH_CLIENT_ID_KEY]: 'web-client-example.apps.googleusercontent.com'
      });

      document.getElementById('btnCloudSaveWebAuthClientId').click();
      await flushPromises();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        [CloudSync.CLOUD_WEB_AUTH_CLIENT_ID_KEY]: 'web-client-example.apps.googleusercontent.com'
      });
      expect(chrome.storage.local.remove).toHaveBeenCalledWith(CloudSync.CLOUD_OAUTH_TOKEN_KEY);
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('Web Auth Client ID 已儲存');
    });

    it('shows a clear status while OAuth client id is still a placeholder', async () => {
      await global.optionsModule.renderCloudSyncStatus();

      expect(document.getElementById('cloudSyncStatus').textContent).toContain('尚未完成 OAuth 設定');
      expect(document.getElementById('cloudSyncStatus').textContent).toContain('目前版本');
    });

    it('summarizes the last cloud sync action for public users', async () => {
      chrome.runtime.getManifest.mockReturnValue({
        version: '1.8.6',
        oauth2: {
          client_id: '1234567890-example.apps.googleusercontent.com',
          scopes: ['https://www.googleapis.com/auth/drive.appdata']
        }
      });
      chrome.storage.local.get.mockResolvedValue({
        [CloudSync.CLOUD_SYNC_META_KEY]: {
          signedIn: true,
          lastUploadAt: '2026-06-09T14:20:30.000Z',
          lastUploadAppVersion: '1.7.4',
          lastUploadSettingsCount: 3
        }
      });

      await global.optionsModule.renderCloudSyncStatus();

      const text = document.getElementById('cloudSyncStatus').textContent;
      expect(text).toContain('最近上傳');
      expect(text).toContain('3 個設定');
      expect(text).toContain('版本 1.7.4');
      expect(text).toContain('上傳：這台覆蓋雲端');
    });

    it('cancels cloud upload before overwriting an existing cloud file', async () => {
      jest.useRealTimers();
      const originalConfirm = window.confirm;
      window.confirm = jest.fn(() => false);
      const tokenSpy = jest.spyOn(CloudSync, 'getAuthToken').mockResolvedValue('token-test');
      const findSpy = jest.spyOn(CloudSync, 'findCloudSettingsFile').mockResolvedValue({
        id: 'cloud-file-1',
        modifiedTime: '2026-06-08T12:00:00.000Z'
      });
      const uploadSpy = jest.spyOn(CloudSync, 'uploadCloudSettings').mockResolvedValue({ id: 'cloud-file-1' });
      chrome.runtime.getManifest.mockReturnValue({
        version: '1.8.6',
        oauth2: {
          client_id: '1234567890-example.apps.googleusercontent.com',
          scopes: ['https://www.googleapis.com/auth/drive.appdata']
        }
      });
      chrome.storage.local.get.mockResolvedValue({});

      try {
        document.getElementById('btnCloudUpload').click();
        await flushPromises(20);

        expect(tokenSpy).toHaveBeenCalledWith(true);
        expect(findSpy).toHaveBeenCalledWith('token-test');
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('覆寫雲端版本'));
        expect(uploadSpy).not.toHaveBeenCalled();
        expect(document.getElementById('cloudSyncStatus').textContent).toContain('已取消上傳');
      } finally {
        window.confirm = originalConfirm;
        tokenSpy.mockRestore();
        findSpy.mockRestore();
        uploadSpy.mockRestore();
      }
    });

    it('cancels cloud download before overwriting local settings', async () => {
      jest.useRealTimers();
      const originalConfirm = window.confirm;
      window.confirm = jest.fn(() => false);
      const tokenSpy = jest.spyOn(CloudSync, 'getAuthToken').mockResolvedValue('token-test');
      const findSpy = jest.spyOn(CloudSync, 'findCloudSettingsFile').mockResolvedValue({
        id: 'cloud-file-1',
        modifiedTime: '2026-06-08T12:00:00.000Z'
      });
      const downloadSpy = jest.spyOn(CloudSync, 'downloadCloudSettings').mockResolvedValue({
        settings: { model: 'gemini-3.5-flash' }
      });
      chrome.runtime.getManifest.mockReturnValue({
        version: '1.8.6',
        oauth2: {
          client_id: '1234567890-example.apps.googleusercontent.com',
          scopes: ['https://www.googleapis.com/auth/drive.appdata']
        }
      });
      chrome.storage.local.get.mockResolvedValue({});

      try {
        document.getElementById('btnCloudDownload').click();
        await flushPromises(20);

        expect(tokenSpy).toHaveBeenCalledWith(true);
        expect(findSpy).toHaveBeenCalledWith('token-test');
        expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('覆寫這台裝置目前的一般設定'));
        expect(downloadSpy).not.toHaveBeenCalled();
        expect(chrome.storage.sync.set).not.toHaveBeenCalledWith({ model: 'gemini-3.5-flash' });
        expect(document.getElementById('cloudSyncStatus').textContent).toContain('已取消下載');
      } finally {
        window.confirm = originalConfirm;
        tokenSpy.mockRestore();
        findSpy.mockRestore();
        downloadSpy.mockRestore();
      }
    });
  });

  // WS-E A1'''：匯入流程讀取 existing 單字本失敗時必須中止，絕不降級成空集
  //（空集會讓 mergeBackup 退化成 replace，舊備份蓋掉整個活單字本）
  describe('getVocabularyItemsMap 讀取降級防護', () => {
    it('background 回 { ok:true } 但 items 非陣列 → throw，不當作空集', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: true });
      await expect(optionsModule.getVocabularyItemsMap()).rejects.toThrow('單字本資料讀取失敗');
    });

    it('background 回錯 → throw（沿用 requestVocabularyStore 契約）', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({ ok: false, error: '資料層錯誤' });
      await expect(optionsModule.getVocabularyItemsMap()).rejects.toThrow('資料層錯誤');
    });

    it('正常回傳陣列 → 轉成 keyed map', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        ok: true,
        items: [{ id: 'en:cat', word: 'cat' }, { id: 'en:dog', word: 'dog' }]
      });
      const map = await optionsModule.getVocabularyItemsMap();
      expect(Object.keys(map).sort()).toEqual(['en:cat', 'en:dog']);
    });
  });

  // WS-E T-BACKUP：單字本 staleness 提醒（mirror-only 後為單一副本的補償控制）
  describe('formatVocabularyBackupReminder', () => {
    it('從未備份 → 提示定期匯出', () => {
      expect(optionsModule.formatVocabularyBackupReminder('')).toContain('尚未匯出');
    });

    it('30 天內 → 顯示天數、無過期警告', () => {
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      const text = optionsModule.formatVocabularyBackupReminder(tenDaysAgo);
      expect(text).toContain('10 天前');
      expect(text).not.toContain('已超過');
    });

    it('超過 30 天 → 附過期建議', () => {
      const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
      expect(optionsModule.formatVocabularyBackupReminder(longAgo)).toContain('已超過 30 天');
    });
  });
});

async function flushPromises(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}
