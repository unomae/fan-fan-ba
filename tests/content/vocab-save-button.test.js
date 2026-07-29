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

// 半接線接完工：exportVocabularyEntryToObsidianIfConfigured 之前零 production caller，
// obsidianExportedAt 恆為 null、單字面板的「已匯出」badge 永遠不會亮。
describe('收藏成功後的 Obsidian 匯出接線', () => {
  function mountSaveButton(overrides) {
    const context = createContext({
      isVocabularySaved: jest.fn(async () => false),
      saveVocabularyEntry: jest.fn(async () => ({ item: { id: 'en:harbor', word: 'Harbor' } })),
      ...overrides
    });
    document.body.innerHTML = '<div class="g-body"><button class="g-vocab-save-btn"><span></span></button></div>';
    return {
      context,
      body: document.querySelector('.g-body'),
      button: document.querySelector('.g-vocab-save-btn')
    };
  }

  async function clickAndSettle(button) {
    button.click();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  }

  it('收藏成功會呼叫匯出，按鈕升級成「已收藏並匯出」', async () => {
    const exportEntry = jest.fn(async () => ({ exported: true, folder: 'Learning' }));
    const { context, body, button } = mountSaveButton({
      exportVocabularyEntryToObsidianIfConfigured: exportEntry
    });

    await context.initVocabularySaveButton(body, { word: 'Harbor', lang: 'en' }, 'Harbor');
    await clickAndSettle(button);

    expect(exportEntry).toHaveBeenCalledWith({ id: 'en:harbor', word: 'Harbor' });
    expect(button.querySelector('span').textContent).toBe('已收藏並匯出');
    expect(button.title).toBe('已收藏到單字本並匯出 Obsidian');
  });

  it('沒設定 Obsidian 資料夾時停在「已收藏」，不謊報匯出', async () => {
    const exportEntry = jest.fn(async () => ({ exported: false, reason: 'missing-folder' }));
    const { context, body, button } = mountSaveButton({
      exportVocabularyEntryToObsidianIfConfigured: exportEntry
    });

    await context.initVocabularySaveButton(body, { word: 'Harbor', lang: 'en' }, 'Harbor');
    await clickAndSettle(button);

    expect(exportEntry).toHaveBeenCalledTimes(1);
    expect(button.querySelector('span').textContent).toBe('已收藏');
    expect(button.classList.contains('g-vocab-error')).toBe(false);
  });

  it('匯出丟錯時不得把「已收藏」回捲成錯誤（單字本那筆已經寫進去了）', async () => {
    const { context, body, button } = mountSaveButton({
      exportVocabularyEntryToObsidianIfConfigured: jest.fn(async () => {
        throw new Error('OBSIDIAN_URI_FAILED');
      })
    });

    await context.initVocabularySaveButton(body, { word: 'Harbor', lang: 'en' }, 'Harbor');
    await clickAndSettle(button);

    expect(button.classList.contains('g-vocab-saved')).toBe(true);
    expect(button.classList.contains('g-vocab-error')).toBe(false);
    expect(button.querySelector('span').textContent).toBe('已收藏');
  });

  it('已匯出過的單字不重複 append 週記，但仍顯示已匯出', async () => {
    const exportEntry = jest.fn(async () => ({ exported: true }));
    const { context, body, button } = mountSaveButton({
      saveVocabularyEntry: jest.fn(async () => ({
        item: { id: 'en:harbor', word: 'Harbor', obsidianExportedAt: '2026-07-20T04:00:00.000Z' }
      })),
      exportVocabularyEntryToObsidianIfConfigured: exportEntry
    });

    await context.initVocabularySaveButton(body, { word: 'Harbor', lang: 'en' }, 'Harbor');
    await clickAndSettle(button);

    expect(exportEntry).not.toHaveBeenCalled();
    expect(button.querySelector('span').textContent).toBe('已收藏並匯出');
  });

  it('沒有匯出 helper 時（舊 context）仍正常收藏', async () => {
    const { context, body, button } = mountSaveButton({});

    await context.initVocabularySaveButton(body, { word: 'Harbor', lang: 'en' }, 'Harbor');
    await clickAndSettle(button);

    expect(button.classList.contains('g-vocab-saved')).toBe(true);
    expect(button.querySelector('span').textContent).toBe('已收藏');
  });
});
