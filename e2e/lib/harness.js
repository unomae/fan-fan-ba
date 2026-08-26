// e2e 共用骨架：設定解析、瀏覽器啟動、fixture 站、常用 UI 操作、結果記錄。
// 設計前提（讀 e2e/README.md 有完整說明）：
// - 優先路徑：FFB_E2E_EXECUTABLE 指向 Chrome for Testing → --load-extension 自動安裝，免人工前置。
// - 備援路徑：品牌版 Chrome + 「已經手動載入未封裝擴充」的拋棄式 profile（Chrome 137 封鎖
//   --load-extension、133 起 unpacked 綁開發人員模式開關，自動化重啟會把擴充停用／移除）。
// - 用 playwright-core，不下載瀏覽器。
// - 測試會改寫該 profile 的擴充資料，**只能指向拋棄式 profile**，絕不可指向日常瀏覽器。
const { chromium } = require('playwright-core');
const http = require('http');
const path = require('path');
const fs = require('fs');

const DEFAULT_EXT_ID = 'cegcbfkgfobpoiaobdedldlabbddbghk';

function loadConfig() {
  const profile = process.env.FFB_E2E_PROFILE;
  if (!profile) {
    throw new Error(
      'FFB_E2E_PROFILE 未設定。這支 e2e 需要一個「已用『載入未封裝項目』裝好 dist/pkg」的拋棄式 Chrome profile；\n'
      + '  例：FFB_E2E_PROFILE="C:\\tmp\\ffb-qa\\p2" npm run e2e\n'
      + '  前置步驟見 e2e/README.md。絕對不要指向你日常在用的 profile。');
  }
  if (!fs.existsSync(profile)) throw new Error(`FFB_E2E_PROFILE 指到不存在的路徑：${profile}`);
  const executable = process.env.FFB_E2E_EXECUTABLE;
  if (executable && !fs.existsSync(executable)) throw new Error(`FFB_E2E_EXECUTABLE 指到不存在的路徑：${executable}`);
  return {
    profile,
    extId: process.env.FFB_E2E_EXT_ID || DEFAULT_EXT_ID,
    channel: process.env.FFB_E2E_CHANNEL || 'chrome',
    executable,
    port: Number(process.env.FFB_E2E_PORT || 4801),
    artifacts: process.env.FFB_E2E_ARTIFACTS || path.join(__dirname, '..', '.artifacts'),
  };
}

// ── fixture 頁 ──────────────────────────────────────────────
const ARTICLE = `<p id="p1">Machine translation quality depends on context and domain knowledge.</p>
<p id="p2">The merge strategy decides which device wins when two clients disagree about progress.</p>
<p id="p3">A snapshot is the last rescue rope when a user deletes the whole vocabulary by accident.</p>`;

function buildPages(port2) {
  return {
    '/plain': `<h1>Plain article</h1>${ARTICLE}`,
    '/frames': `<h1>Frames host</h1>${ARTICLE}
      <iframe id="same" src="http://127.0.0.1:${port2 - 1}/plain" width="320" height="140"></iframe>
      <iframe id="cross" src="http://127.0.0.1:${port2}/plain" width="320" height="140"></iframe>`,
    '/shadow': `<h1>Shadow host page</h1>${ARTICLE}
      <div id="host"></div>
      <script>
        const r = document.getElementById('host').attachShadow({mode:'open'});
        r.innerHTML = '<p>Shadow paragraph one about translation.</p>' +
                      '<p>Shadow paragraph two about vocabulary.</p>' +
                      '<p>Shadow paragraph three about snapshots.</p>';
      <\/script>`,
    '/shadow-controls': `<h1>Controls only</h1>${ARTICLE}
      <div id="host"></div>
      <script>
        const r = document.getElementById('host').attachShadow({mode:'open'});
        r.innerHTML = '<button>OK</button><button>Cancel</button><input type="text">';
      <\/script>`,
    // 跨來源 http iframe 會被判 ready（走 frame-script bridge），
    // data: iframe 才會被判 blocked ——「N 個讀不到」那條要靠它才驗得到
    '/embeds': `<h1>Embeds page</h1>${ARTICLE}
      <iframe src="http://127.0.0.1:${port2}/plain" width="300" height="120"></iframe>
      <iframe src="data:text/html,<p>unreachable</p>" width="200" height="80"></iframe>
      <svg width="220" height="80"><text x="8" y="24">Chart label alpha</text>
        <text x="8" y="48">Chart label beta</text></svg>`,
    '/highlight': `<h1>Highlight page</h1>
      <p>The merge strategy and the snapshot rope are both important for word0001 and word0002.</p>
      <form><label>merge <input type="text" value="snapshot"></label>
        <button type="button">word0001</button></form>
      <pre><code>const merge = require('snapshot'); // word0002</code></pre>`,
  };
}

function serve(port, pages) {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>ffb e2e</title>${pages[req.url] || pages['/plain']}`);
  }).listen(port, '127.0.0.1');
}

// ── 單字本資料層（一律經 VOCABULARY_STORE 訊息，與 production 同一條路）──
const send = (page, action, extra = {}) =>
  page.evaluate(([a, e]) => chrome.runtime.sendMessage({ type: 'VOCABULARY_STORE', action: a, ...e }), [action, extra]);
// seed 一律 snapshot:false：造狀態不該燒掉 24 小時一次的快照輪替額度
const seed = (page, items) => send(page, 'replaceAll', { items, snapshot: false });
const listWords = async page => (await send(page, 'list')).items.map(i => i.word);
const snapshots = async page => (await send(page, 'snapshots')).snapshots;

// ── UI 操作 ────────────────────────────────────────────────
// 浮球選單有展開動畫，Playwright 的 actionability 會卡在「element is not stable」直到逾時。
// 這裡等元素可見＋讓動畫跑完，再用 force 點——語意仍是點那顆真按鈕，只是不等它靜止。
async function clickStable(page, selector, settleMs = 450) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 20000 });
  await page.waitForTimeout(settleMs);
  await page.click(selector, { force: true });
}
async function expandBall(page) {
  await page.waitForSelector('.ffb-ball-main', { timeout: 20000 });
  await clickStable(page, '.ffb-ball-main', 250);
  await page.waitForSelector('[data-action="library"]', { state: 'visible', timeout: 10000 });
}
async function openLibrary(page) {
  await expandBall(page);
  await clickStable(page, '[data-action="library"]');
  await page.waitForSelector('#gemini-result-card.g-show', { timeout: 10000 });
  await page.waitForTimeout(400);
}
// 一律走「浮球 → 收藏/紀錄 → 單字本」：樂觀直點 vocabulary 會空等到逾時
async function openVocabPanel(page) {
  await openLibrary(page);
  await clickStable(page, '[data-library-action="vocabulary"]', 250);
  await page.waitForSelector('.g-vocab-panel-list', { timeout: 30000 });
  await page.waitForTimeout(500);
}
// options 是分頁版面；#vocabularyBackupStatus 沒字時零尺寸會被判 hidden，
// 所以用按鈕當就緒訊號
async function openOptionsPanel(page, panel) {
  await page.evaluate(p => document.querySelector(`[data-panel="${p}"]`).click(), panel);
  await page.waitForTimeout(500);
}
async function openBackupTab(page) {
  await openOptionsPanel(page, 'backup');
  await page.waitForSelector('#btnImportVocabulary', { state: 'visible', timeout: 10000 });
}
// 匯入前先清空狀態列再等非空：連續兩案的成功訊息可能字字相同，
// 用「文字有沒有變」當完成訊號會永遠等不到
async function importVocabFile(page, filePath) {
  await page.evaluate(() => { document.getElementById('vocabularyBackupStatus').textContent = ''; });
  await page.setInputFiles('#vocabularyImportFile', filePath);
  await page.waitForFunction(
    () => document.getElementById('vocabularyBackupStatus').textContent.trim() !== '',
    null, { timeout: 20000 });
  return (await page.locator('#vocabularyBackupStatus').innerText()).trim();
}

const isoHoursAgo = h => new Date(Date.now() - h * 36e5).toISOString();

// ── 結果記錄 ────────────────────────────────────────────────
function createRecorder() {
  const rows = [];
  return {
    rows,
    pass: (id, ok, detail) => { rows.push({ id, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`); },
    partial: (id, detail) => { rows.push({ id, ok: 'partial', detail }); console.log(`PART ${id} — ${detail}`); },
    fail: (id, detail) => { rows.push({ id, ok: false, detail }); console.log(`FAIL ${id} — ${detail}`); },
  };
}

async function launch(cfg) {
  const extDir = path.join(__dirname, '..', '..', 'dist', 'pkg');
  // FFB_E2E_EXECUTABLE（建議指向 Chrome for Testing）：用 --load-extension 自動安裝，
  // 免人工前置。品牌版 Chrome 137 起封鎖 --load-extension、133 起 unpacked 擴充只在
  // 開發人員模式開啟時啟用（自動化重啟會把擴充停用／移除），所以品牌版 Chrome
  // 只能走「手動載入未封裝」的舊路。
  const launchOpts = cfg.executable
    ? {
        executablePath: cfg.executable,
        headless: false,
        args: ['--no-first-run', `--load-extension=${extDir}`, `--disable-extensions-except=${extDir}`],
      }
    : {
        channel: cfg.channel,
        headless: false, // MV3 擴充在 headless 下不載入
        // Playwright 預設會關擴充，逐項丟掉才載得起 profile 內已安裝的未封裝擴充
        ignoreDefaultArgs: ['--disable-extensions', '--disable-component-extensions-with-background-pages'],
        args: ['--no-first-run'],
      };
  const ctx = await chromium.launchPersistentContext(cfg.profile, launchOpts);
  // 先確認擴充真的裝在這個 profile，否則後面每案都會以難懂的方式失敗。
  // 判準用「options 頁載得起來、讀得到 manifest」——**不要用 service worker 是否存在**：
  // MV3 背景閒置就會停，剛啟動時常常還沒醒，會誤判成沒安裝（開發時踩過）。
  const probe = await ctx.newPage();
  let version = null;
  try {
    await probe.goto(`chrome-extension://${cfg.extId}/options.html`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    version = await probe.evaluate(() => chrome.runtime?.getManifest?.().version || null);
  } catch { /* 下面統一報錯 */ }
  await probe.close().catch(() => { });
  if (!version) {
    await ctx.close();
    throw new Error(
      `profile「${cfg.profile}」裡讀不到擴充 ${cfg.extId}。\n`
      + '  多半是：該 profile 沒裝過這顆擴充、或裝的是別的路徑／別的 ID。\n'
      + '  請照 e2e/README.md 用「載入未封裝項目」指向 dist/pkg 裝一次（--load-extension 在 Chrome 151 會被靜默忽略）。');
  }
  cfg.detectedVersion = version;
  return ctx;
}

module.exports = {
  loadConfig, buildPages, serve, launch, createRecorder,
  send, seed, listWords, snapshots,
  clickStable, expandBall, openLibrary, openVocabPanel, openOptionsPanel, openBackupTab, importVocabFile,
  isoHoursAgo, DEFAULT_EXT_ID,
};
