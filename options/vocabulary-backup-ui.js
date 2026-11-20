// options/vocabulary-backup-ui.js — 單字本 JSON／CSV 匯出、匯入與本機自動快照還原
(function registerOptionsVocabularyBackup(global) {
  'use strict';

  const MAX_VOCAB_IMPORT_BYTES = 10 * 1024 * 1024; // 10MB，避免超大檔塞爆 storage

  function createVocabularyBackupUi(ctx) {
    const { VocabBackup } = ctx;
    const {
      $,
      LAST_VOCAB_BACKUP_KEY,
      VOCAB_BACKUP_STALE_DAYS,
      downloadBlobFile,
      requestVocabularyStore
    } = ctx.shared;

    function initVocabularyBackup() {
      $('btnExportVocabulary')?.addEventListener('click', exportVocabularyBackup);
      $('btnExportVocabularyCsv')?.addEventListener('click', exportVocabularyCsv);
      const fileInput = $('vocabularyImportFile');
      $('btnImportVocabulary')?.addEventListener('click', () => fileInput?.click());
      fileInput?.addEventListener('change', importVocabularyBackup);
      renderVocabularyBackupStaleness();
      renderVocabularySnapshots();
    }

    // ── 本機自動快照還原（red-team F3）─────────────────────
    // 快照本身在 vocabulary-store.js 自動輪替；這裡只給讀取與還原入口。
    // **一律走 mergeBackup 合併、絕不 replace**：快照是過去狀態，replace 會把快照
    // 之後新增的單字砍掉。合併方向由 mergeEntry 的時鐘決定，所以現有較新的複習進度
    // 不會被快照回滾（見 vocabulary-backup.js mergeClock）。
    function formatSnapshotLabel({ slot, savedAt, count }) {
      const when = Date.parse(savedAt || '') ? new Date(savedAt).toLocaleString() : '時間未知';
      const which = slot === 'prev' ? '較舊' : '最近';
      return `還原${which}快照（${when}，${count} 個單字）`;
    }

    async function renderVocabularySnapshots() {
      const container = $('vocabularySnapshotActions');
      const note = $('vocabularySnapshotNote');
      if (!container) return;
      let snapshots = [];
      try {
        const response = await requestVocabularyStore('snapshots');
        snapshots = Array.isArray(response.snapshots) ? response.snapshots : [];
      } catch {
        snapshots = []; // 讀不到就當沒有快照可還原，不吵使用者
      }
      container.textContent = '';
      snapshots.forEach(snapshot => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-test';
        button.textContent = formatSnapshotLabel(snapshot);
        button.addEventListener('click', () => restoreVocabularySnapshot(snapshot.slot));
        container.appendChild(button);
      });
      container.hidden = snapshots.length === 0;
      if (note) note.hidden = snapshots.length === 0;
    }

    async function restoreVocabularySnapshot(slot) {
      try {
        const { snapshot } = await requestVocabularyStore('snapshot', { slot });
        const incoming = VocabBackup.normalizeItemsMap(snapshot?.items || {});
        if (!Object.keys(incoming).length) {
          setVocabularyBackupStatus('這份快照沒有可還原的單字。');
          await renderVocabularySnapshots();
          return;
        }
        // 與匯入同一條路：existing 讀取失敗必須中止（空集會讓 mergeBackup 退化成 replace）
        const existing = await getVocabularyItemsMap();
        const { items, summary } = VocabBackup.mergeBackup(existing, incoming, 'merge');
        // 還原不備份前態：不然這一下就把好快照擠到 prev、壞狀態寫進 current（red-team F4）
        await replaceVocabularyItemsMap(items, { snapshot: false });
        setVocabularyBackupStatus(`已從快照還原：補回 ${summary.added}、更新 ${summary.updated}，目前共 ${summary.total} 個單字。`);
        await renderVocabularySnapshots();
      } catch (error) {
        setVocabularyBackupStatus(`還原失敗：${error?.message || '請再試一次'}`);
      }
    }

    async function renderVocabularyBackupStaleness() {
      const el = $('vocabularyBackupReminder');
      if (!el) return;
      const { [LAST_VOCAB_BACKUP_KEY]: last } = await chrome.storage.local.get(LAST_VOCAB_BACKUP_KEY);
      el.textContent = formatVocabularyBackupReminder(last);
    }

    function formatVocabularyBackupReminder(lastIso) {
      const last = Date.parse(lastIso || '');
      if (!last) return '尚未匯出過單字本備份，建議定期匯出 JSON 以免資料遺失。';
      const days = Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
      const when = days <= 0 ? '今天' : `${days} 天前`;
      const tail = days >= VOCAB_BACKUP_STALE_DAYS ? '（已超過 30 天，建議重新匯出）' : '';
      return `上次備份：${when}${tail}`;
    }

    function setVocabularyBackupStatus(text) {
      const el = $('vocabularyBackupStatus');
      if (el) el.textContent = text;
    }

    async function exportVocabularyBackup() {
      try {
        const items = await getVocabularyItemsMap();
        const backup = VocabBackup.buildBackup(items);
        if (!backup.count) { setVocabularyBackupStatus('單字本是空的，沒有可匯出的單字。'); return; }
        downloadBlobFile(
          JSON.stringify(backup, null, 2),
          'application/json',
          `fan-fan-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.json`
        );
        // 只在 JSON 匯出（完整可還原）成功後蓋章；CSV 是 lossy 不算備份
        await chrome.storage.local.set({ [LAST_VOCAB_BACKUP_KEY]: new Date().toISOString() });
        renderVocabularyBackupStaleness();
        setVocabularyBackupStatus(`已匯出 ${backup.count} 個單字。`);
      } catch {
        setVocabularyBackupStatus('匯出失敗，請再試一次。');
      }
    }

    // 檢視用的單向匯出（2026-09-13 由 XLSX 換成 CSV）。刻意不在這裡蓋
    // 「已備份」的章——那只屬於 JSON 匯出，CSV 是 lossy 的，不能還原。
    async function exportVocabularyCsv() {
      try {
        const items = await getVocabularyItemsMap();
        const normalized = VocabBackup.normalizeItemsMap(items);
        const count = Object.keys(normalized).length;
        if (!count) { setVocabularyBackupStatus('單字本是空的，沒有可匯出的單字。'); return; }
        const csv = VocabBackup.buildVocabularyCsv(normalized);
        downloadBlobFile(
          csv,
          VocabBackup.CSV_MIME_TYPE,
          `fan-fan-ba-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`
        );
        setVocabularyBackupStatus(`已匯出 ${count} 個單字成 CSV。`);
      } catch {
        setVocabularyBackupStatus('CSV 匯出失敗，請再試一次。');
      }
    }

    async function importVocabularyBackup(event) {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_VOCAB_IMPORT_BYTES) {
        setVocabularyBackupStatus('檔案太大（上限 10MB），請確認是翻翻吧的單字本備份。');
        return;
      }
      try {
        const text = await file.text();
        const incoming = VocabBackup.parseBackup(text);
        const existing = await getVocabularyItemsMap();
        const { items, summary } = VocabBackup.mergeBackup(existing, incoming, 'merge');
        await replaceVocabularyItemsMap(items);
        setVocabularyBackupStatus(`匯入完成：新增 ${summary.added}、更新 ${summary.updated}，目前共 ${summary.total} 個單字。`);
      } catch (error) {
        setVocabularyBackupStatus(`匯入失敗：${error?.message || '檔案格式不正確'}`);
      }
    }

    // A1'''：不再 fallback 直讀/直寫 storage——匯入流程的 existing 讀取失敗必須
    // 讓匯入整個中止（若降級成空集，mergeBackup 會退化成 replace、舊備份蓋掉活資料）。
    // 失敗往上拋，由 importVocabularyBackup 的 catch 浮出錯誤。
    async function getVocabularyItemsMap() {
      const response = await requestVocabularyStore('list');
      // 非陣列一律視為讀取失敗並中止（絕不降級成空集）
      if (!Array.isArray(response.items)) throw new Error('單字本資料讀取失敗');
      return response.items.reduce((acc, item) => {
        if (item?.id) acc[item.id] = item;
        return acc;
      }, {});
    }

    // snapshot=false 只給還原用（red-team F4）
    async function replaceVocabularyItemsMap(items, { snapshot = true } = {}) {
      await requestVocabularyStore('replaceAll', { items, snapshot });
    }

    return {
      initVocabularyBackup,
      formatSnapshotLabel,
      renderVocabularySnapshots,
      restoreVocabularySnapshot,
      formatVocabularyBackupReminder,
      getVocabularyItemsMap,
      importVocabularyBackup
    };
  }

  global.FanFanBaOptionsModules = global.FanFanBaOptionsModules || {};
  global.FanFanBaOptionsModules.vocabularyBackup = createVocabularyBackupUi;
  if (typeof module !== 'undefined' && module.exports) module.exports = createVocabularyBackupUi;
})(typeof globalThis !== 'undefined' ? globalThis : window);
