// options/action-editor.js — 自訂動作清單、各功能模型對照表、動作編輯器與範例預覽
(function registerOptionsActionEditor(global) {
  'use strict';

  const ACTION_LAYOUT_NOTES = {
    fields: '每個欄位一段，依序顯示欄位名與內容。',
    annotate: '第一個欄位要回傳陣列：[{ "text": 原文片段, "type": 類型, "note": 說明 }]，片段會標在原文上。',
    compare: '欄位代號用 before／after／notes；沒有 before 時以選取原文當修改前。'
  };

  // 內建動作的範本：prompt 是另外寫的簡化版，不是內建動作的原始 prompt
  const BUILTIN_ACTION_TEMPLATES = {
    translate: {
      name: '翻譯（自訂）', icon: 'globe', layout: 'fields',
      userPrompt: '請把下面的文字翻成{{targetLanguage}}，語氣自然。\n\n{{selection}}',
      fields: [{ key: 'translation', label: '譯文', description: '' }]
    },
    explain: {
      name: '解釋（自訂）', icon: 'bulb', layout: 'fields',
      userPrompt: '用{{targetLanguage}}解釋下面這段文字的意思與重點，必要時參考上下文。\n\n文字：{{selection}}\n\n上下文：{{context}}',
      fields: [
        { key: 'meaning', label: '意思', description: '' },
        { key: 'points', label: '重點', description: '條列' }
      ]
    },
    analyze: {
      name: '長難句分析（自訂）', icon: 'list', layout: 'annotate',
      systemPrompt: '說明一律使用{{targetLanguage}}。',
      userPrompt: '分析下面這段文字的句子結構：把主詞、動詞、受詞、子句、修飾語、連接詞標出來，片段要逐字取自原文，並附上整段譯文。\n\n{{selection}}',
      fields: [
        { key: 'marks', label: '句子成分', description: '陣列：text 取自原文，type 用 subject／predicate／object／clause／modifier／connector' },
        { key: 'translation', label: '譯文', description: '' }
      ]
    },
    optimize: {
      name: '優化（自訂）', icon: 'pen', layout: 'compare',
      userPrompt: '把下面的文字改得更通順自然，保留原意，並說明改了什麼。\n\n{{selection}}',
      fields: [
        { key: 'after', label: '修改後', description: '' },
        { key: 'notes', label: '說明', description: '' }
      ]
    }
  };

  function createActionEditor(ctx) {
    const { ModelRegistry, CustomActions, Dom, ActionRender } = ctx;
    const { $, ACTION_FEATURE_BADGES, setModelSelectValue } = ctx.shared;

    let actionListState = [];
    let actionEditorState = null; // { action, isNew }

    // 動作清單的每個動作一列；值寫在動作的 model 欄位，按「儲存設定」才寫回
    function renderFeatureActionModelRows() {
      const body = $('featureActionModelRows');
      if (!body) return;
      const unsaved = new Map(readUnsavedActionModels());
      Dom.ffbClear(body).append(...actionListState.map(action => {
        const id = `featureModel-${action.id}`;
        const savedModel = action.model || 'default';
        const select = Dom.ffbEl(
          'select',
          { id, dataset: { featureModel: '', actionId: action.id, savedModel } },
          ctx.core.buildFeatureModelOptions('default')
        );
        setModelSelectValue(select, unsaved.get(action.id) || savedModel);
        return Dom.ffbEl('tr', null, [
          Dom.ffbEl('th', { scope: 'row' }, Dom.ffbEl('label', { for: id }, action.builtin ? action.name : `自訂：${action.name}`)),
          Dom.ffbEl('td', null, select)
        ]);
      }));
      ctx.core.updateFeatureModelHints();
    }

    function readUnsavedActionModels() {
      return [...document.querySelectorAll('select[data-action-id]')]
        .filter(select => (select.value || 'default') !== select.dataset.savedModel)
        .map(select => [select.dataset.actionId, select.value || 'default']);
    }

    // 按「儲存設定」時把表上改過的動作模型寫回動作清單；沒有變動就不寫。
    async function saveFeatureActionModels() {
      const changed = new Map(readUnsavedActionModels());
      if (!changed.size) return;
      const latest = await CustomActions.loadActionList();
      actionListState = await CustomActions.saveActionList(latest.map(action => (
        changed.has(action.id) ? { ...action, model: changed.get(action.id) } : action
      )));
      renderActionList();
    }

    function initActionListSync() {
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[CustomActions.STORAGE_KEY]) return;
        const next = CustomActions.normalizeActionList(changes[CustomActions.STORAGE_KEY].newValue);
        if (JSON.stringify(next) === JSON.stringify(CustomActions.normalizeActionList(actionListState))) return;
        actionListState = next;
        renderActionList();
      });
    }

    function initActionEditor() {
      if (!$('actionList') || !$('actionEditor')) return undefined;
      renderActionIconPicker();
      renderActionVarButtons();
      renderActionModelSelect();

      $('btnNewAction').addEventListener('click', () => openActionEditor(createBlankCustomAction(), { isNew: true }));
      $('btnCopyAiGuide').addEventListener('click', copyActionAiGuide);
      $('btnAddActionField').addEventListener('click', () => {
        const fields = readActionFieldRows();
        if (fields.length >= CustomActions.MAX_FIELDS) {
          setActionEditorError(`輸出欄位最多 ${CustomActions.MAX_FIELDS} 個`);
          return;
        }
        renderActionFieldRows([...fields, { key: '', label: '', description: '' }]);
        $('actionFields').querySelector('.action-field-row:last-child input')?.focus();
        renderActionPreview();
      });
      $('actionEditor').addEventListener('submit', event => {
        event.preventDefault();
        saveActionFromEditor();
      });
      $('actionEditor').addEventListener('input', renderActionPreview);
      $('actionEditor').addEventListener('change', renderActionPreview);
      $('actionEditor').addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); closeActionEditor(); }
      });
      $('btnCancelAction').addEventListener('click', closeActionEditor);
      $('btnDeleteAction').addEventListener('click', deleteActionFromEditor);
      document.querySelectorAll('[data-preview-width]').forEach(button => {
        button.addEventListener('click', () => setActionPreviewWidth(Number(button.dataset.previewWidth)));
      });

      initActionListSync();
      return loadActionEditorList();
    }

    async function loadActionEditorList() {
      actionListState = await CustomActions.loadActionList();
      renderActionList();
      return actionListState;
    }

    function replaceActionListState(nextList) {
      actionListState = Array.isArray(nextList) ? nextList : [];
      renderActionList();
    }

    function setActionListStatus(message, isError = false) {
      const el = $('actionListStatus');
      if (!el) return;
      el.textContent = message;
      el.classList.toggle('is-error', isError);
    }

    function renderActionList() {
      const list = $('actionList');
      if (!list) return;
      const last = actionListState.length - 1;
      Dom.ffbClear(list).append(...actionListState.map((action, index) => {
        const moveButton = (delta, text) => Dom.ffbEl('button', {
          class: 'btn-test', type: 'button', 'aria-label': `${text}：${action.name}`,
          disabled: (delta < 0 && index === 0) || (delta > 0 && index === last)
        }, delta < 0 ? '↑' : '↓');
        const up = moveButton(-1, '上移');
        const down = moveButton(1, '下移');
        up.addEventListener('click', () => moveAction(action.id, -1));
        down.addEventListener('click', () => moveAction(action.id, 1));

        const enabled = Dom.ffbEl('input', { type: 'checkbox', 'aria-label': `啟用：${action.name}` });
        enabled.checked = action.enabled;
        enabled.addEventListener('change', () => setActionEnabled(action.id, enabled.checked));

        const buttons = action.builtin
          ? [Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'template' } }, '以此為範本')]
          : [
            Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'edit' } }, '編輯'),
            Dom.ffbEl('button', { class: 'btn-test', type: 'button', dataset: { act: 'duplicate' } }, '複製')
          ];
        buttons.forEach(button => button.addEventListener('click', () => {
          const act = button.dataset.act;
          if (act === 'edit') openActionEditor(action, { isNew: false });
          else if (act === 'duplicate') openActionEditor(duplicateCustomAction(action), { isNew: true });
          else openActionEditor(createActionFromBuiltin(action.id), { isNew: true });
        }));

        const badgeKind = action.builtin ? ACTION_FEATURE_BADGES[action.id] : null;
        const badgeId = badgeKind ? `action-${action.id}` : null;
        return Dom.ffbEl('li', {
          class: `action-row${action.enabled ? '' : ' is-disabled'}`,
          dataset: { id: action.id, featureItem: badgeId }
        }, [
          enabled,
          Dom.ffbEl('span', { class: 'action-row-name' }, [
            ActionRender.buildCustomActionIcon(action.builtin ? builtinIconName(action.id) : action.icon, 16),
            Dom.ffbEl('span', null, action.name),
            action.builtin && Dom.ffbEl('span', {
              class: 'action-badge is-locked',
              title: '內建動作只能停用或調整順序；要改內容請按「以此為範本」'
            }, '內建'),
            badgeKind && ctx.navigation.buildFeatureBadge(badgeId, badgeKind)
          ]),
          up, down, ...buttons
        ]);
      }));
      renderFeatureActionModelRows();
      ctx.navigation.applyFeatureBadges();
    }

    function builtinIconName(id) {
      return { translate: 'globe', explain: 'bulb', optimize: 'pen', analyze: 'list' }[id] || ActionRender.getDefaultCustomActionIcon();
    }

    async function persistActionList(list, message) {
      try {
        actionListState = await CustomActions.saveActionList(list);
        renderActionList();
        setActionListStatus(message);
        return true;
      } catch (error) {
        setActionListStatus(`儲存失敗：${error.message}`, true);
        renderActionList();
        return false;
      }
    }

    function reorderActions(list) {
      return list.map((action, index) => ({ ...action, order: index }));
    }

    async function moveAction(id, delta) {
      const index = actionListState.findIndex(action => action.id === id);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= actionListState.length) return false;
      const list = actionListState.slice();
      [list[index], list[target]] = [list[target], list[index]];
      const moved = await persistActionList(reorderActions(list), '✓ 已調整順序');
      if (moved) {
        const row = [...$('actionList').querySelectorAll('.action-row')].find(item => item.dataset.id === id);
        const buttons = row ? [...row.querySelectorAll('button')].slice(0, 2) : [];
        const preferred = buttons[delta < 0 ? 0 : 1];
        (preferred && !preferred.disabled ? preferred : buttons[delta < 0 ? 1 : 0])?.focus();
      }
      return moved;
    }

    function setActionEnabled(id, enabled) {
      const list = actionListState.map(action => (action.id === id ? { ...action, enabled } : action));
      return persistActionList(list, enabled ? '✓ 已啟用' : '✓ 已停用');
    }

    function generateCustomActionId() {
      const random = Math.random().toString(36).slice(2, 8);
      return `custom-${Date.now().toString(36)}-${random}`;
    }

    function nextActionOrder() {
      return Math.min(999, actionListState.reduce((max, action) => Math.max(max, action.order), -1) + 1);
    }

    function createBlankCustomAction() {
      return {
        id: generateCustomActionId(), name: '新動作', icon: ActionRender.getDefaultCustomActionIcon(),
        builtin: false, enabled: true, pinned: false, order: nextActionOrder(), model: 'default',
        systemPrompt: '', userPrompt: '{{selection}}',
        fields: [{ key: 'result', label: '結果', description: '' }],
        layout: 'fields', saveTo: 'none'
      };
    }

    function createActionFromBuiltin(builtinId) {
      const template = BUILTIN_ACTION_TEMPLATES[builtinId];
      return {
        ...createBlankCustomAction(),
        ...template,
        fields: template.fields.map(field => ({ ...field }))
      };
    }

    function duplicateCustomAction(action) {
      return {
        ...action,
        id: generateCustomActionId(),
        name: `${action.name}（副本）`.slice(0, 40),
        pinned: false,
        order: nextActionOrder(),
        fields: action.fields.map(field => ({ ...field }))
      };
    }

    function renderActionIconPicker() {
      const picker = $('actionIconPicker');
      const legend = picker.querySelector('legend');
      Dom.ffbClear(picker).append(legend, ...ActionRender.listCustomActionIcons().map(({ name, label }) => {
        const input = Dom.ffbEl('input', { type: 'radio', name: 'actionIcon', value: name });
        return Dom.ffbEl('label', { class: 'action-icon-option' }, [input, ActionRender.buildCustomActionIcon(name, 16), label]);
      }));
    }

    function getEditorActionVariables() {
      return CustomActions.VARIABLES.filter(name => name !== 'pageUrl');
    }

    function renderActionVarButtons() {
      Dom.ffbClear($('actionVarButtons')).append(...getEditorActionVariables().map(name => {
        const button = Dom.ffbEl('button', { class: 'btn-test', type: 'button', 'aria-label': `插入變數 ${name}` }, `{{${name}}}`);
        button.addEventListener('click', () => insertActionVariable(name));
        return button;
      }));
    }

    function renderActionModelSelect() {
      const models = ModelRegistry.MODELS.filter(model => !model.pageTranslationOnly);
      Dom.ffbClear($('actionModel')).append(
        Dom.ffbEl('option', { value: 'default' }, '跟隨主模型'),
        ...models.map(model => Dom.ffbEl('option', { value: model.id }, model.name || model.id))
      );
    }

    function insertActionVariable(name) {
      const textarea = $('actionUserPrompt');
      const token = `{{${name}}}`;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
      renderActionPreview();
    }

    function renderActionFieldRows(fields) {
      Dom.ffbClear($('actionFields')).append(...fields.map((field, index) => {
        const input = (className, value, label, maxlength, placeholder) => {
          const el = Dom.ffbEl('input', {
            type: 'text', class: className, 'aria-label': `第 ${index + 1} 個欄位的${label}`,
            maxlength, placeholder, autocomplete: 'off', spellcheck: 'false'
          });
          el.value = value || '';
          return el;
        };
        const remove = Dom.ffbEl('button', { class: 'btn-test', type: 'button', 'aria-label': `刪除第 ${index + 1} 個欄位` }, '刪除');
        remove.addEventListener('click', () => {
          const rows = readActionFieldRows();
          rows.splice(index, 1);
          renderActionFieldRows(rows);
          renderActionPreview();
        });
        return Dom.ffbEl('div', { class: 'action-field-row' }, [
          input('action-field-key', field.key, '代號', 32, '代號，如 summary'),
          input('action-field-label', field.label, '名稱', 40, '名稱'),
          input('action-field-description', field.description, '說明', 200, '說明（選填，會寫進 prompt）'),
          remove
        ]);
      }));
    }

    function readActionFieldRows() {
      return [...$('actionFields').querySelectorAll('.action-field-row')].map(row => ({
        key: row.querySelector('.action-field-key').value.trim(),
        label: row.querySelector('.action-field-label').value.trim(),
        description: row.querySelector('.action-field-description').value.trim()
      }));
    }

    function openActionEditor(action, { isNew }) {
      actionEditorState = { action, isNew };
      $('actionEditorTitle').textContent = isNew ? '新增自訂動作' : `編輯：${action.name}`;
      $('actionName').value = action.name;
      $('actionModel').value = action.model || 'default';
      const icons = [...$('actionIconPicker').querySelectorAll('input[name="actionIcon"]')];
      (icons.find(input => input.value === action.icon)
        || icons.find(input => input.value === ActionRender.getDefaultCustomActionIcon())).checked = true;
      $('actionSystemPrompt').value = action.systemPrompt || '';
      $('actionUserPrompt').value = action.userPrompt || '';
      $('actionLayout').value = action.layout || 'fields';
      $('actionSaveTo').value = action.saveTo || 'none';
      $('btnDeleteAction').hidden = isNew;
      renderActionFieldRows(action.fields || []);
      setActionEditorError('');
      $('actionEditor').hidden = false;
      renderActionPreview();
      $('actionName').focus();
    }

    function closeActionEditor() {
      actionEditorState = null;
      $('actionEditor').hidden = true;
      setActionEditorError('');
      $('btnNewAction')?.focus();
    }

    function setActionEditorError(message) {
      const el = $('actionEditorError');
      if (el) el.textContent = message;
    }

    function readActionEditorDraft() {
      const opened = actionEditorState?.action;
      const base = (opened && actionListState.find(item => item.id === opened.id)) || opened || createBlankCustomAction();
      return {
        ...base,
        name: $('actionName').value.trim(),
        icon: $('actionIconPicker').querySelector('input[name="actionIcon"]:checked')?.value || ActionRender.getDefaultCustomActionIcon(),
        model: $('actionModel').value || 'default',
        systemPrompt: $('actionSystemPrompt').value,
        userPrompt: $('actionUserPrompt').value,
        fields: readActionFieldRows(),
        layout: $('actionLayout').value,
        saveTo: $('actionSaveTo').value
      };
    }

    async function saveActionFromEditor() {
      if (!actionEditorState) return false;
      let action;
      try {
        action = CustomActions.validateCustomAction(readActionEditorDraft());
      } catch (error) {
        setActionEditorError(error.message);
        return false;
      }
      const exists = actionListState.some(item => item.id === action.id);
      if (!exists && !actionEditorState.isNew) {
        if (!window.confirm(`「${action.name}」已在其他分頁刪除。要另存成新動作嗎？按「取消」會放棄這次的編輯。`)) {
          closeActionEditor();
          return false;
        }
        action = { ...action, id: generateCustomActionId(), order: nextActionOrder() };
      }
      const list = exists
        ? actionListState.map(item => (item.id === action.id ? action : item))
        : [...actionListState, action];
      const saved = await persistActionList(list, `✓ 已儲存「${action.name}」`);
      if (!saved) {
        setActionEditorError($('actionListStatus').textContent);
        return false;
      }
      closeActionEditor();
      return true;
    }

    async function deleteActionFromEditor() {
      if (!actionEditorState || actionEditorState.isNew) return false;
      const { action } = actionEditorState;
      if (!window.confirm(`確定刪除「${action.name}」？刪除後無法復原。`)) return false;
      const saved = await persistActionList(
        reorderActions(actionListState.filter(item => item.id !== action.id)),
        `✓ 已刪除「${action.name}」`
      );
      if (saved) closeActionEditor();
      return saved;
    }

    function renderActionPreview() {
      const preview = $('actionPreview');
      if (!preview || !actionEditorState) return;
      const draft = readActionEditorDraft();
      $('actionLayoutNote').textContent = ACTION_LAYOUT_NOTES[draft.layout] || '';
      const fields = draft.fields.filter(field => field.key && field.label);
      if (!fields.length) {
        Dom.ffbClear(preview).append(Dom.ffbEl('p', { class: 'field-note' }, '至少填一個欄位的代號與名稱，這裡會顯示預覽。'));
        return;
      }
      const action = { ...draft, fields };
      const sample = ActionRender.buildCustomActionSample(action);
      Dom.ffbClear(preview).append(
        Dom.ffbEl('div', { class: 'action-preview-tag' }, [ActionRender.buildCustomActionIcon(draft.icon, 13), ` ${draft.name || '未命名動作'}`]),
        ActionRender.buildCustomActionContent(action, sample.data, { selectedText: sample.selectedText })
      );
    }

    function setActionPreviewWidth(width) {
      const value = width === 500 ? 500 : 320;
      $('actionPreview').style.width = `${value}px`;
      document.querySelectorAll('[data-preview-width]').forEach(button => {
        button.setAttribute('aria-pressed', Number(button.dataset.previewWidth) === value ? 'true' : 'false');
      });
    }

    function buildActionAiGuideText() {
      return [
        '請幫我設計一個「翻翻吧」瀏覽器擴充功能的自訂動作。使用方式：在網頁上選取文字後執行這個動作，模型會回傳 JSON，擴充功能再依版面顯示。',
        '',
        '請依下面格式回覆，讓我逐欄貼進設定頁：',
        '- 名稱：最多 40 字',
        '- 系統提示（選填）：最多 4000 字，只能用變數 {{targetLanguage}}',
        `- 使用者提示：最多 4000 字，可用變數 ${getEditorActionVariables().map(name => `{{${name}}}`).join('、')}`,
        '  （{{selection}} 是選取文字、{{context}} 是鄰近段落、{{pageTitle}} 是頁面標題、{{targetLanguage}} 是目標語言）',
        `- 輸出欄位：最多 ${CustomActions.MAX_FIELDS} 個，每個有「代號」（英文字母開頭，只能用英數與底線）、「名稱」、「說明」`,
        '- 版面三選一：',
        '  - 欄位卡：每個欄位一段',
        '  - 原文標註：第一個欄位回傳 [{ "text": 原文片段, "type": 類型, "note": 說明 }]，片段必須和原文一字不差',
        '  - 前後對照：欄位代號用 before／after／notes',
        '',
        '不需要在 prompt 裡要求輸出 JSON，擴充功能會自動加上格式要求。中文請用台灣慣用語。',
        '',
        '我想做的動作：'
      ].join('\n');
    }

    async function copyActionAiGuide() {
      try {
        await navigator.clipboard.writeText(buildActionAiGuideText());
        setActionListStatus('✓ 說明文字已複製，貼到任何 AI 並補上你想做的動作');
      } catch {
        setActionListStatus('複製失敗，請確認瀏覽器允許剪貼簿', true);
      }
    }

    return {
      renderFeatureActionModelRows,
      saveFeatureActionModels,
      initActionEditor,
      loadActionEditorList,
      replaceActionListState,
      moveAction,
      setActionEnabled,
      openActionEditor,
      saveActionFromEditor,
      deleteActionFromEditor,
      createBlankCustomAction,
      createActionFromBuiltin,
      duplicateCustomAction,
      insertActionVariable,
      buildActionAiGuideText,
      copyActionAiGuide,
      setActionPreviewWidth
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.actionEditor = createActionEditor;
  if (typeof module !== 'undefined' && module.exports) module.exports = createActionEditor;
})(typeof globalThis !== 'undefined' ? globalThis : window);
