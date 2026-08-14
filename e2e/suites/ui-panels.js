// 面板／浮球／高亮／嵌入提示（原 MANUAL-QA Tier 3 可自動化的部分）
const H = require('../lib/harness');

const DICT = JSON.stringify({ word: 'merge', lang: 'en', phonetic: '/mɜːdʒ/', pos: 'verb',
  definition: '合併策略（來自歷史）', translations: ['合併', '融合'], usage: 'merge the two branches' });

module.exports = {
  name: 'ui-panels',
  description: '收藏面板／歷史 SRS／options 自檢／375 版面／高亮／Obsidian 狀態／嵌入提示',

  async run(s, rec) {
    const { opt } = s;

    // ── T1：面板實心可見且可點（桌機＋375）──
    try {
      const web = await s.newPage('/plain', { width: 1920, height: 1080 });
      await H.openLibrary(web);
      const op = await web.$eval('#gemini-result-card', el => getComputedStyle(el).opacity);
      await web.click('[data-library-action="vocabulary"]');
      await web.waitForSelector('.g-vocab-panel-list', { timeout: 10000 });
      const vocabOk = await web.locator('.g-vocab-panel').isVisible();
      await H.openLibrary(web);
      await web.click('[data-library-action="history"]');
      await web.waitForTimeout(600);
      const histOk = (await web.locator('.g-floating-history, .g-hist-empty').count()) > 0;
      await web.setViewportSize({ width: 375, height: 812 });
      await web.reload({ waitUntil: 'domcontentloaded' });
      await H.openLibrary(web);
      const opM = await web.$eval('#gemini-result-card', el => getComputedStyle(el).opacity);
      await s.shot(web, 'ui-T1-mobile-library');
      await web.close();
      rec.pass('T1 收藏/紀錄面板實心可見可點（TC-F3-001/005）',
        op === '1' && opM === '1' && vocabOk && histOk,
        `桌機 opacity=${op}、375 opacity=${opM}（QA-P1-001 當時是 0）／單字本=${vocabOk}／最近查詢=${histOk}`);
    } catch (e) { rec.fail('T1 收藏/紀錄面板實心可見可點（TC-F3-001/005）', 'EXCEPTION ' + e.message); }

    // ── T2：歷史回看 → 結果卡 → SRS ──
    try {
      await H.seed(opt, {
        'en:merge': { id: 'en:merge', word: 'merge', count: 3, status: 'learning',
          createdAt: '2026-08-01T00:00:00.000Z', lastSeenAt: '2026-08-12T00:00:00.000Z' },
        'en:snapshot': { id: 'en:snapshot', word: 'snapshot', count: 1, status: 'learning',
          createdAt: '2026-08-02T00:00:00.000Z', lastSeenAt: '2026-08-11T00:00:00.000Z' } });
      // 第一筆要 action=translate ＋ 選字 ≤20 字 ＋ result 可 JSON parse，字典卡（含收藏鈕）才渲染
      await opt.evaluate(([d]) => chrome.storage.local.set({ queryHistory: [
        { action: 'translate', text: 'merge', result: d, dictData: JSON.parse(d), ts: Date.now() - 6e5 },
        { action: 'explain', text: 'snapshot rope', result: '快照救命繩（來自歷史）', ts: Date.now() - 12e5 },
        { action: 'optimize', text: 'rescue slot', result: '救援槽（來自歷史）', ts: Date.now() - 18e5 } ] }), [DICT]);

      const web = await s.newPage('/plain', { width: 1920, height: 1080 });
      await H.openLibrary(web);
      await web.click('[data-library-action="history"]');
      await web.waitForSelector('.g-floating-history-item', { timeout: 10000 });
      const histCount = await web.locator('.g-floating-history-item').count();
      await web.locator('.g-floating-history-item').first().click();
      await web.waitForTimeout(700);
      const cardText = await web.$eval('#gemini-result-card .g-rc-body', el => el.innerText.slice(0, 160));
      const before = (await H.send(opt, 'get', { id: 'en:merge' })).item;
      await H.openVocabPanel(web);
      await web.click('[data-filter="all"]');
      await web.waitForTimeout(400);
      if (await web.locator('[data-vocab-status]').count()) {
        await web.locator('[data-vocab-status]').first().click();
        await web.waitForTimeout(800);
      }
      const changed = (await H.send(opt, 'list')).items.find(i => i.status === 'known' && i.reviewedAt);
      await s.shot(web, 'ui-T2-history-srs');
      await web.close();
      rec.pass('T2 歷史回看＋SRS 更新（TC-F3-002）',
        histCount === 3 && (cardText.includes('合併策略') || cardText.includes('merge')) && !!changed,
        `歷史 ${histCount} 筆／回開結果卡有內容／SRS：${before.word} ${before.status}→${changed ? changed.status : '未變更'}`);
    } catch (e) { rec.fail('T2 歷史回看＋SRS 更新（TC-F3-002）', 'EXCEPTION ' + e.message); }

    // ── T3：options 無 TDZ 錯誤＋備份提醒 ──
    try {
      const p = await s.ctx.newPage();
      const errs = [];
      p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      p.on('pageerror', e => errs.push(String(e.message)));
      await p.goto(s.optionsUrl, { waitUntil: 'domcontentloaded' });
      await p.waitForTimeout(1500);
      // 用 DOM dispatch 切分頁：同時開著第二個 options 分頁時 Playwright 的 click 會卡住
      await p.evaluate(() => document.querySelector('[data-panel="backup"]').click());
      await p.waitForSelector('#btnImportVocabulary', { state: 'visible', timeout: 10000 });
      await p.waitForTimeout(600);
      const tdz = errs.filter(t => /Cannot access .* before initialization/.test(t));
      const text = await p.$eval('#btnImportVocabulary', el => el.closest('section, body').innerText);
      await p.close();
      rec.pass('T3 options 無初始化錯誤＋備份提醒（TC-E3-003）',
        tdz.length === 0 && /尚未匯出過|上次備份/.test(text),
        `TDZ 錯誤 ${tdz.length} 筆／其他 console error ${errs.length - tdz.length} 筆／備份提醒可見=${/尚未匯出過|上次備份/.test(text)}`);
    } catch (e) { rec.fail('T3 options 無初始化錯誤＋備份提醒（TC-E3-003）', 'EXCEPTION ' + e.message); }

    // ── T4／T7：375 版面與拖曳 ──
    const CONTROLS = ['[data-action="library"]', '[data-action="vocab-highlight"]',
      '[data-action="page-translate"]', '[data-action="settings"]'];
    const overflow = (page, sel) => page.$eval(sel, el => {
      const r = el.getBoundingClientRect();
      return Math.round((r.right - window.innerWidth) * 10) / 10;
    });
    try {
      // 這案自己會拖浮球，而位置是 per-host 存進 `fanFanBaFloatingPosition`（含 side）。
      // 不先歸零的話，上一次跑留下的「靠左」會讓本次量到的溢出全是負值、
      // 「桌機半藏」直接不成立——測試污染自己的前置（2026-08-13 實際踩到）。
      await opt.evaluate(() => chrome.storage.local.remove('fanFanBaFloatingPosition'));
      const web = await s.newPage('/plain', { width: 375, height: 812 });
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await web.waitForTimeout(800);
      const idle = await overflow(web, '.ffb-ball-main');
      await H.expandBall(web);
      const four = {};
      for (const sel of CONTROLS) four[sel] = await overflow(web, sel).catch(() => 'n/a');
      await s.shot(web, 'ui-T4-375-expanded');

      // 拖到上下緣，選單不得被裁
      const box = await web.$eval('.ffb-ball-main', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      const clip = async () => { await web.waitForTimeout(400); return web.$eval('.ffb-ball-menu', el => {
        const r = el.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom - window.innerHeight) }; }); };
      await web.mouse.move(box.x, box.y); await web.mouse.down();
      await web.mouse.move(box.x, 12, { steps: 12 }); await web.mouse.up();
      await H.expandBall(web).catch(() => { });
      const top = await clip();
      await web.mouse.move(box.x, 12); await web.mouse.down();
      await web.mouse.move(box.x, 800, { steps: 12 }); await web.mouse.up();
      await H.expandBall(web).catch(() => { });
      const bottom = await clip();

      await web.setViewportSize({ width: 1280, height: 900 });
      await web.reload({ waitUntil: 'domcontentloaded' });
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await web.waitForTimeout(900);
      const deskIdle = await overflow(web, '.ffb-ball-main');
      await web.close();
      // 收尾也清一次：別把拖過的位置留給下一輪或下一個 suite
      await opt.evaluate(() => chrome.storage.local.remove('fanFanBaFloatingPosition'));
      const allIn = Object.values(four).every(v => typeof v === 'number' && v <= 0);
      rec.pass('T4/T7 375 四鈕在畫面內、拖到上下緣不裁、桌機仍半藏',
        idle <= 0 && allIn && top.top >= 0 && bottom.bottom <= 0 && deskIdle > 0,
        `375 靜置主球溢出 ${idle}px／展開四鈕 ${JSON.stringify(four)}／拖上緣 top=${top.top}、拖下緣 bottom=${bottom.bottom}／桌機 1280 靜置主球超出 ${deskIdle}px（＝半藏保留）`);
    } catch (e) { rec.fail('T4/T7 375 四鈕在畫面內、拖到上下緣不裁、桌機仍半藏', 'EXCEPTION ' + e.message); }

    // ── T5／T6：高亮開關與記憶 ──
    try {
      await H.seed(opt, {
        'en:merge': { id: 'en:merge', word: 'merge', count: 3, status: 'learning', lastSeenAt: '2026-08-12T00:00:00.000Z', definition: '合併' },
        'en:snapshot': { id: 'en:snapshot', word: 'snapshot', count: 1, status: 'learning', lastSeenAt: '2026-08-11T00:00:00.000Z', definition: '快照' } });
      // 先歸零，否則第一次點其實是「關閉」，會拿到假 FAIL
      await opt.evaluate(() => chrome.storage.sync.remove('vocabularyHighlightMode'));
      const web = await s.newPage('/highlight', { width: 1280, height: 900 });
      const modeBefore = await opt.evaluate(() => chrome.storage.sync.get('vocabularyHighlightMode'));
      await H.expandBall(web);
      await H.clickStable(web, '[data-action="vocab-highlight"]');
      await web.waitForTimeout(3000);
      const modeAfter = await opt.evaluate(() => chrome.storage.sync.get('vocabularyHighlightMode'));
      const marks = await web.locator('mark.g-vocab-highlight').count();
      const inForm = await web.locator('form mark.g-vocab-highlight, pre mark.g-vocab-highlight').count();
      let tip = false;
      if (marks) { await web.locator('mark.g-vocab-highlight').first().hover(); await web.waitForTimeout(700);
        tip = await web.locator('.g-vocab-highlight-tip').count() > 0; }
      await s.shot(web, 'ui-T5-highlight-on');
      // 記憶：重整後應自動高亮
      await web.reload({ waitUntil: 'domcontentloaded' });
      await web.waitForTimeout(2500);
      const afterReload = await web.locator('mark.g-vocab-highlight').count();
      // 關掉，避免影響後續案
      await H.expandBall(web); await H.clickStable(web, '[data-action="vocab-highlight"]'); await web.waitForTimeout(800);
      const off = await web.locator('mark.g-vocab-highlight').count();
      await web.close();
      rec.pass('T5 高亮開關（mark／tooltip／再點還原）',
        marks > 0 && tip && inForm === 0 && off === 0,
        `mode ${JSON.stringify(modeBefore)}→${JSON.stringify(modeAfter)}／mark ${marks}（表單/程式碼內 ${inForm}）／tooltip=${tip}／再點剩 ${off}`);
      rec.pass('T6 高亮狀態被記住（storage.sync）',
        !!modeAfter.vocabularyHighlightMode && afterReload > 0,
        `vocabularyHighlightMode=${JSON.stringify(modeAfter.vocabularyHighlightMode)}／重整後自動高亮 ${afterReload} 個`);
    } catch (e) { rec.fail('T5/T6 高亮開關與記憶', 'EXCEPTION ' + e.message); }

    // ── T8：未設定 Obsidian 資料夾 → 停在「已收藏」不謊報 ──
    try {
      const cfg = await opt.evaluate(() => chrome.storage.sync.get(['obsidianVault', 'obsidianFolder']));
      // 這個字必須「還沒被收藏」，否則字典卡開場就是 disabled 的『已收藏』、按不下去
      await H.seed(opt, { 'en:keepother': { id: 'en:keepother', word: 'keepother', count: 1, status: 'learning', lastSeenAt: '2026-08-13T00:00:00.000Z' } });
      await opt.evaluate(([d]) => chrome.storage.local.set({ queryHistory: [
        { action: 'translate', text: 'freshword', result: d, dictData: JSON.parse(d), ts: Date.now() } ] }),
        [JSON.stringify({ word: 'freshword', lang: 'en', pos: 'noun', definition: '尚未被收藏的字', translations: ['新字'] })]);
      const web = await s.newPage('/plain', { width: 1280, height: 900 });
      await H.openLibrary(web);
      await web.click('[data-library-action="history"]');
      await web.waitForSelector('.g-floating-history-item', { timeout: 10000 });
      await web.locator('.g-floating-history-item').first().click();
      await web.waitForTimeout(800);
      const btn = web.locator('.g-vocab-save-btn');
      let pre = 'n/a', label = '（沒有收藏鈕）';
      if (await btn.count()) {
        pre = JSON.stringify(await btn.first().evaluate(el => ({ text: el.innerText.trim(), disabled: el.disabled })));
        await btn.first().click();
        await web.waitForTimeout(2000);
        label = (await btn.first().innerText()).trim();
      }
      const saved = (await H.send(opt, 'get', { id: 'en:freshword' })).item;
      await s.shot(web, 'ui-T8-save-no-vault');
      await web.close();
      rec.pass('T8 未設定 vault → 停在「已收藏」不謊報匯出',
        label === '已收藏' && !!saved,
        `vault/folder 未設定（${JSON.stringify(cfg)}）／按前 ${pre}／按後「${label}」／有寫進單字本=${!!saved}`);
    } catch (e) { rec.fail('T8 未設定 vault → 停在「已收藏」不謊報匯出', 'EXCEPTION ' + e.message); }

    // ── T9：單字本「已匯出」badge ──
    try {
      await H.seed(opt, {
        'en:exported': { id: 'en:exported', word: 'exported', count: 1, status: 'learning',
          lastSeenAt: '2026-08-13T05:00:00.000Z', obsidianExportedAt: '2026-08-13T05:00:00.000Z' },
        'en:plainword': { id: 'en:plainword', word: 'plainword', count: 1, status: 'learning',
          lastSeenAt: '2026-08-13T04:00:00.000Z' } });
      const web = await s.newPage('/plain');
      await H.openVocabPanel(web);
      await web.click('[data-filter="all"]');
      await web.waitForTimeout(500);
      const rows = await web.$$eval('.g-vocab-panel-item', els => els.map(el => ({
        word: el.querySelector('.g-vocab-panel-word')?.textContent.trim(),
        exported: el.innerText.includes('已匯出') })));
      await s.shot(web, 'ui-T9-exported-badge');
      await web.close();
      const a = rows.find(r => r.word === 'exported'), b = rows.find(r => r.word === 'plainword');
      rec.pass('T9 已匯出 badge 只出現在匯出過的條目',
        !!a?.exported && b && !b.exported, JSON.stringify(rows));
    } catch (e) { rec.fail('T9 已匯出 badge 只出現在匯出過的條目', 'EXCEPTION ' + e.message); }

    // ── B1〜B5：全文翻譯的嵌入提示（collector 在 API 呼叫之前跑，無 key 也驗得到）──
    const embedHint = async route => {
      const web = await s.newPage(route, { width: 1280, height: 900 });
      await H.expandBall(web);
      await H.clickStable(web, '[data-action="page-translate"]');
      await web.waitForTimeout(2500);
      const el = web.locator('.ffb-page-embedded-summary');
      const exists = await el.count();
      const hidden = exists ? await el.first().getAttribute('hidden') !== null : null;
      const text = exists && !hidden ? (await el.first().innerText()).trim() : '';
      const status = await web.locator('.ffb-page-panel-status').count()
        ? (await web.locator('.ffb-page-panel-status').first().innerText()).trim() : '（無面板）';
      const shadowInjected = await web.evaluate(() => {
        const host = document.getElementById('host');
        return host?.shadowRoot ? host.shadowRoot.querySelectorAll('[class*="ffb-page"], [class*="g-pt-"]').length : null;
      });
      await s.shot(web, `ui-embed${route.replace(/\//g, '-')}`);
      await web.close();
      return { exists, hidden, text, status, shadowInjected };
    };

    try {
      const r = await embedHint('/shadow');
      const m = /web component 內文 (\d+) 段/.exec(r.text);
      rec.pass('B1 shadow：不注入譯文＋提示出現', !!m && r.shadowInjected === 0,
        `提示「${r.text || '（未顯示）'}」／shadow root 內譯文區塊 ${r.shadowInjected} 個／面板「${r.status}」`);
      rec.pass('B2 提示的 N 與實際段落數相符', !!m && Number(m[1]) === 3,
        `N=${m ? m[1] : 'n/a'}，fixture 實際 3 段（「選取翻譯仍能翻」子條需 API key，未涵蓋）`);
    } catch (e) { rec.fail('B1/B2 shadow 提示', 'EXCEPTION ' + e.message); }

    try {
      const r = await embedHint('/shadow-controls');
      const shown = r.exists && !r.hidden && /web component/.test(r.text);
      rec.pass('B3 只有控制項的 shadow → 不多嘴', !shown, shown ? `出現了「${r.text}」` : '提示未出現（正確）');
    } catch (e) { rec.fail('B3 只有控制項的 shadow → 不多嘴', 'EXCEPTION ' + e.message); }

    try {
      const r = await embedHint('/embeds');
      const f = /嵌入框架 (\d+) 個(?:（(\d+) 個讀不到）)?/.exec(r.text);
      const k = /圖表文字 (\d+) 段/.exec(r.text);
      rec.pass('B4 iframe＋SVG 的數字與實際相符',
        !!f && !!k && Number(f[1]) === 2 && Number(f[2]) === 1 && Number(k[1]) === 2,
        `提示「${r.text || '（未顯示）'}」；fixture＝http iframe 1（ready）＋data: iframe 1（讀不到）＋SVG 文字 2 段`);
    } catch (e) { rec.fail('B4 iframe＋SVG 的數字與實際相符', 'EXCEPTION ' + e.message); }

    try {
      const r = await embedHint('/plain');
      const shown = r.exists && !r.hidden && r.text.length > 0;
      rec.pass('B5 純文字頁 → 提示不出現', !shown, shown ? `出現了「${r.text}」` : '提示未出現（正確）');
    } catch (e) { rec.fail('B5 純文字頁 → 提示不出現', 'EXCEPTION ' + e.message); }
  },
};
