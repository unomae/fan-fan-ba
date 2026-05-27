describe('Options module', () => {
  beforeAll(() => {
    document.body.innerHTML = `
      <input id="apiKey" />
      <input id="groqApiKey" />
      <input id="openrouterApiKey" />
      <select id="model"></select>
      <select id="pageTranslationModel"></select>
      <select id="vocabularyHighlightMode"></select>
      <input id="obsidianVault" />
      <input id="ttsApiKey" />
      <input id="obsidianDefaultFolder" />
      <button id="toggleVis"></button>
      <button id="toggleGroqVis"></button>
      <button id="toggleOrVis"></button>
      <button id="toggleTtsVis"></button>
      <span id="eye-show"></span>
      <span id="eye-hide"></span>
      <span id="groq-eye-show"></span>
      <span id="groq-eye-hide"></span>
      <span id="or-eye-show"></span>
      <span id="or-eye-hide"></span>
      <span id="tts-eye-show"></span>
      <span id="tts-eye-hide"></span>
      <button id="btnSave"></button>
      <button id="btnTest"></button>
      <div id="status"></div>
    `;
    global.optionsModule = require('../options');
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('showStatus', () => {
    it('should set error class and message', () => {
      global.optionsModule.showStatus('err', 'An error occurred');
      const el = document.getElementById('status');
      expect(el.className).toBe('err');
      expect(el.textContent).toBe('An error occurred');
    });

    it('should clear ok message after 3 seconds', () => {
      global.optionsModule.showStatus('ok', 'Success');
      const el = document.getElementById('status');
      expect(el.className).toBe('ok');

      jest.advanceTimersByTime(3000);
      expect(el.className).toBe('');
    });
  });
});
