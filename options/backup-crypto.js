// options/backup-crypto.js — 設定檔備份／還原、WebCrypto PBKDF2/AES-GCM 加密與確認對話框
(function registerOptionsBackupCrypto(global) {
  'use strict';

  const SETTINGS_BACKUP_APP = 'fan-fan-ba';
  const SETTINGS_BACKUP_SCHEMA_VERSION = 1;
  const SECRET_BACKUP_CRYPTO_VERSION = 1;
  const SECRET_BACKUP_KDF_ITERATIONS = 210000;
  const MIN_SECRET_BACKUP_KDF_ITERATIONS = 100000;
  const MAX_SECRET_BACKUP_KDF_ITERATIONS = 1000000;
  const MAX_SETTINGS_IMPORT_BYTES = 2 * 1024 * 1024;

  function createBackupCrypto(ctx) {
    const { ModelRegistry, Storage, CustomActions, Glossary } = ctx;
    const {
      $,
      SYNC_SETTING_KEYS,
      showStatus,
      downloadBlobFile,
      readTextFile
    } = ctx.shared;

    function bindBackupControls() {
      const exportButton = $('btnExportSettings');
      const includeSecretsCheckbox = $('includeSecretsExport');
      const importButton = $('btnImportSettings');
      const fileInput = $('settingsImportFile');
      const passwordInput = $('backupPassword');
      const passwordField = $('backupPasswordField');

      // 密碼欄只在要加密匯出時出現；匯入加密備份缺密碼時也會打開它
      includeSecretsCheckbox?.addEventListener('change', () => {
        if (passwordField) passwordField.hidden = !includeSecretsCheckbox.checked;
      });

      if (exportButton) {
        exportButton.addEventListener('click', async () => {
          exportButton.disabled = true;
          try {
            const includeSecrets = !!includeSecretsCheckbox?.checked;
            if (includeSecrets && !confirmSecretsExport()) return;
            const payload = await buildSettingsBackupPayload(includeSecrets, {
              password: includeSecrets ? passwordInput?.value || '' : ''
            });
            downloadSettingsBackup(payload);
            showStatus('ok', includeSecrets ? '✓ 設定與加密 API Keys 已匯出' : '✓ 設定檔已匯出');
          } catch (e) {
            showStatus('err', `匯出失敗：${e.message}`);
          } finally {
            exportButton.disabled = false;
          }
        });
      }

      if (importButton && fileInput) {
        importButton.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files?.[0];
          if (!file) return;

          importButton.disabled = true;
          try {
            const result = await importSettingsBackupFile(file, { password: passwordInput?.value || '' });
            showStatus('ok', formatImportSettingsStatus(result));
          } catch (e) {
            if (e.needsPassword && passwordField) {
              passwordField.hidden = false;
              passwordInput?.focus();
            }
            showStatus('err', `匯入失敗：${e.message}`);
          } finally {
            importButton.disabled = false;
            fileInput.value = '';
          }
        });
      }
    }

    async function buildSettingsBackupPayload(includeSecrets = false, options = {}) {
      const syncSettings = await chrome.storage.sync.get(SYNC_SETTING_KEYS);
      const payload = {
        app: SETTINGS_BACKUP_APP,
        schemaVersion: SETTINGS_BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        settings: pickBackupSettings(syncSettings)
      };

      if (includeSecrets) {
        payload.secretsEncrypted = await encryptBackupSecrets(pickBackupSecrets(await Storage.getSecrets({})), options.password || '');
      }

      // 動作清單只進本機設定檔、不進雲端同步（雲端 payload 只取 settings）；沒存過就不帶這個鍵
      const { [CustomActions.STORAGE_KEY]: storedActions } = await chrome.storage.local.get({ [CustomActions.STORAGE_KEY]: [] });
      if (Array.isArray(storedActions) && storedActions.length) payload.actions = storedActions;

      // 術語表跟著設定檔匯出，也跟著雲端同步（見 buildCloudSettingsPayload）。從沒存過就不帶；
      // 存過但清空了要帶空表，還原端才會跟著清空；損毀（非物件）就不帶
      const { [Glossary.STORAGE_KEY]: storedGlossary } = await chrome.storage.local.get({ [Glossary.STORAGE_KEY]: null });
      if (storedGlossary && typeof storedGlossary === 'object' && !Array.isArray(storedGlossary)) {
        payload.glossary = Glossary.normalizeGlossary(storedGlossary);
      }

      return payload;
    }

    async function encryptBackupSecrets(secrets = {}, password = '') {
      const pickedSecrets = pickBackupSecrets(secrets);
      if (!Object.keys(pickedSecrets).length) return null;
      assertBackupPassword(password);
      const cryptoImpl = getCryptoImpl();
      const salt = cryptoImpl.getRandomValues(new Uint8Array(16));
      const iv = cryptoImpl.getRandomValues(new Uint8Array(12));
      const key = await deriveBackupSecretKey(password, salt);
      const encoded = new TextEncoder().encode(JSON.stringify(pickedSecrets));
      const encrypted = await cryptoImpl.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
      return {
        version: SECRET_BACKUP_CRYPTO_VERSION,
        algorithm: 'AES-GCM',
        kdf: 'PBKDF2-SHA-256',
        iterations: SECRET_BACKUP_KDF_ITERATIONS,
        salt: bytesToBase64(salt),
        iv: bytesToBase64(iv),
        data: bytesToBase64(new Uint8Array(encrypted))
      };
    }

    async function decryptBackupSecrets(encrypted = {}, password = '') {
      if (!encrypted) return {};
      assertBackupPassword(password);
      const iterations = encrypted.iterations == null ? SECRET_BACKUP_KDF_ITERATIONS : Number(encrypted.iterations);
      if (encrypted.version !== SECRET_BACKUP_CRYPTO_VERSION
        || encrypted.algorithm !== 'AES-GCM'
        || !Number.isInteger(iterations)
        || iterations < MIN_SECRET_BACKUP_KDF_ITERATIONS
        || iterations > MAX_SECRET_BACKUP_KDF_ITERATIONS) {
        throw new Error('API Key 加密備份格式不支援');
      }
      try {
        const cryptoImpl = getCryptoImpl();
        const salt = base64ToBytes(encrypted.salt);
        const iv = base64ToBytes(encrypted.iv);
        const key = await deriveBackupSecretKey(password, salt, iterations);
        const decrypted = await cryptoImpl.subtle.decrypt(
          { name: 'AES-GCM', iv },
          key,
          base64ToBytes(encrypted.data)
        );
        return pickBackupSecrets(JSON.parse(new TextDecoder().decode(decrypted)));
      } catch (error) {
        if (/API Key 加密備份格式不支援|API Key 備份密碼/.test(String(error?.message || error))) throw error;
        throw new Error('API Key 備份密碼不正確或檔案已損壞');
      }
    }

    async function deriveBackupSecretKey(password, salt, iterations = SECRET_BACKUP_KDF_ITERATIONS) {
      const cryptoImpl = getCryptoImpl();
      const baseKey = await cryptoImpl.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      return cryptoImpl.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations,
          hash: 'SHA-256'
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
      );
    }

    function assertBackupPassword(password = '') {
      if (String(password).length < 8) {
        throw new Error('API Key 備份密碼至少需要 8 個字元');
      }
    }

    function getCryptoImpl() {
      const cryptoImpl = globalThis.crypto?.subtle
        ? globalThis.crypto
        : typeof require === 'function'
          ? require('crypto').webcrypto
          : null;
      if (!cryptoImpl?.subtle || typeof cryptoImpl.getRandomValues !== 'function') {
        throw new Error('此環境不支援 API Key 加密備份');
      }
      return cryptoImpl;
    }

    function bytesToBase64(bytes) {
      if (typeof btoa === 'function') {
        let binary = '';
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
      }
      return Buffer.from(bytes).toString('base64');
    }

    function base64ToBytes(value = '') {
      if (typeof atob === 'function') {
        return Uint8Array.from(atob(value), char => char.charCodeAt(0));
      }
      return Uint8Array.from(Buffer.from(value, 'base64'));
    }

    function pickBackupSettings(values = {}) {
      return SYNC_SETTING_KEYS.reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(values, key)) {
          acc[key] = values[key] == null ? '' : values[key];
        }
        return acc;
      }, {});
    }

    function pickBackupSecrets(values = {}) {
      return Storage.SECRET_KEYS.reduce((acc, key) => {
        if (Object.prototype.hasOwnProperty.call(values, key) && values[key]) {
          acc[key] = values[key];
        }
        return acc;
      }, {});
    }

    function downloadSettingsBackup(payload) {
      downloadBlobFile(`${JSON.stringify(payload, null, 2)}\n`, 'application/json', buildSettingsBackupFilename());
    }

    function buildSettingsBackupFilename(date = new Date()) {
      const stamp = date.toISOString().slice(0, 10).replace(/-/g, '');
      return `fan-fan-ba-settings-${stamp}.json`;
    }

    async function importSettingsBackupFile(file, options = {}) {
      if (file?.size > MAX_SETTINGS_IMPORT_BYTES) {
        throw new Error('設定檔太大（上限 2MB），請確認是翻翻吧的設定備份');
      }
      const payload = parseSettingsBackup(await readTextFile(file));
      const settings = normalizeImportedSettings(payload.settings || {});
      const secrets = await resolveImportedBackupSecrets(payload, options.password || '');
      const hasActions = Array.isArray(payload.actions);
      const hasGlossary = !!payload.glossary && typeof payload.glossary === 'object';

      if (!Object.keys(settings).length && !Object.keys(secrets).length && !hasActions && !hasGlossary) {
        throw new Error('設定檔沒有可匯入的設定');
      }

      const writes = [];
      if (Object.keys(settings).length) writes.push(chrome.storage.sync.set(settings));
      if (Object.keys(secrets).length) writes.push(Storage.setSecrets(secrets));
      // 動作清單整份取代：讀取端容錯（壞掉的自訂動作略過），再走嚴格存檔
      let actions = null;
      if (hasActions) writes.push(CustomActions.saveActionList(CustomActions.normalizeActionList(payload.actions)).then(list => { actions = list; }));
      // 術語表整份取代，壞掉的列略過
      let glossary = null;
      if (hasGlossary) writes.push(ctx.glossary.saveImportedGlossary(payload.glossary).then(saved => { glossary = saved; }));
      await Promise.all(writes);
      await ctx.core.loadSettings();
      const result = { settingsCount: Object.keys(settings).length, secretsCount: Object.keys(secrets).length };
      // 舊版備份把 API Key 明文寫在檔案裡：照常匯入，但提醒重新匯出成加密版
      if (!payload.secretsEncrypted && result.secretsCount) result.legacyPlainSecrets = true;
      if (actions) {
        result.actionsCount = actions.filter(action => !action.builtin).length;
        ctx.actions.replaceActionListState(actions);
      }
      if (glossary) result.glossaryCount = glossary.terms.length;
      return result;
    }

    async function resolveImportedBackupSecrets(payload = {}, password = '') {
      if (payload.secretsEncrypted && !password) {
        // 密碼欄平常收起來，缺密碼時讓呼叫端把它打開
        const error = new Error('這份設定檔的 API Key 有加密，請輸入備份密碼後再匯入一次');
        error.needsPassword = true;
        throw error;
      }
      if (payload.secretsEncrypted) {
        return decryptBackupSecrets(payload.secretsEncrypted, password);
      }
      return pickBackupSecrets(payload.secrets || {});
    }

    function parseSettingsBackup(text) {
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('JSON 格式不正確');
      }

      if (!payload || payload.app !== SETTINGS_BACKUP_APP) {
        throw new Error('不是翻翻吧設定檔');
      }
      if (payload.schemaVersion !== SETTINGS_BACKUP_SCHEMA_VERSION) {
        throw new Error('設定檔版本不支援');
      }
      return payload;
    }

    function normalizeImportedSettings(values = {}) {
      const settings = {};
      SYNC_SETTING_KEYS.forEach(key => {
        if (!Object.prototype.hasOwnProperty.call(values, key)) return;
        settings[key] = normalizeImportedSetting(key, values[key]);
      });
      return settings;
    }

    function normalizeImportedSetting(key, value) {
      // 全文翻譯的空字串＝跟隨主模型，不能被 normalizeModel 補成預設模型
      if (key === 'pageTranslationModel' && !String(value || '').trim()) return '';
      if (key === 'dictionaryModel') {
        const raw = String(value || '').trim();
        if (!raw || raw === 'default') return '';
        const normalized = ModelRegistry.normalizeModel(raw);
        const entry = ModelRegistry.MODELS.find(item => item.id === normalized);
        return entry && !entry.pageTranslationOnly ? normalized : '';
      }
      if (key === 'model' || key === 'pageTranslationModel') {
        return ModelRegistry.normalizeModel(String(value || ''));
      }
      if (key === 'targetLanguage') {
        return ModelRegistry.normalizeLanguage(value, 'zh-TW');
      }
      if (key === 'explanationLanguage') {
        return ModelRegistry.normalizeExplanationLanguage(value, 'target');
      }
      if (key === 'ttsLanguageMode') {
        return ModelRegistry.normalizeTtsLanguageMode(value, 'auto');
      }
      if (key === 'vocabularyHighlightMode') {
        return value === 'auto' ? 'auto' : 'off';
      }
      if (key === 'customApiBase') {
        try {
          return ModelRegistry.normalizeCustomEndpoint(value).base;
        } catch (error) {
          return '';
        }
      }
      return String(value || '').trim();
    }

    function formatImportSettingsStatus({ settingsCount = 0, secretsCount = 0, actionsCount = null, glossaryCount = null, legacyPlainSecrets = false } = {}) {
      const parts = [];
      if (settingsCount) parts.push(`${settingsCount} 個設定`);
      if (secretsCount) parts.push(`${secretsCount} 個 API Key`);
      if (actionsCount !== null) parts.push(`動作清單（${actionsCount} 個自訂動作）`);
      if (glossaryCount !== null) parts.push(`術語表（${glossaryCount} 筆）`);
      const legacyNote = legacyPlainSecrets ? '。這是舊版未加密的備份，建議重新匯出成加密備份' : '';
      return `✓ 設定檔已匯入${parts.length ? `：${parts.join('、')}` : ''}${legacyNote}`;
    }

    function confirmSecretsExport() {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
      return window.confirm('API Keys 會用你輸入的密碼加密後匯出。請記住密碼，忘記後無法還原。確定要匯出嗎？');
    }

    function confirmRemoveProviderKey(label) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false;
      return window.confirm(`${label} API Key 欄位目前是空的。要移除已儲存的 ${label} API Key 嗎？移除後翻譯功能會要求重新設定金鑰。`);
    }

    function confirmCloudUploadOverwrite(file = {}) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
      const modifiedTime = file.modifiedTime ? `\n雲端檔案最後修改：${file.modifiedTime}` : '';
      return window.confirm(`雲端已經有翻翻吧設定檔。上傳目前設定會覆寫雲端版本，另一台裝置之後下載會拿到這份新設定。${modifiedTime}\n\n確定要上傳並覆寫嗎？`);
    }

    function confirmCloudDownloadOverwrite(file = {}) {
      if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
      const modifiedTime = file.modifiedTime ? `\n雲端檔案最後修改：${file.modifiedTime}` : '';
      return window.confirm(`下載雲端設定會覆寫這台裝置目前的一般設定，但不會變更任何 API Key。${modifiedTime}\n\n確定要下載並套用嗎？`);
    }

    return {
      bindBackupControls,
      buildSettingsBackupPayload,
      encryptBackupSecrets,
      decryptBackupSecrets,
      pickBackupSettings,
      pickBackupSecrets,
      buildSettingsBackupFilename,
      parseSettingsBackup,
      normalizeImportedSettings,
      importSettingsBackupFile,
      resolveImportedBackupSecrets,
      formatImportSettingsStatus,
      confirmSecretsExport,
      confirmRemoveProviderKey,
      confirmCloudUploadOverwrite,
      confirmCloudDownloadOverwrite
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.backupCrypto = createBackupCrypto;
  if (typeof module !== 'undefined' && module.exports) module.exports = createBackupCrypto;
})(typeof globalThis !== 'undefined' ? globalThis : window);
