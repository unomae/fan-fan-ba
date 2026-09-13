// Onboarding checklist（2026-09-13）。step 1／2 自動偵測、step 3 使用者自己勾，
// 三者的完成狀態與「切回分頁會重新偵測」都在這裡鎖住。
describe('Welcome module', () => {
  let localStore;

  // storage.js 與 welcome.js 會用 array／string 兩種形式取鍵，所以假 store 要都吃
  function pick(keys) {
    if (Array.isArray(keys)) {
      return keys.reduce((acc, key) => {
        if (key in localStore) acc[key] = localStore[key];
        return acc;
      }, {});
    }
    if (typeof keys === 'string') {
      return key0(keys);
    }
    // 物件形式＝帶預設值
    return Object.entries(keys || {}).reduce((acc, [key, fallback]) => {
      acc[key] = key in localStore ? localStore[key] : fallback;
      return acc;
    }, {});
  }

  function key0(key) {
    return key in localStore ? { [key]: localStore[key] } : {};
  }

  function setupDom() {
    document.body.innerHTML = `
      <button id="btnSettings"></button>
      <button id="btnClose"></button>
      <div class="step" data-step="apikey">
        <h3><span class="step-state" data-step-state>檢查中…</span></h3>
      </div>
      <div class="step" data-step="firstuse">
        <h3><span class="step-state" data-step-state>檢查中…</span></h3>
      </div>
      <div class="step" data-step="obsidian">
        <h3><button class="step-state is-toggle" data-step-state data-step-toggle>標記完成</button></h3>
      </div>
    `;
  }

  function stepState(name) {
    const step = document.querySelector(`[data-step="${name}"]`);
    return {
      done: step.classList.contains('is-done'),
      label: step.querySelector('[data-step-state]').textContent
    };
  }

  // click handler 是 async，click() 本身不等它跑完；要排空 microtask 才看得到寫入
  // 用 setTimeout 不用 setImmediate：jsdom 環境沒有 setImmediate（Node 有，jsdom 沒搬進來）
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  function load() {
    // 讓 welcome.js 走 require('./storage') 那條，用真的 storage.js 配假 chrome
    delete globalThis.FanFanBaStorage;
    return require('../welcome');
  }

  beforeEach(() => {
    jest.resetModules();
    localStore = {};
    global.window.close = jest.fn();
    chrome.storage.local.get.mockImplementation(async keys => pick(keys));
    chrome.storage.local.set.mockImplementation(async values => { Object.assign(localStore, values); });
    chrome.storage.sync.get.mockImplementation(async () => ({}));
    chrome.storage.sync.remove.mockImplementation(async () => {});
    setupDom();
  });

  it('should open options page when settings clicked', async () => {
    const welcome = load();
    await welcome.refreshSteps();
    document.getElementById('btnSettings').click();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('should close window when close clicked', async () => {
    const welcome = load();
    await welcome.refreshSteps();
    document.getElementById('btnClose').click();
    expect(window.close).toHaveBeenCalled();
  });

  it('三個 step 在全新安裝時都顯示未完成', async () => {
    const welcome = load();
    await welcome.refreshSteps();

    expect(stepState('apikey')).toEqual({ done: false, label: '還沒設定' });
    expect(stepState('firstuse')).toEqual({ done: false, label: '還沒用過' });
    expect(stepState('obsidian')).toEqual({ done: false, label: '標記完成' });
  });

  it('任一家 API Key 設好就自動勾掉 step 1', async () => {
    localStore.groqApiKey = 'gsk_dummy';
    const welcome = load();
    await welcome.refreshSteps();

    expect(stepState('apikey')).toEqual({ done: true, label: '已設定' });
    // 設了 key 不代表用過，step 2 不該連坐
    expect(stepState('firstuse').done).toBe(false);
  });

  it('用過任一動作（含全文翻譯）就自動勾掉 step 2', async () => {
    localStore.fanFanBaDiagnostics = {
      since: '2026-09-13T00:00:00.000Z',
      actions: { translate: 0, explain: 0, optimize: 0 },
      pageTranslations: 2,
      errors: 0
    };
    const welcome = load();
    await welcome.refreshSteps();

    expect(stepState('firstuse')).toEqual({ done: true, label: '已用過' });
  });

  it('計數全為 0 時 step 2 維持未完成（不得把有紀錄當成用過）', async () => {
    localStore.fanFanBaDiagnostics = {
      since: '2026-09-13T00:00:00.000Z',
      actions: { translate: 0, explain: 0, optimize: 0 },
      pageTranslations: 0,
      errors: 5
    };
    const welcome = load();
    await welcome.refreshSteps();

    expect(stepState('firstuse').done).toBe(false);
  });

  it('step 3 可手動勾、會寫進 storage，再點一次可取消', async () => {
    const welcome = load();
    await welcome.refreshSteps();

    document.querySelector('[data-step-toggle]').click();
    await flush();
    expect(localStore[welcome.ONBOARDING_KEY]).toEqual({ obsidianDone: true });
    // handler 自己會重繪，這裡再跑一次只是確保斷言讀到的是最終狀態
    await welcome.refreshSteps();
    expect(stepState('obsidian')).toEqual({ done: true, label: '已完成' });

    document.querySelector('[data-step-toggle]').click();
    await flush();
    expect(localStore[welcome.ONBOARDING_KEY]).toEqual({ obsidianDone: false });
    await welcome.refreshSteps();
    expect(stepState('obsidian').done).toBe(false);
  });

  it('切回分頁會重新偵測（設完 key 回來這頁要看到已設定）', async () => {
    const welcome = load();
    await welcome.refreshSteps();
    expect(stepState('apikey').done).toBe(false);

    // 使用者去設定頁填了 key
    localStore.apiKey = 'AIza-dummy';
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // 刻意**不**手動呼叫 refreshSteps：這條要驗的就是 listener 自己會重算。
    // 補一次就會變成「listener 拿掉也照樣綠」的假鎖（2026-09-13 實際踩過）。
    await flush();

    expect(stepState('apikey')).toEqual({ done: true, label: '已設定' });
  });

  it('分頁被隱藏時不重算（避免切走也白跑一輪）', async () => {
    const welcome = load();
    await welcome.refreshSteps();

    localStore.apiKey = 'AIza-dummy';
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();

    expect(stepState('apikey').done).toBe(false);
  });

  it('storage 讀不到時不炸，三個 step 都顯示未完成', async () => {
    chrome.storage.local.get.mockImplementation(async () => { throw new Error('storage 掛了'); });
    const welcome = load();

    // 不得 reject：載入時就會跑一次，rejection 沒人接會讓整頁炸掉
    await expect(welcome.refreshSteps()).resolves.toBeUndefined();
    expect(stepState('apikey')).toEqual({ done: false, label: '還沒設定' });
    expect(stepState('firstuse')).toEqual({ done: false, label: '還沒用過' });
    expect(stepState('obsidian')).toEqual({ done: false, label: '標記完成' });
  });
});
