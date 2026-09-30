// 結果卡「僅本次」模型：background 端的驗證、路由與可用清單
const {
  validateAIRequest,
  normalizeModelOverride,
  getAvailableCardModelIds,
  _handleAIRequest
} = require('../background');

const GROQ = 'groq:openai/gpt-oss-120b';
const GEMINI = 'gemini-3.5-flash';

beforeEach(() => jest.clearAllMocks());

describe('modelOverride 驗證', () => {
  it('清冊內的模型原樣保留', () => {
    expect(validateAIRequest({ action: 'translate', selectedText: 'hi', modelOverride: GROQ }).modelOverride).toBe(GROQ);
  });

  it('沒帶就是空字串（走全域主模型）', () => {
    expect(validateAIRequest({ action: 'translate', selectedText: 'hi' }).modelOverride).toBe('');
  });

  it('不在清冊內的 model 被拒絕', () => {
    expect(() => validateAIRequest({ action: 'translate', selectedText: 'hi', modelOverride: 'evil:model' })).toThrow('不支援的模型');
    // 舊版遺留 id 只容許出現在 model 欄位，不能拿來當單次覆寫
    expect(() => normalizeModelOverride('gemini-2.5-flash', false)).toThrow('不支援的模型');
    expect(() => normalizeModelOverride({ id: GROQ }, false)).toThrow('模型格式不正確');
  });

  it('只做頁面翻譯的模型不能拿來查選取文字', () => {
    expect(() => normalizeModelOverride('builtin:translator', false)).toThrow('此模型只能用於全文翻譯');
    expect(normalizeModelOverride('builtin:translator', true)).toBe('builtin:translator');
  });

  it('既有的 model 欄位維持寬鬆（舊 id 不擋）', () => {
    expect(validateAIRequest({ action: 'translate', selectedText: 'hi', model: 'gemini-2.5-flash' }).model).toBe('gemini-2.5-flash');
  });
});

describe('modelOverride 路由', () => {
  it('單次覆寫優先於儲存的主模型，且不寫回設定', async () => {
    chrome.storage.sync.get.mockResolvedValueOnce({ model: GEMINI });
    chrome.storage.local.get.mockResolvedValue({ apiKey: 'AIza-dummy', groqApiKey: 'gsk_dummy' });
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ choices: [{ message: { content: '你好' } }] }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '你好' } }] })
    }));
    await _handleAIRequest({ action: 'translate', selectedText: 'hello there, this is long enough', modelOverride: GROQ }).catch(() => {});
    expect(global.fetch).toHaveBeenCalled();
    expect(String(global.fetch.mock.calls[0][0])).toContain('api.groq.com');
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    chrome.storage.local.get.mockResolvedValue({});
  });
});

describe('三層優先序：單次覆寫 > 功能模型 > 主模型', () => {
  const okFetch = () => jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '你好' } }], candidates: [{ content: { parts: [{ text: '你好' }] } }] }),
    text: async () => '{}'
  }));
  const hostOf = () => new URL(String(global.fetch.mock.calls[0][0])).host;
  const run = async request => {
    chrome.storage.sync.get.mockResolvedValueOnce({ model: GEMINI });
    chrome.storage.local.get.mockResolvedValue({ apiKey: 'AIza-dummy', groqApiKey: 'gsk_dummy' });
    global.fetch = okFetch();
    await _handleAIRequest({ action: 'explain', selectedText: 'hello there, this is long enough', ...request }).catch(() => {});
    chrome.storage.local.get.mockResolvedValue({});
    return hostOf();
  };

  it('只有主模型：用主模型', async () => {
    expect(await run({})).toBe('generativelanguage.googleapis.com');
  });

  it('有功能模型：功能模型優先於主模型', async () => {
    expect(await run({ model: GROQ })).toBe('api.groq.com');
  });

  it('再加單次覆寫：單次覆寫優先於功能模型', async () => {
    expect(await run({ model: GROQ, modelOverride: GEMINI })).toBe('generativelanguage.googleapis.com');
  });
});

describe('可用模型清單', () => {
  it('只列有金鑰的模型，永遠不列只做頁面翻譯的內建模型', () => {
    expect(getAvailableCardModelIds({ groqApiKey: 'gsk_x' })).toEqual([GROQ]);
    expect(getAvailableCardModelIds({ apiKey: 'AIza', openrouterApiKey: 'sk-or' }))
      .toEqual([GEMINI, 'gemini-3.5-flash-lite', 'openrouter:google/gemma-4-31b-it:free']);
    expect(getAvailableCardModelIds({})).toEqual([]);
  });
});
