(function initFanFanBaCloudSync(global) {
  'use strict';

  const CLOUD_SYNC_APP = 'fan-fan-ba';
  const CLOUD_SYNC_SCHEMA_VERSION = 1;
  const CLOUD_SYNC_FILE_NAME = 'fan-fan-ba-cloud-settings.json';
  const CLOUD_SYNC_DEVICE_KEY = 'fanFanBaCloudDeviceId';
  const CLOUD_SYNC_META_KEY = 'fanFanBaCloudSyncMeta';
  const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
  const OAUTH_PLACEHOLDER_PATTERN = /REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID/i;

  function getManifest() {
    return chrome.runtime?.getManifest?.() || {};
  }

  function getOAuthConfig() {
    const oauth2 = getManifest().oauth2 || {};
    return {
      clientId: String(oauth2.client_id || ''),
      scopes: Array.isArray(oauth2.scopes) ? oauth2.scopes : []
    };
  }

  function isOAuthConfigured(config = getOAuthConfig()) {
    return Boolean(
      config.clientId &&
      !OAUTH_PLACEHOLDER_PATTERN.test(config.clientId) &&
      config.scopes.includes(DRIVE_APPDATA_SCOPE)
    );
  }

  function ensureOAuthReady() {
    if (!chrome.identity?.getAuthToken) {
      throw new Error('此瀏覽器環境不支援 Google 登入');
    }
    if (!isOAuthConfigured()) {
      throw new Error('尚未設定 Google OAuth Client ID');
    }
  }

  function getAuthToken(interactive = true) {
    ensureOAuthReady();
    return new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive }, token => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) {
          reject(new Error(lastError.message));
          return;
        }
        if (!token) {
          reject(new Error('未取得 Google 登入 token'));
          return;
        }
        resolve(token);
      });
    });
  }

  async function signOut(token) {
    if (!token || !chrome.identity?.removeCachedAuthToken) return;
    await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
  }

  async function getOrCreateDeviceId() {
    const existing = await chrome.storage.local.get(CLOUD_SYNC_DEVICE_KEY);
    if (existing?.[CLOUD_SYNC_DEVICE_KEY]) return existing[CLOUD_SYNC_DEVICE_KEY];
    const id = `device-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    await chrome.storage.local.set({ [CLOUD_SYNC_DEVICE_KEY]: id });
    return id;
  }

  async function buildCloudSettingsPayload(settings = {}, options = {}) {
    return {
      app: CLOUD_SYNC_APP,
      cloudSchemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      appVersion: options.appVersion || getManifest().version || '',
      deviceId: options.deviceId || await getOrCreateDeviceId(),
      settings: { ...settings }
    };
  }

  function validateCloudSettingsPayload(payload) {
    if (!payload || payload.app !== CLOUD_SYNC_APP) {
      throw new Error('不是翻翻吧雲端設定檔');
    }
    if (payload.cloudSchemaVersion !== CLOUD_SYNC_SCHEMA_VERSION) {
      throw new Error('雲端設定檔版本不支援');
    }
    if (!payload.settings || typeof payload.settings !== 'object') {
      throw new Error('雲端設定檔沒有可還原的設定');
    }
    if (payload.secrets || payload.secretsEncrypted) {
      throw new Error('v1.7.0 不支援雲端同步 API Key');
    }
    return payload;
  }

  async function driveFetch(token, url, options = {}) {
    const headers = {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    };
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error?.message || `Google Drive API 失敗：HTTP ${res.status}`);
    }
    return res;
  }

  async function findCloudSettingsFile(token) {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      q: `name='${CLOUD_SYNC_FILE_NAME}' and trashed=false`,
      fields: 'files(id,name,modifiedTime)'
    });
    const res = await driveFetch(token, `${DRIVE_FILES_URL}?${params.toString()}`);
    const data = await res.json();
    return data.files?.[0] || null;
  }

  function buildMultipartBody(metadata, payload) {
    const boundary = `fan-fan-ba-${Date.now().toString(36)}`;
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(payload, null, 2),
      `--${boundary}--`,
      ''
    ].join('\r\n');
    return { body, boundary };
  }

  async function uploadCloudSettings(token, payload) {
    validateCloudSettingsPayload(payload);
    const existing = await findCloudSettingsFile(token);
    const metadata = existing
      ? { name: CLOUD_SYNC_FILE_NAME, mimeType: 'application/json' }
      : { name: CLOUD_SYNC_FILE_NAME, mimeType: 'application/json', parents: ['appDataFolder'] };
    const { body, boundary } = buildMultipartBody(metadata, payload);
    const url = existing
      ? `${DRIVE_UPLOAD_URL}/${existing.id}?uploadType=multipart`
      : `${DRIVE_UPLOAD_URL}?uploadType=multipart`;
    const method = existing ? 'PATCH' : 'POST';
    const res = await driveFetch(token, url, {
      method,
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body
    });
    const file = await res.json();
    await chrome.storage.local.set({
      [CLOUD_SYNC_META_KEY]: {
        lastUploadAt: payload.updatedAt,
        lastFileId: file.id || existing?.id || '',
        lastDeviceId: payload.deviceId || ''
      }
    });
    return file;
  }

  async function downloadCloudSettings(token) {
    const file = await findCloudSettingsFile(token);
    if (!file) throw new Error('找不到雲端設定檔');
    const res = await driveFetch(token, `${DRIVE_FILES_URL}/${file.id}?alt=media`);
    const payload = validateCloudSettingsPayload(await res.json());
    await chrome.storage.local.set({
      [CLOUD_SYNC_META_KEY]: {
        lastDownloadAt: new Date().toISOString(),
        lastCloudUpdatedAt: payload.updatedAt || '',
        lastFileId: file.id
      }
    });
    return payload;
  }

  async function getCloudSyncMeta() {
    const data = await chrome.storage.local.get(CLOUD_SYNC_META_KEY);
    return data?.[CLOUD_SYNC_META_KEY] || {};
  }

  const cloudSync = {
    CLOUD_SYNC_APP,
    CLOUD_SYNC_SCHEMA_VERSION,
    CLOUD_SYNC_FILE_NAME,
    CLOUD_SYNC_DEVICE_KEY,
    CLOUD_SYNC_META_KEY,
    DRIVE_APPDATA_SCOPE,
    getOAuthConfig,
    isOAuthConfigured,
    getAuthToken,
    signOut,
    getOrCreateDeviceId,
    buildCloudSettingsPayload,
    validateCloudSettingsPayload,
    findCloudSettingsFile,
    uploadCloudSettings,
    downloadCloudSettings,
    getCloudSyncMeta
  };

  global.FanFanBaCloudSync = cloudSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = cloudSync;
})(typeof globalThis !== 'undefined' ? globalThis : window);
