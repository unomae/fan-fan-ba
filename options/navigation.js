// options/navigation.js — 總覽狀態摘要、分類分頁路由、未儲存追蹤、⌘K 搜尋與新功能標籤
(function registerOptionsNavigation(global) {
  'use strict';

  function createOptionsNavigation(ctx) {
    const { ModelRegistry, Storage, CloudSync, CustomActions, Dom } = ctx;
    const {
      $,
      SYNC_SETTING_KEYS,
      LAST_VOCAB_BACKUP_KEY,
      VOCAB_BACKUP_STALE_DAYS,
      SEEN_FEATURE_BADGES_KEY,
      FEATURE_BADGE_TEXT,
      SEARCH_RESULT_LIMIT,
      SEARCH_HIT_MS,
      SAVE_BUTTON_PANELS,
      OVERVIEW_RENDER_DELAY_MS,
      OVERVIEW_SHORTCUT_COMMANDS
    } = ctx.shared;

    // null＝還沒讀到已看過清單，標籤先全部藏著，避免載入時閃一下
    let seenFeatureBadges = null;
    let settingsSearchState = { results: [], active: 0 };
    const settingsDirtyPanels = new Set();
    let overviewRenderSeq = 0;
    let overviewRenderTimer = null;

    // ── 總覽與分類切換 ─────────────────────────────────────
    function settingsPanelTitle(panelName) {
      return searchableText(document.querySelector(`.settings-tab[data-panel="${panelName}"]`));
    }

    function getSettingsPanelNames() {
      return [...document.querySelectorAll('.settings-panel[data-panel-content]')].map(panel => panel.dataset.panelContent);
    }

    // pushState 不會觸發 hashchange，切換時不會自己再跑一次路由
    function setSettingsHash(panelName) {
      const target = panelName ? `#${panelName}` : '';
      if ((location.hash || '') === target) return;
      try {
        history.pushState(null, '', target || `${location.pathname}${location.search}`);
      } catch (error) {
        console.warn('[翻翻吧] 設定頁網址更新失敗', error);
      }
    }

    function activateSettingsPanel(panelName, { updateHistory = true } = {}) {
      document.querySelectorAll('.settings-tab[data-panel]').forEach(tab => {
        const isActive = tab.dataset.panel === panelName;
        tab.classList.toggle('is-active', isActive);
        if (isActive) tab.setAttribute('aria-current', 'true');
        else tab.removeAttribute('aria-current');
      });

      document.querySelectorAll('.settings-panel[data-panel-content]').forEach(panel => {
        panel.hidden = panel.dataset.panelContent !== panelName;
      });

      if ($('settingsOverview')) $('settingsOverview').hidden = true;
      if ($('settingsDetail')) $('settingsDetail').hidden = false;
      if ($('saveButtons')) $('saveButtons').hidden = !SAVE_BUTTON_PANELS.has(panelName);
      // 從總覽下方的卡片點進來時，詳細頁開頭可能在視窗外
      const detail = $('settingsDetail');
      if (detail && detail.getBoundingClientRect().top < 0) detail.scrollIntoView?.({ block: 'start' });
      if (updateHistory) setSettingsHash(panelName);
    }

    function showSettingsOverview({ updateHistory = true } = {}) {
      const from = document.querySelector('.settings-tab.is-active[data-panel]');
      document.querySelectorAll('.settings-tab[data-panel]').forEach(tab => {
        tab.classList.remove('is-active');
        tab.removeAttribute('aria-current');
      });
      if ($('settingsOverview')) $('settingsOverview').hidden = false;
      if ($('settingsDetail')) $('settingsDetail').hidden = true;
      if (updateHistory) setSettingsHash('');
      // 鍵盤使用者回到剛才那張卡片
      from?.focus({ preventScroll: true });
    }

    function routeSettingsFromHash() {
      let name = '';
      try { name = decodeURIComponent((location.hash || '').slice(1)); } catch { name = ''; }
      if (getSettingsPanelNames().includes(name)) activateSettingsPanel(name, { updateHistory: false });
      else showSettingsOverview({ updateHistory: false });
    }

    function initSettingsTabs() {
      const tabs = document.querySelectorAll('.settings-tab[data-panel]');
      const panels = document.querySelectorAll('.settings-panel[data-panel-content]');
      if (!tabs.length || !panels.length) return;

      tabs.forEach(tab => {
        tab.addEventListener('click', () => activateSettingsPanel(tab.dataset.panel));
      });
      $('btnBackToOverview')?.addEventListener('click', () => showSettingsOverview());
      // 總覽上「需要注意」與「未儲存」提示裡的按鈕
      $('settingsOverview')?.addEventListener('click', event => {
        const go = event.target.closest?.('[data-go-panel]');
        if (go) activateSettingsPanel(go.dataset.goPanel);
      });
      window.addEventListener('popstate', routeSettingsFromHash);
      window.addEventListener('hashchange', routeSettingsFromHash);
      routeSettingsFromHash();
    }

    // ── 總覽狀態摘要 ─────────────────────────────────────
    function getSavedModelKeyGap(modelId, settings = {}, secrets = {}) {
      const provider = ModelRegistry.PROVIDERS[ModelRegistry.getProvider(modelId)];
      if (!provider || provider.keyless) return '';
      const has = value => !!String(value || '').trim();
      if (provider.userConfigured) {
        return has(settings.customApiBase) && has(settings.customModelName) && has(secrets[provider.apiKeyName])
          ? ''
          : '自訂端點的網址、模型名稱或金鑰還沒填';
      }
      return has(secrets[provider.apiKeyName]) ? '' : `缺 ${provider.label} API Key`;
    }

    function formatBackupAge(lastIso, now) {
      const last = Date.parse(lastIso || '');
      if (!last) return null;
      return Math.max(0, Math.floor((now - last) / (24 * 60 * 60 * 1000)));
    }

    // 純函式：把讀到的資料整理成總覽要顯示的文字，方便測試
    function buildSettingsOverview(data = {}, now = Date.now()) {
      const { settings = {}, secrets = {}, lastBackupAt = '', actions = null, glossary = null, cloud = null } = data;
      const model = ModelRegistry.normalizeModel(settings.model);
      const modelName = ModelRegistry.getModelDisplayName(model);
      const provider = ModelRegistry.PROVIDERS[ModelRegistry.getProvider(model)];
      const mainGap = getSavedModelKeyGap(model, settings, secrets);
      // 大卡片上逐家列出金鑰有沒有填；自訂端點沒設網址時不列
      const keys = Object.values(ModelRegistry.PROVIDERS)
        .filter(item => item.apiKeyName && (!item.userConfigured || String(settings.customApiBase || '').trim()))
        .map(item => ({ label: item.label, filled: !!String(secrets[item.apiKeyName] || '').trim() }));

      // 只放「功能會壞掉」的事；選填功能沒設定不算
      const attention = [];
      if (mainGap) attention.push({ panel: 'model', text: `預設模型「${modelName}」${mainGap}，翻譯會無法使用` });
      for (const [key, label] of [['dictionaryModel', '字典'], ['pageTranslationModel', '全文翻譯']]) {
        const value = settings[key];
        if (!value || value === 'default') continue;
        const gap = getSavedModelKeyGap(value, settings, secrets);
        if (gap && gap !== mainGap) attention.push({ panel: 'model', text: `${label}選的模型${gap}，這個功能會無法使用` });
      }

      const language = ModelRegistry.getLanguageOption(ModelRegistry.normalizeLanguage(settings.targetLanguage, 'zh-TW'));
      const enabledActions = Array.isArray(actions) ? actions.filter(action => action.enabled).length : null;
      const terms = glossary ? glossary.terms.length : null;
      const sites = glossary ? glossary.sites.length : 0;
      const backupDays = formatBackupAge(lastBackupAt, now);

      let cloudTile = { summary: '同步狀態讀取失敗' };
      if (cloud && !cloud.configured) {
        cloudTile = { summary: '尚未完成 Google OAuth 設定', status: ['off', '未設定'] };
      } else if (cloud) {
        cloudTile = {
          summary: ctx.cloud.formatCloudSyncSummary(cloud.meta || {}),
          status: cloud.meta?.signedIn ? ['ok', '已登入'] : ['off', '未登入']
        };
      }

      return {
        keys,
        attention,
        tiles: {
          model: {
            summary: `預設：${modelName}`,
            status: mainGap ? ['warn', mainGap] : provider?.keyless ? ['ok', '不需金鑰'] : ['ok', '金鑰已設定']
          },
          language: {
            summary: `翻譯成 ${language?.name || '繁體中文'}，單字高亮${settings.vocabularyHighlightMode === 'auto' ? '開啟' : '關閉'}`
          },
          actions: { summary: enabledActions === null ? '動作清單讀取失敗' : `${enabledActions} 個動作啟用中` },
          glossary: {
            summary: terms === null ? '術語表讀取失敗' : terms ? `${terms} 筆術語${sites ? `，限 ${sites} 個網站` : ''}` : '還沒有術語'
          },
          compare: { summary: '' },
          obsidian: { summary: settings.obsidianVault ? `Vault：${settings.obsidianVault}` : '存到目前開啟的 Vault' },
          backup: backupDays === null
            ? { summary: '單字本還沒匯出過備份', status: ['off', '未備份'] }
            : {
              summary: `單字本上次備份：${backupDays === 0 ? '今天' : `${backupDays} 天前`}`,
              ...(backupDays >= VOCAB_BACKUP_STALE_DAYS ? { status: ['warn', `超過 ${VOCAB_BACKUP_STALE_DAYS} 天`] } : {})
            },
          cloud: cloudTile,
          privacy: { summary: '' }
        }
      };
    }

    async function loadSettingsOverviewData() {
      const safe = async (read, fallback) => {
        try {
          return await read();
        } catch (error) {
          console.warn('[翻翻吧] 總覽資料讀取失敗', error);
          return fallback;
        }
      };
      const keyDefaults = Object.fromEntries(Object.values(ModelRegistry.PROVIDERS)
        .map(item => item.apiKeyName).filter(Boolean).map(name => [name, '']));
      const [settings, secrets, local, actions, glossary, cloud] = await Promise.all([
        safe(() => chrome.storage.sync.get(SYNC_SETTING_KEYS), {}),
        safe(() => Storage.getSecrets(keyDefaults), {}),
        safe(() => chrome.storage.local.get(LAST_VOCAB_BACKUP_KEY), {}),
        safe(() => CustomActions.loadActionList(), null),
        safe(() => ctx.glossary.loadStoredGlossary(), null),
        safe(async () => {
          await CloudSync.loadWebAuthClientId?.();
          const configured = CloudSync.isOAuthConfigured(CloudSync.getOAuthConfig());
          return { configured, meta: configured ? await CloudSync.getCloudSyncMeta() : {} };
        }, null)
      ]);
      return { settings: settings || {}, secrets: secrets || {}, lastBackupAt: local?.[LAST_VOCAB_BACKUP_KEY] || '', actions, glossary, cloud };
    }

    async function renderSettingsOverview() {
      const seq = ++overviewRenderSeq;
      const overview = buildSettingsOverview(await loadSettingsOverviewData());
      // 連續觸發時只畫最後一次讀到的資料
      if (seq !== overviewRenderSeq) return overview;

      Object.entries(overview.tiles).forEach(([panelName, tile]) => {
        const summary = document.querySelector(`[data-summary-for="${panelName}"]`);
        const status = document.querySelector(`[data-status-for="${panelName}"]`);
        if (summary) summary.textContent = tile.summary;
        if (status) {
          status.hidden = !tile.status;
          status.dataset.kind = tile.status?.[0] || '';
          status.textContent = tile.status?.[1] || '';
        }
      });

      const keyList = $('overviewKeys');
      if (keyList) {
        Dom.ffbClear(keyList).append(...overview.keys.map(key => Dom.ffbEl('span', {
          class: `tile-key${key.filled ? ' is-filled' : ''}`
        }, `${key.label} 金鑰${key.filled ? '已填' : '未填'}`)));
      }

      const list = $('overviewAttention');
      if (list) {
        Dom.ffbClear(list);
        overview.attention.forEach(item => {
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('aria-hidden', 'true');
          const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
          use.setAttribute('href', '#ico-alert');
          icon.append(use);
          list.append(Dom.ffbEl('li', null, [
            icon,
            Dom.ffbEl('span', null, item.text),
            Dom.ffbEl('button', { type: 'button', dataset: { goPanel: item.panel } }, '去設定')
          ]));
        });
        list.hidden = !overview.attention.length;
      }
      return overview;
    }

    function scheduleSettingsOverviewRender() {
      clearTimeout(overviewRenderTimer);
      overviewRenderTimer = setTimeout(() => { renderSettingsOverview(); }, OVERVIEW_RENDER_DELAY_MS);
    }

    // ── 總覽頁尾快捷鍵 ─────────────────────────────────
    function renderOverviewShortcuts(commands = []) {
      const row = $('overviewShortcuts');
      const list = $('overviewShortcutList');
      if (!row || !list) return;
      const byName = new Map(commands.map(command => [command.name, command]));
      const items = OVERVIEW_SHORTCUT_COMMANDS.map(name => byName.get(name)).filter(Boolean).map(command =>
        Dom.ffbEl('span', null, [
          `${command.description || command.name} `,
          Dom.ffbEl('kbd', command.shortcut ? null : { class: 'is-unset' }, command.shortcut || '未設定')
        ]));
      Dom.ffbClear(list).append(...items);
      row.hidden = !items.length;
    }

    async function initOverviewShortcuts() {
      // chrome:// 頁面不能用一般連結開，要走 tabs.create
      $('btnOpenShortcuts')?.addEventListener('click', () => chrome.tabs?.create({ url: 'chrome://extensions/shortcuts' }));
      let commands = [];
      try {
        commands = (await chrome.commands?.getAll?.()) || [];
      } catch {
        commands = [];
      }
      renderOverviewShortcuts(commands);
    }

    function initSettingsOverview() {
      chrome.storage.onChanged?.addListener(scheduleSettingsOverviewRender);
      return renderSettingsOverview();
    }

    // ── 未儲存提示 ───────────────────────────────────────
    function renderSettingsSaveState() {
      const dirty = [...settingsDirtyPanels];
      if ($('saveState')) $('saveState').textContent = dirty.length ? '有未儲存的變更' : '';
      const notice = $('overviewUnsaved');
      if (!notice) return;
      notice.hidden = !dirty.length;
      Dom.ffbClear(notice);
      if (!dirty.length) return;
      notice.append(
        Dom.ffbEl('span', null, `「${dirty.map(settingsPanelTitle).join('、')}」有未儲存的變更`),
        Dom.ffbEl('button', { type: 'button', dataset: { goPanel: dirty[0] } }, '回去儲存')
      );
    }

    function markSettingsDirty(panelName) {
      if (!SAVE_BUTTON_PANELS.has(panelName) || settingsDirtyPanels.has(panelName)) return;
      settingsDirtyPanels.add(panelName);
      renderSettingsSaveState();
    }

    function clearSettingsDirty(panelNames = [...settingsDirtyPanels]) {
      panelNames.forEach(name => settingsDirtyPanels.delete(name));
      renderSettingsSaveState();
    }

    function initSettingsDirtyTracking() {
      const onEdit = event => {
        const target = event.target;
        if (!target?.matches?.('input, select, textarea') || target.type === 'file') return;
        const panel = target.closest('.settings-panel[data-panel-content]');
        if (panel) markSettingsDirty(panel.dataset.panelContent);
      };
      document.addEventListener('input', onEdit);
      document.addEventListener('change', onEdit);
      // 術語表的刪除列不會觸發 input
      $('glossaryRows')?.addEventListener('click', event => {
        if (event.target.closest('button')) markSettingsDirty('glossary');
      });
      window.addEventListener('beforeunload', event => {
        if (!settingsDirtyPanels.size) return;
        event.preventDefault();
        event.returnValue = '';
      });
    }

    // ── 設定搜尋（⌘K／Ctrl+K）────────────────────────────
    function searchableText(el) {
      if (!el) return '';
      const clone = el.cloneNode(true);
      clone.querySelectorAll('.feature-badge, .hint, small, .tile-meta').forEach(node => node.remove());
      return clone.textContent.replace(/\s+/g, ' ').trim();
    }

    function isHiddenInPanel(el, panel) {
      for (let node = el; node && node !== panel; node = node.parentElement) {
        if (node.hidden) return true;
      }
      return false;
    }

    function collectSettingsSearchEntries() {
      const entries = [];
      const seen = new Set();
      const add = (panel, panelTitle, text, target) => {
        const key = `${panel}\n${text}`;
        if (!text || seen.has(key)) return;
        seen.add(key);
        entries.push({ panel, panelTitle, text, target });
      };
      document.querySelectorAll('.settings-panel[data-panel-content]').forEach(panel => {
        const panelName = panel.dataset.panelContent;
        const tab = document.querySelector(`.settings-tab[data-panel="${panelName}"]`);
        const panelTitle = searchableText(tab) || searchableText(panel.querySelector('h2'));
        add(panelName, panelTitle, panelTitle, panel.querySelector('.panel-head') || panel);
        panel.querySelectorAll('h2, h3, label, .field-label').forEach(el => {
          if (!isHiddenInPanel(el, panel)) add(panelName, panelTitle, searchableText(el), el);
        });
      });
      return entries;
    }

    function searchSettings(query) {
      const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const hits = collectSettingsSearchEntries().filter(entry => {
        const text = entry.text.toLowerCase();
        return terms.every(term => text.includes(term));
      });
      const starts = hits.filter(entry => entry.text.toLowerCase().startsWith(terms[0]));
      const rest = hits.filter(entry => !starts.includes(entry));
      return [...starts, ...rest].slice(0, SEARCH_RESULT_LIMIT);
    }

    function setSettingsSearchOpen(open) {
      const list = $('settingsSearchResults');
      const input = $('settingsSearch');
      list.hidden = !open;
      input.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) input.removeAttribute('aria-activedescendant');
    }

    function renderSettingsSearchResults() {
      const list = $('settingsSearchResults');
      const input = $('settingsSearch');
      const { results, active } = settingsSearchState;
      if (!input.value.trim()) {
        Dom.ffbClear(list);
        setSettingsSearchOpen(false);
        return;
      }
      if (!results.length) {
        Dom.ffbClear(list).append(Dom.ffbEl('li', { class: 'search-empty', role: 'presentation' }, '沒有符合的設定'));
        setSettingsSearchOpen(true);
        return;
      }
      Dom.ffbClear(list).append(...results.map((entry, index) => {
        const item = Dom.ffbEl('li', {
          class: 'search-result',
          role: 'option',
          id: `settingsSearchResult${index}`,
          'aria-selected': index === active ? 'true' : 'false'
        }, [
          Dom.ffbEl('span', null, entry.text),
          entry.text !== entry.panelTitle && Dom.ffbEl('small', null, entry.panelTitle)
        ]);
        item.addEventListener('mousedown', event => event.preventDefault());
        item.addEventListener('click', () => jumpToSettingsSearchResult(entry));
        return item;
      }));
      input.setAttribute('aria-activedescendant', `settingsSearchResult${active}`);
      setSettingsSearchOpen(true);
    }

    function jumpToSettingsSearchResult(entry) {
      if (!entry) return false;
      activateSettingsPanel(entry.panel);
      const block = entry.target.closest('tr, .provider-card, .field, .info-block, .panel-head') || entry.target;
      block.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      const control = entry.target.htmlFor ? $(entry.target.htmlFor) : null;
      control?.focus({ preventScroll: true });
      block.classList.remove('search-hit');
      void block.offsetWidth; // 重新觸發高亮動畫
      block.classList.add('search-hit');
      setTimeout(() => block.classList.remove('search-hit'), SEARCH_HIT_MS);

      $('settingsSearch').value = '';
      settingsSearchState = { results: [], active: 0 };
      renderSettingsSearchResults();
      return true;
    }

    function updateSettingsSearch() {
      settingsSearchState = { results: searchSettings($('settingsSearch').value), active: 0 };
      renderSettingsSearchResults();
    }

    function initSettingsSearch() {
      const input = $('settingsSearch');
      if (!input) return;
      const isMac = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform || '');
      if ($('settingsSearchKbd')) $('settingsSearchKbd').textContent = isMac ? '⌘K' : 'Ctrl K';

      input.addEventListener('input', updateSettingsSearch);
      input.addEventListener('focus', () => { if (input.value.trim()) updateSettingsSearch(); });
      input.addEventListener('blur', () => setSettingsSearchOpen(false));
      input.addEventListener('keydown', event => {
        const { results, active } = settingsSearchState;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          if (!results.length) return;
          event.preventDefault();
          const step = event.key === 'ArrowDown' ? 1 : -1;
          settingsSearchState.active = (active + step + results.length) % results.length;
          renderSettingsSearchResults();
        } else if (event.key === 'Enter') {
          event.preventDefault();
          jumpToSettingsSearchResult(results[active]);
        } else if (event.key === 'Escape') {
          event.preventDefault();
          input.value = '';
          updateSettingsSearch();
        }
      });

      document.addEventListener('keydown', event => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          input.focus();
          input.select();
        }
      });
    }

    // ── 新功能標籤 ─────────────────────────────────────
    function buildFeatureBadge(id, kind) {
      return Dom.ffbEl('span', { class: 'feature-badge', dataset: { badgeFor: id, kind }, hidden: true }, FEATURE_BADGE_TEXT[kind]);
    }

    function applyFeatureBadges() {
      document.querySelectorAll('.feature-badge[data-badge-for]').forEach(badge => {
        badge.hidden = !seenFeatureBadges || seenFeatureBadges.has(badge.dataset.badgeFor);
      });
      document.querySelectorAll('.settings-tab[data-panel]').forEach(tab => {
        const ownBadge = tab.querySelector('.feature-badge:not([hidden])');
        const panel = document.querySelector(`.settings-panel[data-panel-content="${tab.dataset.panel}"]`);
        const unseen = !!panel && !!panel.querySelector('.feature-badge[data-badge-for]:not([hidden])');
        tab.classList.toggle('has-unseen', !ownBadge && unseen);
      });
    }

    async function markFeatureSeen(id) {
      if (!seenFeatureBadges || !id || seenFeatureBadges.has(id)) return false;
      seenFeatureBadges.add(id);
      applyFeatureBadges();
      try {
        await chrome.storage.local.set({ [SEEN_FEATURE_BADGES_KEY]: [...seenFeatureBadges] });
      } catch (error) {
        console.warn('[翻翻吧] 新功能標籤狀態儲存失敗', error);
      }
      return true;
    }

    async function initFeatureBadges() {
      document.addEventListener('click', event => {
        const item = event.target.closest?.('[data-feature-item]');
        if (item) markFeatureSeen(item.dataset.featureItem);
      });
      let stored = [];
      try {
        ({ [SEEN_FEATURE_BADGES_KEY]: stored } = await chrome.storage.local.get({ [SEEN_FEATURE_BADGES_KEY]: [] }));
      } catch (error) {
        console.warn('[翻翻吧] 新功能標籤狀態讀取失敗', error);
      }
      seenFeatureBadges = new Set(Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : []);
      applyFeatureBadges();
      return seenFeatureBadges;
    }

    return {
      initSettingsTabs,
      activateSettingsPanel,
      settingsPanelTitle,
      showSettingsOverview,
      routeSettingsFromHash,
      buildSettingsOverview,
      renderSettingsOverview,
      renderOverviewShortcuts,
      initOverviewShortcuts,
      initSettingsOverview,
      markSettingsDirty,
      clearSettingsDirty,
      initSettingsDirtyTracking,
      searchableText,
      searchSettings,
      jumpToSettingsSearchResult,
      initSettingsSearch,
      buildFeatureBadge,
      applyFeatureBadges,
      markFeatureSeen,
      initFeatureBadges
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.navigation = createOptionsNavigation;
  if (typeof module !== 'undefined' && module.exports) module.exports = createOptionsNavigation;
})(typeof globalThis !== 'undefined' ? globalThis : window);
