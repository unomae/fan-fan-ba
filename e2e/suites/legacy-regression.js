// Legacy 回歸（原 MANUAL-QA §1–§7 中可自動化的部分）
// frame-split／訊息硬化／品牌字型／單段翻譯 UI／診斷自檢／SRS／匯入硬化／綜合回歸
const path = require('path');
const fs = require('fs');
const H = require('../lib/harness');

module.exports = {
  name: 'legacy-regression',
  description: '§1–§7 legacy 回歸的可自動化部分',

  async run(s, rec) {
    let { opt } = s;
    const tmp = path.join(s.artifacts, 'tmp');
    fs.mkdirSync(tmp, { recursive: true });

    // ── §1-1 iframe 內不長浮球 ──
    try {
      const web = await s.newPage('/frames', { width: 1280, height: 900 });
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await web.waitForTimeout(2500);
      const frames = web.frames().filter(f => f !== web.mainFrame());
      const inMain = await web.mainFrame().evaluate(() => document.querySelectorAll('.ffb-ball-main').length);
      const inFrames = [];
      for (const f of frames) inFrames.push(await f.evaluate(() => document.querySelectorAll('.ffb-ball-main').length).catch(() => 'n/a'));
      await s.shot(web, 'legacy-frames');
      await web.close();
      rec.pass('§1-1 浮球只在主頁面、iframe 內不長',
        inMain === 1 && inFrames.every(n => n === 0),
        `主頁 ${inMain} 顆／子框架 ${frames.length} 個各 ${JSON.stringify(inFrames)} 顆`);
    } catch (e) { rec.fail('§1-1 浮球只在主頁面、iframe 內不長', 'EXCEPTION ' + e.message); }

    // ── §1-2／§1-3 選取文字 → 工具列（能不能翻需 key，只驗工具列）──
    try {
      const web = await s.newPage('/frames', { width: 1280, height: 900 });
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await web.waitForTimeout(2000);
      const selectIn = async target => target.evaluate(() => {
        const el = document.querySelector('#p2') || document.querySelector('p');
        const r = document.createRange(); r.selectNodeContents(el);
        const sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(r);
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, view: window }));
      });
      await selectIn(web); await web.waitForTimeout(900);
      const mainTb = await web.evaluate(() => {
        const el = document.getElementById('gemini-ai-toolbar');
        return el ? { visible: getComputedStyle(el).display !== 'none' && getComputedStyle(el).opacity !== '0',
          buttons: el.querySelectorAll('.g-btn').length } : { visible: false };
      });
      const frame = web.frames().find(f => f !== web.mainFrame() && /\/plain$/.test(f.url()));
      let frameTb = 'n/a';
      if (frame) {
        await selectIn(frame); await web.waitForTimeout(1200);
        frameTb = await frame.evaluate(() => {
          const el = document.getElementById('gemini-ai-toolbar');
          return el ? getComputedStyle(el).display !== 'none' : false;
        });
      }
      await s.shot(web, 'legacy-toolbar');
      await web.close();
      rec.partial('§1-2/§1-3 選取文字跳出工具列',
        `主頁工具列 ${JSON.stringify(mainTb)}／iframe 內工具列=${frameTb}（**「能不能翻譯」需 API key，未涵蓋**）`);
    } catch (e) { rec.fail('§1-2/§1-3 選取文字跳出工具列', 'EXCEPTION ' + e.message); }

    // ── §1-4 敏感頁整支不啟用（會連外到 accounts.google.com，只載入、不登入）──
    if (process.env.FFB_E2E_ALLOW_NET === '1') {
      try {
        const web = await s.ctx.newPage();
        const resp = await web.goto('https://accounts.google.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await web.waitForTimeout(3500);
        const p = await web.evaluate(() => ({
          ball: document.querySelectorAll('.ffb-ball-main').length,
          toolbar: document.querySelectorAll('#gemini-ai-toolbar').length,
          card: document.querySelectorAll('#gemini-result-card').length }));
        await s.shot(web, 'legacy-google-accounts');
        await web.close();
        rec.pass('§1-4 敏感頁整支不啟用', p.ball === 0 && p.toolbar === 0 && p.card === 0,
          `HTTP ${resp?.status()}／浮球 ${p.ball}、工具列 ${p.toolbar}、結果卡 ${p.card}（皆應 0）`);
      } catch (e) { rec.fail('§1-4 敏感頁整支不啟用', 'EXCEPTION ' + e.message); }
    } else {
      rec.partial('§1-4 敏感頁整支不啟用', '略過：需連外到 accounts.google.com，設 FFB_E2E_ALLOW_NET=1 才會跑');
    }

    // ── §2-2 浮球「設定」→ 開設定頁 ──
    try {
      // openOptionsPage() 會聚焦既有的設定分頁而不是開新的，先關掉才驗得到
      await s.closeOptions();
      const web = await s.newPage('/plain');
      await H.expandBall(web);
      const [newPage] = await Promise.all([
        s.ctx.waitForEvent('page', { timeout: 20000 }),
        H.clickStable(web, '[data-action="settings"]'),
      ]);
      // page 事件在分頁還是空白時就觸發，太早讀 url() 會拿到空字串
      await newPage.waitForURL(/options\.html/, { timeout: 20000 });
      const url = newPage.url();
      const hasTabs = await newPage.locator('[data-panel="backup"]').count();
      await newPage.close(); await web.close();
      opt = await s.openOptions();
      rec.pass('§2-2 浮球設定鈕開得了設定頁',
        url.includes('/options.html') && hasTabs > 0, `URL=${url.slice(0, 64)}…／分頁鈕存在=${hasTabs > 0}`);
    } catch (e) { rec.fail('§2-2 浮球設定鈕開得了設定頁', 'EXCEPTION ' + e.message); opt = await s.openOptions(); }

    // ── §3-1 品牌字型與 icon ──
    try {
      const web = await s.newPage('/plain');
      const fontReqs = [];
      web.on('response', r => { if (/\.(woff2?|ttf)(\?|$)/i.test(r.url())) fontReqs.push(`${r.status()} ${r.url().split('/').pop()}`); });
      // 品牌字型只套 `#gemini-result-card *`（浮球刻意用系統字型），而且字型用到才載入
      await H.openLibrary(web);
      await web.waitForTimeout(2000);
      const f = await web.evaluate(async () => {
        await document.fonts.ready;
        const faces = [...document.fonts].map(x => `${x.family}:${x.status}`);
        const card = document.querySelector('#gemini-result-card .g-rc-tag') || document.querySelector('#gemini-result-card');
        const ball = document.querySelector('.ffb-ball-main');
        return { faces, cardFont: getComputedStyle(card).fontFamily, ballFont: getComputedStyle(ball).fontFamily,
          icon: !!ball.querySelector('svg, img'), check: document.fonts.check('16px "jf-openhuninn"') };
      });
      await s.shot(web, 'legacy-font-icon');
      await web.close();
      // 狀態要精確等於 loaded：用 /loaded/ 比對會把 "unloaded" 也算過
      const faceLoaded = f.faces.some(x => /openhuninn/i.test(x) && x.split(':')[1] === 'loaded');
      rec.pass('§3-1 品牌字型載入、icon 正常',
        faceLoaded && f.check && /openhuninn/i.test(f.cardFont) && f.icon,
        `FontFace ${JSON.stringify(f.faces)}／fonts.check=${f.check}／結果卡 ${f.cardFont}／浮球 ${f.ballFont}（刻意系統字型）／icon=${f.icon}／字型請求 ${JSON.stringify(fontReqs)}`);
    } catch (e) { rec.fail('§3-1 品牌字型載入、icon 正常', 'EXCEPTION ' + e.message); }

    // ── §4-1 滑過段落不出浮動鈕、不遮原文 ──
    try {
      const web = await s.newPage('/plain');
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await web.waitForTimeout(1500);
      const before = await web.$eval('#p2', el => el.getBoundingClientRect().top);
      await web.hover('#p2');
      await web.waitForTimeout(1500);
      const probe = await web.evaluate(() => {
        const p = document.getElementById('p2').getBoundingClientRect();
        const overlapping = [...document.querySelectorAll('body > *')].filter(el => {
          if (el.id === 'p2' || el.contains(document.getElementById('p2'))) return false;
          // 浮球容器是常駐 UI（固定右緣），與整寬段落必然幾何重疊，不算「遮住」
          if (el.id === 'fanfanba-floating' || el.id === 'gemini-result-card') return false;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return false;
          return !(r.right < p.left || r.left > p.right || r.bottom < p.top || r.top > p.bottom);
        }).map(el => el.id || el.className || el.tagName);
        const t = document.getElementById('gemini-ai-toolbar');
        return { toolbarVisible: t ? getComputedStyle(t).display !== 'none' && getComputedStyle(t).opacity !== '0' : false,
          singleBtns: document.querySelectorAll('[class*="single"]').length, overlapping };
      });
      const after = await web.$eval('#p2', el => el.getBoundingClientRect().top);
      await web.close();
      rec.pass('§4-1 滑過段落不出浮動鈕、不遮原文',
        !probe.toolbarVisible && probe.singleBtns === 0 && probe.overlapping.length === 0 && before === after,
        `工具列可見=${probe.toolbarVisible}／單段鈕 ${probe.singleBtns}／重疊元素 ${JSON.stringify(probe.overlapping)}／段落未位移=${before === after}`);
    } catch (e) { rec.fail('§4-1 滑過段落不出浮動鈕、不遮原文', 'EXCEPTION ' + e.message); }

    // ── §4-5 局部重試 UI（無 key ⇒ 每段必失敗，正好驗失敗態）──
    try {
      const web = await s.newPage('/plain');
      await H.expandBall(web);
      await H.clickStable(web, '[data-action="page-translate"]');
      await web.waitForTimeout(4000);
      const snap = () => web.evaluate(() => ({
        retry: document.querySelectorAll('.ffb-page-retry').length,
        status: document.querySelector('.ffb-page-panel-status')?.textContent.trim() || '',
        count: document.querySelector('.ffb-page-panel-count')?.textContent.trim() || '' }));
      const before = await snap();
      let after = before;
      if (before.retry) { await web.locator('.ffb-page-retry').first().click(); await web.waitForTimeout(3000); after = await snap(); }
      await s.shot(web, 'legacy-retry');
      await web.close();
      rec.pass('§4-5 失敗段落出現「重試此段」且可點', before.retry > 0,
        `重試鈕 ${before.retry} 顆／點前「${before.status}」${before.count}／點後「${after.status}」${after.count}`
        + '（**「失敗計數正確扣回」無 key 驗不到，未涵蓋**）');
    } catch (e) { rec.fail('§4-5 失敗段落出現「重試此段」且可點', 'EXCEPTION ' + e.message); }

    // ── §5-2 API Key 有無 → 自檢表狀態 ──
    try {
      const line = t => (/單段翻譯模型[^。]*/.exec(t) || ['(找不到那行)'])[0].slice(0, 46);
      const summary = async () => { await H.openOptionsPanel(opt, 'privacy');
        return (await opt.locator('#diagnosticsSummary').innerText()).trim().replace(/\s+/g, ' '); };
      const initial = await summary();
      // dummy 值要符合 gsk_ 前綴，否則存檔被格式驗證擋下；**絕不使用真實金鑰**
      await H.openOptionsPanel(opt, 'model');
      await opt.fill('#groqApiKey', 'gsk_dummyKeyForQaOnly000000000000000000000000000000');
      await opt.evaluate(() => document.getElementById('btnSave').click());
      await opt.waitForTimeout(1500);
      await opt.reload({ waitUntil: 'domcontentloaded' }); await opt.waitForTimeout(1500);
      const withKey = await summary();
      // 清空欄位再存檔會被必填驗證擋下、金鑰不會被清除，所以「回到無 key」只能繞過 UI 刪 storage
      await H.openOptionsPanel(opt, 'model');
      await opt.fill('#groqApiKey', '');
      const uiBlocked = await opt.evaluate(() => { document.getElementById('btnSave').click();
        return new Promise(r => setTimeout(() => r(document.body.innerText.includes('請輸入 Groq API Key')), 1200)); });
      await opt.evaluate(async () => { await chrome.storage.local.remove(['groqApiKey']); await chrome.storage.sync.remove(['groqApiKey']); });
      await opt.reload({ waitUntil: 'domcontentloaded' }); await opt.waitForTimeout(1500);
      const cleared = await summary();
      await s.shot(opt, 'legacy-diagnostics');
      const miss = t => /缺 API Key/.test(t);
      rec.pass('§5-2 自檢表反映 API Key 有無',
        miss(initial) && !miss(withKey) && miss(cleared),
        `無 key「${line(initial)}」→ 補 dummy「${line(withKey)}」→ 移除後「${line(cleared)}」`
        + `／⚠️ UI 清空目前模型的 key 會被必填驗證擋下（畫面回「請輸入 Groq API Key」=${uiBlocked}），本案的移除是直接刪 storage`);
    } catch (e) { rec.fail('§5-2 自檢表反映 API Key 有無', 'EXCEPTION ' + e.message); }

    // ── §5-3 清除診斷資料 ──
    try {
      await H.openOptionsPanel(opt, 'privacy');
      const before = (await opt.locator('#diagnosticsSummary').innerText()).trim().replace(/\s+/g, ' ').slice(0, 90);
      opt.once('dialog', d => d.accept());
      await opt.evaluate(() => document.getElementById('btnClearDiagnostics').click());
      await opt.waitForTimeout(1200);
      const after = (await opt.locator('#diagnosticsSummary').innerText()).trim().replace(/\s+/g, ' ').slice(0, 90);
      rec.pass('§5-3 清除診斷資料歸零', /已清除診斷資料|尚無/.test(after), `清除前「${before}」→ 清除後「${after}」`);
    } catch (e) { rec.fail('§5-3 清除診斷資料歸零', 'EXCEPTION ' + e.message); }

    // ── §5-4 無非預期外連 ──
    try {
      const web = await s.ctx.newPage();
      const hosts = new Set(); const urls = [];
      web.on('request', r => {
        const u = r.url();
        try { hosts.add(new URL(u).host || u.slice(0, 24)); } catch { }
        if (!u.startsWith(s.origin) && !u.startsWith(s.origin2)) urls.push(u.slice(0, 110));
      });
      await web.goto(`${s.origin}/plain`, { waitUntil: 'domcontentloaded' });
      await web.waitForSelector('.ffb-ball-main', { timeout: 20000 });
      await H.openVocabPanel(web).catch(() => { });
      await web.waitForTimeout(1500);
      await web.close();
      const isExt = u => u.startsWith('chrome-extension://');
      const isAv = u => /kaspersky-labs\.com/i.test(u);   // 本機防毒對每頁注入，非擴充行為
      const other = urls.filter(u => !isExt(u) && !isAv(u));
      rec.pass('§5-4 無非預期外連（無 telemetry）', other.length === 0,
        `host ${JSON.stringify([...hosts])}／擴充自身資源 ${urls.filter(isExt).length} 筆／防毒注入 ${urls.filter(isAv).length} 筆`
        + `／其他外連 ${other.length} 筆${other.length ? '：' + JSON.stringify(other.slice(0, 5)) : ''}（**未含 AI API 請求，因為沒有 key**）`);
    } catch (e) { rec.fail('§5-4 無非預期外連（無 telemetry）', 'EXCEPTION ' + e.message); }

    // ── §6-1〜§6-4 SRS ──
    try {
      const today = new Date().toISOString();
      await H.seed(opt, {
        'en:due1': { id: 'en:due1', word: 'due1', count: 2, status: 'learning', createdAt: today, lastSeenAt: today, nextReviewAt: new Date(Date.now() - 864e5).toISOString() },
        'en:due2': { id: 'en:due2', word: 'due2', count: 1, status: 'learning', createdAt: today, lastSeenAt: today, nextReviewAt: new Date(Date.now() - 1728e5).toISOString() },
        'en:known1': { id: 'en:known1', word: 'known1', count: 1, status: 'known', createdAt: today, lastSeenAt: today, reviewedAt: today } });
      const web = await s.newPage('/plain');
      await H.openVocabPanel(web);
      const activeTab = await web.$eval('.g-vocab-tab.g-active', el => el.dataset.filter);
      const due = await web.$$eval('.g-vocab-panel-word', els => els.map(e => e.textContent.trim()));
      rec.pass('§6-1 預設「今日複習」＋到期排序',
        activeTab === 'review' && due.length > 0 && !due.includes('known1'),
        `預設分頁=${activeTab}／清單 ${JSON.stringify(due)}（已記得的不該在此）`);

      // 今日複習分頁的按鈕是 [data-vocab-review][data-review-status]，不是 [data-vocab-status]
      const clickReview = async status => {
        const sel = `[data-review-status="${status}"]`;
        if (!await web.locator(sel).count()) return null;
        const id = await web.locator(sel).first().getAttribute('data-vocab-review');
        await web.locator(sel).first().click();
        await web.waitForTimeout(1500);
        const it = (await H.send(opt, 'get', { id })).item;
        return { id, status: it?.status, days: it?.nextReviewAt ? Math.round((Date.parse(it.nextReviewAt) - Date.now()) / 864e5) : null };
      };
      const r7 = await clickReview('known');
      rec.pass('§6-2 點「記得」→ 已記得、約 7 天後',
        !!r7 && r7.status === 'known' && r7.days >= 6 && r7.days <= 8,
        r7 ? `${r7.id}：status=${r7.status}、距今 ${r7.days} 天（期望 7）` : '找不到「記得」鈕');
      const r1 = await clickReview('learning');
      rec.pass('§6-3 點「還不熟」→ 維持 learning、約 1 天後',
        !!r1 && r1.status === 'learning' && r1.days >= 0 && r1.days <= 2,
        r1 ? `${r1.id}：status=${r1.status}、距今 ${r1.days} 天（期望 1）` : '找不到「還不熟」鈕');

      await web.click('[data-filter="weak"]');
      await web.waitForTimeout(800);
      const weak = await web.$$eval('.g-vocab-panel-word', els => els.map(e => e.textContent.trim()));
      await s.shot(web, 'legacy-srs');
      await web.close();
      rec.pass('§6-4 錯題回看只有還不熟', !weak.includes('known1') && !weak.includes('due2'),
        `錯題回看 ${JSON.stringify(weak)}（已記得的不該出現）`);
    } catch (e) { rec.fail('§6-1〜§6-4 SRS', 'EXCEPTION ' + e.message); }

    // ── §6-5 匯出 JSON ＋ §6-8 清空後匯入救回 ──
    let exported = null;
    try {
      await H.openBackupTab(opt);
      const [dl] = await Promise.all([
        opt.waitForEvent('download', { timeout: 20000 }),
        opt.evaluate(() => document.getElementById('btnExportVocabulary').click()),
      ]);
      exported = path.join(tmp, dl.suggestedFilename());
      await dl.saveAs(exported);
      const parsed = JSON.parse(fs.readFileSync(exported, 'utf8'));
      rec.pass('§6-5 匯出 JSON', parsed.app === 'fan-fan-ba' && parsed.count > 0,
        `${dl.suggestedFilename()}：app=${parsed.app}、schema=${parsed.schema}、count=${parsed.count}`);
    } catch (e) { rec.fail('§6-5 匯出 JSON', 'EXCEPTION ' + e.message); }

    try {
      const before = (await H.listWords(opt)).length;
      await opt.evaluate(() => chrome.storage.local.clear());
      await opt.reload({ waitUntil: 'domcontentloaded' }); await opt.waitForTimeout(1000);
      await H.openBackupTab(opt);
      const emptied = (await H.listWords(opt)).length;
      const st = await H.importVocabFile(opt, exported);
      const restored = (await H.listWords(opt)).length;
      rec.partial('§6-8 清空 storage 後匯入救回',
        `${before} 筆 → 清空後 ${emptied} 筆 → 匯入「${st}」→ ${restored} 筆`
        + '（**以清空 storage 模擬，不是真正的移除擴充再重裝**）');
    } catch (e) { rec.fail('§6-8 清空 storage 後匯入救回', 'EXCEPTION ' + e.message); }

    // ── §6-9 __proto__ ＋ §6-10 >10MB ──
    try {
      const evil = path.join(tmp, 'evil-proto.json');
      fs.writeFileSync(evil, JSON.stringify({ app: 'fan-fan-ba', schema: 'vocabulary', version: 1, count: 2,
        items: { '__proto__': { id: '__proto__', word: 'polluted' }, 'en:good': { id: 'en:good', word: 'goodword' } } }), 'utf8');
      const st = await H.importVocabFile(opt, evil);
      const items = (await H.send(opt, 'list')).items;
      const polluted = await opt.evaluate(() => ({}).polluted !== undefined || Object.prototype.polluted !== undefined);
      rec.pass('§6-9 __proto__ 惡意 JSON 被忽略',
        !polluted && items.some(i => i.word === 'goodword') && !items.some(i => i.word === 'polluted'),
        `「${st}」／原型污染=${polluted}／goodword 有匯入=${items.some(i => i.word === 'goodword')}／polluted 未進=${!items.some(i => i.word === 'polluted')}`);
    } catch (e) { rec.fail('§6-9 __proto__ 惡意 JSON 被忽略', 'EXCEPTION ' + e.message); }

    try {
      const big = path.join(tmp, 'too-big.json');
      fs.writeFileSync(big, JSON.stringify({ app: 'fan-fan-ba', schema: 'vocabulary', version: 1, count: 1,
        items: { 'en:big': { id: 'en:big', word: 'big', definition: 'x'.repeat(11 * 1024 * 1024) } } }), 'utf8');
      const mb = (fs.statSync(big).size / 1024 / 1024).toFixed(1);
      const st = await H.importVocabFile(opt, big);
      rec.pass('§6-10 超過 10MB 擋下', /檔案太大/.test(st), `${mb}MB → 「${st}」`);
    } catch (e) { rec.fail('§6-10 超過 10MB 擋下', 'EXCEPTION ' + e.message); }

    // ── §7-3 綜合回歸 ──
    try {
      await opt.evaluate(([d]) => chrome.storage.local.set({ queryHistory: [
        { action: 'translate', text: 'merge', result: d, dictData: JSON.parse(d), ts: Date.now() }] }),
        [JSON.stringify({ word: 'merge', lang: 'en', definition: '合併', translations: ['合併'] })]);
      await H.seed(opt, { 'en:merge': { id: 'en:merge', word: 'merge', count: 1, status: 'learning', lastSeenAt: new Date().toISOString() } });
      await opt.evaluate(() => chrome.storage.sync.remove('vocabularyHighlightMode'));
      const web = await s.newPage('/plain', { width: 1280, height: 900 });
      await H.openLibrary(web);
      let pinned = 'n/a';
      if (await web.locator('#gemini-result-card .g-pin').count()) {
        await web.locator('#gemini-result-card .g-pin').first().click();
        await web.waitForTimeout(500);
        pinned = await web.$eval('#gemini-result-card', el => el.className);
      }
      await web.click('[data-library-action="history"]');
      await web.waitForTimeout(800);
      const hist = await web.locator('.g-floating-history-item').count();
      await H.openVocabPanel(web).catch(() => { });
      const rows = await web.locator('.g-vocab-panel-item').count();
      await H.expandBall(web);
      await H.clickStable(web, '[data-action="vocab-highlight"]');
      await web.waitForTimeout(2500);
      const marks = await web.locator('mark.g-vocab-highlight').count();
      await s.shot(web, 'legacy-regression');
      await web.close();
      rec.pass('§7-3 釘住／最近查詢／單字本／高亮',
        /pinned/.test(String(pinned)) && hist > 0 && rows > 0 && marks > 0,
        `釘住後 class「${pinned}」／最近查詢 ${hist} 筆／單字本 ${rows} 列／高亮 ${marks} 個`);
    } catch (e) { rec.fail('§7-3 釘住／最近查詢／單字本／高亮', 'EXCEPTION ' + e.message); }

    // ── §7-4 設定匯出／匯入 ──
    try {
      await H.openBackupTab(opt);
      const [dl] = await Promise.all([
        opt.waitForEvent('download', { timeout: 20000 }),
        opt.evaluate(() => document.getElementById('btnExportSettings').click()),
      ]);
      const p = path.join(tmp, dl.suggestedFilename());
      await dl.saveAs(p);
      const keys = Object.keys(JSON.parse(fs.readFileSync(p, 'utf8'))).length;
      await opt.setInputFiles('#settingsImportFile', p);
      await opt.waitForTimeout(2000);
      const feedback = await opt.evaluate(() => /設定檔已匯入|匯入/.test(document.body.innerText));
      rec.partial('§7-4 設定匯出／匯入',
        `匯出 ${dl.suggestedFilename()}（${keys} 個鍵）→ 重新匯入有回饋=${feedback}`
        + '（**Cloud Sync 登入同步需 Google 帳號、hover 設定未逐欄核對，未涵蓋**）');
    } catch (e) { rec.fail('§7-4 設定匯出／匯入', 'EXCEPTION ' + e.message); }

    // 收尾
    await H.seed(opt, { 'en:merge': { id: 'en:merge', word: 'merge', count: 1, status: 'learning', lastSeenAt: new Date().toISOString() } });
    await opt.evaluate(() => chrome.storage.sync.remove(['vocabularyHighlightMode', 'groqApiKey']));
  },
};
