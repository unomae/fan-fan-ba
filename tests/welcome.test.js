describe('Welcome module', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="btnSettings"></button>
      <button id="btnClose"></button>
    `;
    global.window.close = jest.fn();
    require('../welcome');
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('should open options page when settings clicked', () => {
    document.getElementById('btnSettings').click();
    expect(chrome.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it('should close window when close clicked', () => {
    document.getElementById('btnClose').click();
    expect(window.close).toHaveBeenCalled();
  });
});
