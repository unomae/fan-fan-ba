describe('Popup module', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <div id="modelList"></div>
      <div id="apiDot"></div>
      <div id="apiLabel"></div>
      <div id="popupState"></div>
      <div id="popupStateText"></div>
      <div id="currentModelName"></div>
      <div id="currentModelMeta"></div>
      <div id="currentProvider"></div>
      <div id="healthApiDot"></div>
      <div id="healthApiText"></div>
      <div id="healthTtsDot"></div>
      <div id="healthTtsText"></div>
      <div id="healthObsidianDot"></div>
      <div id="healthObsidianText"></div>
      <div id="save-msg"></div>
      <button id="openOptions"></button>
      <div id="shortcutList"></div>
      <button id="openShortcuts"></button>
    `;
    global.popupModule = require('../popup');
  });

  describe('renderApiStatus', () => {
    it('should show ok if key is set', () => {
      global.popupModule.renderApiStatus('gemini-3', { apiKey: '123' });
      expect(document.getElementById('apiDot').className).toContain('ok');
    });
  });

  describe('keyless provider', () => {
    it('treats the builtin model as ready without any API key', () => {
      expect(global.popupModule.getApiKeyStatus('builtin:translator', {})).toEqual({ provider: 'builtin', hasKey: true });
    });
  });

  describe('MODELS', () => {
    // 原本只驗 length > 0——少一顆模型照樣綠，等於沒鎖。清冊內容的正本鎖在
    // models-registry.test.js「模型清冊完整性」；這裡只確認 popup 拿到的是同一份五顆。
    it('should expose the same five models as the registry', () => {
      expect(global.popupModule.MODELS).toBeDefined();
      expect(global.popupModule.MODELS.map(entry => entry.id)).toEqual([
        'groq:openai/gpt-oss-120b',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'openrouter:google/gemma-4-31b-it:free',
        'builtin:translator'
      ]);
    });
  });

  describe('renderPopupOverview', () => {
    it('should summarize usable state and optional integrations', () => {
      const model = global.popupModule.MODELS[0].id;
      global.popupModule.renderPopupOverview(model, {
        groqApiKey: 'gsk_test',
        ttsApiKey: 'AIza-test',
        obsidianDefaultFolder: 'Reading'
      });

      expect(document.getElementById('popupStateText').textContent).toBe('可正常使用');
      expect(document.getElementById('healthApiText').textContent).toBe('OK');
      expect(document.getElementById('healthTtsText').textContent).toBe('Cloud');
      expect(document.getElementById('healthObsidianText').textContent).toBe('已設定');
    });

    it('should show missing key for the selected provider', () => {
      const model = global.popupModule.MODELS[0].id;
      global.popupModule.renderPopupOverview(model, {});

      expect(document.getElementById('popupStateText').textContent).toBe('缺少 Groq Key');
      expect(document.getElementById('healthApiText').className).toContain('err');
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
