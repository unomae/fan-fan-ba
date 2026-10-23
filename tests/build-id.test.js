/**
 * @jest-environment node
 */
'use strict';

// e2e 建置指紋：打包時蓋進 dist/pkg/background.js，e2e 啟動時拿來比對 service worker
// 是不是現行版（同 profile＋同版本號時 Chrome 可能一直跑舊的 background.js）。

const fs = require('fs');
const os = require('os');
const path = require('path');
const B = require('../scripts/build-id');

// 建過的暫存夾全部記下，跑完統一刪掉，不在系統 temp 留垃圾
const tempDirs = [];
afterAll(() => {
  tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

function makeStage(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffb-build-id-'));
  tempDirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content, 'utf8');
  }
  return dir;
}

const BASE = {
  'background.js': "console.log('bg');\n",
  'models.js': 'const a = 1;\n',
  'content/main.js': 'main();\n'
};

describe('stampBuildId', () => {
  test('蓋進 background.js 尾端，讀得回同一個 12 碼指紋', () => {
    const dir = makeStage(BASE);
    const id = B.stampBuildId(dir);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    const stamped = fs.readFileSync(path.join(dir, 'background.js'), 'utf8');
    expect(stamped.startsWith(BASE['background.js'])).toBe(true);
    expect(B.readBuildId(stamped)).toBe(id);
  });

  test('同樣內容打包兩次指紋相同；重複蓋不會疊出第二行', () => {
    const a = makeStage(BASE);
    const b = makeStage(BASE);
    const idA = B.stampBuildId(a);
    expect(B.stampBuildId(b)).toBe(idA);
    expect(B.stampBuildId(a)).toBe(idA);
    const stamped = fs.readFileSync(path.join(a, 'background.js'), 'utf8');
    expect(stamped.match(/FFB_BUILD_ID/g)).toHaveLength(1);
  });

  test('任何一個檔（含子資料夾）改了，指紋就變', () => {
    const idBase = B.stampBuildId(makeStage(BASE));
    expect(B.stampBuildId(makeStage({ ...BASE, 'content/main.js': 'main(1);\n' }))).not.toBe(idBase);
    expect(B.stampBuildId(makeStage({ ...BASE, 'background.js': "console.log('bg2');\n" }))).not.toBe(idBase);
  });
});

describe('readBuildId', () => {
  test('原始碼 background.js 沒有指紋（只蓋在打包產物上）', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'background.js'), 'utf8');
    expect(B.readBuildId(source)).toBeNull();
  });

  test('空值或格式不符回 null', () => {
    expect(B.readBuildId('')).toBeNull();
    expect(B.readBuildId("self.FFB_BUILD_ID = 'xyz';")).toBeNull();
  });
});

describe('checkBuildId（e2e 啟動判斷）', () => {
  test.each([
    ['一致 → 放行', 'abc123abc123', 'abc123abc123', false, 'ok'],
    ['不一致、還沒 reload → reload', 'abc123abc123', 'fff000fff000', false, 'reload'],
    ['舊版 SW 沒有指紋 → reload', 'abc123abc123', null, false, 'reload'],
    ['reload 後仍不一致 → 停', 'abc123abc123', 'fff000fff000', true, 'fail'],
    ['reload 後一致 → 放行', 'abc123abc123', 'abc123abc123', true, 'ok'],
    ['磁碟沒指紋（沒跑 package）→ 直接停，不 reload', null, null, false, 'fail']
  ])('%s', (_name, diskId, runningId, reloaded, expected) => {
    expect(B.checkBuildId(diskId, runningId, { reloaded })).toBe(expected);
  });
});
