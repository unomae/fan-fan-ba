(function initFanFanBaCloudSync(global) {
  'use strict';

  const CLOUD_SYNC_APP = 'fan-fan-ba';
  const CLOUD_SYNC_SCHEMA_VERSION = 1;
  const CLOUD_SYNC_FILE_NAME = 'fan-fan-ba-cloud-settings.json';
  const CLOUD_SYNC_DEVICE_KEY = 'fanFanBaCloudDeviceId';
  const CLOUD_SYNC_META_KEY = 'fanFanBaCloudSyncMeta';
  const CLOUD_OAUTH_TOKEN_KEY = 'fanFanBaCloudOAuthToken';
  const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';
  const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
  const GOOGLE_OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
  const OAUTH_PLACEHOLDER_PATTERN = /REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID/i;
  const NATIVE_AUTH_UNSUPPORTED_PATTERN = /not supported|unsupported|microsoft edge|extensions API documentation/i;

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

  function getOAuthSupport() {
    return {
      configured: isOAuthConfigured(),
      nativeAuth: Boolean(chrome.identity?.getAuthToken),
      webAuthFlow: Boolean(chrome.identity?.launchWebAuthFlow && chrome.identity?.getRedirectURL)
    };
  }

  function getOAuthRedirectUrl() {
    try {
      return chrome.identity?.getRedirectURL?.() || '';
    } catch {
      return '';
    }
  }

  function ensureOAuthReady() {
    if (!isOAuthConfigured()) {
      throw new Error('尚未設定 Google OAuth Client ID');
    }
    const support = getOAuthSupport();
    if (!support.nativeAuth && !support.webAuthFlow) {
      throw new Error('此瀏覽器環境不支援 Google 登入');
    }
  }

  async function getAuthToken(interactive = true) {
    ensureOAuthReady();
    if (chrome.identity?.getAuthToken) {
      try {
        return await getNativeAuthToken(interactive);
      } catch (error) {
        if (!isNativeAuthUnsupportedError(error) || !chrome.identity?.launchWebAuthFlow) throw error;
      }
    }
    return getWebAuthFlowToken(interactive);
  }

  function getNativeAuthToken(interactive = true) {
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

  function isNativeAuthUnsupportedError(error) {
    return NATIVE_AUTH_UNSUPPORTED_PATTERN.test(String(error?.message || error || ''));
  }

  async function getWebAuthFlowToken(interactive = true) {
    const config = getOAuthConfig();
    const cached = await getCachedWebAuthToken(config);
    if (cached) return cached.token;
    if (!interactive) throw new Error('尚未登入 Google');
    if (!chrome.identity?.launchWebAuthFlow || !chrome.identity?.getRedirectURL) {
      throw new Error('此瀏覽器不支援跨瀏覽器 Google 登入流程');
    }

    const state = createOAuthState();
    const authUrl = buildGoogleOAuthUrl(config, state);
    const redirectUrl = await launchWebAuthFlow(authUrl, interactive);
    const token = parseGoogleOAuthRedirect(redirectUrl, state);
    await cacheWebAuthToken(config, token);
    return token.token;
  }

  function buildGoogleOAuthUrl(config = getOAuthConfig(), state = createOAuthState()) {
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'token',
      redirect_uri: getOAuthRedirectUrl(),
      scope: config.scopes.join(' '),
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state
    });
    return `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`;
  }

  function launchWebAuthFlow(url, interactive = true) {
    return new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow({ url, interactive }, redirectUrl => {
        const lastError = chrome.runtime?.lastError;
        if (lastError?.message) {
          reject(new Error(lastError.message));
          return;
        }
        if (!redirectUrl) {
          reject(new Error('未取得 Google OAuth 回傳網址'));
          return;
        }
        resolve(redirectUrl);
      });
    });
  }

  function parseGoogleOAuthRedirect(redirectUrl, expectedState = '') {
    const url = new URL(redirectUrl);
    const params = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.search.slice(1));
    const error = params.get('error');
    if (error) throw new Error(`Google OAuth 失敗：${error}`);
    const state = params.get('state') || '';
    if (expectedState && state !== expectedState) throw new Error('Google OAuth state 驗證失敗');
    const token = params.get('access_token');
    if (!token) throw new Error('未取得 Google 登入 token');
    const expiresIn = Number.parseInt(params.get('expires_in') || '3600', 10);
    return {
      token,
      expiresAt: Date.now() + Math.max(60, Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000
    };
  }

  async function getCachedWebAuthToken(config = getOAuthConfig()) {
    const data = await chrome.storage.local.get(CLOUD_OAUTH_TOKEN_KEY);
    const cached = data?.[CLOUD_OAUTH_TOKEN_KEY];
    if (!cached || cached.clientId !== config.clientId || cached.scope !== config.scopes.join(' ')) return null;
    if (!cached.token || Number(cached.expiresAt || 0) <= Date.now() + 60000) return null;
    return cached;
  }

  async function cacheWebAuthToken(config, token) {
    await chrome.storage.local.set({
      [CLOUD_OAUTH_TOKEN_KEY]: {
        token: token.token,
        expiresAt: token.expiresAt,
        clientId: config.clientId,
        scope: config.scopes.join(' ')
      }
    });
  }

  function createOAuthState() {
    return `ffb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }

  async function signOut(token) {
    if (token && chrome.identity?.removeCachedAuthToken) {
      await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token }, resolve));
    }
    await chrome.storage.local.remove(CLOUD_OAUTH_TOKEN_KEY);
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

  async function recordCloudSyncError(error, context = '') {
    const info = classifyCloudSyncError(error);
    const meta = await getCloudSyncMeta();
    const nextMeta = {
      ...meta,
      lastErrorAt: new Date().toISOString(),
      lastErrorContext: context,
      lastErrorCategory: info.category,
      lastErrorMessage: info.message
    };
    await chrome.storage.local.set({ [CLOUD_SYNC_META_KEY]: nextMeta });
    return nextMeta;
  }

  function classifyCloudSyncError(error) {
    const raw = String(error?.message || error || '').trim();
    const text = raw.toLowerCase();
    if (/redirect_uri_mismatch|redirect uri mismatch|redirect_uri/.test(text)) {
      return {
        category: 'oauth_redirect',
        message: 'Google OAuth redirect URL 未被允許',
        hint: `請到 Google Cloud OAuth 設定加入 redirect URL：${getOAuthRedirectUrl() || '目前瀏覽器未提供 redirect URL'}`
      };
    }
    if (/invalid_client|unauthorized_client|client/i.test(raw) && /oauth|google/i.test(raw)) {
      return {
        category: 'oauth_client',
        message: 'Google OAuth Client ID 設定不正確',
        hint: '請確認 manifest.json 的 OAuth Client ID 與 Google Cloud 專案設定一致。'
      };
    }
    if (/access_denied|denied|cancel|closed|canceled|cancelled/.test(text)) {
      return {
        category: 'oauth_cancelled',
        message: 'Google 登入未完成',
        hint: '請重新按登入，並在 Google 授權視窗完成同意流程。'
      };
    }
    if (/not supported|unsupported|microsoft edge|extensions api documentation/.test(text)) {
      return {
        category: 'oauth_unsupported',
        message: '目前瀏覽器不支援 native Google 登入',
        hint: '已支援 cross-browser Web Auth fallback；若仍失敗，請確認 OAuth redirect URL 設定。'
      };
    }
    if (/401|403|insufficient|permission|forbidden|unauthorized/.test(text)) {
      return {
        category: 'drive_permission',
        message: 'Google Drive appData 權限不足',
        hint: '請登出後重新登入 Google，確認授權包含 Drive appData。'
      };
    }
    if (/google drive api|http 4|http 5|quota|rate/.test(text)) {
      return {
        category: 'drive_api',
        message: raw || 'Google Drive API 失敗',
        hint: '稍後重試；若持續失敗，請檢查 Google Cloud API 與配額。'
      };
    }
    if (/failed to fetch|network|offline|timeout/.test(text)) {
      return {
        category: 'network',
        message: '網路連線或請求逾時',
        hint: '請確認網路可連到 Google API 後重試。'
      };
    }
    if (/api key|secrets|secret/.test(text)) {
      return {
        category: 'payload_secret',
        message: '雲端同步檔包含不允許的 API Key 資料',
        hint: 'v1.7.x 只同步一般設定，API Key 加密備份排在 v1.7.1。'
      };
    }
    if (/找不到|not found|沒有可還原|settings/.test(text)) {
      return {
        category: 'cloud_file',
        message: raw || '找不到可同步的雲端設定檔',
        hint: '請先在主要裝置上傳目前設定，再到另一台裝置下載。'
      };
    }
    return {
      category: 'unknown',
      message: raw || '雲端同步失敗',
      hint: '請保留錯誤訊息，方便後續判斷是 OAuth、Drive API 或網路問題。'
    };
  }

  const cloudSync = {
    CLOUD_SYNC_APP,
    CLOUD_SYNC_SCHEMA_VERSION,
    CLOUD_SYNC_FILE_NAME,
    CLOUD_SYNC_DEVICE_KEY,
    CLOUD_SYNC_META_KEY,
    CLOUD_OAUTH_TOKEN_KEY,
    DRIVE_APPDATA_SCOPE,
    getOAuthConfig,
    isOAuthConfigured,
    getOAuthSupport,
    getOAuthRedirectUrl,
    getAuthToken,
    signOut,
    buildGoogleOAuthUrl,
    parseGoogleOAuthRedirect,
    getOrCreateDeviceId,
    buildCloudSettingsPayload,
    validateCloudSettingsPayload,
    findCloudSettingsFile,
    uploadCloudSettings,
    downloadCloudSettings,
    getCloudSyncMeta,
    recordCloudSyncError,
    classifyCloudSyncError
  };

  global.FanFanBaCloudSync = cloudSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = cloudSync;
})(typeof globalThis !== 'undefined' ? globalThis : window);
