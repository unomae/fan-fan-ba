// 快捷鍵（chrome.commands）與右鍵選單（chrome.contextMenus）在 background 端的分派：
// background 只負責把「要做什麼」送到正確的分頁／frame，不讀網頁內容。
const {
  registerContextMenus,
  handleContextMenuClick,
  handleCommand
} = require('../background');

const TRIGGER = 'FFB_TRIGGER';

// jest.setup.js 的 chrome mock 是全檔共用、不會自動清，每案前先清呼叫紀錄
beforeEach(() => jest.clearAllMocks());

describe('右鍵選單', () => {
  it('建立「翻譯選取文字」與「翻譯整頁」兩項，且先清掉舊選單', () => {
    registerContextMenus();
    expect(chrome.contextMenus.removeAll).toHaveBeenCalledTimes(1);
    expect(chrome.contextMenus.create).toHaveBeenCalledTimes(2);
    const items = chrome.contextMenus.create.mock.calls.map(([item]) => item);
    expect(items).toEqual([
      { id: 'ffb-translate-selection', title: '翻翻吧：翻譯選取文字', contexts: ['selection'] },
      { id: 'ffb-translate-page', title: '翻翻吧：翻譯整頁', contexts: ['page'] }
    ]);
  });

  it('翻譯選取文字：送到右鍵所在的 frame', async () => {
    await handleContextMenuClick({ menuItemId: 'ffb-translate-selection', frameId: 7 }, { id: 3 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, { type: TRIGGER, trigger: 'translate-selection' }, { frameId: 7 });
  });

  it('翻譯整頁：只送最上層 frame', async () => {
    await handleContextMenuClick({ menuItemId: 'ffb-translate-page', frameId: 7 }, { id: 3 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(3, { type: TRIGGER, trigger: 'start-page-translation' }, { frameId: 0 });
  });

  it('不認得的選單 id 不送訊息', async () => {
    await expect(handleContextMenuClick({ menuItemId: 'other' }, { id: 3 })).resolves.toBe(false);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('分頁沒有 content script（敏感網域、chrome:// 頁）時靜默回 false', async () => {
    chrome.tabs.sendMessage.mockRejectedValueOnce(new Error('Could not establish connection'));
    await expect(handleContextMenuClick({ menuItemId: 'ffb-translate-page' }, { id: 3 })).resolves.toBe(false);
  });
});

describe('快捷鍵', () => {
  it('翻譯選取文字：廣播給所有 frame，並要求只由有焦點的 frame 處理', async () => {
    await handleCommand('translate-selection', { id: 5 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { type: TRIGGER, trigger: 'translate-selection', requireFocus: true }, undefined);
  });

  it('切換全文翻譯：只送最上層 frame', async () => {
    await handleCommand('toggle-page-translation', { id: 5 });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, { type: TRIGGER, trigger: 'toggle-page-translation', requireFocus: false }, { frameId: 0 });
  });

  it('拿不到 tab 時改查目前分頁', async () => {
    chrome.tabs.query.mockResolvedValueOnce([{ id: 9 }]);
    await handleCommand('toggle-page-translation');
    expect(chrome.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(9, expect.objectContaining({ trigger: 'toggle-page-translation' }), { frameId: 0 });
  });

  it('不認得的 command 不送訊息', async () => {
    await expect(handleCommand('nope', { id: 5 })).resolves.toBe(false);
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});

describe('manifest', () => {
  const manifest = require('../manifest.json');

  it('宣告 contextMenus 權限與兩個快捷鍵，Mac／其他平台各有預設鍵', () => {
    expect(manifest.permissions).toContain('contextMenus');
    expect(Object.keys(manifest.commands).sort()).toEqual(['toggle-page-translation', 'translate-selection']);
    Object.values(manifest.commands).forEach(command => {
      expect(command.suggested_key.default).toMatch(/^(Ctrl|Alt)\+/);
      expect(command.suggested_key.mac).toBeTruthy();
      expect(command.description).toBeTruthy();
    });
  });
});
