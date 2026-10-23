/**
 * @jest-environment node
 */
'use strict';

// e2e harness 的 service worker 現行版檢查：真實環境很難造出的失敗路徑，用假的瀏覽器 context 驗。
// 鎖住三件事：任何一步丟錯都會關掉瀏覽器；卡住的 worker 不會讓檢查永遠掛著；
// reload 後還沒終止的舊 worker 不會被誤採信。

const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('../e2e/lib/harness');

const EXT_ID = 'testextid';
const PREFIX = `chrome-extension://${EXT_ID}/`;

const tempDirs = [];
afterAll(() => {
  tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

// 假 dist/pkg：background.js 帶指定指紋
function makeExtDir(buildId) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffb-sw-check-'));
  tempDirs.push(dir);
  fs.writeFileSync(path.join(dir, 'background.js'), `x();\nself.FFB_BUILD_ID = '${buildId}';\n`, 'utf8');
  return dir;
}

function fakeWorker(evaluate) {
  return { url: () => `${PREFIX}background.js`, evaluate };
}

// 假 context：workers() 決定每次 serviceWorkers() 回什麼；reload 後切到 afterReload
function fakeContext({ before, afterReload = before, gotoError } = {}) {
  let reloaded = false;
  const ctx = {
    closed: false,
    close: jest.fn(async () => { ctx.closed = true; }),
    serviceWorkers: () => (reloaded ? afterReload : before),
    newPage: async () => ({
      goto: async () => { if (gotoError) throw gotoError; },
      // reload 頁面的 evaluate 會排程 chrome.runtime.reload()，這裡直接切狀態
      evaluate: async fn => { if (String(fn).includes('runtime.reload')) reloaded = true; return null; },
      waitForEvent: async () => { },
      close: async () => { }
    })
  };
  return ctx;
}

const DISK = 'aaaaaaaaaaaa';
const OLD = 'bbbbbbbbbbbb';

describe('assertCurrentServiceWorker', () => {
  test('一致 → 直接放行、不關瀏覽器', async () => {
    const ctx = fakeContext({ before: [fakeWorker(async () => DISK)] });
    await expect(H.assertCurrentServiceWorker(ctx, EXT_ID, makeExtDir(DISK))).resolves.toBe(DISK);
    expect(ctx.close).not.toHaveBeenCalled();
  });

  test('options 頁載入失敗 → 先關瀏覽器再丟錯（不留 Chrome 鎖住 profile）', async () => {
    const ctx = fakeContext({ before: [], gotoError: new Error('goto timeout') });
    await expect(H.assertCurrentServiceWorker(ctx, EXT_ID, makeExtDir(DISK))).rejects.toThrow('goto timeout');
    expect(ctx.close).toHaveBeenCalled();
  });

  test('reload 後舊 worker 還沒終止 → 不採信它，改讀新 worker', async () => {
    const stale = fakeWorker(async () => OLD);
    const fresh = fakeWorker(async () => DISK);
    const ctx = fakeContext({ before: [stale], afterReload: [stale, fresh] });
    await expect(H.assertCurrentServiceWorker(ctx, EXT_ID, makeExtDir(DISK))).resolves.toBe(DISK);
    expect(ctx.close).not.toHaveBeenCalled();
  });

  test('卡住的 worker 逾時後換下一個，不會永遠掛著', async () => {
    const hung = fakeWorker(() => new Promise(() => { }));
    const ok = fakeWorker(async () => DISK);
    const ctx = fakeContext({ before: [hung, ok] });
    await expect(H.assertCurrentServiceWorker(ctx, EXT_ID, makeExtDir(DISK))).resolves.toBe(DISK);
  }, 10000);

  test('reload 後仍不一致 → 關瀏覽器並說明原因', async () => {
    const ctx = fakeContext({ before: [fakeWorker(async () => OLD)], afterReload: [fakeWorker(async () => OLD)] });
    await expect(H.assertCurrentServiceWorker(ctx, EXT_ID, makeExtDir(DISK))).rejects.toThrow('reload 後 service worker 仍不是現行版');
    expect(ctx.close).toHaveBeenCalled();
  });
});

describe('withTimeout', () => {
  test('逾時就 reject，不等原本的 promise', async () => {
    await expect(H.withTimeout(new Promise(() => { }), 50)).rejects.toThrow('逾時 50ms');
  });

  test('先完成就回原值', async () => {
    await expect(H.withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
});
