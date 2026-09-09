#!/usr/bin/env node
'use strict';

// 現況數字腐化防呆。
//
// 問題：`TESTING.md`／`MANUAL-QA.md`／`PLAN.md`／`project-overview.html` 各自寫著「目前測試數」，
// 加了測試卻沒同步就會靜靜過期，而**不會有任何測試變紅**。2026-09-09 實際清過一次：
// 三處分別停在 318／317／273，互相都不一致。
//
// 為什麼用標記而不是正則掃全檔：這些檔裡的數字**絕大多數是歷史紀錄**（「2026-07-28：26 suites /
// 249 tests 全綠」這類有日期的驗收條目），那些本來就不該跟著現況變。靠正則或日期前綴去猜哪個是
// 「現況」極不可靠，所以改成顯式標記——**只有被標記的數字才是現況宣稱**，其餘一律視為歷史、不管。
//
// 標記格式（HTML 註解，Markdown 與 HTML 都不會顯示）：
//   <!-- ffb:tests -->324<!-- /ffb:tests -->
//   <!-- ffb:suites -->27<!-- /ffb:suites -->
//
// 兩種模式：
//   預設      一致性檢查：所有標記過的同名數字必須相等。快、不跑 jest，
//             但**不對照實際測試結果**——全部一起過期它抓不到，輸出會明講。
//   --verify  權威檢查：實跑 jest 取真實數字再比對。慢（約 1-2 分鐘），給 release／CI 用。
//
// exit：0 通過／1 不一致或與實際不符／2 未檢（讀不到檔、jest 跑不起來）。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// 會被掃描的檔。新增檔案要記得加進來——沒列到的檔即使有標記也不會被檢查。
const FILES = ['TESTING.md', 'MANUAL-QA.md', 'PLAN.md', 'project-overview.html'];

// 目前支援的欄位。key 是標記名，value 是從 jest --json 取真實值的方法（--verify 用）。
const FIELDS = {
  suites: summary => summary.numTotalTestSuites,
  tests: summary => summary.numTotalTests
};

/** 純函式：從一份文字裡抓出某個欄位的所有標記值（含出現位置的行號）。 */
function extractMarks(text, field) {
  const pattern = new RegExp(`<!--\\s*ffb:${field}\\s*-->\\s*(\\d+)\\s*<!--\\s*/ffb:${field}\\s*-->`, 'g');
  const found = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const line = text.slice(0, match.index).split('\n').length;
    found.push({ line, value: Number(match[1]) });
  }
  return found;
}

/** 純函式：判斷一組標記值是否一致；回傳 {ok, values, expected}。 */
function checkConsistency(marks) {
  const values = [...new Set(marks.map(m => m.value))];
  return { ok: values.length <= 1, values, expected: values.length === 1 ? values[0] : null };
}

function collect() {
  const byField = {};
  for (const field of Object.keys(FIELDS)) byField[field] = [];
  for (const name of FILES) {
    const full = path.join(ROOT, name);
    if (!fs.existsSync(full)) throw new Error(`列在 FILES 的檔不存在：${name}`);
    const text = fs.readFileSync(full, 'utf8');
    for (const field of Object.keys(FIELDS)) {
      extractMarks(text, field).forEach(m => byField[field].push({ ...m, file: name }));
    }
  }
  return byField;
}

function runJestSummary() {
  const out = path.join(require('os').tmpdir(), `ffb-jest-${process.pid}.json`);
  // 直接跑 jest 的 JS 入口，不經 npx：
  //   - `npx` 在 Win 是 `npx.cmd`，而 Node 自 CVE-2024-27980 起禁止在沒有 shell 的情況下
  //     執行 .cmd／.bat（會拿到 `spawnSync npx.cmd EINVAL`）
  //   - 補 shell:true 繞過去則會噴 DEP0190（參數不跳脫），未來要變成錯誤
  // 用 process.execPath ＋ jest.js 兩邊都不沾。
  const jestBin = path.join(ROOT, 'node_modules', 'jest', 'bin', 'jest.js');
  if (!fs.existsSync(jestBin)) throw new Error(`找不到 jest 入口 ${jestBin}（是不是還沒 npm install？）`);
  execFileSync(process.execPath, [jestBin, '--json', `--outputFile=${out}`, '--testPathIgnorePatterns', '/\\.claude/'],
    { cwd: ROOT, stdio: 'ignore' });
  const summary = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.unlinkSync(out);
  return summary;
}

function main(argv) {
  const verify = argv.includes('--verify');
  let byField;
  try {
    byField = collect();
  } catch (error) {
    console.error(`未檢：${error.message}`);
    return 2;
  }

  let failed = false;
  const expectedByField = {};

  console.log('=== 現況數字一致性 ===');
  for (const field of Object.keys(FIELDS)) {
    const marks = byField[field];
    if (marks.length === 0) {
      console.error(`❌ 欄位 ffb:${field} 在所有檔案裡一個標記都沒有——現況數字沒被任何東西守著。`);
      failed = true;
      continue;
    }
    const { ok, values, expected } = checkConsistency(marks);
    const where = marks.map(m => `${m.file}:${m.line}=${m.value}`).join('、');
    if (ok) {
      console.log(`✅ ffb:${field} = ${expected}（${marks.length} 處一致）：${where}`);
      expectedByField[field] = expected;
    } else {
      console.error(`❌ ffb:${field} 不一致，出現 ${values.length} 種值 ${values.join('／')}：${where}`);
      failed = true;
    }
  }

  if (!verify) {
    console.log('\n⚠️ 預設模式**只比對文件彼此**，未對照實際測試結果——全部一起過期抓不到。');
    console.log('   要權威檢查請跑 `npm run check-docs -- --verify`（會實跑 jest）。');
    return failed ? 1 : 0;
  }

  console.log('\n=== 對照實際 jest 結果（--verify）===');
  let summary;
  try {
    summary = runJestSummary();
  } catch (error) {
    console.error(`未檢：jest 跑不起來（${error.message}）——這不等於通過。`);
    return 2;
  }
  for (const [field, pick] of Object.entries(FIELDS)) {
    if (!(field in expectedByField)) continue;
    const actual = pick(summary);
    if (expectedByField[field] === actual) {
      console.log(`✅ ffb:${field} 文件寫 ${expectedByField[field]}，實跑也是 ${actual}`);
    } else {
      console.error(`❌ ffb:${field} 文件寫 ${expectedByField[field]}，實跑是 ${actual} —— 文件已過期`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

// ── self-test（離線，不讀專案檔、不跑 jest）──────────────────────────────
function selftest() {
  const cases = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    cases.push([name, ok, ok ? '' : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`]);
  };

  check('抓得到單一標記',
    extractMarks('前面 <!-- ffb:tests -->324<!-- /ffb:tests --> 後面', 'tests'),
    [{ line: 1, value: 324 }]);
  check('多個標記與行號',
    extractMarks('a\n<!-- ffb:tests -->1<!-- /ffb:tests -->\nb\n<!-- ffb:tests -->2<!-- /ffb:tests -->', 'tests'),
    [{ line: 2, value: 1 }, { line: 4, value: 2 }]);
  check('容忍標記內外空白',
    extractMarks('<!--  ffb:tests  --> 42 <!--  /ffb:tests  -->', 'tests'),
    [{ line: 1, value: 42 }]);
  check('不同欄位不互相干擾',
    extractMarks('<!-- ffb:suites -->27<!-- /ffb:suites -->', 'tests'), []);
  check('**未標記的歷史數字一律不抓**（本 lint 的核心前提）',
    extractMarks('2026-07-28：26 suites / 249 tests 全綠', 'tests'), []);
  check('沒有結束標記就不算數',
    extractMarks('<!-- ffb:tests -->324', 'tests'), []);

  check('一致 → ok',
    checkConsistency([{ value: 5 }, { value: 5 }]), { ok: true, values: [5], expected: 5 });
  check('不一致 → 不 ok（漏改一處就是這條抓）',
    checkConsistency([{ value: 5 }, { value: 6 }]), { ok: false, values: [5, 6], expected: null });
  check('單一標記也算一致',
    checkConsistency([{ value: 5 }]), { ok: true, values: [5], expected: 5 });

  cases.forEach(([name, ok, detail]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`));
  const passed = cases.filter(([, ok]) => ok).length;
  const allOk = passed === cases.length;
  console.log(allOk ? `SELFTEST ${passed}/${cases.length} PASS` : `SELFTEST ${passed}/${cases.length} FAIL`);
  return allOk ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = process.argv.includes('--selftest') ? selftest() : main(process.argv.slice(2));
}

module.exports = { extractMarks, checkConsistency };
