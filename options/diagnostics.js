// options/diagnostics.js — 本機診斷自檢面板（純本機計數，不上傳任何內容）
(function registerOptionsDiagnostics(global) {
  'use strict';

  function createDiagnosticsPanel(ctx) {
    const { ModelRegistry, Storage } = ctx;
    const {
      $,
      DIAGNOSTICS_SETTING_KEYS,
      getCurrentAppVersion,
      providerName,
      hasProviderKey
    } = ctx.shared;

    function initDiagnosticsPanel() {
      renderDiagnostics();
      $('btnClearDiagnostics')?.addEventListener('click', async () => {
        await Storage.clearDiagnostics();
        renderDiagnostics('已清除診斷資料。');
      });
    }

    async function renderDiagnostics(note = '') {
      const el = $('diagnosticsSummary');
      if (!el) return;
      try {
        const [diagnostics, settings, secrets] = await Promise.all([
          Storage.getDiagnostics(),
          chrome.storage.sync.get(DIAGNOSTICS_SETTING_KEYS),
          Storage.getSecrets({})
        ]);
        renderDiagnosticsSelfCheck(el, {
          note,
          diagnostics,
          rows: buildDiagnosticsChecklist(diagnostics, settings, secrets, getCurrentAppVersion())
        });
      } catch {
        el.textContent = note || '無法讀取本機診斷資料，請重新開啟設定頁再試一次。';
      }
    }

    function renderDiagnosticsSelfCheck(el, { note = '', diagnostics = Storage.emptyDiagnostics(), rows = [] } = {}) {
      el.textContent = '';
      const warningCount = rows.filter(row => row.status === 'warn').length;
      const overview = document.createElement('div');
      overview.className = `diagnostics-overview${warningCount ? ' is-warn' : ''}`;

      const title = document.createElement('strong');
      title.textContent = warningCount ? `自檢結果：${warningCount} 項需要處理` : '自檢結果：本機狀態正常';
      const summary = document.createElement('span');
      summary.textContent = formatDiagnosticsSummary(diagnostics, note);
      overview.append(title, summary);

      const list = document.createElement('ul');
      list.className = 'diagnostics-checklist';
      rows.forEach(row => {
        const item = document.createElement('li');
        const dot = document.createElement('span');
        const content = document.createElement('div');
        const label = document.createElement('strong');
        const value = document.createElement('span');
        dot.className = `diagnostics-dot ${row.status || 'info'}`;
        label.textContent = row.label || '';
        value.textContent = row.value || '';
        content.append(label, value);
        if (row.detail) {
          const detail = document.createElement('small');
          detail.textContent = row.detail;
          content.appendChild(detail);
        }
        item.append(dot, content);
        list.appendChild(item);
      });

      el.append(overview, list);
    }

    function formatDiagnosticsSummary(d = Storage.emptyDiagnostics(), note = '') {
      const total = d.actions.translate + d.actions.explain + d.actions.optimize + d.pageTranslations;
      if (!total && !d.errors) return note || '尚無使用紀錄。';
      const sinceText = formatDiagnosticsDate(d.since);
      const parts = [
        `翻譯 ${d.actions.translate}`,
        `解釋 ${d.actions.explain}`,
        `優化 ${d.actions.optimize}`,
        `全文翻譯 ${d.pageTranslations}`,
        `失敗 ${d.errors}`
      ];
      return `${note ? note + ' ' : ''}自 ${sinceText} 起：${parts.join('、')}`;
    }

    function formatDiagnosticsDate(value = '') {
      const t = Date.parse(value);
      return Number.isFinite(t) ? new Date(t).toLocaleDateString() : '未知日期';
    }

    function formatDiagnosticModelStatus(model, ready) {
      const provider = ModelRegistry.PROVIDERS[model?.provider];
      if (provider?.keyless) return `${providerName(model.provider)} / ${model.name}：免金鑰（本機執行）`;
      if (provider?.userConfigured) {
        return `${providerName(model.provider)} / ${model.name}${ready ? '：端點與金鑰已設定' : '：缺端點網址、模型名稱或 API Key'}`;
      }
      return `${providerName(model.provider)} / ${model.name}${ready ? '：API Key 已設定' : '：缺 API Key'}`;
    }

    function buildDiagnosticsChecklist(diagnostics = Storage.emptyDiagnostics(), settings = {}, secrets = {}, appVersion = '') {
      const model = ModelRegistry.getModel(settings.model);
      const pageTranslationModel = ModelRegistry.getModel(settings.pageTranslationModel || model.id);
      const modelKeyReady = hasProviderKey(model, secrets, settings);
      const pageModelKeyReady = hasProviderKey(pageTranslationModel, secrets, settings);
      const total = diagnostics.actions.translate + diagnostics.actions.explain + diagnostics.actions.optimize + diagnostics.pageTranslations;
      const targetLanguage = ModelRegistry.getLanguageOption?.(ModelRegistry.normalizeLanguage(settings.targetLanguage, 'zh-TW'))?.name || '繁體中文';
      const rows = [
        {
          status: modelKeyReady ? 'ok' : 'warn',
          label: '單段翻譯模型',
          value: formatDiagnosticModelStatus(model, modelKeyReady),
          detail: modelKeyReady ? '可按「測試連線」確認 API 是否可用。' : `目前選用 ${model.name}，請先填入 ${providerName(model.provider)} API Key。`
        },
        {
          status: pageModelKeyReady ? 'ok' : 'warn',
          label: '全文翻譯模型',
          value: formatDiagnosticModelStatus(pageTranslationModel, pageModelKeyReady),
          detail: `目標語言：${targetLanguage}；此檢查不會發送測試請求。`
        },
        {
          status: settings.vocabularyHighlightMode === 'auto' ? 'ok' : 'info',
          label: '單字高亮',
          value: settings.vocabularyHighlightMode === 'auto' ? '自動標示已收藏單字' : '關閉',
          detail: settings.vocabularyHighlightMode === 'auto' ? '瀏覽網頁時會用本機單字本輔助提醒。' : '不影響翻譯，只是不在頁面上標示已收藏單字。'
        },
        {
          status: diagnostics.errors ? 'warn' : total ? 'ok' : 'info',
          label: '本機使用紀錄',
          value: diagnostics.errors ? `累計 ${diagnostics.errors} 次失敗` : total ? `累計 ${total} 次成功操作` : '尚無使用紀錄',
          detail: formatDiagnosticsSummary(diagnostics)
        },
        {
          status: 'ok',
          label: '隱私邊界',
          value: '僅保留本機計數，不含選取文字、網址或內容',
          detail: '不會上傳 telemetry；按下清除後會重設這份本機摘要。'
        }
      ];

      if (appVersion) {
        rows.unshift({
          status: 'ok',
          label: '擴充功能版本',
          value: `v${appVersion}`,
          detail: '從本機 manifest 讀取。'
        });
      }

      return rows;
    }

    return {
      initDiagnosticsPanel,
      renderDiagnostics,
      renderDiagnosticsSelfCheck,
      formatDiagnosticsSummary,
      buildDiagnosticsChecklist
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.diagnostics = createDiagnosticsPanel;
  if (typeof module !== 'undefined' && module.exports) module.exports = createDiagnosticsPanel;
})(typeof globalThis !== 'undefined' ? globalThis : window);
