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

describe('Storage — 本機診斷摘要 (v1.9.8)', () => {
  beforeEach(() => {
    jest.resetModules();
    chrome.storage.local.get.mockReset();
    chrome.storage.local.set.mockReset();
    chrome.storage.local.set.mockResolvedValue();
  });

  it('returns a zeroed summary when nothing stored', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const Storage = require('../storage');
    const d = await Storage.getDiagnostics();
    expect(d.actions).toEqual({ translate: 0, explain: 0, optimize: 0 });
    expect(d.pageTranslations).toBe(0);
    expect(d.errors).toBe(0);
    expect(typeof d.since).toBe('string');
  });

  it('increments the matching counter and persists it', async () => {
    chrome.storage.local.get.mockResolvedValue({
      fanFanBaDiagnostics: { since: '2026-06-01T00:00:00.000Z', actions: { translate: 2, explain: 1, optimize: 0 }, pageTranslations: 3, errors: 1 }
    });
    const Storage = require('../storage');

    const afterTranslate = await Storage.recordDiagnosticEvent('translate');
    expect(afterTranslate.actions.translate).toBe(3);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      fanFanBaDiagnostics: expect.objectContaining({ pageTranslations: 3 })
    });

    const afterPage = await Storage.recordDiagnosticEvent('pageTranslation');
    expect(afterPage.pageTranslations).toBe(4);

    const afterError = await Storage.recordDiagnosticEvent('error');
    expect(afterError.errors).toBe(2);
  });

  it('ignores unknown event kinds without writing', async () => {
    chrome.storage.local.get.mockResolvedValue({});
    const Storage = require('../storage');
    await Storage.recordDiagnosticEvent('definitelyNotAThing');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('clears the summary back to zero', async () => {
    chrome.storage.local.get.mockResolvedValue({
      fanFanBaDiagnostics: { actions: { translate: 9, explain: 9, optimize: 9 }, pageTranslations: 9, errors: 9 }
    });
    const Storage = require('../storage');
    const fresh = await Storage.clearDiagnostics();
    expect(fresh.actions).toEqual({ translate: 0, explain: 0, optimize: 0 });
    expect(fresh.pageTranslations).toBe(0);
    expect(fresh.errors).toBe(0);
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('coerces malformed stored values defensively', async () => {
    chrome.storage.local.get.mockResolvedValue({ fanFanBaDiagnostics: 'corrupt' });
    const Storage = require('../storage');
    const d = await Storage.getDiagnostics();
    expect(d.actions.translate).toBe(0);
    expect(d.errors).toBe(0);
  });
});
