'use strict';

// 2026-11-20 Code Review P3 回歸測試（第 12 項 options.js 模組化 + 第 13 項防呆與續翻保留）
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { isTextSelectionControl, isSensitiveTextSelectionControl } = require('../content/selection-controls');
const CloudSync = require('../cloud-sync');

const ROOT = path.join(__dirname, '..');

function input(attrs = {}) {
  const el = document.createElement('input');
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else el.setAttribute(key, value);
  });
  return el;
}

describe('P3 Item 13 — 邊界防呆與續翻狀態保留', () => {
  it('selection-controls: 詞界防護不誤擋 card-body / shipping / hotel / laptop，且仍擋住 camelCase 敏感欄', () => {
    const allowed = [
      input({ type: 'text', className: 'card-body' }),
      input({ type: 'text', id: 'shipping-address' }),
      input({ type: 'text', name: 'hotelName' }),
      input({ type: 'text', placeholder: 'laptop model notes' }),
      input({ type: 'text', id: 'discard-draft' })
    ];
    allowed.forEach(el => {
      expect(isSensitiveTextSelectionControl(el)).toBe(false);
      expect(isTextSelectionControl(el)).toBe(true);
    });

    const blocked = [
      input({ type: 'text', id: 'userPin' }),
      input({ type: 'text', name: 'otpCode' }),
      input({ type: 'text', id: 'creditCardNumber' }),
      input({ type: 'text', name: 'cardHolder' }),
      input({ type: 'text', name: 'debit_card' }),
      input({ type: 'text', name: 'tel_num' }),
      input({ type: 'text', name: 'billingAddressAndPhone' })
    ];
    blocked.forEach(el => {
      expect(isSensitiveTextSelectionControl(el)).toBe(true);
      expect(isTextSelectionControl(el)).toBe(false);
    });
  });

  it('floating-ball: saveFloatingBallPosition 限制最多保留 50 站並淘汰最舊網域', async () => {
    const localStore = { fanFanBaFloatingPosition: {} };
    for (let i = 0; i < 60; i += 1) {
      localStore.fanFanBaFloatingPosition[`old-${i}.example.com`] = {
        top: 100,
        side: 'right',
        updatedAt: 1000 + i
      };
    }

    document.body.innerHTML = '<main></main>';
    const context = vm.createContext({
      window,
      document,
      location: { hostname: 'current.example.com' },
      navigator,
      chrome: {
        runtime: { id: 'ext-test', getURL: p => p, sendMessage: jest.fn(async () => ({ ok: true })) },
        storage: {
          local: {
            get: jest.fn(async key => ({ [key]: localStore[key] })),
            set: jest.fn(async values => { Object.assign(localStore, values); })
          }
        }
      },
      console,
      Date,
      setTimeout,
      clearTimeout
    });
    context.globalThis = context;
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'models.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'content/site-policy.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'content/state.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'content/dom.js'), 'utf8'), context);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'content/floating-ball.js'), 'utf8'), context);

    await context.saveFloatingBallPosition();
    const saved = localStore.fanFanBaFloatingPosition;
    const keys = Object.keys(saved);
    expect(keys).toHaveLength(50);
    expect(saved['current.example.com']).toBeDefined();
    expect(saved['old-0.example.com']).toBeUndefined();
    expect(saved['old-59.example.com']).toBeDefined();
  });

  it('cloud-sync: uploadCloudSettings 使用密碼學隨機 hex boundary（兩次不重複）', async () => {
    const originalFetch = global.fetch;
    const boundaries = [];
    global.fetch = jest.fn(async (url, opts = {}) => {
      if (url.includes('spaces=appDataFolder')) {
        return { ok: true, json: async () => ({ files: [] }) };
      }
      const match = /boundary=([^\s;]+)/.exec(opts.headers?.['Content-Type'] || '');
      if (match) boundaries.push(match[1]);
      return { ok: true, json: async () => ({ id: 'file-1' }) };
    });
    chrome.storage.local.get.mockResolvedValue({});
    chrome.storage.local.set.mockResolvedValue();

    try {
      const payload = await CloudSync.buildCloudSettingsPayload({ model: 'groq:openai/gpt-oss-120b' }, { appVersion: '1.11.1', deviceId: 'dev-1' });
      await CloudSync.uploadCloudSettings('tok', payload);
      await CloudSync.uploadCloudSettings('tok', payload);
      expect(boundaries).toHaveLength(2);
      expect(boundaries[0]).toMatch(/^fan-fan-ba-[0-9a-f]{32}$/);
      expect(boundaries[1]).toMatch(/^fan-fan-ba-[0-9a-f]{32}$/);
      expect(boundaries[0]).not.toBe(boundaries[1]);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('package-extension.js: 收錄 options/ 目錄並用 try/finally 清理 _pack.ps1', () => {
    const source = fs.readFileSync(path.join(ROOT, 'scripts/package-extension.js'), 'utf8');
    expect(source).toMatch(/INCLUDE_DIRS\s*=\s*\[[^\]]*'options'/);
    expect(source).toMatch(/try\s*\{[\s\S]*execFileSync\('powershell'[\s\S]*\}\s*finally\s*\{[\s\S]*rmSync\(psPath/);
  });

  it('page-translator-panel: 續翻或沒有新段落時保留先前已譯段落與複製內容', async () => {
    const oldStyle = window.getComputedStyle;
    const oldRect = HTMLElement.prototype.getBoundingClientRect;
    window.getComputedStyle = jest.fn(() => ({
      display: 'block', visibility: 'visible', opacity: '1', fontSize: '16px', lineHeight: 'normal', backgroundColor: 'rgb(255, 255, 255)'
    }));
    HTMLElement.prototype.getBoundingClientRect = jest.fn(function rect() {
      const top = Number(this.dataset?.rectTop || 100);
      return { top, bottom: top + 60, left: 20, right: 620, width: 600, height: 60 };
    });

    try {
      document.body.innerHTML = `
        <main>
          <p id="p1" data-rect-top="100">First visible paragraph about regional supply chain planning.</p>
          <p id="p2" data-rect-top="1400">Second paragraph initially below the viewport fold for later.</p>
        </main>
      `;

      let replyCount = 0;
      const mockChrome = {
        runtime: {
          id: 'ext-test',
          connect: jest.fn(() => {
            const listeners = { message: [], disconnect: [] };
            return {
              onMessage: { addListener: cb => listeners.message.push(cb) },
              onDisconnect: { addListener: cb => listeners.disconnect.push(cb) },
              postMessage: jest.fn(msg => {
                replyCount += 1;
                const chunk = replyCount === 1 ? '第一段譯文' : '第二段譯文';
                Promise.resolve().then(() => {
                  listeners.message.forEach(cb => cb({ requestId: msg.requestId, chunk }));
                  listeners.message.forEach(cb => cb({ requestId: msg.requestId, done: true }));
                });
              }),
              disconnect: jest.fn()
            };
          })
        }
      };

      const context = vm.createContext({
        window,
        document,
        location,
        history,
        navigator,
        chrome: mockChrome,
        console,
        Date,
        Node,
        Map,
        Set,
        Promise,
        MutationObserver,
        updateFloatingBallPageTranslationState: () => {},
        setTimeout,
        clearTimeout
      });
      context.globalThis = context;
      ['models.js', 'content/site-policy.js', 'content/state.js', 'content/dom.js',
        'content/page-translator-state.js', 'content/page-translator-collector.js',
        'content/page-translator-client.js', 'content/page-translator-renderer.js',
        'content/page-translator-panel.js'].forEach(file => {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context, { filename: file });
      });

      context.startPageTranslationBeta();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(vm.runInContext('pageTranslationState.done', context)).toBe(1);
      expect(context.buildPageTranslationCopyText('translation')).toBe('第一段譯文');

      // 沒有新段落時再次呼叫：不應清空原本的 items 與計數
      context.startPageTranslationBeta();
      expect(vm.runInContext('pageTranslationState.done', context)).toBe(1);
      expect(vm.runInContext('pageTranslationState.total', context)).toBe(1);
      expect(context.buildPageTranslationCopyText('translation')).toBe('第一段譯文');

      // 第二段捲入視窗後再按繼續翻譯：應保留第一段並累計成 2/2
      document.getElementById('p2').dataset.rectTop = '120';
      context.startPageTranslationBeta();
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(vm.runInContext('pageTranslationState.done', context)).toBe(2);
      expect(vm.runInContext('pageTranslationState.total', context)).toBe(2);
      expect(context.buildPageTranslationCopyText('translation')).toBe('第一段譯文\n\n第二段譯文');

      context.restorePageTranslationBeta();
    } finally {
      window.getComputedStyle = oldStyle;
      HTMLElement.prototype.getBoundingClientRect = oldRect;
    }
  });
});

describe('P3 Item 12 — options.html 瀏覽器腳本順序與無 require 載入契約', () => {
  it('options.html 列出的所有 <script> 檔案皆存在，且無 require 環境可依序完成初始化', () => {
    const html = fs.readFileSync(path.join(ROOT, 'options.html'), 'utf8');
    const scripts = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map(match => match[1]);
    expect(scripts).toContain('options/shared.js');
    expect(scripts).toContain('options.js');
    expect(scripts[scripts.length - 1]).toBe('options.js');

    document.documentElement.innerHTML = html;
    const mockChrome = {
      runtime: {
        id: 'ext-test',
        getManifest: () => ({ version: '1.11.1', oauth2: { client_id: '', scopes: [] } }),
        sendMessage: jest.fn(async () => ({ ok: true, snapshots: [], items: [] }))
      },
      storage: {
        local: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async () => {}),
          remove: jest.fn(async () => {})
        },
        sync: {
          get: jest.fn(async () => ({})),
          set: jest.fn(async () => {}),
          remove: jest.fn(async () => {})
        },
        onChanged: { addListener: jest.fn() }
      },
      commands: { getAll: jest.fn(async () => []) },
      permissions: { request: jest.fn(async () => true) },
      tabs: { create: jest.fn() }
    };

    // 刻意不提供 require，驗證真 Chrome extension 頁面透過 <script> 載入所有 options/*.js 零錯誤
    const context = vm.createContext({
      window,
      document,
      location,
      history,
      navigator,
      chrome: mockChrome,
      console,
      Date,
      Map,
      Set,
      Promise,
      URL,
      Blob,
      FileReader,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      crypto: globalThis.crypto,
      btoa: globalThis.btoa,
      atob: globalThis.atob,
      setTimeout,
      clearTimeout
    });
    context.globalThis = context;

    scripts.forEach(src => {
      const fullPath = path.join(ROOT, src);
      expect(fs.existsSync(fullPath)).toBe(true);
      vm.runInContext(fs.readFileSync(fullPath, 'utf8'), context, { filename: src });
    });

    expect(Object.keys(context.FanFanBaOptionsModules).sort()).toEqual([
      'actionEditor',
      'backupCrypto',
      'cloudSyncUi',
      'diagnostics',
      'glossaryEditor',
      'modelCompare',
      'navigation',
      'shared',
      'vocabularyBackup'
    ]);
  });
});
