describe('Storage helper', () => {
  beforeEach(() => {
    jest.resetModules();
    chrome.storage.sync.get.mockReset();
    chrome.storage.sync.set.mockReset();
    chrome.storage.sync.remove.mockReset();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
  });

  it('migrates API keys from sync to local and removes sync copies', async () => {
    chrome.storage.sync.get.mockResolvedValueOnce({
      apiKey: 'AIza-old',
      groqApiKey: 'gsk-old',
      openrouterApiKey: '',
      ttsApiKey: 'AIza-tts'
    });
    chrome.storage.local.get
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        apiKey: 'AIza-old',
        groqApiKey: 'gsk-old',
        ttsApiKey: 'AIza-tts'
      });
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.sync.remove.mockResolvedValue();

    const Storage = require('../storage');
    const secrets = await Storage.getSecrets();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      apiKey: 'AIza-old',
      groqApiKey: 'gsk-old',
      ttsApiKey: 'AIza-tts'
    });
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(Storage.SECRET_KEYS);
    expect(secrets.apiKey).toBe('AIza-old');
    expect(secrets.groqApiKey).toBe('gsk-old');
    expect(secrets.ttsApiKey).toBe('AIza-tts');
  });

  it('stores secrets only in local storage and clears sync copies', async () => {
    chrome.storage.local.set.mockResolvedValue();
    chrome.storage.sync.remove.mockResolvedValue();

    const Storage = require('../storage');
    await Storage.setSecrets({ apiKey: 'AIza-new', groqApiKey: 'gsk-new' });

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      apiKey: 'AIza-new',
      groqApiKey: 'gsk-new'
    });
    expect(chrome.storage.sync.remove).toHaveBeenCalledWith(Storage.SECRET_KEYS);
  });
});
