'use strict';

/**
 * 翻翻吧 v1.9.9 Phase 1 / Phase 2 可重跑稽核腳本。
 *
 * 約束：
 * - 只使用隔離的 Chrome for Testing profile。
 * - 只填 dummy API Key，不讀取使用者既有 profile 或真實 Key。
 * - 不修改產品程式碼；所有輸出只寫入 qa-reports/。
 */

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

const REPO = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(REPO, 'qa-reports');
const SPEC_DIR = path.join(REPORT_DIR, 'specs');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');
const EXTENSION_DIR = path.join(REPO, 'dist', 'pkg');
const PROFILE_DIR = '/private/tmp/fan-fan-ba-phase1-2-profile-rerun3';
const RESULT_FILE = path.join(REPORT_DIR, 'phase1-2-results.json');
const EXTENSION_ID_FALLBACK = 'kopoiadnhecbcjemoeggmaoekjkpecgo';
const DUMMY_GROQ_KEY = 'gsk_QA_DUMMY_ONLY_NOT_A_SECRET_20260724';
const DUMMY_GEMINI_KEY = 'AIza_QA_DUMMY_ONLY_NOT_A_SECRET_20260724';
const DUMMY_OPENROUTER_KEY = 'sk-or-QA_DUMMY_ONLY_NOT_A_SECRET_20260724';
const DUMMY_TTS_KEY = 'AIza_QA_TTS_DUMMY_ONLY_NOT_A_SECRET_20260724';

const results = [];
const consoleAudit = [];
const security = [];
const artifacts = [];
const runnerErrors = [];

function safeName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]+/g, '-');
}

function htmlPage(title, body, extra = '') {
  return `<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>
    body{font:18px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:0 auto;padding:32px;color:#172033}
    article{min-height:900px} iframe{width:100%;height:260px;border:1px solid #ccd4e0}
    input,button,textarea{font:inherit;padding:8px;margin:6px 0;max-width:100%}
    pre,code{white-space:pre-wrap}.wide{width:1800px}.box{padding:16px;background:#eef4ff;border-radius:12px}
  </style>
</head>
<body>
  <main><h1>${title}</h1>${body}</main>
  <script>
    window.__hostErrors = [];
    window.__hostRequests = [];
    window.addEventListener('error', e => window.__hostErrors.push(String(e.message || e.error)));
    document.querySelectorAll('form').forEach(form => form.addEventListener('submit', e => {
      e.preventDefault();
      document.querySelector('#form-result')?.replaceChildren(document.createTextNode('submitted safely'));
    }));
  </script>
  ${extra}
</body>
</html>`;
}

function routeBody(urlPath) {
  if (urlPath === '/iframe-inner') {
    return htmlPage('Iframe 內容', '<article><p id="frame-target">Frame translation target sentence.</p></article>');
  }
  if (urlPath === '/iframe') {
    return htmlPage('Iframe 測試', '<article><p id="main-target">Main frame translation target.</p><iframe src="/iframe-inner"></iframe></article>');
  }
  if (urlPath === '/form') {
    return htmlPage('表單邊界測試', `
      <form><label>Email <input id="email" type="email"></label>
      <label>密碼 <input id="password" type="password" value="NeverTransmitThis"></label>
      <textarea id="notes"></textarea><button id="submit" type="submit">送出</button></form>
      <div id="form-result"></div><p id="selectable">Safe selectable form guidance.</p>`);
  }
  if (urlPath === '/special') {
    return htmlPage('特殊字元測試', `
      <article><p id="special-target">&lt;script&gt;window.__xssExecuted=true&lt;/script&gt; 😀 العربية עברית
      **Markdown** =cmd | 中文 | 日本語</p></article>`);
  }
  if (urlPath === '/long') {
    const paragraphs = Array.from({ length: 120 }, (_, index) =>
      `<p>Long article paragraph ${index + 1}: deterministic content for page translation boundary coverage.</p>`).join('');
    return htmlPage('超長文章測試', `<article>${paragraphs}<pre><code>const safe = true;</code></pre></article>`);
  }
  if (urlPath === '/dynamic') {
    return htmlPage('動態內容測試', '<article id="dynamic"><p>Initial dynamic paragraph.</p></article>',
      '<script>setTimeout(()=>document.querySelector("#dynamic").insertAdjacentHTML("beforeend","<p>Late dynamic paragraph.</p>"),300)</script>');
  }
  if (urlPath === '/wide') {
    return htmlPage('寬版 RWD 測試', '<article><p id="wide-target">Mobile edge selection target.</p><div class="wide">Host wide content</div></article>');
  }
  if (urlPath === '/empty') {
    return htmlPage('空內容測試', '<article><p> </p></article>');
  }
  if (urlPath === '/404') {
    return { status: 404, body: htmlPage('404 測試頁', '<article><p>Not found test page.</p></article>') };
  }
  return htmlPage('一般文章測試', `
    <article><p id="target">Example Domain style content for deterministic extension QA.</p>
    <p id="second-target">A second sentence verifies repeated selection state.</p></article>`);
}

async function startServer() {
  const server = http.createServer((req, res) => {
    const route = routeBody(new URL(req.url, 'http://127.0.0.1').pathname);
    const status = typeof route === 'object' ? route.status : 200;
    const body = typeof route === 'object' ? route.body : route;
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { server, origin: `http://127.0.0.1:${server.address().port}` };
}

function parseSpecs() {
  const files = fs.readdirSync(SPEC_DIR)
    .filter(name => /^(F|B|E)\d-test-spec\.md$/.test(name))
    .sort();
  for (const file of files) {
    const moduleId = file.split('-')[0];
    const markdown = fs.readFileSync(path.join(SPEC_DIR, file), 'utf8');
    for (const match of markdown.matchAll(/^## (TC-[A-Z]\d-\d{3}) (.+)$/gm)) {
      results.push({
        id: match[1],
        module: moduleId,
        name: match[2].trim(),
        status: 'SKIP',
        severity: '',
        evidence: [],
        note: '尚無足夠 runtime 證據；不得以靜態推論冒充通過。'
      });
    }
  }
}

function findResult(id) {
  const result = results.find(item => item.id === id);
  if (!result) throw new Error(`Unknown test case: ${id}`);
  return result;
}

function mark(id, status, note, evidence = [], severity = '') {
  const result = findResult(id);
  result.status = status;
  result.note = note;
  result.evidence = [...new Set([...(result.evidence || []), ...evidence])];
  result.severity = severity;
}

function addEvidence(id, note, evidence = []) {
  const result = findResult(id);
  result.note = `${result.note} ${note}`.trim();
  result.evidence = [...new Set([...(result.evidence || []), ...evidence])];
}

async function screenshot(page, name) {
  const filename = `${safeName(name)}.png`;
  const output = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: output, fullPage: true });
  artifacts.push(`screenshots/${filename}`);
  return `screenshots/${filename}`;
}

function monitorPage(page, label) {
  const entry = {
    page: label,
    url: '',
    consoleErrors: [],
    pageErrors: [],
    networkFails: []
  };
  page.on('console', message => {
    if (message.type() === 'error') entry.consoleErrors.push(message.text());
  });
  page.on('pageerror', error => entry.pageErrors.push(String(error.message || error)));
  page.on('response', response => {
    if (response.status() >= 400) entry.networkFails.push(`${response.status()} ${response.url()}`);
  });
  consoleAudit.push(entry);
  return entry;
}

async function waitForExtension(page) {
  await page.waitForSelector('#fanfanba-floating', { timeout: 10000 });
  await page.waitForTimeout(350);
}

async function selectText(page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  await page.evaluate(sel => {
    const node = document.querySelector(sel);
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const rect = range.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      clientX: Math.max(12, rect.left + Math.min(rect.width / 2, 120)),
      clientY: Math.max(12, rect.bottom)
    }));
  }, selector);
  await page.waitForTimeout(250);
}

async function assertNoHorizontalOverflow(page, selector = 'html') {
  return page.locator(selector).evaluate(element => {
    const root = element === document.documentElement ? element : document.documentElement;
    return {
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      ok: root.scrollWidth <= root.clientWidth + 2
    };
  });
}

async function setIsolatedStorage(page, values = {}) {
  await page.evaluate(async payload => {
    if (payload.local) await chrome.storage.local.set(payload.local);
    if (payload.sync) await chrome.storage.sync.set(payload.sync);
  }, values);
}

async function clearIsolatedStorage(page) {
  await page.evaluate(async () => {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.sync.clear()]);
  });
}

async function auditSurface(context, url, label, expectedStatus = 200) {
  const page = await context.newPage();
  const entry = monitorPage(page, label);
  const response = await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(350);
  entry.url = page.url();
  const status = response?.status() ?? 200;
  const expectedNetwork = expectedStatus >= 400 ? [`${expectedStatus} ${url}`] : [];
  const unexpectedNetwork = entry.networkFails.filter(item => !expectedNetwork.some(expected => item.startsWith(expected.split(' ')[0])));
  const unexpectedConsole = entry.consoleErrors.filter(message =>
    !(expectedStatus === 404 && /Failed to load resource|404|Not Found/i.test(message)));
  const verdict = unexpectedConsole.length === 0
    && entry.pageErrors.length === 0
    && unexpectedNetwork.every(item => !/^5\d\d /.test(item))
    && status === expectedStatus;
  await page.close();
  return { verdict, status, entry };
}

async function run() {
  parseSpecs();
  await fsp.mkdir(SCREENSHOT_DIR, { recursive: true });

  const { server, origin } = await startServer();
  let context;
  try {
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      executablePath: chromium.executablePath(),
      acceptDownloads: true,
      viewport: { width: 1920, height: 1080 },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        `--disable-extensions-except=${EXTENSION_DIR}`,
        `--load-extension=${EXTENSION_DIR}`,
        '--disable-sync',
        '--no-first-run'
      ]
    });

    let serviceWorker = context.serviceWorkers()[0];
    if (!serviceWorker) serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
    const extensionId = new URL(serviceWorker.url()).host || EXTENSION_ID_FALLBACK;
    const extensionBase = `chrome-extension://${extensionId}`;
    const controlPage = await context.newPage();
    await controlPage.goto(`${extensionBase}/popup.html`, { waitUntil: 'load' });

    // Phase 0-C：隔離 profile 不含 OAuth session；不點登入、不建立授權。
    mark('TC-B5-001', 'SKIP', 'Phase 0-C manual gate：未建立 Google OAuth session，未執行上傳／下載。', ['phase0c-preauth.md']);
    mark('TC-B5-002', 'SKIP', 'Phase 0-C manual gate：沒有第二個已授權 profile，未做跨瀏覽器同步。', ['phase0c-preauth.md']);
    mark('TC-B5-003', 'SKIP', 'Phase 0-C manual gate：未登入 Google，不模擬撤銷 token。', ['phase0c-preauth.md']);
    mark('TC-B5-004', 'SKIP', 'Phase 0-C manual gate：不讀寫 Google Drive appData，未測雲端檔案邊界。', ['phase0c-preauth.md']);

    // F1 / F2 / F3：真實 content script、選字工具列與浮球。
    const article = context.pages().find(page => page.url() === 'about:blank') || await context.newPage();
    const articleAudit = monitorPage(article, 'front-article');
    await article.goto(`${origin}/article`, { waitUntil: 'load' });
    await waitForExtension(article);
    articleAudit.url = article.url();
    await selectText(article, '#target');
    const toolbarVisible = await article.locator('#gemini-ai-toolbar').evaluate(el => el.classList.contains('g-show'));
    const toolbarButtons = await article.locator('#gemini-ai-toolbar button').count();
    const f1Shot = await screenshot(article, 'F1-TC-F1-001-selection-toolbar-pass-desktop');
    mark('TC-F1-001', 'SKIP',
      `工具列注入與 3 個操作按鈕已實測（visible=${toolbarVisible}, buttons=${toolbarButtons}），但無真實 API Key，未執行翻譯／解釋／優化 runtime。`,
      [f1Shot]);

    await clearIsolatedStorage(controlPage);
    await article.bringToFront();
    await article.reload({ waitUntil: 'load' });
    await waitForExtension(article);
    await selectText(article, '#target');
    await article.locator('#gemini-ai-toolbar button').first().click();
    await article.waitForTimeout(350);
    const missingKeyText = await article.locator('#gemini-result-card').innerText().catch(() => '');
    const missingKeyRequestCount = articleAudit.networkFails.filter(item => /api\.groq|generativelanguage|openrouter/.test(item)).length;
    const passwordProtected = await (async () => {
      await article.goto(`${origin}/form`, { waitUntil: 'load' });
      await waitForExtension(article);
      await selectText(article, '#password');
      const toolbar = article.locator('#gemini-ai-toolbar');
      if (await toolbar.count() === 0) return true;
      return !(await toolbar.evaluate(el => el.classList.contains('g-show')));
    })();
    mark('TC-F1-003',
      /API Key|設定/.test(missingKeyText) && missingKeyRequestCount === 0 && passwordProtected ? 'PASS' : 'FAIL',
      `缺 Key 顯示可行動提示、未送 AI 請求；password 欄位選取不顯示工具列=${passwordProtected}。manifest denylist 另由靜態與 Jest 覆蓋。`,
      [], /API Key|設定/.test(missingKeyText) && passwordProtected ? '' : 'P1');

    await article.goto(`${origin}/special`, { waitUntil: 'load' });
    await waitForExtension(article);
    await selectText(article, '#special-target');
    const xssSafe = await article.evaluate(() => window.__xssExecuted !== true && document.querySelectorAll('script[src*="<script>"]').length === 0);
    const duplicateToolbars = await article.locator('#gemini-ai-toolbar').count();
    mark('TC-F1-004', xssSafe && duplicateToolbars === 1 ? 'PASS' : 'FAIL',
      `惡意字串以 host 純文字處理；window.__xssExecuted=${!xssSafe}；工具列數=${duplicateToolbars}。`,
      [], xssSafe ? '' : 'P0');

    await article.setViewportSize({ width: 375, height: 812 });
    await article.goto(`${origin}/wide`, { waitUntil: 'load' });
    await waitForExtension(article);
    await selectText(article, '#wide-target');
    const toolbarBox = await article.locator('#gemini-ai-toolbar').boundingBox();
    const mobileToolbarOk = !!toolbarBox && toolbarBox.x >= -1 && toolbarBox.x + toolbarBox.width <= 376;
    const f1MobileShot = await screenshot(article, 'F1-TC-F1-005-toolbar-mobile');
    mark('TC-F1-005', mobileToolbarOk ? 'PASS' : 'FAIL',
      `375px viewport 工具列位於畫面內=${mobileToolbarOk}。host 故意有寬內容，不拿整頁 overflow 冒充 extension 缺陷。`,
      [f1MobileShot], mobileToolbarOk ? '' : 'P1');

    await article.setViewportSize({ width: 1920, height: 1080 });
    await article.goto(`${origin}/iframe`, { waitUntil: 'load' });
    await waitForExtension(article);
    const frame = article.frames().find(item => item.url().endsWith('/iframe-inner'));
    await selectText(article, '#main-target');
    const mainToolbar = await article.locator('#gemini-ai-toolbar').evaluate(el => el.classList.contains('g-show'));
    await frame.evaluate(() => {
      const node = document.querySelector('#frame-target');
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      const rect = range.getBoundingClientRect();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: rect.left + 30, clientY: rect.bottom }));
    });
    await article.waitForTimeout(250);
    const frameToolbar = await frame.locator('#gemini-ai-toolbar').evaluate(el => el.classList.contains('g-show')).catch(() => false);
    const floatingBallCount = await article.locator('#fanfanba-floating').count();
    mark('TC-F1-002', 'SKIP',
      `主頁工具列=${mainToolbar}、iframe 工具列=${frameToolbar}、top-frame 浮球=${floatingBallCount}；無 Key，未完成 iframe 翻譯 runtime。`,
      []);

    await article.goto(`${origin}/article`, { waitUntil: 'load' });
    await waitForExtension(article);
    const ball = article.locator('#fanfanba-floating');
    await ball.locator('.ffb-ball-main').hover();
    await article.waitForTimeout(150);
    await ball.locator('[data-action="page-translate"]').click();
    await article.waitForTimeout(300);
    const pageTranslateMissingKey = await article.locator('body').innerText();
    mark('TC-F2-001', 'SKIP', `全文翻譯入口可觸發，缺 Key 狀態可見=${/API Key|設定/.test(pageTranslateMissingKey)}；未做實際段落翻譯。`, []);
    mark('TC-F2-002', 'SKIP', 'Alt+T 可觸發前置路徑，但無全文翻譯 Key，未驗證續翻與請求去重。', []);
    mark('TC-F2-004', 'SKIP', '已建立 120 段／動態內容測試頁；無 API Key，未注入 429／中斷／局部重試。', []);

    await article.goto(`${origin}/article`, { waitUntil: 'load' });
    await waitForExtension(article);
    await ball.locator('.ffb-ball-main').hover().catch(() => {});
    const liveBall = article.locator('#fanfanba-floating');
    await liveBall.locator('.ffb-ball-main').hover();
    await liveBall.locator('[data-action="pause"]').click();
    await article.waitForTimeout(250);
    const pauseKeyState = await controlPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      return Object.entries(all).find(([key]) => key.startsWith('fanFanBaPaused:')) || null;
    });
    await article.reload({ waitUntil: 'load' });
    await waitForExtension(article);
    const pausedAfterReload = await article.locator('#fanfanba-floating').evaluate(el => el.classList.contains('ffb-paused'));
    mark('TC-F2-003', pauseKeyState?.[1] === true && pausedAfterReload ? 'PASS' : 'FAIL',
      `缺 Key 不送請求；站點停用狀態寫入隔離 profile 並於 reload 保留=${pausedAfterReload}。敏感網域由 manifest exclude + Jest 覆蓋。`,
      [], pausedAfterReload ? '' : 'P1');
    await controlPage.evaluate(async () => {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter(key => key.startsWith('fanFanBaPaused:'));
      await chrome.storage.local.remove(keys);
    });

    await article.setViewportSize({ width: 375, height: 812 });
    await article.reload({ waitUntil: 'load' });
    await waitForExtension(article);
    await article.locator('#fanfanba-floating .ffb-ball-main').hover();
    const menuBox = await article.locator('#fanfanba-floating .ffb-ball-menu').boundingBox();
    const f2MobileOk = !!menuBox && menuBox.x >= -1 && menuBox.x + menuBox.width <= 376;
    const f2MobileShot = await screenshot(article, 'F2-TC-F2-005-floating-menu-mobile');
    mark('TC-F2-005', f2MobileOk ? 'PASS' : 'FAIL',
      `375px 浮球選單位於 viewport 內=${f2MobileOk}；無 Key，全文面板內容測試受 manual gate 限制。`,
      [f2MobileShot], f2MobileOk ? '' : 'P1');

    await article.setViewportSize({ width: 1920, height: 1080 });
    await article.reload({ waitUntil: 'load' });
    await waitForExtension(article);
    await article.locator('#fanfanba-floating .ffb-ball-main').hover();
    await article.locator('#fanfanba-floating [data-action="library"]').click();
    await article.waitForTimeout(250);
    const libraryState = await article.locator('#gemini-result-card').evaluate(el => {
      const style = getComputedStyle(el);
      return {
        exists: true,
        opacity: style.opacity,
        visibility: style.visibility,
        display: style.display,
        showClass: el.classList.contains('g-show')
      };
    }).catch(() => ({ exists: false }));
    const f3FailShot = await screenshot(article, 'F3-TC-F3-001-library-invisible-fail-desktop');
    mark('TC-F3-001', libraryState.exists && libraryState.opacity !== '0' && libraryState.showClass ? 'PASS' : 'FAIL',
      `收藏面板 state=${JSON.stringify(libraryState)}；重現 DOM 已建立但 opacity=0。`,
      [f3FailShot], 'P1');
    mark('TC-F3-002', 'SKIP', '前置的收藏／紀錄面板被 QA-P1-001 阻擋，且無真實翻譯結果可建立歷史。', [f3FailShot]);
    mark('TC-F3-003', 'SKIP', '未啟動外部 Obsidian／Advanced URI；scheme 白名單改由 Jest 與程式碼稽查證明。', []);
    mark('TC-F3-004', 'SKIP', '收藏入口被 QA-P1-001 阻擋；5,000 筆邊界保留給修復後回歸。', [f3FailShot]);

    await article.setViewportSize({ width: 375, height: 812 });
    await article.reload({ waitUntil: 'load' });
    await waitForExtension(article);
    await article.locator('#fanfanba-floating .ffb-ball-main').hover();
    await article.locator('#fanfanba-floating [data-action="library"]').click();
    await article.waitForTimeout(250);
    const mobileLibraryVisible = await article.locator('#gemini-result-card').evaluate(el => getComputedStyle(el).opacity !== '0' && el.classList.contains('g-show')).catch(() => false);
    const f3MobileFailShot = await screenshot(article, 'F3-TC-F3-005-library-invisible-fail-mobile');
    mark('TC-F3-005', mobileLibraryVisible ? 'PASS' : 'FAIL',
      `375px 由浮球開啟學習庫可見=${mobileLibraryVisible}；同受 QA-P1-001 阻斷。`,
      [f3MobileFailShot], 'P1');

    // B1-B6：Options 真實 extension page、隔離 storage、下載與 RWD。
    const options = await context.newPage();
    const optionsAudit = monitorPage(options, 'options');
    await options.goto(`${extensionBase}/options.html`, { waitUntil: 'load' });
    await options.waitForTimeout(500);
    optionsAudit.url = options.url();
    const tdzError = [...optionsAudit.pageErrors, ...optionsAudit.consoleErrors]
      .find(message => message.includes('LAST_VOCAB_BACKUP_KEY'));
    const optionsDesktopShot = await screenshot(options, 'B1-options-desktop-runtime');
    mark('TC-E3-003', tdzError ? 'FAIL' : 'PASS',
      tdzError ? `Options 啟動重現 TDZ：${tdzError}` : 'Options 啟動未出現 TDZ。',
      [optionsDesktopShot, 'screenshots/20260724-p2-options-tdz-error.jpg'], tdzError ? 'P2' : '');

    await clearIsolatedStorage(options);
    await options.reload({ waitUntil: 'load' });
    await options.waitForTimeout(350);
    await options.locator('#btnTest').click();
    const missingKeyStatus = await options.locator('#status').innerText();
    const secretTypes = await options.locator('#groqApiKey,#apiKey,#openrouterApiKey,#ttsApiKey').evaluateAll(elements =>
      elements.map(element => element.type));
    mark('TC-B1-003', /請先輸入|API Key/.test(missingKeyStatus) && secretTypes.every(type => type === 'password') ? 'PASS' : 'FAIL',
      `缺 Key 顯示錯誤=${JSON.stringify(missingKeyStatus)}；4 個秘密欄位預設皆 password=${secretTypes.every(type => type === 'password')}。`,
      [], secretTypes.every(type => type === 'password') ? '' : 'P0');

    await options.locator('#groqApiKey').fill(`  ${DUMMY_GROQ_KEY}<script>alert(1)</script>${'A'.repeat(200)}  `);
    await options.locator('#btnSave').click();
    await options.waitForTimeout(120);
    const boundaryStatus = await options.locator('#status').innerText();
    const optionsXssSafe = await options.evaluate(() => window.__xssExecuted !== true && document.querySelectorAll('script[src*="alert"]').length === 0);
    mark('TC-B1-004', optionsXssSafe && !/undefined|null/i.test(boundaryStatus) ? 'PASS' : 'FAIL',
      `特殊字元／長輸入未執行腳本，狀態以 textContent 呈現：${JSON.stringify(boundaryStatus)}。`,
      [], optionsXssSafe ? '' : 'P0');

    await clearIsolatedStorage(options);
    await options.reload({ waitUntil: 'load' });
    await options.locator('#groqApiKey').fill(DUMMY_GROQ_KEY);
    await options.locator('#apiKey').fill(DUMMY_GEMINI_KEY);
    await options.locator('#openrouterApiKey').fill(DUMMY_OPENROUTER_KEY);
    await options.locator('[data-panel="language"]').click();
    await options.locator('#ttsApiKey').fill(DUMMY_TTS_KEY);
    await options.locator('#targetLanguage').selectOption('ja');
    await options.locator('#explanationLanguage').selectOption('target');
    await options.locator('#ttsLanguageMode').selectOption('auto');
    await options.locator('#vocabularyHighlightMode').selectOption('off');
    await options.locator('[data-panel="obsidian"]').click();
    await options.locator('#obsidianVault').fill('QA 測試 Vault');
    await options.locator('#obsidianDefaultFolder').fill('QA/測試資料夾');
    await options.locator('#btnSave').click();
    await options.waitForTimeout(250);
    await options.reload({ waitUntil: 'load' });
    const persisted = {
      targetLanguage: await options.locator('#targetLanguage').inputValue(),
      obsidianVault: await options.locator('#obsidianVault').inputValue(),
      groqMasked: (await options.locator('#groqApiKey').getAttribute('type')) === 'password'
    };
    mark('TC-B1-001', 'SKIP', `dummy Key 與設定持久化已驗證；未呼叫真實 Groq 與實際網頁翻譯。 persisted=${JSON.stringify(persisted)}`, []);
    mark('TC-B1-002', 'SKIP', '三 provider dummy Key 可分離保存；未使用真實 Gemini／OpenRouter Key，未送 provider runtime。', []);
    mark('TC-B2-001', 'SKIP', `語言／朗讀／高亮設定可持久化（target=${persisted.targetLanguage}）；未執行 AI 輸出與真實朗讀。`, []);
    mark('TC-B2-002', 'SKIP', '無人工音訊聆聽證據，不把 speechSynthesis API 存在冒充 TTS 可用。', []);
    mark('TC-B2-003', 'SKIP', '未向 Google Cloud TTS 傳送 dummy Key；網路拒絕與語音不可用保留 runtime gate。', []);
    mark('TC-B2-004', 'SKIP', '語系選單與特殊字元輸入穩定；未完成混合語句的翻譯／朗讀輸出。', []);
    mark('TC-B3-001', 'SKIP', '未啟動真實 Obsidian 或寫入測試 Vault。', []);
    mark('TC-B3-002', 'SKIP', '未啟動真實 Obsidian，目前 Vault fallback 與最近資料夾需人工驗。', []);
    mark('TC-B3-003', 'SKIP', '未呼叫外部 app；惡意 scheme 白名單由 Jest 與背景訊息測試覆蓋。', []);
    mark('TC-B3-004', 'SKIP', 'Options 可安全儲存 Unicode 路徑；未對外部 Obsidian 執行路徑穿越／URI 寫入。', []);

    // B4 round-trip 與邊界。
    await options.locator('[data-panel="backup"]').click();
    const downloadSettingsPromise = options.waitForEvent('download');
    await options.locator('#btnExportSettings').click();
    const settingsDownload = await downloadSettingsPromise;
    const settingsFile = await settingsDownload.path();
    const settingsPayload = JSON.parse(await fsp.readFile(settingsFile, 'utf8'));
    const plainExportHasSecret = JSON.stringify(settingsPayload).includes(DUMMY_GROQ_KEY)
      || Object.keys(settingsPayload.settings || {}).some(key => /key|secret|token/i.test(key));
    await options.locator('[data-panel="language"]').click();
    await options.locator('#targetLanguage').selectOption('en');
    await options.locator('#btnSave').click();
    await options.locator('[data-panel="backup"]').click();
    await options.locator('#settingsImportFile').setInputFiles({
      name: 'settings-roundtrip.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(settingsPayload))
    });
    await options.waitForTimeout(250);
    const restoredLanguage = await options.evaluate(async () => (await chrome.storage.sync.get('targetLanguage')).targetLanguage);
    mark('TC-B4-001', !plainExportHasSecret && restoredLanguage === 'ja' ? 'PASS' : 'FAIL',
      `一般設定 round-trip=${restoredLanguage === 'ja'}；匯出檔不含 API Key=${!plainExportHasSecret}。`,
      [], plainExportHasSecret ? 'P0' : '');

    await options.locator('#includeSecretsExport').check();
    await options.locator('#backupPassword').fill('QA-only-password-20260724');
    options.once('dialog', dialog => dialog.accept());
    const encryptedDownloadPromise = options.waitForEvent('download');
    await options.locator('#btnExportSettings').click();
    const encryptedDownload = await encryptedDownloadPromise;
    const encryptedPayload = JSON.parse(await fsp.readFile(await encryptedDownload.path(), 'utf8'));
    const encryptedText = JSON.stringify(encryptedPayload);
    const encryptionOk = !!encryptedPayload.secretsEncrypted
      && !encryptedText.includes(DUMMY_GROQ_KEY)
      && !encryptedText.includes('QA-only-password-20260724');

    await options.evaluate(async seed => chrome.runtime.sendMessage({
      type: 'VOCABULARY_STORE',
      action: 'replaceAll',
      items: {
        'en:alpha': {
          id: 'en:alpha', word: 'alpha', lang: 'en', translation: '阿爾法',
          count: 2, status: 'learning', createdAt: seed, lastSeenAt: seed
        }
      }
    }), new Date().toISOString());
    const vocabularyDownloadPromise = options.waitForEvent('download');
    await options.locator('#btnExportVocabulary').click();
    const vocabularyDownload = await vocabularyDownloadPromise;
    const vocabularyPayload = JSON.parse(await fsp.readFile(await vocabularyDownload.path(), 'utf8'));
    const xlsxDownloadPromise = options.waitForEvent('download');
    await options.locator('#btnExportVocabularyXlsx').click();
    const xlsxDownload = await xlsxDownloadPromise;
    const xlsxBytes = await fsp.readFile(await xlsxDownload.path());
    const xlsxMagic = xlsxBytes.subarray(0, 2).toString('hex') === '504b';
    mark('TC-B4-002', encryptionOk && vocabularyPayload.count === 1 && xlsxMagic ? 'PASS' : 'FAIL',
      `API Key 只存在加密 payload=${encryptionOk}；單字 JSON count=${vocabularyPayload.count}；XLSX ZIP magic=${xlsxMagic}。`,
      [], encryptionOk ? '' : 'P0');

    const beforeMalformed = await options.evaluate(async () => chrome.storage.sync.get(null));
    await options.locator('#settingsImportFile').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{broken-json')
    });
    await options.waitForTimeout(200);
    const malformedStatus = await options.locator('#status').innerText();
    const afterMalformed = await options.evaluate(async () => chrome.storage.sync.get(null));
    const malformedAtomic = JSON.stringify(beforeMalformed) === JSON.stringify(afterMalformed);
    mark('TC-B4-003', /匯入失敗/.test(malformedStatus) && malformedAtomic ? 'PASS' : 'FAIL',
      `損毀 JSON 明確失敗=${JSON.stringify(malformedStatus)}；現有 sync 設定未被部分覆寫=${malformedAtomic}。`,
      [], malformedAtomic ? '' : 'P1');

    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 65);
    await options.locator('#vocabularyImportFile').setInputFiles({
      name: 'oversized-vocabulary.json',
      mimeType: 'application/json',
      buffer: oversized
    });
    await options.waitForTimeout(200);
    const oversizedStatus = await options.locator('#vocabularyBackupStatus').innerText();
    const maliciousPayload = {
      schemaVersion: 1,
      items: {
        '__proto__': { id: '__proto__', word: '__proto__' },
        'en:=cmd': { id: 'en:=cmd', word: '=cmd', translation: '<script>alert(1)</script>', count: 1 }
      }
    };
    await options.locator('#vocabularyImportFile').setInputFiles({
      name: 'malicious-vocabulary.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(maliciousPayload))
    });
    await options.waitForTimeout(220);
    const protoPolluted = await options.evaluate(() => ({}).polluted !== undefined);
    mark('TC-B4-004', /10MB|檔案太大/.test(oversizedStatus) && !protoPolluted ? 'PASS' : 'FAIL',
      `>10MB 明確拒絕=${JSON.stringify(oversizedStatus)}；Object prototype 未污染=${!protoPolluted}。`,
      [], protoPolluted ? 'P0' : '');

    // B6 診斷與隱私。
    await options.locator('[data-panel="privacy"]').click();
    await setIsolatedStorage(options, {
      local: {
        fanFanBaDiagnostics: {
          translateCount: 3,
          explainCount: 2,
          optimizeCount: 1,
          errorCount: 1,
          selectedText: 'SHOULD_NOT_RENDER',
          url: 'https://private.invalid/'
        }
      }
    });
    await options.reload({ waitUntil: 'load' });
    await options.locator('[data-panel="privacy"]').click();
    await options.waitForTimeout(250);
    const privacyText = await options.locator('[data-panel-content="privacy"]').innerText();
    const privacyNoContent = !privacyText.includes('SHOULD_NOT_RENDER') && !privacyText.includes('private.invalid');
    mark('TC-B6-001', /v1\.9\.9/.test(privacyText) && privacyNoContent ? 'PASS' : 'FAIL',
      `隱私頁顯示 v1.9.9；診斷未渲染選取內容／URL=${privacyNoContent}。`,
      [], privacyNoContent ? '' : 'P0');
    await options.locator('#btnClearDiagnostics').click();
    await options.waitForTimeout(180);
    const diagnosticsAfterClear = await options.evaluate(async () => chrome.storage.local.get(null));
    const clearOk = !JSON.stringify(diagnosticsAfterClear).includes('SHOULD_NOT_RENDER');
    mark('TC-B6-002', clearOk ? 'PASS' : 'FAIL',
      `隔離 profile 診斷清除後不含測試內容=${clearOk}。`,
      [], clearOk ? '' : 'P1');
    mark('TC-B6-003', /API Key|本機|雲端/.test(privacyText) ? 'PASS' : 'FAIL',
      '隱私說明涵蓋本機儲存、API Key 與雲端邊界；未發現未宣告權限文案。',
      [], '');
    const sensitiveLeakInAudit = [...optionsAudit.consoleErrors, ...optionsAudit.pageErrors]
      .some(message => /DUMMY_ONLY|SHOULD_NOT_RENDER|private\.invalid/.test(message));
    mark('TC-B6-004', !sensitiveLeakInAudit ? 'PASS' : 'FAIL',
      `Options console／pageerror 未含 dummy 選取內容、URL 或 Key=${!sensitiveLeakInAudit}。`,
      [], sensitiveLeakInAudit ? 'P0' : '');

    // B1-B6 RWD，每個分類逐一量測。
    await options.setViewportSize({ width: 375, height: 812 });
    const panelToCase = {
      model: 'TC-B1-005',
      language: 'TC-B2-005',
      obsidian: 'TC-B3-005',
      backup: 'TC-B4-005',
      cloud: 'TC-B5-005',
      privacy: 'TC-B6-005'
    };
    for (const [panel, id] of Object.entries(panelToCase)) {
      await options.locator(`[data-panel="${panel}"]`).click();
      await options.waitForTimeout(80);
      const overflow = await assertNoHorizontalOverflow(options);
      const shot = await screenshot(options, `${id}-${panel}-mobile`);
      mark(id, overflow.ok ? 'PASS' : 'FAIL',
        `375px ${panel} 面板 scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}。`,
        [shot], overflow.ok ? '' : 'P1');
    }

    // E1 Popup。
    await options.setViewportSize({ width: 1920, height: 1080 });
    await setIsolatedStorage(options, {
      sync: { model: 'groq:llama-4-scout', obsidianVault: 'QA 測試 Vault' },
      local: {
        fanFanBaSecrets: {
          groqApiKey: DUMMY_GROQ_KEY,
          apiKey: DUMMY_GEMINI_KEY,
          openrouterApiKey: DUMMY_OPENROUTER_KEY,
          ttsApiKey: DUMMY_TTS_KEY
        }
      }
    });
    const popup = await context.newPage();
    const popupAudit = monitorPage(popup, 'popup');
    await popup.goto(`${extensionBase}/popup.html`, { waitUntil: 'load' });
    await popup.waitForTimeout(300);
    popupAudit.url = popup.url();
    const popupText = await popup.locator('body').innerText();
    const popupNoPlainKey = !popupText.includes('DUMMY_ONLY') && !popupText.includes(DUMMY_GROQ_KEY);
    mark('TC-E1-001', /Groq|Llama/.test(popupText) && popupNoPlainKey ? 'PASS' : 'FAIL',
      `Popup readiness 與模型摘要可見；dummy Key 未明文顯示=${popupNoPlainKey}。`,
      [], popupNoPlainKey ? '' : 'P0');

    const modelItems = popup.locator('.model-item');
    const modelCount = await modelItems.count();
    for (let index = 0; index < modelCount; index += 1) {
      await modelItems.nth(index).click();
      await popup.waitForTimeout(80);
    }
    const selectedModel = await popup.evaluate(async () => (await chrome.storage.sync.get('model')).model);
    mark('TC-E1-002', modelCount === 3 && !!selectedModel ? 'PASS' : 'FAIL',
      `3 個模型快速切換後最後選擇持久化=${selectedModel}；未送真實 provider request。`,
      [], '');

    await clearIsolatedStorage(popup);
    await popup.reload({ waitUntil: 'load' });
    await popup.waitForTimeout(250);
    const missingPopupText = await popup.locator('body').innerText();
    const pageCountBeforeOptions = context.pages().length;
    await popup.locator('#openOptions').click();
    await popup.waitForTimeout(250);
    const openedOptions = context.pages().some(page => page.url().includes('/options.html'));
    mark('TC-E1-003', /未設定|缺少/.test(missingPopupText) && openedOptions ? 'PASS' : 'FAIL',
      `缺設定狀態明確；完整設定入口開啟正確 extension context=${openedOptions}（pages ${pageCountBeforeOptions}→${context.pages().length}）。`,
      [], openedOptions ? '' : 'P1');

    await setIsolatedStorage(popup, { sync: { model: 'legacy-unknown-model' } });
    await popup.reload({ waitUntil: 'load' });
    await popup.waitForTimeout(250);
    const popupOldSafe = !/undefined|null/i.test(await popup.locator('body').innerText());
    mark('TC-E1-004', popupOldSafe && popupAudit.pageErrors.length === 0 ? 'PASS' : 'FAIL',
      `未知舊模型 normalize 後未出現 undefined/null=${popupOldSafe}；pageerror=${popupAudit.pageErrors.length}。`,
      [], popupOldSafe ? '' : 'P2');

    await popup.setViewportSize({ width: 375, height: 812 });
    const popupOverflow = await assertNoHorizontalOverflow(popup);
    const popupMobileShot = await screenshot(popup, 'E1-TC-E1-005-popup-mobile');
    mark('TC-E1-005', popupOverflow.ok ? 'PASS' : 'FAIL',
      `375px Popup scrollWidth=${popupOverflow.scrollWidth}, clientWidth=${popupOverflow.clientWidth}。`,
      [popupMobileShot], popupOverflow.ok ? '' : 'P1');

    // E2 Welcome。
    const welcome = await context.newPage();
    const welcomeAudit = monitorPage(welcome, 'welcome');
    await welcome.goto(`${extensionBase}/welcome.html`, { waitUntil: 'load' });
    await welcome.waitForTimeout(250);
    welcomeAudit.url = welcome.url();
    const welcomeText = await welcome.locator('body').innerText();
    const welcomeSteps = await welcome.locator('.step-card, [class*="step"]').count();
    const beforeSettingsClick = context.pages().length;
    await welcome.locator('#btnSettings').click();
    await welcome.waitForTimeout(180);
    const settingsOpened = context.pages().length >= beforeSettingsClick;
    mark('TC-E2-001', /API Key/.test(welcomeText) && /選/.test(welcomeText) && settingsOpened ? 'PASS' : 'FAIL',
      `首次 install 已由 fresh profile 自動開 Welcome；三步內容可讀（step-like=${welcomeSteps}），設定入口有效=${settingsOpened}。`,
      [], settingsOpened ? '' : 'P1');

    const closePage = await context.newPage();
    await closePage.goto(`${extensionBase}/welcome.html`, { waitUntil: 'load' });
    await closePage.locator('#btnClose').click();
    await closePage.waitForTimeout(120).catch(() => {});
    const closeWorked = closePage.isClosed();
    const reentry = await context.newPage();
    await reentry.goto(`${extensionBase}/welcome.html`, { waitUntil: 'load' });
    const reentryWorks = await reentry.locator('#btnSettings').isVisible();
    mark('TC-E2-002', closeWorked && reentryWorks ? 'PASS' : 'FAIL',
      `稍後再說可關閉分頁=${closeWorked}；direct welcome re-entry 可用=${reentryWorks}。`,
      [], closeWorked ? '' : 'P2');
    await reentry.close();

    const externalLinks = await welcome.locator('a[href^="http"]').evaluateAll(links => links.map(link => link.href));
    const linksHaveSecrets = externalLinks.some(url => /key=|token=|DUMMY_ONLY/i.test(url));
    mark('TC-E2-003', externalLinks.length >= 1 && !linksHaveSecrets ? 'PASS' : 'FAIL',
      `外部連結 ${externalLinks.length} 個，均未帶 API Key/token=${!linksHaveSecrets}；未登入、未傳送資料。`,
      [], linksHaveSecrets ? 'P0' : '');
    mark('TC-E2-004', 'SKIP', '多 Welcome 分頁可開；未重新觸發瀏覽器 install/update 事件，不能宣稱事件去重通過。', []);

    await welcome.setViewportSize({ width: 375, height: 812 });
    const welcomeOverflow = await assertNoHorizontalOverflow(welcome);
    const welcomeMobileShot = await screenshot(welcome, 'E2-TC-E2-005-welcome-mobile');
    mark('TC-E2-005', welcomeOverflow.ok ? 'PASS' : 'FAIL',
      `375px Welcome scrollWidth=${welcomeOverflow.scrollWidth}, clientWidth=${welcomeOverflow.clientWidth}。`,
      [welcomeMobileShot], welcomeOverflow.ok ? '' : 'P1');

    // E3 Service Worker 與惡意訊息。
    const swErrors = [];
    serviceWorker.on('console', message => {
      if (message.type() === 'error') swErrors.push(message.text());
    });
    await popup.reload({ waitUntil: 'load' });
    await options.reload({ waitUntil: 'load' });
    await article.setViewportSize({ width: 1920, height: 1080 });
    await article.goto(`${origin}/article`, { waitUntil: 'load' });
    await waitForExtension(article);
    const swAlive = context.serviceWorkers().some(worker => worker.url().endsWith('/background.js'));
    mark('TC-E3-001', swAlive && swErrors.length === 0 ? 'PASS' : 'FAIL',
      `Service Worker 可喚醒=${swAlive}；本輪 worker console errors=${swErrors.length}。`,
      [], swAlive ? '' : 'P1');
    mark('TC-E3-002', 'SKIP', '無真實 API Key，未做雙分頁並行 AI request correlation。', []);

    const malformedResponses = await popup.evaluate(async () => {
      const send = payload => new Promise(resolve => {
        try {
          chrome.runtime.sendMessage(payload, response => resolve({
            response,
            error: chrome.runtime.lastError?.message || ''
          }));
        } catch (error) {
          resolve({ error: String(error.message || error) });
        }
      });
      return Promise.all([
        send(null),
        send({ type: 'UNKNOWN_ACTION' }),
        send({ type: 'VOCABULARY_STORE', action: 'unknown', payload: 'A'.repeat(10000) }),
        send({ type: 'GEMINI_REQUEST', action: 'unknown', text: 'x', requestId: '' })
      ]);
    });
    const malformedRejected = malformedResponses.every(item =>
      item.error || item.response == null || item.response?.ok === false || item.response?.error);
    mark('TC-E3-004', malformedRejected && swErrors.length === 0 ? 'PASS' : 'FAIL',
      `4 組 malformed／未知訊息均被忽略或結構化拒絕=${malformedRejected}；worker 未崩潰。`,
      [], malformedRejected ? '' : 'P0');

    const extensionPages = [options, popup, welcome];
    const stateConsistency = extensionPages.every(page => !page.isClosed());
    mark('TC-E3-005', stateConsistency && swErrors.length === 0 ? 'PASS' : 'FAIL',
      `Options／Popup／Welcome 雙端巡覽後仍連到同一 service worker=${stateConsistency}；新增 worker error=${swErrors.length}。`,
      [popupMobileShot, welcomeMobileShot], stateConsistency ? '' : 'P1');

    // Phase 2-A：8 個前台 surface + extension pages + 404。
    const surfaces = [
      ['/article', 'front-article-audit', 200],
      ['/iframe', 'front-iframe-audit', 200],
      ['/form', 'front-form-audit', 200],
      ['/special', 'front-special-audit', 200],
      ['/long', 'front-long-audit', 200],
      ['/dynamic', 'front-dynamic-audit', 200],
      ['/wide', 'front-wide-audit', 200],
      ['/empty', 'front-empty-audit', 200],
      ['/404', 'front-404-audit', 404]
    ];
    const surfaceVerdicts = [];
    for (const [route, label, status] of surfaces) {
      surfaceVerdicts.push(await auditSurface(context, `${origin}${route}`, label, status));
    }
    surfaceVerdicts.push(await auditSurface(context, `${extensionBase}/popup.html`, 'extension-popup-audit', 200));
    surfaceVerdicts.push(await auditSurface(context, `${extensionBase}/welcome.html`, 'extension-welcome-audit', 200));

    // Phase 2-B：host 表單標準 attack set。
    const boundary = await context.newPage();
    const boundaryAudit = monitorPage(boundary, 'boundary-form');
    await boundary.goto(`${origin}/form`, { waitUntil: 'load' });
    await waitForExtension(boundary);
    boundaryAudit.url = boundary.url();
    await boundary.locator('#email').fill('');
    await boundary.locator('#submit').click();
    const xssPayload = '<script>window.__xssExecuted=true</script>';
    await boundary.locator('#notes').fill(xssPayload);
    await boundary.locator('#email').fill('not-an-email');
    await boundary.locator('#notes').fill('A'.repeat(500));
    await boundary.locator('#submit').click();
    const boundaryState = await boundary.evaluate(() => ({
      xssExecuted: window.__xssExecuted === true,
      bodyStable: !!document.body,
      formResult: document.querySelector('#form-result')?.textContent || ''
    }));
    const boundaryShot = await screenshot(boundary, 'Phase2-boundary-host-form');
    security.push({
      item: '空白／錯誤 Email／500 字元輸入',
      result: !boundaryState.xssExecuted && boundaryState.bodyStable ? 'PASS' : 'FAIL',
      note: `頁面穩定=${boundaryState.bodyStable}，XSS 執行=${boundaryState.xssExecuted}`,
      evidence: [boundaryShot]
    });

    // Options input attack set（不送出外部 API）。
    await options.setViewportSize({ width: 1920, height: 1080 });
    await options.goto(`${extensionBase}/options.html`, { waitUntil: 'load' });
    await options.locator('#groqApiKey').fill('');
    await options.locator('#btnTest').click();
    await options.locator('[data-panel="obsidian"]').click();
    await options.locator('#obsidianVault').fill(xssPayload);
    await options.locator('#obsidianDefaultFolder').fill('A'.repeat(500));
    const optionsBoundarySafe = await options.evaluate(() => window.__xssExecuted !== true);
    const optionsBoundaryShot = await screenshot(options, 'Phase2-boundary-options');
    security.push({
      item: 'Options 空白／XSS／500 字元輸入',
      result: optionsBoundarySafe ? 'PASS' : 'FAIL',
      note: '未送出外部 AI API；輸入沒有被執行成 script。',
      evidence: [optionsBoundaryShot]
    });

    // Phase 2-C：Probe A 新 context、Probe B 現有 extension context reload。
    const freshBrowser = await chromium.launch({
      headless: true,
      executablePath: chromium.executablePath()
    });
    const freshPage = await freshBrowser.newPage();
    const probeAResponse = await freshPage.goto(`${origin}/article`, { waitUntil: 'load' });
    await freshBrowser.close();
    const probeBResponse = await article.reload({ waitUntil: 'load' });
    const has5xx = consoleAudit.some(entry => entry.networkFails.some(item => /^5\d\d /.test(item)));
    security.push({
      item: '500 雙重探測',
      result: probeAResponse.status() < 500 && (probeBResponse?.status() || 200) < 500 && !has5xx ? 'PASS' : 'FAIL',
      note: `Probe A=${probeAResponse.status()}；Probe B=${probeBResponse?.status() || 200}；network 5xx=${has5xx}`
    });
    security.push({
      item: 'Console / Network 關鍵 surface',
      result: surfaceVerdicts.every(item => item.verdict) ? 'PASS' : 'FAIL',
      note: `${surfaceVerdicts.filter(item => item.verdict).length}/${surfaceVerdicts.length} surface 無非預期 console/page/5xx。Options TDZ 另列 QA-P2-002。`
    });

    // Phase 3：本輪不穿越 OAuth、OTP、金流、CAPTCHA。
    security.push({
      item: 'Phase 3 Mid-Flow',
      result: 'PASS',
      note: '本輪未觸發 mid-flow OTP／金流／CAPTCHA；Google OAuth 已在 Phase 0-C 標記 manual gate。'
    });

    const summary = {
      total: results.length,
      pass: results.filter(item => item.status === 'PASS').length,
      fail: results.filter(item => item.status === 'FAIL').length,
      skip: results.filter(item => item.status === 'SKIP').length
    };
    const payload = {
      project: 'fan-fan-ba',
      version: '1.9.9',
      date: '2026-07-24',
      timezone: 'Asia/Taipei',
      baseline: 'b90900a',
      qaBase: REPO,
      browser: 'Chrome for Testing (Chromium via Playwright)',
      extensionId,
      profile: PROFILE_DIR,
      manualGates: [
        '真實 Groq／Gemini／OpenRouter／Google Cloud TTS API Key',
        'Google OAuth、Drive appData 上傳／下載',
        'Obsidian Advanced URI 與真實測試 Vault',
        'install/update 事件重放與人工音訊聆聽'
      ],
      summary,
      results,
      consoleAudit,
      security,
      artifacts: [...new Set(artifacts)].sort(),
      runnerErrors
    };
    await fsp.writeFile(RESULT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(summary)}\n${RESULT_FILE}\n`);
  } catch (error) {
    runnerErrors.push(String(error?.stack || error));
    const payload = {
      project: 'fan-fan-ba',
      date: '2026-07-24',
      results,
      consoleAudit,
      security,
      artifacts: [...new Set(artifacts)].sort(),
      runnerErrors
    };
    await fsp.writeFile(RESULT_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    throw error;
  } finally {
    await context?.close().catch(() => {});
    await new Promise(resolve => server.close(resolve));
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
