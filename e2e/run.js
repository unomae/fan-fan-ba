#!/usr/bin/env node
// fan-fan-ba e2e 執行器
//   node e2e/run.js                 # 跑全部 suite
//   node e2e/run.js vocab-import    # 只跑指定 suite（可多個）
//   node e2e/run.js --list
// 設定見 e2e/README.md；FFB_E2E_PROFILE 必填。
const path = require('path');
const fs = require('fs');
const H = require('./lib/harness');

const SUITES = ['vocab-import', 'ui-panels', 'hostile-data', 'legacy-regression'];

async function makeSession(cfg, pages) {
  const s = {
    cfg,
    artifacts: cfg.artifacts,
    origin: `http://127.0.0.1:${cfg.port}`,
    origin2: `http://127.0.0.1:${cfg.port + 1}`,
    optionsUrl: `chrome-extension://${cfg.extId}/options.html`,
  };

  s.openOptions = async () => {
    s.opt = await s.ctx.newPage();
    await s.opt.goto(s.optionsUrl, { waitUntil: 'domcontentloaded' });
    await s.opt.waitForTimeout(800);
    return s.opt;
  };
  s.closeOptions = async () => { if (s.opt && !s.opt.isClosed()) await s.opt.close(); s.opt = null; };

  s.boot = async () => {
    s.ctx = await H.launch(cfg);
    await s.openOptions();
    return s;
  };
  // 重啟瀏覽器＝重置 service worker 的記憶體狀態（例如 snapshotCheckedAt），
  // 某些案子沒有這一步就會拿到假 FAIL
  s.relaunch = async () => {
    await s.ctx.close();
    await new Promise(r => setTimeout(r, 1200));
    return s.boot();
  };

  s.newPage = async (route, viewport) => {
    const page = await s.ctx.newPage();
    if (viewport) await page.setViewportSize(viewport);
    await page.goto(`${s.origin}${route}`, { waitUntil: route === '/frames' ? 'load' : 'domcontentloaded' });
    return page;
  };
  s.shot = async (page, name) => {
    fs.mkdirSync(cfg.artifacts, { recursive: true });
    await page.screenshot({ path: path.join(cfg.artifacts, `${name}.png`) }).catch(() => { });
  };
  s.pages = pages;
  return s;
}

(async () => {
  const args = process.argv.slice(2);
  if (args.includes('--list')) { console.log(SUITES.join('\n')); return; }
  const wanted = args.filter(a => !a.startsWith('-'));
  const selected = wanted.length ? wanted : SUITES;
  const unknown = selected.filter(n => !SUITES.includes(n));
  if (unknown.length) { console.error(`未知的 suite：${unknown.join(', ')}\n可用：${SUITES.join(', ')}`); process.exit(2); }

  const cfg = H.loadConfig();
  const pages = H.buildPages(cfg.port + 1);
  const s1 = H.serve(cfg.port, pages);
  const s2 = H.serve(cfg.port + 1, pages);
  const rec = H.createRecorder();
  const session = await makeSession(cfg, pages);
  await session.boot();

  console.log(`profile=${cfg.profile}\nchannel=${cfg.channel}  ext=${cfg.extId}  fixture=${session.origin}\n`);
  let crashed = null;
  try {
    for (const name of selected) {
      const suite = require(`./suites/${name}`);
      console.log(`── ${suite.name}：${suite.description} ──`);
      await suite.run(session, rec);
      console.log('');
    }
  } catch (e) {
    crashed = e;
    console.error('RUNNER ERROR:', e.message);
  } finally {
    if (session.ctx) await session.ctx.close().catch(() => { });
    s1.close(); s2.close();
  }

  const pass = rec.rows.filter(r => r.ok === true).length;
  const fail = rec.rows.filter(r => r.ok === false).length;
  const part = rec.rows.filter(r => r.ok === 'partial').length;
  console.log('════ 總結 ════');
  console.log(`${pass} PASS / ${fail} FAIL / ${part} PARTIAL（共 ${rec.rows.length} 案）`);
  rec.rows.filter(r => r.ok !== true).forEach(r => console.log(`  ${r.ok === false ? '❌' : '🟡'} ${r.id}`));
  console.log(`產物：${cfg.artifacts}`);
  process.exit(crashed || fail ? 1 : 0);
})();
