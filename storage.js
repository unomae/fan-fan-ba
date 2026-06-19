(function initFanFanBaStorage(global) {
  'use strict';

  const SECRET_KEYS = ['apiKey', 'groqApiKey', 'openrouterApiKey', 'ttsApiKey'];
  let migrationPromise = null;

  function pickSecrets(values = {}) {
    return SECRET_KEYS.reduce((acc, key) => {
      if (Object.prototype.hasOwnProperty.call(values, key)) acc[key] = values[key] || '';
      return acc;
    }, {});
  }

  async function getArea(area, keysOrDefaults) {
    return chrome.storage[area].get(keysOrDefaults);
  }

  async function setArea(area, values) {
    return chrome.storage[area].set(values);
  }

  async function removeSyncSecrets() {
    if (typeof chrome.storage.sync.remove === 'function') {
      await chrome.storage.sync.remove(SECRET_KEYS);
      return;
    }

    // Test/mocked environments may not provide remove().
    const emptySecrets = SECRET_KEYS.reduce((acc, key) => {
      acc[key] = '';
      return acc;
    }, {});
    await setArea('sync', emptySecrets);
  }

  async function migrateSecretsFromSync() {
    if (migrationPromise) return migrationPromise;

    migrationPromise = (async () => {
      const [syncSecrets, localSecrets] = await Promise.all([
        getArea('sync', SECRET_KEYS),
        getArea('local', SECRET_KEYS)
      ]);

      const migrated = {};
      SECRET_KEYS.forEach(key => {
        if (syncSecrets?.[key] && !localSecrets?.[key]) migrated[key] = syncSecrets[key];
      });

      if (Object.keys(migrated).length) await setArea('local', migrated);
      if (SECRET_KEYS.some(key => syncSecrets?.[key])) await removeSyncSecrets();
    })();

    return migrationPromise;
  }

  async function getSecrets(defaults = {}) {
    await migrateSecretsFromSync();
    const localSecrets = await getArea('local', SECRET_KEYS);
    return { ...pickSecrets(defaults), ...pickSecrets(localSecrets) };
  }

  async function setSecrets(values = {}) {
    const secrets = pickSecrets(values);
    await setArea('local', secrets);
    await removeSyncSecrets();
    return secrets;
  }

  // ── 本機診斷摘要（v1.9.8）──────────────────────────────
  // 純本機計數，僅累計「用了幾次」，不含任何選取文字 / 網址 / 內容；
  // 不上傳、不 telemetry，使用者可隨時在設定頁清除。
  const DIAGNOSTICS_KEY = 'fanFanBaDiagnostics';

  function emptyDiagnostics() {
    return {
      since: new Date().toISOString(),
      actions: { translate: 0, explain: 0, optimize: 0 },
      pageTranslations: 0,
      errors: 0
    };
  }

  function normalizeDiagnostics(value) {
    const base = emptyDiagnostics();
    if (!value || typeof value !== 'object') return base;
    return {
      since: typeof value.since === 'string' ? value.since : base.since,
      actions: {
        translate: Number(value.actions?.translate) || 0,
        explain: Number(value.actions?.explain) || 0,
        optimize: Number(value.actions?.optimize) || 0
      },
      pageTranslations: Number(value.pageTranslations) || 0,
      errors: Number(value.errors) || 0
    };
  }

  async function getDiagnostics() {
    const stored = await getArea('local', DIAGNOSTICS_KEY);
    return normalizeDiagnostics(stored?.[DIAGNOSTICS_KEY]);
  }

  async function recordDiagnosticEvent(kind) {
    const current = await getDiagnostics();
    if (kind === 'pageTranslation') current.pageTranslations += 1;
    else if (kind === 'error') current.errors += 1;
    else if (kind && Object.prototype.hasOwnProperty.call(current.actions, kind)) current.actions[kind] += 1;
    else return current; // 未知類型不記
    await setArea('local', { [DIAGNOSTICS_KEY]: current });
    return current;
  }

  async function clearDiagnostics() {
    const fresh = emptyDiagnostics();
    await setArea('local', { [DIAGNOSTICS_KEY]: fresh });
    return fresh;
  }

  const storage = {
    SECRET_KEYS,
    DIAGNOSTICS_KEY,
    migrateSecretsFromSync,
    getSecrets,
    setSecrets,
    emptyDiagnostics,
    normalizeDiagnostics,
    getDiagnostics,
    recordDiagnosticEvent,
    clearDiagnostics
  };

  global.FanFanBaStorage = storage;
  if (typeof module !== 'undefined' && module.exports) module.exports = storage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
