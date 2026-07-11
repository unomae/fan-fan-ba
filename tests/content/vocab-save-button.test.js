'use strict';

// WS-E A1'''：收藏按鈕「先綁 click 再查已收藏狀態」引入的 state-clobber race 回歸鎖。
// 若初始 isVocabularySaved 查詢在使用者已點擊觸發收藏「之後」才 resolve，
// 不得把 saving/saved 狀態蓋回 idle（否則放行第二次 saveVocabularyEntry → count 膨脹）。

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function runContentScript(file, context) {
  const source = fs.readFileSync(path.join(__dirname, '../../', file), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

function createContext(overrides) {
  const context = vm.createContext({
    window, document, navigator, console, setTimeout, clearTimeout,
    chrome: { runtime: { id: 'x' } },
    escapeHtml: v => String(v),
    hideAutoSaveToast: jest.fn(),
    FanFanBaModels: { MODELS: [], MODEL_NAME_MAP: {}, normalizeModel: m => m },
    ...overrides
  });
  context.globalThis = context;
  runContentScript('content/dom.js', context);
  runContentScript('content/result-card.js', context);
  return context;
}

describe('收藏按鈕 state-clobber race（WS-E A1\'\'\'）', () => {
  it('查詢在點擊收藏後才回來時，不覆寫 saving/saved、不放行第二次收藏', async () => {
    const savedQuery = deferred();
    const saveEntry = jest.fn(async () => ({ item: { id: 'en:x', word: 'x' } }));
    const context = createContext({
      isVocabularySaved: jest.fn(() => savedQuery.promise),
      saveVocabularyEntry: saveEntry
    });

    document.body.innerHTML = '<div class="g-body"><button class="g-vocab-save-btn"><span></span></button></div>';
    const body = document.querySelector('.g-body');
    const button = document.querySelector('.g-vocab-save-btn');

    // 初始查詢尚未 resolve（模擬慢查詢）
    const initPromise = context.initVocabularySaveButton(body, { word: 'x', lang: 'en' }, 'x');

    // 查詢飛行中使用者點擊收藏
    button.click();
    await Promise.resolve(); // 讓 click handler 的 saving 狀態落地
    expect(button.disabled).toBe(true); // 收藏進行中，按鈕鎖住

    // 初始查詢此刻才回來，回報「未收藏」
    savedQuery.resolve(false);
    await savedQuery.promise;
    await initPromise;
    await Promise.resolve();

    // 舊 bug：初始查詢會把按鈕蓋回 idle（button.disabled=false），放行第二次點擊
    expect(saveEntry).toHaveBeenCalledTimes(1);
    expect(button.classList.contains('g-vocab-saved')).toBe(true);
  });

  it('無點擊時，初始查詢正常設定 saved/idle', async () => {
    const context = createContext({
      isVocabularySaved: jest.fn(async () => true),
      saveVocabularyEntry: jest.fn()
    });
    document.body.innerHTML = '<div class="g-body"><button class="g-vocab-save-btn"><span></span></button></div>';
    const body = document.querySelector('.g-body');
    const button = document.querySelector('.g-vocab-save-btn');

    await context.initVocabularySaveButton(body, { word: 'y', lang: 'en' }, 'y');

    expect(button.classList.contains('g-vocab-saved')).toBe(true);
  });
});
