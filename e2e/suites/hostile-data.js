// 大量／惡意單字（原 MANUAL-QA TC-F3-004）
// 5,000 筆 ＋ emoji／RTL override／公式／HTML／超長字串，驗 UI 不執行內容、不卡死、
// 並發寫入不爆增、高亮不污染互動元件、CSV 匯出有公式前綴防護。
const H = require('../lib/harness');

module.exports = {
  name: 'hostile-data',
  description: '5,000 筆＋惡意字串邊界（TC-F3-004）',

  async run(s, rec) {
    const { opt } = s;

    const seedInfo = await opt.evaluate(async () => {
      const now = new Date().toISOString();
      const items = {};
      const hostile = {
        'en:h-emoji': '🎉🐕 party',
        'en:h-rtl': 'test‮gnp.exe',
        'en:h-formula': "=cmd|' /C calc'!A0",
        'en:h-img': '<img src=x onerror="window.__ffbXss=1">',
        'en:h-script': '<script>window.__ffbXss2=1</scr' + 'ipt>',
        'en:h-long': 'L'.repeat(5000),
        'en:h-csv': 'a,b"c',
      };
      for (const [id, word] of Object.entries(hostile)) {
        items[id] = { id, word, count: 1, status: 'learning', createdAt: now, lastSeenAt: now, definition: '惡意樣本' };
      }
      for (let i = 1; i <= 5000 - Object.keys(hostile).length; i++) {
        const id = `en:word${String(i).padStart(4, '0')}`;
        items[id] = { id, word: `word${String(i).padStart(4, '0')}`, count: 1, status: 'learning',
          createdAt: now, lastSeenAt: new Date(Date.now() - i * 1000).toISOString() };
      }
      const t0 = performance.now();
      const r = await chrome.runtime.sendMessage({ type: 'VOCABULARY_STORE', action: 'replaceAll', items, snapshot: false });
      return { written: r.count, ms: Math.round(performance.now() - t0) };
    });
    console.log(`  seed: ${seedInfo.written} 筆／${seedInfo.ms}ms`);

    const web = await s.newPage('/highlight');

    // ── 1) 大量資料下 UI 不卡死 ──
    let openMs = -1, searchMs = -1, statusMs = -1, shown = -1, hits = -1;
    try {
      const t0 = Date.now();
      await H.openVocabPanel(web);
      await web.click('[data-filter="all"]');
      await web.waitForFunction(() => document.querySelectorAll('.g-vocab-panel-item').length > 0, null, { timeout: 60000 });
      openMs = Date.now() - t0;
      shown = await web.locator('.g-vocab-panel-item').count();

      const t1 = Date.now();
      await web.fill('.g-vocab-search', 'word0042');
      await web.waitForFunction(() => document.querySelectorAll('.g-vocab-panel-item').length <= 5, null, { timeout: 30000 });
      searchMs = Date.now() - t1;
      hits = await web.locator('.g-vocab-panel-item').count();

      await web.fill('.g-vocab-search', '');
      await web.waitForTimeout(400);
      await web.locator('.g-vocab-panel-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
      const t2 = Date.now();
      await web.locator('[data-vocab-status]').first().click();
      await web.waitForTimeout(800);
      statusMs = Date.now() - t2;
      await s.shot(web, 'hostile-panel-5000');
      rec.pass('5,000 筆下 UI 不卡死', openMs < 15000 && searchMs < 5000 && statusMs < 5000 && shown > 0,
        `開面板(全部) ${openMs}ms／渲染 ${shown} 列／搜尋 ${searchMs}ms→${hits} 筆／切狀態 ${statusMs}ms（門檻 15s/5s/5s）`);
    } catch (e) { rec.fail('5,000 筆下 UI 不卡死', `EXCEPTION ${e.message}（open=${openMs} search=${searchMs}）`); }

    // ── 2) UI 不執行惡意內容 ──
    try {
      await web.fill('.g-vocab-search', 'img');
      await web.waitForTimeout(600);
      const p = await web.evaluate(() => ({
        xss: typeof window.__ffbXss, xss2: typeof window.__ffbXss2,
        img: document.querySelectorAll('#gemini-result-card img[src="x"], #gemini-result-card img[onerror]').length,
        script: document.querySelectorAll('#gemini-result-card script').length,
        literal: (document.querySelector('.g-vocab-panel-list')?.innerText || '').includes('<img'),
      }));
      await s.shot(web, 'hostile-xss');
      rec.pass('UI 不執行惡意內容',
        p.xss === 'undefined' && p.xss2 === 'undefined' && p.img === 0 && p.script === 0 && p.literal,
        `__ffbXss=${p.xss}／__ffbXss2=${p.xss2}／注入 img ${p.img}、script ${p.script}／HTML 以字面顯示=${p.literal}`);
    } catch (e) { rec.fail('UI 不執行惡意內容', 'EXCEPTION ' + e.message); }

    // ── 3) 並發重複收藏不爆增（序列化佇列）──
    try {
      const before = (await H.listWords(opt)).length;
      const merged = await opt.evaluate(async () => {
        const now = new Date().toISOString();
        const one = n => chrome.runtime.sendMessage({ type: 'VOCABULARY_STORE', action: 'upsert',
          item: { id: 'en:rapid', word: 'rapid', count: n, status: 'learning', createdAt: now, lastSeenAt: now } });
        await Promise.all(Array.from({ length: 20 }, (_, i) => one(i + 1)));
        return (await chrome.runtime.sendMessage({ type: 'VOCABULARY_STORE', action: 'get', id: 'en:rapid' })).item;
      });
      const after = (await H.listWords(opt)).length;
      rec.pass('20 次並發 upsert 只 +1', after === before + 1 && !!merged,
        `總筆數 ${before}→${after}／合併後 count=${merged?.count}`);
    } catch (e) { rec.fail('20 次並發 upsert 只 +1', 'EXCEPTION ' + e.message); }

    // ── 4) 高亮只作用於文章文字 ──
    try {
      await opt.evaluate(() => chrome.storage.sync.remove('vocabularyHighlightMode'));
      await web.reload({ waitUntil: 'domcontentloaded' });
      await web.waitForTimeout(1200);
      await H.expandBall(web);
      await H.clickStable(web, '[data-action="vocab-highlight"]');
      await web.waitForTimeout(3500);
      const h = await web.evaluate(() => ({
        total: document.querySelectorAll('mark.g-vocab-highlight').length,
        inForm: document.querySelectorAll('form mark.g-vocab-highlight').length,
        inCode: document.querySelectorAll('pre mark.g-vocab-highlight, code mark.g-vocab-highlight').length,
        inUi: document.querySelectorAll('#gemini-result-card mark.g-vocab-highlight, [class^="ffb-"] mark.g-vocab-highlight').length,
        inArticle: document.querySelectorAll('p mark.g-vocab-highlight').length,
      }));
      await s.shot(web, 'hostile-highlight');
      rec.pass('高亮不污染表單／程式碼／自身 UI',
        h.inArticle > 0 && h.inForm === 0 && h.inCode === 0 && h.inUi === 0 && h.total <= 80,
        `文章 ${h.inArticle}／表單 ${h.inForm}／程式碼 ${h.inCode}／翻翻吧 UI ${h.inUi}／共 ${h.total}（上限 maxMarks=80）`);
    } catch (e) { rec.fail('高亮不污染表單／程式碼／自身 UI', 'EXCEPTION ' + e.message); }

    // ── 5) CSV 公式注入防護 ──
    try {
      await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: s.origin });
      // 剪貼簿 API 要頁面在前景才讀得到；多分頁時不 bringToFront 會拿到空字串（會變成假 FAIL）
      await web.bringToFront();
      await H.openVocabPanel(web);
      await web.click('[data-vocab-export="csv"]');
      await web.waitForTimeout(1500);
      let csv = '';
      for (let i = 0; i < 3 && !csv.includes('cmd|'); i++) {
        if (i) await web.waitForTimeout(1000);
        csv = await web.evaluate(() => navigator.clipboard.readText().catch(e => 'CLIPBOARD_ERR:' + e.message));
      }
      const readable = !csv.startsWith('CLIPBOARD_ERR') && csv.length > 0;
      const line = (csv.split(/\r?\n/).find(l => l.includes('cmd|')) || '').slice(0, 80);
      rec.pass('CSV 公式前綴防護', readable && !!line && /^(?:"?')/.test(line),
        readable
          ? (line ? `含 =cmd 的那行＝「${line}」（開頭要有 ' 才不會被 Excel／Sheets 當公式）`
            : `剪貼簿有內容但找不到含 =cmd 的行（前 80 字：${csv.slice(0, 80)}）→ 本條未驗成`)
          : `讀不到剪貼簿（${csv.slice(0, 60)}）→ 本條未驗成，不得當通過`);
    } catch (e) { rec.fail('CSV 公式前綴防護', 'EXCEPTION ' + e.message); }

    await web.close();
    // 收尾：不把 5,000 筆留在 profile 裡
    await H.seed(opt, { 'en:merge': { id: 'en:merge', word: 'merge', count: 1, status: 'learning', lastSeenAt: new Date().toISOString() } });
    await opt.evaluate(() => chrome.storage.sync.remove('vocabularyHighlightMode'));
  },
};
