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
    it('should contain expected default models', () => {
      expect(global.popupModule.MODELS).toBeDefined();
      expect(global.popupModule.MODELS.length).toBeGreaterThan(0);
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
