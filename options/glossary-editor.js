// options/glossary-editor.js — 術語表表格編輯器、多分頁同步、衝突防護與 CSV 匯入匯出
(function registerOptionsGlossaryEditor(global) {
  'use strict';

  const GLOSSARY_CSV_MAX_BYTES = 1024 * 1024;

  function createGlossaryEditor(ctx) {
    const { Glossary, VocabBackup, Dom } = ctx;
    const { $, downloadBlobFile, readTextFile } = ctx.shared;

    let glossaryEditorLoaded = false;
    let glossaryEditorBaseline = '';
    let glossaryLoadFailed = false; // 讀取失敗時儲存設定不寫術語表，儲存訊息也要講明
    let glossaryEditorDirty = false; // 使用者動過編輯器：別處更新術語表時不換掉手上的內容
    let glossaryPendingWrite = null; // 這頁正在寫入的內容：storage 變更事件回來時認得是自己寫的

    function setGlossaryStatus(message) {
      if ($('glossaryStatus')) $('glossaryStatus').textContent = message;
    }

    function buildGlossaryRow(term = {}) {
      const input = (field, label, maxlength) => {
        const el = Dom.ffbEl('input', { type: 'text', class: `glossary-${field}`, maxlength, 'aria-label': label, autocomplete: 'off', spellcheck: 'false' });
        el.value = term[field] || '';
        return el;
      };
      const remove = Dom.ffbEl('button', { class: 'btn-test', type: 'button', 'aria-label': '刪除這一列' }, '刪除');
      const row = Dom.ffbEl('tr', { class: 'glossary-row' }, [
        Dom.ffbEl('td', null, input('source', '原文', Glossary.MAX_SOURCE_CHARS)),
        Dom.ffbEl('td', null, input('target', '譯文', Glossary.MAX_TARGET_CHARS)),
        Dom.ffbEl('td', null, input('note', '備註', Glossary.MAX_NOTE_CHARS)),
        Dom.ffbEl('td', null, remove)
      ]);
      row.addEventListener('input', () => row.classList.remove('is-invalid'));
      remove.addEventListener('click', () => {
        const rows = $('glossaryRows');
        const next = row.nextElementSibling || row.previousElementSibling;
        row.remove();
        if (!rows.children.length) rows.append(buildGlossaryRow());
        (next || rows.firstElementChild).querySelector('input').focus();
      });
      return row;
    }

    function readGlossaryRow(row) {
      const value = field => row.querySelector(`.glossary-${field}`).value.trim();
      return { source: value('source'), target: value('target'), note: value('note') };
    }

    function isBlankGlossaryRow(row) {
      const { source, target, note } = readGlossaryRow(row);
      return !source && !target && !note;
    }

    function renderGlossaryEditor(glossary) {
      const rows = $('glossaryRows');
      if (!rows) return;
      const terms = glossary.terms.length ? glossary.terms : [{}];
      Dom.ffbClear(rows).append(...terms.map(term => buildGlossaryRow(term)));
      $('glossarySites').value = glossary.sites.join('\n');
    }

    // 讀回編輯器內容；有錯就列在 errors，呼叫端不存檔
    function readGlossaryEditor() {
      const errors = [];
      const terms = [];
      const seen = new Set();
      [...$('glossaryRows').querySelectorAll('.glossary-row')].forEach((row, index) => {
        row.classList.remove('is-invalid');
        if (isBlankGlossaryRow(row)) return;
        const term = readGlossaryRow(row);
        if (!term.source || !term.target) {
          errors.push(`第 ${index + 1} 列缺${term.source ? '譯文' : '原文'}`);
          row.classList.add('is-invalid');
          return;
        }
        const key = term.source.toLowerCase();
        if (seen.has(key)) {
          errors.push(`原文重複：${term.source}`);
          row.classList.add('is-invalid');
          return;
        }
        seen.add(key);
        terms.push(term);
      });
      if (terms.length > Glossary.MAX_TERMS) errors.push(`術語最多 ${Glossary.MAX_TERMS} 筆，目前 ${terms.length} 筆`);

      const sites = $('glossarySites').value.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const badSites = sites.filter(site => !Glossary.normalizeSite(site));
      if (badSites.length) errors.push(`看不懂的網站：${badSites.slice(0, 3).join('、')}`);
      if (sites.length > Glossary.MAX_SITES) errors.push(`網站最多 ${Glossary.MAX_SITES} 個`);

      return { errors, glossary: Glossary.normalizeGlossary({ terms, sites }) };
    }

    async function loadStoredGlossary() {
      const { [Glossary.STORAGE_KEY]: stored } = await chrome.storage.local.get({ [Glossary.STORAGE_KEY]: null });
      return Glossary.normalizeGlossary(stored);
    }

    function markGlossaryEditorSynced(glossary) {
      glossaryEditorBaseline = JSON.stringify(Glossary.normalizeGlossary(glossary));
      glossaryEditorLoaded = true;
      glossaryLoadFailed = false;
      glossaryEditorDirty = false;
      ctx.navigation.clearSettingsDirty(['glossary']);
    }

    function isGlossaryDraftChanged(glossary) {
      return JSON.stringify(Glossary.normalizeGlossary(glossary)) !== glossaryEditorBaseline;
    }

    async function writeGlossary(glossary) {
      glossaryPendingWrite = JSON.stringify(Glossary.normalizeGlossary(glossary));
      try {
        await chrome.storage.local.set({ [Glossary.STORAGE_KEY]: glossary });
        markGlossaryEditorSynced(glossary);
      } finally {
        glossaryPendingWrite = null;
      }
    }

    function initGlossarySync() {
      chrome.storage.onChanged?.addListener((changes, area) => {
        if (area !== 'local' || !changes[Glossary.STORAGE_KEY] || !glossaryEditorLoaded) return;
        const next = Glossary.normalizeGlossary(changes[Glossary.STORAGE_KEY].newValue);
        const nextJson = JSON.stringify(next);
        if (nextJson === glossaryEditorBaseline || nextJson === glossaryPendingWrite) return;
        if (glossaryEditorDirty) {
          setGlossaryStatus('術語表已在其他分頁更新；這頁改過的內容還在，但儲存時不會覆蓋，請先複製需要的內容再重新整理頁面。');
          return;
        }
        renderGlossaryEditor(next);
        markGlossaryEditorSynced(next);
        setGlossaryStatus('術語表已在其他分頁更新，這裡已換上最新內容。');
      });
    }

    async function loadGlossaryEditor() {
      let glossary = Glossary.normalizeGlossary(null);
      try {
        glossary = await loadStoredGlossary();
      } catch (error) {
        console.warn('[翻翻吧] 術語表讀取失敗', error);
        renderGlossaryEditor(glossary);
        glossaryEditorLoaded = false;
        glossaryLoadFailed = true;
        setGlossaryStatus('術語表讀取失敗，儲存設定時不會動到術語表；請重新整理頁面再試。');
        return glossary;
      }
      renderGlossaryEditor(glossary);
      markGlossaryEditorSynced(glossary);
      return glossary;
    }

    async function saveImportedGlossary(raw) {
      const glossary = Glossary.normalizeGlossary(raw);
      await writeGlossary(glossary);
      renderGlossaryEditor(glossary);
      return glossary;
    }

    async function importGlossaryCsvFile(file) {
      if (file?.size > GLOSSARY_CSV_MAX_BYTES) {
        setGlossaryStatus('檔案太大（上限 1MB），請確認是術語表 CSV。');
        return null;
      }
      const { terms, skipped } = Glossary.parseGlossaryCsv(await readTextFile(file));
      const rows = $('glossaryRows');
      [...rows.children].forEach(row => { if (isBlankGlossaryRow(row)) row.remove(); });
      const existing = new Set([...rows.children].map(row => readGlossaryRow(row).source.toLowerCase()));
      let added = 0;
      let duplicated = 0;
      for (const term of terms) {
        const key = term.source.toLowerCase();
        if (existing.has(key)) { duplicated++; continue; }
        existing.add(key);
        rows.append(buildGlossaryRow(term));
        added++;
      }
      if (!rows.children.length) rows.append(buildGlossaryRow());
      if (added) {
        glossaryEditorDirty = true;
        ctx.navigation.markSettingsDirty('glossary');
      }
      const parts = [`已加入 ${added} 筆`];
      if (duplicated) parts.push(`${duplicated} 筆原文重複略過`);
      if (skipped) parts.push(`${skipped} 列缺原文或譯文略過`);
      setGlossaryStatus(`${parts.join('，')}；按「儲存設定」才會生效。`);
      return { added, duplicated, skipped };
    }

    function exportGlossaryCsv() {
      const { terms } = readGlossaryEditor().glossary;
      if (!terms.length) {
        setGlossaryStatus('術語表是空的，沒有可匯出的內容。');
        return null;
      }
      const csv = Glossary.buildGlossaryCsv(terms, VocabBackup.escapeCsvCell);
      downloadBlobFile(csv, VocabBackup.CSV_MIME_TYPE, `fan-fan-ba-glossary-${new Date().toISOString().slice(0, 10)}.csv`);
      setGlossaryStatus(`已匯出 ${terms.length} 筆術語成 CSV。`);
      return csv;
    }

    function initGlossaryEditor() {
      if (!$('glossaryRows')) return undefined;
      $('glossaryRows').addEventListener('input', () => { glossaryEditorDirty = true; });
      $('glossaryRows').addEventListener('click', event => { if (event.target.closest('button')) glossaryEditorDirty = true; });
      $('glossarySites').addEventListener('input', () => { glossaryEditorDirty = true; });
      initGlossarySync();
      $('btnAddGlossaryTerm').addEventListener('click', () => {
        const row = buildGlossaryRow();
        $('glossaryRows').append(row);
        row.querySelector('input').focus();
      });
      $('btnImportGlossary').addEventListener('click', () => $('glossaryCsvFile').click());
      $('glossaryCsvFile').addEventListener('change', async event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          await importGlossaryCsvFile(file);
        } catch {
          setGlossaryStatus('CSV 讀取失敗，請確認檔案格式。');
        }
      });
      $('btnExportGlossary').addEventListener('click', () => {
        try {
          exportGlossaryCsv();
        } catch {
          setGlossaryStatus('CSV 匯出失敗，請再試一次。');
        }
      });
      return loadGlossaryEditor();
    }

    function getGlossaryState() {
      return {
        loaded: glossaryEditorLoaded,
        loadFailed: glossaryLoadFailed,
        baseline: glossaryEditorBaseline
      };
    }

    return {
      initGlossaryEditor,
      loadGlossaryEditor,
      readGlossaryEditor,
      loadStoredGlossary,
      writeGlossary,
      saveImportedGlossary,
      isGlossaryDraftChanged,
      importGlossaryCsvFile,
      exportGlossaryCsv,
      getGlossaryState
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.glossaryEditor = createGlossaryEditor;
  if (typeof module !== 'undefined' && module.exports) module.exports = createGlossaryEditor;
})(typeof globalThis !== 'undefined' ? globalThis : window);
