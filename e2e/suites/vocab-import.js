// 單字本匯入／快照（原 MANUAL-QA Tier 2 後半 7 項）
// 重點是資料遺失類：跨裝置合併勝負、零收穫匯入不得吃掉救援快照。
const path = require('path');
const H = require('../lib/harness');

const FX = path.join(__dirname, '..', 'fixtures');
const fx = name => path.join(FX, name);

module.exports = {
  name: 'vocab-import',
  description: '跨裝置匯入 3 案 ＋ 零收穫匯入 4 案',

  async run(s, rec) {
    const { opt } = s;
    await H.openBackupTab(opt);

    // ── A1：A 機已熟 → 匯進「遇很多次但還在 learning」的 B 機 ──
    try {
      await H.seed(opt, { 'en:merge': {
        id: 'en:merge', word: 'merge', definition: 'B 機：遇很多次但還在 learning',
        count: 250, status: 'learning',
        createdAt: '2026-05-01T00:00:00.000Z', lastSeenAt: '2026-06-05T00:00:00.000Z',
        reviewedAt: '2026-06-05T00:00:00.000Z', nextReviewAt: '2026-06-06T00:00:00.000Z' } });
      const st = await H.importVocabFile(opt, fx('03-machineA-newer.json'));
      const it = (await H.send(opt, 'get', { id: 'en:merge' })).item;
      rec.pass('A1 較新的複習進度勝出',
        st === '匯入完成：新增 0、更新 1，目前共 1 個單字。'
        && it.status === 'known' && Number(it.count) === 250
        && it.reviewedAt.startsWith('2026-08-09') && it.nextReviewAt.startsWith('2026-08-16')
        && it.createdAt.startsWith('2026-05-01') && it.lastSeenAt.startsWith('2026-06-05'),
        `「${st}」／status=${it.status} count=${it.count}（取較大）createdAt=${it.createdAt}（較早）lastSeenAt=${it.lastSeenAt}（較新）`);
    } catch (e) { rec.fail('A1 較新的複習進度勝出', 'EXCEPTION ' + e.message); }

    // ── A2：較舊備份匯進已複習過的機器 → 進度不回滾、次數取較大 ──
    try {
      await H.seed(opt, { 'en:merge': {
        id: 'en:merge', word: 'merge', definition: '本機：已複習到熟，count 只有 1',
        count: 1, status: 'known',
        createdAt: '2026-06-01T00:00:00.000Z', lastSeenAt: '2026-06-01T00:00:00.000Z',
        reviewedAt: '2026-08-09T00:00:00.000Z', nextReviewAt: '2026-08-16T00:00:00.000Z' } });
      const st = await H.importVocabFile(opt, fx('04-older-backup.json'));
      const it = (await H.send(opt, 'get', { id: 'en:merge' })).item;
      rec.pass('A2 舊備份不回滾進度、次數取較大',
        st === '匯入完成：新增 0、更新 1，目前共 1 個單字。'
        && it.status === 'known' && Number(it.count) === 250 && it.reviewedAt.startsWith('2026-08-09'),
        `「${st}」／status=${it.status}（未回滾）count=1→${it.count} reviewedAt=${it.reviewedAt}`);
    } catch (e) { rec.fail('A2 舊備份不回滾進度、次數取較大', 'EXCEPTION ' + e.message); }

    // ── A3：匯入後排序 ──
    try {
      await H.seed(opt, {
        'en:merge': { id: 'en:merge', word: 'merge', count: 1, status: 'known',
          createdAt: '2026-06-01T00:00:00.000Z', lastSeenAt: '2026-06-05T00:00:00.000Z' },
        'en:oldest': { id: 'en:oldest', word: 'oldest', count: 1, status: 'learning',
          createdAt: '2026-01-01T00:00:00.000Z', lastSeenAt: '2026-01-01T00:00:00.000Z' } });
      const st = await H.importVocabFile(opt, fx('05-normal.json'));
      const order = await H.listWords(opt);
      const web = await s.newPage('/plain');
      await H.openVocabPanel(web);
      // 面板預設分頁是「今日複習」＝複習佇列順序，本來就不照 lastSeenAt；
      // 「最後遇到時間」排序要看「全部」／「最近遇到」
      const defaultTab = await web.$$eval('.g-vocab-panel-word', els => els.map(e => e.textContent.trim()));
      await web.click('[data-filter="all"]');
      await web.waitForTimeout(400);
      const uiOrder = await web.$$eval('.g-vocab-panel-word', els => els.map(e => e.textContent.trim()));
      await s.shot(web, 'vocab-import-A3-panel');
      await web.close();
      const want = JSON.stringify(['control', 'merge', 'oldest']);
      rec.pass('A3 匯入後排序（最後遇到時間）',
        st === '匯入完成：新增 1、更新 0，目前共 3 個單字。'
        && JSON.stringify(order) === want && JSON.stringify(uiOrder) === want,
        `「${st}」／資料層 [${order}]／面板「全部」[${uiOrder}]（參考：預設「今日複習」[${defaultTab}]＝複習佇列順序）`);
    } catch (e) { rec.fail('A3 匯入後排序（最後遇到時間）', 'EXCEPTION ' + e.message); }

    // ── B1／B2：零有效條目一律擋在門口，兩槽快照不得被動 ──
    // prev 傳 null ＝ 明確清掉較舊那槽（不是「不動它」）；
    // 少了這個 B3 會被前面案子留下的 prev 干擾，看起來像快照數量不對
    const setSnaps = (page, cur, prev) => page.evaluate(async ([c, p]) => {
      await chrome.storage.local.set({ fanFanBaVocabularyItemsSnapshot: c });
      if (p) await chrome.storage.local.set({ fanFanBaVocabularyItemsSnapshotPrev: p });
      else await chrome.storage.local.remove('fanFanBaVocabularyItemsSnapshotPrev');
    }, [cur, prev]);

    try {
      await setSnaps(opt,
        { savedAt: H.isoHoursAgo(2), items: { 'en:rescue1': { id: 'en:rescue1', word: 'rescue1' }, 'en:rescue2': { id: 'en:rescue2', word: 'rescue2' } } },
        { savedAt: H.isoHoursAgo(30), items: { 'en:older': { id: 'en:older', word: 'older' } } });
      for (const [id, file] of [['B1 空 items 備份被擋、快照不動', '01-empty-items.json'],
        ['B2 條目全缺 word 被擋、快照不動', '02-no-word.json']]) {
        const before = JSON.stringify(await H.snapshots(opt));
        const st = await H.importVocabFile(opt, fx(file));
        const after = JSON.stringify(await H.snapshots(opt));
        rec.pass(id, st === '匯入失敗：備份內沒有可匯入的單字' && before === after,
          `「${st}」／快照 before=after：${before === after}　${after}`);
      }
    } catch (e) { rec.fail('B1／B2 零收穫匯入', 'EXCEPTION ' + e.message); }

    // ── B3：刪光 → 匯入空檔 → 快照還在 → 還原救回 ──
    try {
      const items3 = {
        'en:alpha': { id: 'en:alpha', word: 'alpha', count: 1, status: 'learning', lastSeenAt: '2026-08-13T01:00:00.000Z' },
        'en:beta': { id: 'en:beta', word: 'beta', count: 1, status: 'learning', lastSeenAt: '2026-08-13T02:00:00.000Z' },
        'en:gamma': { id: 'en:gamma', word: 'gamma', count: 1, status: 'learning', lastSeenAt: '2026-08-13T03:00:00.000Z' } };
      await H.seed(opt, items3);
      const snapAt = H.isoHoursAgo(2);   // fresh ⇒ 後續刪除不會輪替，快照留住「誤刪前」
      await setSnaps(opt, { savedAt: snapAt, items: items3 }, null);

      const web = await s.newPage('/plain');
      await H.openVocabPanel(web);
      // 刪除後清單是非同步重繪：睡固定秒數再點 .first() 可能仍指到同一列，
      // 等於重複刪同一筆、剩下的字沒被刪到（flaky 來源）。改成讀 id → 點 → 等那列消失。
      let deleted = 0;
      while (await web.locator('[data-vocab-delete]').count()) {
        const btn = web.locator('[data-vocab-delete]').first();
        const id = await btn.getAttribute('data-vocab-delete');
        await btn.click();
        await web.waitForFunction(
          x => !document.querySelector(`[data-vocab-delete="${x}"]`), id, { timeout: 15000 });
        deleted++;
        if (deleted > 10) break; // 保險，避免無限迴圈
      }
      await s.shot(web, 'vocab-import-B3-after-delete');
      await web.close();

      const emptied = (await H.listWords(opt)).length;
      await opt.reload({ waitUntil: 'domcontentloaded' });
      await opt.waitForTimeout(800);
      await H.openBackupTab(opt);
      const st = await H.importVocabFile(opt, fx('01-empty-items.json'));
      const kept = await H.snapshots(opt);
      const keptOk = kept.length === 1 && kept[0].count === 3 && kept[0].savedAt === snapAt;

      await opt.reload({ waitUntil: 'domcontentloaded' });
      await opt.waitForTimeout(800);
      await H.openBackupTab(opt);
      const btn = opt.locator('#vocabularySnapshotActions button', { hasText: '還原最近快照' });
      let restoreStatus = '（沒有出現還原按鈕）';
      if (await btn.count()) {
        await btn.first().click();
        await opt.waitForFunction(() => /已從快照還原|還原失敗/.test(
          document.getElementById('vocabularyBackupStatus').textContent), null, { timeout: 20000 });
        restoreStatus = (await opt.locator('#vocabularyBackupStatus').innerText()).trim();
      }
      const back = await H.listWords(opt);
      rec.pass('B3 誤刪光後匯入空檔仍救得回',
        deleted === 3 && emptied === 0 && st === '匯入失敗：備份內沒有可匯入的單字'
        && keptOk && restoreStatus === '已從快照還原：補回 3、更新 0，目前共 3 個單字。' && back.length === 3,
        `刪 ${deleted}/3 → list=${emptied} → 匯入「${st}」→ 快照保留 ${JSON.stringify(kept)} → 還原「${restoreStatus}」→ 救回 [${back}]`);
    } catch (e) { rec.fail('B3 誤刪光後匯入空檔仍救得回', 'EXCEPTION ' + e.message); }

    // ── B4：對照組（要重啟才驗得到，見下方註記）──
    try {
      // snapshotCheckedAt 是 SW 記憶體變數：B3 看過 fresh 快照後 24 小時內不會再輪替，
      // 不重啟瀏覽器就會拿到假 FAIL
      const fresh = await s.relaunch();
      const o = fresh.opt;
      await H.openBackupTab(o);
      await H.seed(o, { 'en:before': { id: 'en:before', word: 'before', count: 1, status: 'learning', lastSeenAt: '2026-08-13T00:00:00.000Z' } });
      await o.evaluate(([stale]) => chrome.storage.local.set({ fanFanBaVocabularyItemsSnapshot: stale })
        .then(() => chrome.storage.local.remove('fanFanBaVocabularyItemsSnapshotPrev')),
        [{ savedAt: H.isoHoursAgo(30), items: { 'en:stale': { id: 'en:stale', word: 'stale' } } }]);
      const before = await H.snapshots(o);
      const st = await H.importVocabFile(o, fx('05-normal.json'));
      const after = await H.snapshots(o);
      const cur = (await H.send(o, 'snapshot', { slot: 'current' })).snapshot;
      const curWords = Object.values(cur?.items || {}).map(i => i.word);
      const rotated = after.find(x => x.slot === 'current');
      const prev = after.find(x => x.slot === 'prev');
      rec.pass('B4 對照組：有內容的匯入會備份前態',
        st === '匯入完成：新增 1、更新 0，目前共 2 個單字。'
        && rotated && (Date.now() - Date.parse(rotated.savedAt)) < 5 * 60e3
        && JSON.stringify(curWords) === JSON.stringify(['before']) && prev && prev.count === 1,
        `「${st}」／before=${JSON.stringify(before)}／after=${JSON.stringify(after)}／current 內容 [${curWords}]（＝匯入前的 before）`);
    } catch (e) { rec.fail('B4 對照組：有內容的匯入會備份前態', 'EXCEPTION ' + e.message); }
  },
};
