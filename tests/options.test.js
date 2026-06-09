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
    `;
    global.optionsModule = require('../options');
  });

  beforeEach(async () => {
    jest.useFakeTimers();
    document.getElementById('cloudWebAuthClientId').value = '';
    await CloudSync.setWebAuthClientId('');
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockClear();
    chrome.storage.local.remove.mockClear();
    chrome.runtime.getManifest.mockReturnValue({
      version: '1.7.4',
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

    it('imports settings and API keys from a backup file', async () => {
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
      expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('明文包含 API Keys'));

      window.confirm = originalConfirm;
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
      expect(payload.appVersion).toBe('1.7.4');
      expect(payload.settings).toEqual({
        model: 'groq:meta-llama/llama-4-scout-17b-16e-instruct',
        obsidianDefaultFolder: '30_Knowledge/my-notes/languages/vocabulary'
      });
      expect(payload.secrets).toBeUndefined();
    });

    it('shows the cross-browser auth fallback when OAuth is configured', async () => {
      chrome.runtime.getManifest.mockReturnValueOnce({
        version: '1.7.4',
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
        version: '1.7.4',
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
        version: '1.7.4',
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
        version: '1.7.4',
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
        version: '1.7.4',
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
});

async function flushPromises(times = 8) {
  for (let i = 0; i < times; i += 1) {
    await Promise.resolve();
  }
}
