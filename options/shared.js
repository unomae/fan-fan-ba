// options/shared.js — 設定頁共用常數與工具函式（消除多檔重複樣板與頂層 TDZ 相依）
(function registerOptionsShared(global) {
  'use strict';

  const SYNC_SETTING_KEYS = [
    'model',
    'pageTranslationModel',
    'dictionaryModel',
    'targetLanguage',
    'explanationLanguage',
    'ttsLanguageMode',
    'vocabularyHighlightMode',
    'obsidianVault',
    'obsidianDefaultFolder',
    // 自訂端點的網址與模型名稱不是機密，跟著備份與雲端同步；金鑰 customApiKey 另存本機
    'customApiBase',
    'customModelName'
  ];

  const DIAGNOSTICS_SETTING_KEYS = [
    'model',
    'pageTranslationModel',
    'targetLanguage',
    'vocabularyHighlightMode',
    'customApiBase',
    'customModelName'
  ];

  const LAST_VOCAB_BACKUP_KEY = 'lastVocabularyBackupAt';
  const VOCAB_BACKUP_STALE_DAYS = 30;
  const SEEN_FEATURE_BADGES_KEY = 'seenFeatureBadges';
  const FEATURE_BADGE_TEXT = { new: '新增', updated: '已更新' };
  const ACTION_FEATURE_BADGES = { analyze: 'new', optimize: 'updated' };
  const SEARCH_RESULT_LIMIT = 8;
  const SEARCH_HIT_MS = 2000;
  // 這幾個分類的欄位由「儲存設定」一起寫入；其他分類各有自己的按鈕，詳細頁只留狀態列
  const SAVE_BUTTON_PANELS = new Set(['model', 'language', 'glossary', 'obsidian']);
  const OVERVIEW_RENDER_DELAY_MS = 80;
  const OVERVIEW_SHORTCUT_COMMANDS = ['translate-selection', 'toggle-page-translation'];
  const TEST_CONNECTION_TIMEOUT_MS = 20000;

  function createOptionsShared(ctx) {
    const { ModelRegistry } = ctx;
    const $ = id => document.getElementById(id);
    let statusClearTimer = null;

    function getCurrentAppVersion() {
      return chrome.runtime?.getManifest?.().version || '未知';
    }

    function providerApiKeyName(provider = '') {
      return (ModelRegistry.PROVIDERS[provider] || ModelRegistry.PROVIDERS.gemini).apiKeyName;
    }

    function providerName(provider = '') {
      return ModelRegistry.PROVIDERS[provider]?.label || provider || '未知模型';
    }

    function hasProviderKey(model = {}, secrets = {}, settings = {}) {
      const provider = ModelRegistry.PROVIDERS[model.provider];
      if (provider?.keyless) return true;
      if (provider?.userConfigured) {
        return !!String(settings.customApiBase || '').trim()
          && !!String(settings.customModelName || '').trim()
          && !!String(secrets[provider.apiKeyName] || '').trim();
      }
      const keyName = model.apiKeyName || providerApiKeyName(model.provider);
      return !!String(secrets[keyName] || '').trim();
    }

    // 未在冊的舊版 model id（如 gemini-2.5-flash）：select 沒有對應選項時補一個
    // 保留現行設定，避免 select 落回第一個選項、儲存時被靜默改掉（WS-E M3'' 附帶修復）
    function setModelSelectValue(select, modelId) {
      if (!select) return;
      select.value = modelId;
      if (select.value !== modelId) {
        const opt = document.createElement('option');
        opt.value = modelId;
        opt.textContent = `${ModelRegistry.getModelDisplayName(modelId)}（舊版）`;
        select.appendChild(opt);
        select.value = modelId;
      }
    }

    function showStatus(type, msg) {
      const el = $('status');
      clearTimeout(statusClearTimer);
      statusClearTimer = null;
      el.className = type;
      el.textContent = msg;
      if (type === 'ok') {
        statusClearTimer = setTimeout(() => {
          statusClearTimer = null;
          el.className = '';
          el.textContent = '';
        }, 3000);
      }
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = TEST_CONNECTION_TIMEOUT_MS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // 共用 Blob 檔案下載 helper（單字本 JSON／CSV、設定檔 JSON、術語表 CSV 共用）
    function downloadBlobFile(content, mimeType, filename) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function readTextFile(file) {
      if (file && typeof file.text === 'function') return file.text();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('無法讀取設定檔'));
        reader.readAsText(file);
      });
    }

    async function requestVocabularyStore(action, payload = {}) {
      if (!chrome.runtime?.sendMessage) throw new Error('單字本資料層不可用');
      const response = await chrome.runtime.sendMessage({
        type: 'VOCABULARY_STORE',
        action,
        ...payload
      });
      if (!response || response.ok !== true) {
        throw new Error(response?.error || '單字本資料層不可用');
      }
      return response;
    }

    return {
      SYNC_SETTING_KEYS,
      DIAGNOSTICS_SETTING_KEYS,
      LAST_VOCAB_BACKUP_KEY,
      VOCAB_BACKUP_STALE_DAYS,
      SEEN_FEATURE_BADGES_KEY,
      FEATURE_BADGE_TEXT,
      ACTION_FEATURE_BADGES,
      SEARCH_RESULT_LIMIT,
      SEARCH_HIT_MS,
      SAVE_BUTTON_PANELS,
      OVERVIEW_RENDER_DELAY_MS,
      OVERVIEW_SHORTCUT_COMMANDS,
      TEST_CONNECTION_TIMEOUT_MS,
      $,
      getCurrentAppVersion,
      providerApiKeyName,
      providerName,
      hasProviderKey,
      setModelSelectValue,
      showStatus,
      fetchWithTimeout,
      downloadBlobFile,
      readTextFile,
      requestVocabularyStore
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.shared = createOptionsShared;
  if (typeof module !== 'undefined' && module.exports) module.exports = createOptionsShared;
})(typeof globalThis !== 'undefined' ? globalThis : window);
