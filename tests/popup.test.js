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
    `;
    global.popupModule = require('../popup');
  });

  describe('renderApiStatus', () => {
    it('should show ok if key is set', () => {
      global.popupModule.renderApiStatus('gemini-3', { apiKey: '123' });
      expect(document.getElementById('apiDot').className).toContain('ok');
    });
  });

  describe('MODELS', () => {
    // 原本只驗 length > 0——少一顆模型照樣綠，等於沒鎖。清冊內容的正本鎖在
    // models-registry.test.js「模型清冊完整性」；這裡只確認 popup 拿到的是同一份四顆。
    it('should expose the same four models as the registry', () => {
      expect(global.popupModule.MODELS).toBeDefined();
      expect(global.popupModule.MODELS.map(entry => entry.id)).toEqual([
        'groq:openai/gpt-oss-120b',
        'gemini-3.5-flash',
        'gemini-3.5-flash-lite',
        'openrouter:google/gemma-4-31b-it:free'
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
});
