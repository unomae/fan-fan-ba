const CloudSync = require('../cloud-sync');

describe('Cloud Sync helper', () => {
  beforeEach(async () => {
    delete chrome.runtime.lastError;
    if (!chrome.identity.getAuthToken) chrome.identity.getAuthToken = jest.fn();
    if (!chrome.identity.launchWebAuthFlow) chrome.identity.launchWebAuthFlow = jest.fn();
    chrome.identity.getAuthToken.mockReset();
    chrome.identity.launchWebAuthFlow.mockReset();
    chrome.identity.getRedirectURL.mockReturnValue('https://mock-extension-id.chromiumapp.org/');
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.local.remove.mockResolvedValue();
    chrome.runtime.getManifest.mockReturnValue({
      version: '1.6.0',
      oauth2: {
        client_id: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
      }
    });
    await CloudSync.setWebAuthClientId('');
    chrome.storage.local.set.mockClear();
    chrome.storage.local.remove.mockClear();
  });

  it('treats the placeholder OAuth client id as not configured', () => {
    expect(CloudSync.isOAuthConfigured()).toBe(false);
  });

  it('accepts a configured OAuth client id with the Drive appData scope', () => {
    expect(CloudSync.isOAuthConfigured({
      clientId: '1234567890-example.apps.googleusercontent.com',
      scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
    })).toBe(true);
  });

  it('builds a Google OAuth URL for launchWebAuthFlow', async () => {
    await CloudSync.setWebAuthClientId('web-client-example.apps.googleusercontent.com');

    const url = new URL(CloudSync.buildGoogleOAuthUrl(undefined, 'state-test'));

    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('web-client-example.apps.googleusercontent.com');
    expect(url.searchParams.get('redirect_uri')).toBe('https://mock-extension-id.chromiumapp.org/');
    expect(url.searchParams.get('scope')).toBe(CloudSync.DRIVE_APPDATA_SCOPE);
    expect(url.searchParams.get('state')).toBe('state-test');
  });

  it('falls back to launchWebAuthFlow when native auth is unsupported', async () => {
    chrome.runtime.getManifest.mockReturnValue({
      oauth2: {
        client_id: '1234567890-example.apps.googleusercontent.com',
        scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
      },
    });
    await CloudSync.setWebAuthClientId('web-client-example.apps.googleusercontent.com');
    chrome.storage.local.set.mockClear();
    chrome.identity.getAuthToken.mockImplementation((details, callback) => {
      chrome.runtime.lastError = { message: 'This API is not supported on Microsoft Edge' };
      callback();
      delete chrome.runtime.lastError;
    });
    chrome.identity.launchWebAuthFlow.mockImplementation((details, callback) => {
      const state = new URL(details.url).searchParams.get('state');
      callback(`https://mock-extension-id.chromiumapp.org/#access_token=edge-token&expires_in=3600&state=${state}`);
    });

    await expect(CloudSync.getAuthToken(true)).resolves.toBe('edge-token');
    expect(chrome.identity.launchWebAuthFlow).toHaveBeenCalledWith(expect.objectContaining({
      interactive: true
    }), expect.any(Function));
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [CloudSync.CLOUD_OAUTH_TOKEN_KEY]: expect.objectContaining({
        token: 'edge-token',
        clientId: 'web-client-example.apps.googleusercontent.com',
        scope: CloudSync.DRIVE_APPDATA_SCOPE
      })
    });
  });

  it('fails early on Edge when the Web Auth fallback client id is missing', async () => {
    chrome.runtime.getManifest.mockReturnValue({
      oauth2: {
        client_id: '1234567890-example.apps.googleusercontent.com',
        scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
      }
    });
    delete chrome.identity.getAuthToken;

    await expect(CloudSync.getAuthToken(true)).rejects.toThrow('尚未設定 Web Auth fallback OAuth Client ID');
    expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
    chrome.identity.getAuthToken = jest.fn();
  });

  it('uses a cached web auth token for non-interactive auth', async () => {
    chrome.runtime.getManifest.mockReturnValue({
      oauth2: {
        client_id: '1234567890-example.apps.googleusercontent.com',
        scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
      }
    });
    delete chrome.identity.getAuthToken;
    await CloudSync.setWebAuthClientId('web-client-example.apps.googleusercontent.com');
    chrome.storage.local.set.mockClear();
    chrome.storage.local.get.mockResolvedValueOnce({
      [CloudSync.CLOUD_OAUTH_TOKEN_KEY]: {
        token: 'cached-token',
        expiresAt: Date.now() + 3600000,
        clientId: 'web-client-example.apps.googleusercontent.com',
        scope: CloudSync.DRIVE_APPDATA_SCOPE
      }
    });

    await expect(CloudSync.getAuthToken(false)).resolves.toBe('cached-token');
    expect(chrome.identity.launchWebAuthFlow).not.toHaveBeenCalled();
    chrome.identity.getAuthToken = jest.fn();
  });

  it('classifies redirect mismatch errors with the current redirect URL', () => {
    const info = CloudSync.classifyCloudSyncError(new Error('redirect_uri_mismatch'));

    expect(info.category).toBe('oauth_redirect');
    expect(info.hint).toContain('https://mock-extension-id.chromiumapp.org/');
  });

  it('classifies missing Web Auth client id errors', () => {
    const info = CloudSync.classifyCloudSyncError(new Error('尚未設定 Web Auth fallback OAuth Client ID'));

    expect(info.category).toBe('oauth_web_client');
    expect(info.hint).toContain('Edge / Chromium Web Auth Client ID');
  });

  it('records the last cloud sync error in local metadata', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({
      [CloudSync.CLOUD_SYNC_META_KEY]: {
        lastUploadAt: '2026-06-08T00:00:00.000Z'
      }
    });

    await CloudSync.recordCloudSyncError(new Error('redirect_uri_mismatch'), 'btnCloudSignIn');

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [CloudSync.CLOUD_SYNC_META_KEY]: expect.objectContaining({
        lastUploadAt: '2026-06-08T00:00:00.000Z',
        lastErrorContext: 'btnCloudSignIn',
        lastErrorCategory: 'oauth_redirect',
        lastErrorMessage: 'Google OAuth redirect URL 未被允許'
      })
    });
  });

  it('builds a cloud settings payload without secrets', async () => {
    chrome.storage.local.get.mockResolvedValueOnce({});
    chrome.storage.local.set.mockResolvedValueOnce();

    const payload = await CloudSync.buildCloudSettingsPayload({
      model: 'gemini-3.5-flash',
      obsidianDefaultFolder: 'Learning'
    }, {
      deviceId: 'device-test',
      appVersion: '1.7.0'
    });

    expect(payload).toMatchObject({
      app: 'fan-fan-ba',
      cloudSchemaVersion: 1,
      appVersion: '1.7.0',
      deviceId: 'device-test',
      settings: {
        model: 'gemini-3.5-flash',
        obsidianDefaultFolder: 'Learning'
      }
    });
    expect(payload.secrets).toBeUndefined();
  });

  it('records the uploaded settings count in cloud sync metadata', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ files: [] })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({ id: 'cloud-file-1' })
      });

    await CloudSync.uploadCloudSettings('token-test', {
      app: 'fan-fan-ba',
      cloudSchemaVersion: 1,
      updatedAt: '2026-06-09T14:20:30.000Z',
      appVersion: '1.7.4',
      deviceId: 'device-test',
      settings: {
        model: 'gemini-3.5-flash',
        targetLanguage: 'zh-TW'
      }
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [CloudSync.CLOUD_SYNC_META_KEY]: expect.objectContaining({
        signedIn: true,
        lastUploadAt: '2026-06-09T14:20:30.000Z',
        lastUploadAppVersion: '1.7.4',
        lastUploadSettingsCount: 2,
        lastFileId: 'cloud-file-1',
        lastDeviceId: 'device-test'
      })
    });
  });

  it('records the downloaded settings count in cloud sync metadata', async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          files: [{ id: 'cloud-file-1', name: 'fan-fan-ba-cloud-settings.json' }]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          app: 'fan-fan-ba',
          cloudSchemaVersion: 1,
          updatedAt: '2026-06-09T14:20:30.000Z',
          appVersion: '1.7.4',
          settings: {
            model: 'gemini-3.5-flash',
            targetLanguage: 'zh-TW'
          }
        })
      });

    await CloudSync.downloadCloudSettings('token-test');

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      [CloudSync.CLOUD_SYNC_META_KEY]: expect.objectContaining({
        signedIn: true,
        lastCloudUpdatedAt: '2026-06-09T14:20:30.000Z',
        lastCloudAppVersion: '1.7.4',
        lastDownloadSettingsCount: 2,
        lastFileId: 'cloud-file-1'
      })
    });
  });

  it('rejects cloud payloads that include API key data', () => {
    expect(() => CloudSync.validateCloudSettingsPayload({
      app: 'fan-fan-ba',
      cloudSchemaVersion: 1,
      settings: {},
      secrets: { groqApiKey: 'gsk-test' }
    })).toThrow('雲端同步不支援 API Key；請改用設定備份的密碼加密匯出');
  });
});
