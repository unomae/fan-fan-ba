'use strict';

/**
 * 從 phase1-2-results.json 產生 Phase 4-A / 4-B 報告。
 * 輸出全在 qa-reports/；不修改 extension runtime。
 */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const REPORT_DIR = path.join(REPO, 'qa-reports');
const SCREENSHOT_DIR = path.join(REPORT_DIR, 'screenshots');
const RESULTS_FILE = path.join(REPORT_DIR, 'phase1-2-results.json');
const OUT_HTML = path.join(REPORT_DIR, 'fan-fan-ba-qa-report-20260724.html');
const data = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));

const MODULE_NAMES = {
  F1: '網頁注入、選字工具列與結果卡',
  F2: '浮球、全文翻譯與站點控制',
  F3: '收藏、單字本、最近查詢與 Obsidian 入口',
  B1: '模型與金鑰',
  B2: '語言與朗讀',
  B3: 'Obsidian 設定',
  B4: '備份還原',
  B5: '雲端同步',
  B6: '隱私與說明',
  E1: 'Popup 與設定狀態摘要',
  E2: 'Welcome 與首次使用導引',
  E3: 'Service Worker、Options 啟動與跨元件訊息'
};

const BUGS = [
  {
    id: 'QA-P1-001',
    severity: 'P1',
    module: 'F3',
    title: '收藏／紀錄面板建立後保持透明',
    page: '一般 HTTPS 頁面 → 浮球 → 收藏／紀錄',
    description: '結果卡 DOM 已建立，但沒有 g-show class，computed opacity 為 0。',
    expected: '學習庫面板可見，可進入單字本與最近查詢。',
    actual: '面板透明且無法操作；桌機與 375px 都重現。',
    cause: 'showFloatingLibraryPanel() 結尾只定位卡片，未加入 resultCard.classList.add("g-show")。',
    screenshot: 'F3-TC-F3-001-library-invisible-fail-desktop.png',
    impactedCases: ['TC-F3-001', 'TC-F3-005'],
    owner: '前端',
    estimate: '0.5–1 小時'
  },
  {
    id: 'QA-P1-003',
    severity: 'P1',
    module: 'F2',
    title: '375px 浮球展開時仍被右側裁切',
    page: '一般文章頁（viewport 375 × 812）',
    description: '浮球和三個操作鈕約有一半位於 viewport 右側之外。',
    expected: '展開時主球與所有操作鈕完整位於 viewport 內。',
    actual: '主球、收藏、全文翻譯與設定圖示被右側裁切。',
    cause: '浮球右側半藏的 translateX(24px) 與 hover／menu-open 位移在窄螢幕互動時發生抖動／回縮；現有測試只驗 class，未驗實際 bounding box。',
    screenshot: 'F2-TC-F2-005-floating-menu-mobile.png',
    impactedCases: ['TC-F2-005'],
    owner: '前端 / CSS',
    estimate: '1–2 小時'
  },
  {
    id: 'QA-P2-002',
    severity: 'P2',
    module: 'E3',
    title: 'Options 啟動發生 LAST_VOCAB_BACKUP_KEY TDZ',
    page: 'chrome-extension://…/options.html',
    description: 'Options 每次載入都產生未捕捉的 ReferenceError。',
    expected: '啟動無未捕捉錯誤，單字本備份提醒正常渲染。',
    actual: 'Cannot access LAST_VOCAB_BACKUP_KEY before initialization。',
    cause: 'initVocabularyBackup() 在常數初始化前呼叫 async renderVocabularyBackupStaleness()。',
    screenshot: '20260724-p2-options-tdz-error.jpg',
    impactedCases: ['TC-E3-003'],
    owner: '前端',
    estimate: '0.5 小時'
  }
];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function relativeEvidence(items = []) {
  return items.map(item => `\`${item}\``).join('、') || '查無截圖；詳見自動化結果紀錄。';
}

function checkbox(result) {
  if (result.status === 'PASS') return `- [x] ${result.id} ${result.name}`;
  if (result.status === 'FAIL') {
    const bug = BUGS.find(item => item.impactedCases.includes(result.id));
    return `- [ ] ${result.id} ${result.name}（FAIL${bug ? ` → ${bug.id}` : ''}）`;
  }
  return `- [ ] ${result.id} ${result.name}（SKIP · manual gate / 證據不足）`;
}

function moduleSummary(moduleId) {
  const rows = data.results.filter(item => item.module === moduleId);
  return {
    id: moduleId,
    name: MODULE_NAMES[moduleId],
    total: rows.length,
    pass: rows.filter(item => item.status === 'PASS').length,
    fail: rows.filter(item => item.status === 'FAIL').length,
    skip: rows.filter(item => item.status === 'SKIP').length,
    rows
  };
}

function writeModuleReports(moduleId) {
  const module = moduleSummary(moduleId);
  const bugs = BUGS.filter(item => item.module === moduleId);
  const uat = `# ${module.id} — ${module.name} UAT 清單

- 日期：2026-07-24（Asia/Taipei）
- 基準：\`master@b90900a\`
- 瀏覽器：Chrome for Testing（Playwright）＋ Edge Beta 探察
- 結果：${module.total} TC｜${module.pass} PASS｜${module.fail} FAIL｜${module.skip} SKIP

## 測試案例

${module.rows.map(checkbox).join('\n')}

## 執行證據

${module.rows.map(result => `### ${result.id} · ${result.status}

${result.note}

證據：${relativeEvidence(result.evidence)}
`).join('\n')}

## Gate

- SKIP 不算通過；需真實 API Key、Google OAuth、Obsidian 或 install/update 事件的案例保留給人工回歸。
- 原始機器結果：\`qa-reports/phase1-2-results.json\`
`;

  const p1 = bugs.filter(item => item.severity === 'P1');
  const p2 = bugs.filter(item => item.severity === 'P2');
  const bugDetail = bug => `### ${bug.id} · ${bug.title}

- 發生位置：${bug.page}
- 影響案例：${bug.impactedCases.join('、')}
- 預期：${bug.expected}
- 實際：${bug.actual}
- 技術肇因：${bug.cause}
- 截圖：![${bug.id}](screenshots/${bug.screenshot})
`;
  const bugReport = `# QA 滿配驗收報告 — ${module.id}：${module.name} — 2026-07-24

**測試範圍：** ${module.name}
**測試裝置：** 桌機 1920px + 行動 375px
**測試案例：** ${module.total}
**測試結果：** ${module.pass} PASS / ${module.fail} FAIL / ${module.skip} SKIP

## 1. QA 漏測／技術覆盤分析

| 層面 | 本輪觀察 | 為何常規測試可能漏網 |
| --- | --- | --- |
| CSS / RWD | ${moduleId === 'F2' ? '375px 實際 bounding box 發現浮球裁切。' : '以 375px 真實 viewport 逐頁量測。'} | jsdom 不會驗證實際像素位置。 |
| JS 邏輯 | ${moduleId === 'F3' ? 'DOM 建立成功仍可能因缺少 g-show 而不可見。' : moduleId === 'E3' ? 'async microtask 會在常數初始化前讀取 TDZ。' : '以 pageerror 與實際互動補足靜態測試。'} | 單元測試若只驗 DOM / class 存在，可能漏掉 runtime 時序與 computed style。 |
| 外部服務 | ${module.skip ? `${module.skip} 案例受 manual gate 限制。` : '本模組無外部服務 gate。'} | dummy Key 不可取代真實 provider／OAuth／外部 app。 |
| UX | ${bugs.length ? '發現阻斷或明顯摩擦，需修復後重跑。' : '本輪未發現可重現產品缺陷。'} | 熟悉產品的人容易用強制操作繞過入口問題。 |

## 2. 核心阻斷性缺陷（P0）

查無 P0。

## 3. 高／中優先缺陷（P1 / P2）

${bugs.length ? bugs.map(bugDetail).join('\n') : '查無 P1 / P2 產品缺陷。'}

## 4. UX 摩擦與未驗證項目（P3 / SKIP）

${module.rows.filter(item => item.status === 'SKIP').map(item => `- ${item.id}：${item.note}`).join('\n') || '- 查無 SKIP。'}

## 5. 完整修復優先級矩陣

| 優先級 | 缺陷 ID | 描述 | 受影響裝置 | 建議負責人 | 預估工時 |
| --- | --- | --- | --- | --- | --- |
${bugs.map(bug => `| ${bug.severity} | ${bug.id} | ${bug.title} | ${bug.id === 'QA-P1-003' ? '375px 行動版' : '桌機 + 行動'} | ${bug.owner} | ${bug.estimate} |`).join('\n') || '| - | 查無 | 本模組未發現產品缺陷 | - | - | - |'}

**執行完成度：** ${Math.round(module.pass / module.total * 100)}%（PASS / 全案例，不是產品健康分數）
**可送審建議：** ${bugs.some(item => item.severity === 'P1') ? '❌ 先修 P1 並回歸' : module.skip ? '⚠️ 完成 manual gate 後再判定' : '✅ 本模組可進下一 gate'}
`;

  fs.writeFileSync(path.join(REPORT_DIR, `${moduleId}-uat-checklist.md`), uat, 'utf8');
  fs.writeFileSync(path.join(REPORT_DIR, `${moduleId}-qa-bug-report.md`), bugReport, 'utf8');
}

function imageData(filename) {
  const file = path.join(SCREENSHOT_DIR, filename);
  if (!fs.existsSync(file)) return '';
  const ext = path.extname(filename).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}

function renderHtml() {
  const modules = Object.keys(MODULE_NAMES).map(moduleSummary);
  const sum = data.summary;
  const severityCounts = {
    P0: BUGS.filter(item => item.severity === 'P0').length,
    P1: BUGS.filter(item => item.severity === 'P1').length,
    P2: BUGS.filter(item => item.severity === 'P2').length,
    P3: BUGS.filter(item => item.severity === 'P3').length
  };
  const moduleRows = modules.map(module => `<tr>
    <td><strong>${module.id}</strong></td><td>${escapeHtml(module.name)}</td>
    <td>${module.total}</td><td class="pass">${module.pass}</td><td class="fail">${module.fail}</td><td class="skip">${module.skip}</td>
  </tr>`).join('');
  const bugCards = BUGS.map(bug => {
    const image = imageData(bug.screenshot);
    return `<details open class="bug">
      <summary><span class="sev ${bug.severity.toLowerCase()}">${bug.severity}</span> ${bug.id} — ${escapeHtml(bug.title)}</summary>
      <div class="bug-body">
        <p><strong>位置：</strong>${escapeHtml(bug.page)}</p>
        <p><strong>影響：</strong>${escapeHtml(bug.description)}</p>
        <p><strong>預期：</strong>${escapeHtml(bug.expected)}</p>
        <p><strong>實際：</strong>${escapeHtml(bug.actual)}</p>
        <p><strong>肇因：</strong>${escapeHtml(bug.cause)}</p>
        ${image ? `<img src="${image}" alt="${bug.id} 截圖">` : ''}
      </div>
    </details>`;
  }).join('');
  const resultRows = data.results.map(result => `<tr>
    <td><code>${result.id}</code></td><td>${escapeHtml(result.name)}</td>
    <td><span class="status ${result.status.toLowerCase()}">${result.status}</span></td>
    <td>${escapeHtml(result.note)}</td>
  </tr>`).join('');
  const securityRows = data.security.map(item => `<tr>
    <td>${escapeHtml(item.item)}</td>
    <td><span class="status ${item.result.toLowerCase()}">${item.result}</span></td>
    <td>${escapeHtml(item.note)}</td>
  </tr>`).join('');
  const manualGates = data.manualGates.map(item => `<li>${escapeHtml(item)}</li>`).join('');

  return `<!doctype html>
<html lang="zh-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>fan-fan-ba QA 驗收報告 20260724</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fb;color:#172033;font:15px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft JhengHei",sans-serif}
main{max-width:1120px;margin:auto;padding:28px}.hero,.card{background:#fff;border:1px solid #e4e8f0;border-radius:16px;box-shadow:0 8px 30px rgba(22,34,57,.06);padding:24px;margin-bottom:18px}
.hero{background:linear-gradient(135deg,#13233f,#2c6e49);color:#fff}.hero h1{margin:0 0 6px;font-size:30px}.hero p{margin:4px 0;color:#dce8e1}
.verdict{border-left:6px solid #d9485f;background:#fff7f8}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:12px}.metric{padding:16px;border-radius:12px;text-align:center;background:#f5f7fb}.metric b{display:block;font-size:28px}.metric span{color:#687386}
h2{font-size:20px;margin:0 0 14px}h3{font-size:16px}table{width:100%;border-collapse:collapse}th,td{padding:10px 9px;border-bottom:1px solid #e8ebf1;text-align:left;vertical-align:top}th{background:#f8fafc;color:#536075;font-size:12px;position:sticky;top:0}.table-wrap{overflow:auto;max-height:680px}
.pass{color:#178246}.fail{color:#c6384d}.skip{color:#9a6900}.status,.sev{display:inline-block;padding:2px 8px;border-radius:999px;font-weight:800;font-size:12px}.status.pass{background:#e9f7ef}.status.fail,.sev.p1{background:#feecef;color:#c6384d}.status.skip,.sev.p2{background:#fff4d8;color:#956400}.sev{color:#fff;background:#c6384d}
.bug{border:1px solid #e3e7ee;border-radius:12px;margin:10px 0;overflow:hidden}.bug summary{cursor:pointer;padding:13px 15px;background:#fafbfc;font-weight:750}.bug-body{padding:14px}.bug img{display:block;width:100%;max-height:620px;object-fit:contain;border:1px solid #e3e7ee;border-radius:10px;margin-top:12px;background:#fff}
.callout{padding:14px 16px;border-radius:10px;background:#fff4d8;border-left:4px solid #e2a400}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
@media(max-width:620px){main{padding:12px}.hero,.card{padding:16px;border-radius:12px}.hero h1{font-size:23px}th,td{min-width:110px}.bug img{max-height:420px}}
</style>
</head>
<body><main>
  <section class="hero">
    <h1>翻翻吧 v1.9.9 QA 驗收報告</h1>
    <p>Phase 0-C → Phase 4-B｜2026-07-24 Asia/Taipei｜baseline <code>b90900a</code></p>
    <p>Chrome for Testing（Playwright）＋ Microsoft Edge Beta 真機探察</p>
  </section>

  <section class="card verdict">
    <h2>結論：目前不建議送審</h2>
    <p>2 個 P1 會阻斷或明顯破壞核心 UI；另有 1 個 P2 runtime error。24 個案例因真實 API Key、Google OAuth、Obsidian 或 install/update 事件尚未取得證據，維持 SKIP。</p>
    <div class="callout"><strong>修復順序：</strong>QA-P1-001 → QA-P1-003 → QA-P2-002；修完先重跑失敗案例，再由 KAKA 補 Phase 0-C manual gate。</div>
  </section>

  <section class="card">
    <h2>測試總覽</h2>
    <div class="grid">
      <div class="metric"><b>${sum.total}</b><span>全部案例</span></div>
      <div class="metric"><b class="pass">${sum.pass}</b><span>PASS</span></div>
      <div class="metric"><b class="fail">${sum.fail}</b><span>FAIL</span></div>
      <div class="metric"><b class="skip">${sum.skip}</b><span>SKIP</span></div>
      <div class="metric"><b>${severityCounts.P0}</b><span>P0</span></div>
      <div class="metric"><b class="fail">${severityCounts.P1}</b><span>P1</span></div>
      <div class="metric"><b class="skip">${severityCounts.P2}</b><span>P2</span></div>
    </div>
  </section>

  <section class="card">
    <h2>Phase 0-C Pre-Auth</h2>
    <p>Google OAuth session 未建立；沒有輸入、擷取或傳送任何真實 secret。其餘可離線驗證的案例已繼續執行。</p>
    <ul>${manualGates}</ul>
  </section>

  <section class="card">
    <h2>獨立缺陷（${BUGS.length}）</h2>
    ${bugCards}
  </section>

  <section class="card">
    <h2>各模組 UAT</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>模組</th><th>名稱</th><th>TC</th><th>PASS</th><th>FAIL</th><th>SKIP</th></tr></thead>
      <tbody>${moduleRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>Phase 2 安全／強健性</h2>
    <table><thead><tr><th>項目</th><th>結果</th><th>說明</th></tr></thead><tbody>${securityRows}</tbody></table>
  </section>

  <section class="card">
    <h2>60 個案例明細</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>ID</th><th>案例</th><th>結果</th><th>證據摘要</th></tr></thead>
      <tbody>${resultRows}</tbody>
    </table></div>
  </section>

  <section class="card">
    <h2>證據與可重跑入口</h2>
    <ul>
      <li><code>qa-reports/phase1-2-results.json</code></li>
      <li><code>qa-reports/scripts/run-phase1-2.js</code></li>
      <li><code>qa-reports/*-uat-checklist.md</code></li>
      <li><code>qa-reports/*-qa-bug-report.md</code></li>
      <li><code>qa-reports/screenshots/</code></li>
    </ul>
  </section>
</main></body></html>`;
}

for (const moduleId of Object.keys(MODULE_NAMES)) writeModuleReports(moduleId);
fs.writeFileSync(OUT_HTML, renderHtml(), 'utf8');

const preAuth = `# Phase 0-C — Pre-Auth 結果

- 日期：2026-07-24（Asia/Taipei）
- 需要登入的模組：B5 雲端同步
- 必要 session：Google OAuth（Drive appData scope）
- 實際狀態：未建立 session；Edge 顯示尚未登入
- 安全邊界：未輸入、顯示、擷取或傳送真實 API Key／token

## 判定

Phase 0-C 已完成「需求盤點與 gate 分流」，但 OAuth session 尚待 KAKA 人工授權。B5 的 4 個 OAuth／Drive 案例標記 SKIP；B5 RWD 與其他不需登入的案例照常執行。

## 明日接續

1. KAKA 在隔離 QA profile 自行完成 Google 登入／授權。
2. 只重跑 TC-B5-001～004。
3. 不把登入成功等同於 Drive 上傳／下載成功；兩方向都要比對一般設定，且 API Key／單字本／歷史不得同步。
`;
fs.writeFileSync(path.join(REPORT_DIR, 'phase0c-preauth.md'), preAuth, 'utf8');

const phase2 = `# Phase 2 — Console / Network / 邊界稽查

- 11 / 11 關鍵 surface 無非預期 console／network／5xx。
- 404 測試頁的 404 console／network 訊息為預期負向證據。
- Options 每次載入都重現 \`LAST_VOCAB_BACKUP_KEY\` TDZ，已列 QA-P2-002。
- host 表單與 Options 的空白、XSS、500 字元輸入均未執行 script。
- 500 雙重探測：fresh context 200；extension context reload 200；查無 5xx。
- Phase 3 未觸發 OTP／金流／CAPTCHA；Google OAuth 已在 Phase 0-C 先分流。

完整機器證據：\`qa-reports/phase1-2-results.json\`。
`;
fs.writeFileSync(path.join(REPORT_DIR, 'phase2-boundary-console.md'), phase2, 'utf8');

process.stdout.write(`PASS modules=${Object.keys(MODULE_NAMES).length} html=${OUT_HTML}\n`);
