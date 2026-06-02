const CloudSync = require('../cloud-sync');

describe('Cloud Sync helper', () => {
  beforeEach(() => {
    chrome.runtime.getManifest.mockReturnValue({
      version: '1.6.0',
      oauth2: {
        client_id: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        scopes: [CloudSync.DRIVE_APPDATA_SCOPE]
      }
    });
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

  it('rejects cloud payloads that include API key data', () => {
    expect(() => CloudSync.validateCloudSettingsPayload({
      app: 'fan-fan-ba',
      cloudSchemaVersion: 1,
      settings: {},
      secrets: { groqApiKey: 'gsk-test' }
    })).toThrow('v1.7.0 不支援雲端同步 API Key');
  });
});
