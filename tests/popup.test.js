describe('Popup module', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div id="modelList"></div>
      <div id="keyAlert" hidden><span id="keyAlertText"></span><button id="keyAlertAction"></button></div>
      <button id="openOptions"></button>
      <div id="shortcutList"></div>
      <button id="openShortcuts"></button>
    `;
    global.popupModule = require('../popup');
  });

  describe('keyless provider', () => {
    it('treats the builtin model as ready without any API key', () => {
      expect(global.popupModule.getApiKeyStatus('builtin:translator', {})).toEqual({ provider: 'builtin', hasKey: true });
    });
  });

  describe('MODELS', () => {
    // 原本只驗 length > 0——少一顆模型照樣綠，等於沒鎖。清冊內容的正本鎖在
    // models-registry.test.js「模型清冊完整性」；這裡只確認 popup 拿到的是同一份五顆。
    it('should expose the same six models as the registry', () => {
      expect(global.popupModule.MODELS).toBeDefined();
      expect(global.popupModule.MODELS.map(entry => entry.id)).toEqual([
        'groq:openai/gpt-oss-120b',
        'gemini-3.8-flash',
        'gemini-3.5-flash-lite',
        'openrouter:google/gemma-4-31b-it:free',
        'builtin:translator',
        'custom:endpoint'
      ]);
    });
  });

  // 只能全文翻譯的模型（瀏覽器內建）若被選成主模型，選字翻譯／解釋／優化會全部被背景端拒絕；
  // 設定頁主選單已排除它，popup 的快選也要排除
  describe('renderModels', () => {
    it('不列出只能全文翻譯的模型', () => {
      global.popupModule.renderModels('groq:openai/gpt-oss-120b');
      const names = [...document.querySelectorAll('#modelList .model-item .model-name')].map(el => el.textContent);
      const pageOnly = global.popupModule.MODELS.filter(m => m.pageTranslationOnly);
      expect(pageOnly.length).toBeGreaterThan(0);
      pageOnly.forEach(m => expect(names).not.toContain(m.name));
      expect(names).toHaveLength(global.popupModule.MODELS.length - pageOnly.length);
    });
  });

  describe('renderKeyAlert', () => {
    it('選的模型有金鑰時不顯示提醒', () => {
      global.popupModule.renderKeyAlert(global.popupModule.MODELS[0].id, { groqApiKey: 'gsk_test' });
      expect(document.getElementById('keyAlert').hidden).toBe(true);
    });

    it('缺金鑰時點名缺哪一家', () => {
      global.popupModule.renderKeyAlert(global.popupModule.MODELS[0].id, {});
      expect(document.getElementById('keyAlert').hidden).toBe(false);
      expect(document.getElementById('keyAlertText').textContent).toBe('選字等功能缺少 Groq API Key');
    });

    it('「填寫金鑰」直接開到設定頁的模型分類', () => {
      chrome.runtime.getURL = jest.fn(path => `chrome-extension://id/${path}`);
      document.getElementById('keyAlertAction').click();
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://id/options.html#model' });
    });
  });

  describe('全文翻譯主按鈕', () => {
    const builtin = { model: 'builtin:translator' };
    const cloud = { model: 'groq:openai/gpt-oss-120b' };
    const idle = { documentKey: 'document-1', active: false };
    const active = { ...idle, active: true, ...builtin, message: '翻譯中 0/1' };
    const action = () => document.getElementById('pageTranslationAction');
    const status = () => document.getElementById('pageTranslationStatus').textContent;
    let current;

    beforeEach(() => {
      jest.useFakeTimers();
      document.body.insertAdjacentHTML('beforeend', `
        <div id="pageTranslationFixture">
          <button id="pageTranslationAction" disabled></button>
          <p id="pageTranslationRoute"></p><p id="pageTranslationStatus" role="status"></p>
        </div>`);
      current = idle;
      chrome.tabs.query.mockReset().mockResolvedValue([{ id: 7 }]);
      chrome.runtime.sendMessage.mockReset().mockResolvedValue(builtin);
      chrome.tabs.sendMessage.mockReset().mockImplementation(async (_tab, message) => {
        if (message.action === 'start') current = active;
        if (message.action === 'restore') current = idle;
        return current;
      });
    });

    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
      document.getElementById('pageTranslationFixture').remove();
    });

    it('顯示裝置端路由，明確向 top frame 開始和還原', async () => {
      await global.popupModule.refreshPopupPageTranslation();
      expect(action().disabled).toBe(false);
      expect(document.getElementById('pageTranslationRoute').textContent).toContain('裝置端');
      await global.popupModule.runPopupPageTranslation();
      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7, {
        type: 'FFB_POPUP_PAGE', action: 'start', documentKey: 'document-1', ...builtin
      }, { frameId: 0 });
      expect(action().textContent).toBe('還原原文');
      await global.popupModule.runPopupPageTranslation();
      expect(status()).toBe('已還原原文。');
    });

    it('顯示過裝置端後改成雲端時，首次點擊只更新路由', async () => {
      await global.popupModule.refreshPopupPageTranslation();
      chrome.runtime.sendMessage.mockResolvedValue(cloud);
      await global.popupModule.runPopupPageTranslation();
      expect(chrome.tabs.sendMessage.mock.calls.every(([, message]) => message.action === 'status')).toBe(true);
      expect(document.getElementById('pageTranslationRoute').textContent).toBe('雲端 · Groq');
      expect(status()).toContain('請再確認');
    });

    it('分頁已換文件或無法使用時，不送出翻譯動作', async () => {
      await global.popupModule.refreshPopupPageTranslation();
      current = { ...idle, documentKey: 'document-2' };
      await global.popupModule.runPopupPageTranslation();
      expect(chrome.tabs.sendMessage.mock.calls.every(([, message]) => message.action === 'status')).toBe(true);
      current = { paused: true };
      await global.popupModule.refreshPopupPageTranslation();
      expect(action().disabled).toBe(true);
      expect(status()).toContain('停用');
    });

    it('現有工作階段的錯誤在重開 Popup 後仍可看到和還原', async () => {
      current = { ...active, message: '1 段翻譯失敗，可在頁面查看原因並重試。' };
      await global.popupModule.refreshPopupPageTranslation();
      expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
      expect(action().disabled).toBe(false);
      expect(action().textContent).toBe('還原原文');
      expect(status()).toContain('1 段翻譯失敗');
    });
  });

  describe('快捷鍵', () => {
    beforeEach(() => jest.clearAllMocks());

    const rows = () => [...document.querySelectorAll('#shortcutList .shortcut-row')]
      .map(row => [...row.children].map(el => el.textContent));

    it('顯示瀏覽器實際綁定的鍵，沒綁上就顯示「未設定」', () => {
      global.popupModule.renderShortcuts([
        { name: '_execute_action', shortcut: '', description: '' },
        { name: 'toggle-page-translation', shortcut: 'Alt+A', description: '切換全文翻譯' },
        { name: 'translate-selection', shortcut: '', description: '翻譯選取文字' }
      ]);
      expect(rows()).toEqual([['翻譯選取文字', '未設定'], ['切換全文翻譯', 'Alt+A']]);
      expect(document.querySelector('.shortcut-key.unset').textContent).toBe('未設定');
    });

    it('指令描述含 HTML 也只當文字顯示', () => {
      global.popupModule.renderShortcuts([{ name: 'translate-selection', shortcut: 'Alt+S', description: '<img src=x onerror=alert(1)>' }]);
      expect(document.querySelector('#shortcutList img')).toBeNull();
    });

    it('讀不到 commands API 時回空清單，不讓 popup 壞掉', async () => {
      chrome.commands.getAll.mockRejectedValueOnce(new Error('unavailable'));
      await expect(global.popupModule.loadShortcuts()).resolves.toEqual([]);
    });

    it('「變更快捷鍵」用 tabs.create 開 chrome://extensions/shortcuts', () => {
      document.getElementById('openShortcuts').click();
      expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome://extensions/shortcuts' });
    });
  });
});
