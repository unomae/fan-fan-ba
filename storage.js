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

  const storage = {
    SECRET_KEYS,
    migrateSecretsFromSync,
    getSecrets,
    setSecrets
  };

  global.FanFanBaStorage = storage;
  if (typeof module !== 'undefined' && module.exports) module.exports = storage;
})(typeof globalThis !== 'undefined' ? globalThis : window);
