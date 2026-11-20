// options/model-compare.js — 多模型並排翻譯比較面板
(function registerOptionsModelCompare(global) {
  'use strict';

  const COMPARE_MAX_CHARS = 2000;

  function createModelCompare(ctx) {
    const { ModelRegistry, Storage, Dom } = ctx;
    const { $ } = ctx.shared;
    let compareRunning = false;

    function setCompareStatus(message) {
      if ($('compareStatus')) $('compareStatus').textContent = message;
    }

    // 只列已儲存金鑰的模型（自訂端點還要填好網址與模型名稱）與免金鑰的內建翻譯
    async function loadCompareModels() {
      const [secrets, settings] = await Promise.all([
        Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '', customApiKey: '' }),
        chrome.storage.sync.get({ customApiBase: '', customModelName: '' })
      ]);
      return ModelRegistry.MODELS.filter(model => ModelRegistry.isModelConfigured(model, secrets, settings));
    }

    function compareModelLabel(id) {
      const model = ModelRegistry.getModel(id);
      const provider = ModelRegistry.PROVIDERS[model?.provider];
      return provider && !provider.keyless ? `${model.name}（${provider.label}）` : (model?.name || id);
    }

    // 重畫時保留原本勾選的項目（金鑰改了、清單變了也不會全部被取消）
    async function renderCompareModels() {
      const list = $('compareModelList');
      if (!list) return [];
      let models = [];
      try {
        models = await loadCompareModels();
      } catch (error) {
        console.warn('[翻翻吧] 讀取可比較的模型失敗', error);
      }
      const checked = new Set([...list.querySelectorAll('input:checked')].map(input => input.value));
      Dom.ffbClear(list).append(...models.map(model => {
        const input = Dom.ffbEl('input', { type: 'checkbox', name: 'compareModel', value: model.id });
        input.checked = checked.has(model.id);
        return Dom.ffbEl('label', null, [input, compareModelLabel(model.id)]);
      }));
      $('compareModelEmpty').hidden = models.length > 0;
      return models;
    }

    async function compareOneModel(modelId, text, targetLanguage) {
      const started = Date.now();
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GEMINI_REQUEST',
          action: 'translate',
          selectedText: text,
          modelOverride: modelId,
          pageTranslation: true,
          targetLanguage,
          browserLanguage: globalThis.navigator?.language || ''
        });
        const ms = Date.now() - started;
        if (!response) return { modelId, ms, error: '沒有收到回應，請重試' };
        if (response.error) return { modelId, ms, error: String(response.error) };
        return { modelId, ms, result: String(response.result ?? ''), notice: response.notice ? String(response.notice) : '' };
      } catch (error) {
        return { modelId, ms: Date.now() - started, error: error?.message || '請求失敗' };
      }
    }

    function formatCompareSeconds(ms) {
      return `${(ms / 1000).toFixed(1)} 秒`;
    }

    function buildCompareCard(modelId) {
      const meta = Dom.ffbEl('p', { class: 'compare-meta' }, '翻譯中…');
      const output = Dom.ffbEl('p', { class: 'compare-output' });
      const el = Dom.ffbEl('article', { class: 'compare-card', dataset: { model: modelId } }, [
        Dom.ffbEl('h3', null, compareModelLabel(modelId)),
        meta,
        output
      ]);
      return { el, meta, output };
    }

    function fillCompareCard(card, outcome) {
      card.el.classList.toggle('is-error', !!outcome.error);
      if (outcome.error) {
        card.meta.textContent = `失敗，${formatCompareSeconds(outcome.ms)}`;
        card.output.textContent = outcome.error;
        return;
      }
      card.meta.textContent = [formatCompareSeconds(outcome.ms), outcome.notice].filter(Boolean).join('，');
      card.output.textContent = outcome.result;
    }

    async function runModelCompare() {
      if (compareRunning) return null;
      const text = $('compareText').value.trim();
      const modelIds = [...$('compareModelList').querySelectorAll('input:checked')].map(input => input.value);
      if (!text) {
        setCompareStatus('請先輸入要翻譯的文字。');
        $('compareText').focus();
        return null;
      }
      if (text.length > COMPARE_MAX_CHARS) {
        setCompareStatus(`文字最多 ${COMPARE_MAX_CHARS} 字。`);
        return null;
      }
      if (!modelIds.length) {
        setCompareStatus('請至少勾選一個模型。');
        return null;
      }

      compareRunning = true;
      $('btnRunCompare').disabled = true;
      const targetLanguage = ModelRegistry.normalizeLanguage($('targetLanguage')?.value, 'zh-TW');
      const cards = modelIds.map(buildCompareCard);
      Dom.ffbClear($('compareResults')).append(...cards.map(card => card.el));
      setCompareStatus(`比較中：${modelIds.length} 個模型同時送出…`);

      try {
        const outcomes = await Promise.all(modelIds.map((modelId, index) =>
          compareOneModel(modelId, text, targetLanguage).then(outcome => {
            fillCompareCard(cards[index], outcome);
            return outcome;
          })
        ));
        const failed = outcomes.filter(outcome => outcome.error).length;
        setCompareStatus(failed
          ? `完成：${outcomes.length - failed} 個成功、${failed} 個失敗。`
          : `完成：${outcomes.length} 個模型都有結果。`);
        return outcomes;
      } finally {
        compareRunning = false;
        $('btnRunCompare').disabled = false;
      }
    }

    function initModelCompare() {
      if (!$('compareForm')) return undefined;
      $('compareForm').addEventListener('submit', event => {
        event.preventDefault();
        runModelCompare();
      });
      document.querySelector('.settings-tab[data-panel="compare"]')?.addEventListener('click', () => renderCompareModels());
      return renderCompareModels();
    }

    return {
      initModelCompare,
      renderCompareModels,
      runModelCompare
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.modelCompare = createModelCompare;
  if (typeof module !== 'undefined' && module.exports) module.exports = createModelCompare;
})(typeof globalThis !== 'undefined' ? globalThis : window);
