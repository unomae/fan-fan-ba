// options/cloud-sync-ui.js — Google Drive 雲端同步控制列與狀態顯示
(function registerOptionsCloudSyncUi(global) {
  'use strict';

  function createCloudSyncUi(ctx) {
    const { CloudSync } = ctx;
    const { $, getCurrentAppVersion, showStatus } = ctx.shared;

    function bindCloudSyncControls() {
      const webAuthClientInput = $('cloudWebAuthClientId');
      const saveWebAuthClientButton = $('btnCloudSaveWebAuthClientId');
      const signInButton = $('btnCloudSignIn');
      const uploadButton = $('btnCloudUpload');
      const downloadButton = $('btnCloudDownload');
      const signOutButton = $('btnCloudSignOut');
      if (!saveWebAuthClientButton && !signInButton && !uploadButton && !downloadButton && !signOutButton) return;

      saveWebAuthClientButton?.addEventListener('click', () => runCloudSyncAction(saveWebAuthClientButton, async () => {
        const savedClientId = await CloudSync.setWebAuthClientId(webAuthClientInput?.value || '');
        await renderCloudSyncStatus(savedClientId ? 'Web Auth Client ID 已儲存。' : 'Web Auth Client ID 已清除。');
        showStatus('ok', savedClientId ? '✓ Web Auth Client ID 已儲存' : '✓ Web Auth Client ID 已清除');
      }));

      signInButton?.addEventListener('click', () => runCloudSyncAction(signInButton, async () => {
        await CloudSync.getAuthToken(true);
        await CloudSync.recordCloudSyncSignIn?.();
        await renderCloudSyncStatus('已登入 Google，可上傳或下載一般設定。');
        showStatus('ok', '✓ Google 登入成功');
      }));

      uploadButton?.addEventListener('click', () => runCloudSyncAction(uploadButton, async () => {
        const token = await CloudSync.getAuthToken(true);
        await CloudSync.recordCloudSyncSignIn?.();
        const existingFile = await CloudSync.findCloudSettingsFile(token);
        if (existingFile && !ctx.backup.confirmCloudUploadOverwrite(existingFile)) {
          await renderCloudSyncStatus('已取消上傳，雲端設定未變更。');
          showStatus('info', '已取消雲端設定上傳');
          return;
        }
        const payload = await buildCloudSettingsPayload();
        const file = await CloudSync.uploadCloudSettings(token, payload);
        await renderCloudSyncStatus(`已上傳 ${CloudSync.countCloudGeneralSettings(payload.settings)} 個一般設定${payload.settings?.glossary ? '與術語表' : ''}：版本 ${payload.appVersion || '未知'}，${formatCloudSyncTime(payload.updatedAt)}`);
        showStatus('ok', `✓ 雲端設定已上傳${file?.id ? `（${file.id}）` : ''}`);
      }));

      downloadButton?.addEventListener('click', () => runCloudSyncAction(downloadButton, async () => {
        const token = await CloudSync.getAuthToken(true);
        await CloudSync.recordCloudSyncSignIn?.();
        const existingFile = await CloudSync.findCloudSettingsFile(token);
        if (!existingFile) throw new Error('找不到雲端設定檔');
        if (!ctx.backup.confirmCloudDownloadOverwrite(existingFile)) {
          await renderCloudSyncStatus('已取消下載，本機設定未變更。');
          showStatus('info', '已取消雲端設定下載');
          return;
        }
        const payload = await CloudSync.downloadCloudSettings(token);
        const settings = ctx.backup.normalizeImportedSettings(payload.settings || {});
        if (!Object.keys(settings).length) throw new Error('雲端設定檔沒有可還原的設定');
        await chrome.storage.sync.set(settings);
        const cloudGlossary = payload.settings?.glossary && typeof payload.settings.glossary === 'object'
          ? await ctx.glossary.saveImportedGlossary(payload.settings.glossary)
          : null;
        await ctx.core.loadSettings();
        await renderCloudSyncStatus(`已下載雲端設定：${payload.updatedAt || '未知時間'}`);
        showStatus('ok', `✓ 已還原 ${Object.keys(settings).length} 個一般設定${cloudGlossary ? `與術語表（${cloudGlossary.terms.length} 筆）` : ''}`);
      }));

      signOutButton?.addEventListener('click', () => runCloudSyncAction(signOutButton, async () => {
        const token = await CloudSync.getAuthToken(false).catch(() => '');
        await CloudSync.signOut(token);
        await CloudSync.recordCloudSyncSignOut?.();
        await renderCloudSyncStatus('已登出 Google。');
        showStatus('ok', '✓ 已登出 Google');
      }));
    }

    async function runCloudSyncAction(button, action) {
      const buttons = ['btnCloudSaveWebAuthClientId', 'btnCloudSignIn', 'btnCloudUpload', 'btnCloudDownload', 'btnCloudSignOut']
        .map(id => $(id))
        .filter(Boolean);
      buttons.forEach(btn => { btn.disabled = true; });
      try {
        await action();
      } catch (e) {
        const info = CloudSync.classifyCloudSyncError?.(e) || { message: e.message, hint: '' };
        await CloudSync.recordCloudSyncError?.(e, button?.id || '');
        await renderCloudSyncStatus(`${info.message}${info.hint ? `｜${info.hint}` : ''}`);
        showStatus('err', `雲端同步失敗：${info.message}`);
      } finally {
        buttons.forEach(btn => { btn.disabled = false; });
        if (button) button.focus?.();
      }
    }

    async function buildCloudSettingsPayload() {
      const backup = await ctx.backup.buildSettingsBackupPayload(false);
      const settings = backup.glossary ? { ...backup.settings, glossary: backup.glossary } : backup.settings;
      return CloudSync.buildCloudSettingsPayload(settings, {
        appVersion: chrome.runtime?.getManifest?.().version || ''
      });
    }

    async function renderCloudSyncStatus(message = '') {
      const el = $('cloudSyncStatus');
      if (!el) return;
      await CloudSync.loadWebAuthClientId?.();
      const config = CloudSync.getOAuthConfig();
      if (!CloudSync.isOAuthConfigured(config)) {
        renderCloudSyncStatusRows(el, [
          ['登入狀態', '尚未完成 OAuth 設定'],
          ['目前版本', getCurrentAppVersion()],
          ['注意', '請先完成 Google OAuth Client ID 設定；API Key 不會同步。']
        ]);
        return;
      }

      const meta = await CloudSync.getCloudSyncMeta();
      const support = CloudSync.getOAuthSupport?.() || {};
      const authMode = support.nativeAuth && support.webAuthFlow
        ? 'Chrome native auth / cross-browser Web Auth fallback'
        : support.webAuthFlow
          ? 'cross-browser Web Auth'
          : 'Chrome native auth';
      const rows = [
        ['同步摘要', formatCloudSyncSummary(meta)],
        ['登入狀態', formatCloudSignedInStatus(meta)],
        ['目前版本', getCurrentAppVersion()],
        ['同步範圍', '一般設定與術語表，不含 API Key、單字本、查詢歷史'],
        ['儲存位置', 'Google Drive 隱藏 appDataFolder'],
        ['操作方向', '上傳：這台覆蓋雲端；下載：雲端覆蓋這台'],
        ['登入流程', authMode],
        ['Native Client', support.nativeAuthConfigured ? '已設定' : '未設定']
      ];
      if (support.webAuthFlow) rows.push(['Web Auth Client', support.webAuthConfigured ? '已設定' : '未設定']);
      const redirectUrl = CloudSync.getOAuthRedirectUrl?.();
      if (support.webAuthFlow && redirectUrl) rows.push(['Redirect URL', redirectUrl]);
      if (support.webAuthFlow && !support.webAuthConfigured) {
        rows.push(['提醒', 'Edge / Chromium 需設定 Web Auth fallback OAuth Client ID']);
      }
      if (meta.lastUploadAt) rows.push(['最後上傳', `${formatCloudSyncTime(meta.lastUploadAt)}${formatCloudSettingsCount(meta.lastUploadSettingsCount)}${meta.lastUploadAppVersion ? `，版本 ${meta.lastUploadAppVersion}` : ''}`]);
      if (meta.lastDownloadAt) rows.push(['最後下載', `${formatCloudSyncTime(meta.lastDownloadAt)}${formatCloudSettingsCount(meta.lastDownloadSettingsCount)}${meta.lastCloudAppVersion ? `，雲端版本 ${meta.lastCloudAppVersion}` : ''}`]);
      if (meta.lastErrorAt) rows.push(['最後錯誤', `${meta.lastErrorCategory || 'unknown'}，${formatCloudSyncTime(meta.lastErrorAt)}`]);
      if (message) rows.push(['最新訊息', message]);
      renderCloudSyncStatusRows(el, rows);
    }

    function renderCloudSyncStatusRows(el, rows = []) {
      el.textContent = '';
      rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        const strong = document.createElement('strong');
        const span = document.createElement('span');
        strong.textContent = label;
        span.textContent = value || '-';
        row.append(strong, span);
        el.appendChild(row);
      });
    }

    function formatCloudSyncSummary(meta = {}) {
      const uploadAt = parseCloudSyncTime(meta.lastUploadAt);
      const downloadAt = parseCloudSyncTime(meta.lastDownloadAt);
      if (uploadAt && (!downloadAt || uploadAt >= downloadAt)) {
        return `最近上傳：${formatCloudSyncTime(meta.lastUploadAt)}${formatCloudSettingsCount(meta.lastUploadSettingsCount)}`;
      }
      if (downloadAt) {
        return `最近下載：${formatCloudSyncTime(meta.lastDownloadAt)}${formatCloudSettingsCount(meta.lastDownloadSettingsCount)}`;
      }
      if (meta.signedIn) return '已登入，尚未上傳或下載設定';
      if (meta.lastSignOutAt) return '已登出，雲端同步暫停';
      return '尚未開始雲端同步';
    }

    function formatCloudSignedInStatus(meta = {}) {
      if (meta.signedIn) {
        return meta.lastSignInAt ? `已登入，${formatCloudSyncTime(meta.lastSignInAt)}` : '已登入';
      }
      if (meta.lastSignOutAt) return `已登出，${formatCloudSyncTime(meta.lastSignOutAt)}`;
      return '尚未登入';
    }

    function parseCloudSyncTime(value = '') {
      if (!value) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatCloudSettingsCount(value) {
      const count = Number(value);
      return Number.isFinite(count) ? `，${count} 個設定` : '';
    }

    function formatCloudSyncTime(value = '') {
      if (!value) return '未知時間';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
    }

    async function loadCloudWebAuthClientId() {
      const input = $('cloudWebAuthClientId');
      if (!input) return '';
      const clientId = await CloudSync.loadWebAuthClientId?.() || '';
      input.value = clientId;
      return clientId;
    }

    return {
      bindCloudSyncControls,
      loadCloudWebAuthClientId,
      buildCloudSettingsPayload,
      renderCloudSyncStatus,
      formatCloudSyncSummary,
      formatCloudSyncTime
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.cloudSyncUi = createCloudSyncUi;
  if (typeof module !== 'undefined' && module.exports) module.exports = createCloudSyncUi;
})(typeof globalThis !== 'undefined' ? globalThis : window);
