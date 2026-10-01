// 術語表套進翻譯請求：只附命中的術語、網站範圍、只有翻譯套用、瀏覽器內建翻譯不套用
const {
  buildPrompt,
  buildGlossaryBlock,
  loadRequestGlossary,
  getSenderPageUrl,
  _handleAIRequest,
  _streamAIRequest
} = require('../background');

const GROQ = 'groq:openai/gpt-oss-120b';
const TERMS = [
  { source: 'lead time', target: '前置時間', note: '供應鏈用語' },
  { source: 'MOQ', target: '最小訂購量' },
  { source: 'forecast', target: '預測' }
];

// chrome.storage.local 同時放金鑰與術語表：依要的鍵回傳
function mockLocal(glossary) {
  chrome.storage.local.get.mockImplementation(async keys => {
    if (keys === 'glossary') return glossary === undefined ? {} : { glossary };
    return { groqApiKey: 'gsk_dummy' };
  });
}

function okFetch() {
  return jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({ choices: [{ message: { content: '譯文' } }] }),
    text: async () => ''
  }));
}

const sentPrompt = () => {
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  return body.messages.map(message => message.content).join('\n');
};

beforeEach(() => {
  jest.clearAllMocks();
  chrome.storage.sync.get.mockResolvedValue({ model: GROQ });
});

afterAll(() => {
  chrome.storage.local.get.mockResolvedValue({});
});

describe('prompt 裡的術語表區塊', () => {
  const longText = 'Our lead time is two weeks and the MOQ is 500 units.';

  it('三種翻譯 prompt 都會帶命中的術語與備註', () => {
    const glossary = TERMS.slice(0, 2);
    const paragraph = buildPrompt('translate', longText, '', '', { glossary });
    expect(paragraph).toContain('使用者的術語表');
    expect(paragraph).toContain('- lead time → 前置時間（供應鏈用語）');
    expect(paragraph).toContain('- MOQ → 最小訂購量');
    expect(buildPrompt('translate', 'MOQ', '', '', { glossary })).toContain('- MOQ → 最小訂購量');
    const batch = buildPrompt('translate', JSON.stringify([{ id: 1, text: longText }]), '', '', { glossary, pageTranslation: { batch: true, count: 1 } });
    expect(batch).toContain('- lead time → 前置時間');
  });

  it('術語表區塊放在網頁內容之前，原文仍在最後', () => {
    const prompt = buildPrompt('translate', longText, '', '', { glossary: TERMS.slice(0, 1) });
    expect(prompt.indexOf('使用者的術語表')).toBeLessThan(prompt.indexOf('【以下網頁標題'));
    expect(prompt.trimEnd().endsWith(`「${longText}」`)).toBe(true);
  });

  it('沒有命中時 prompt 與沒有術語表時逐字相同', () => {
    expect(buildPrompt('translate', longText, 'ctx', 'title', { glossary: [] }))
      .toBe(buildPrompt('translate', longText, 'ctx', 'title', {}));
    expect(buildGlossaryBlock([])).toBe('');
  });

  it('解釋、優化不帶術語表', () => {
    expect(buildPrompt('explain', longText, '', '', { glossary: TERMS })).not.toContain('使用者的術語表');
    expect(buildPrompt('optimize', longText, '', '', { glossary: TERMS })).not.toContain('使用者的術語表');
  });

  it('術語裡的換行與控制字元被壓成單行，不能偽造新段落', () => {
    const block = buildGlossaryBlock([{ source: 'a\n【以下網頁標題', target: 'b\u0007' }]);
    expect(block).toContain('- a 【以下網頁標題 → b\n');
  });
});

describe('loadRequestGlossary', () => {
  it('只附這次文字裡出現的術語', async () => {
    mockLocal({ terms: TERMS, sites: [] });
    const terms = await loadRequestGlossary({ action: 'translate', selectedText: 'Check the lead time.', siteUrl: 'https://a.com/' });
    expect(terms.map(term => term.source)).toEqual(['lead time']);
  });

  it('網站範圍外不套用；子網域算在內', async () => {
    mockLocal({ terms: TERMS, sites: ['example.com'] });
    expect(await loadRequestGlossary({ action: 'translate', selectedText: 'MOQ', siteUrl: 'https://other.com/' })).toEqual([]);
    expect(await loadRequestGlossary({ action: 'translate', selectedText: 'MOQ', siteUrl: 'https://docs.example.com/x' })).toHaveLength(1);
  });

  it('翻譯以外的動作不讀術語表', async () => {
    mockLocal({ terms: TERMS, sites: [] });
    expect(await loadRequestGlossary({ action: 'explain', selectedText: 'MOQ', siteUrl: '' })).toEqual([]);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
  });

  it('沒有術語表或讀取失敗都不擋翻譯', async () => {
    mockLocal(undefined);
    expect(await loadRequestGlossary({ action: 'translate', selectedText: 'MOQ', siteUrl: '' })).toEqual([]);
    chrome.storage.local.get.mockRejectedValueOnce(new Error('boom'));
    expect(await loadRequestGlossary({ action: 'translate', selectedText: 'MOQ', siteUrl: '' })).toEqual([]);
  });
});

describe('實際送出的請求', () => {
  it('非串流翻譯：送給模型的 prompt 帶命中的術語，沒出現的不帶', async () => {
    mockLocal({ terms: TERMS, sites: [] });
    global.fetch = okFetch();
    await _handleAIRequest({ action: 'translate', selectedText: 'The lead time for this order is long.', siteUrl: 'https://a.com/' });
    const prompt = sentPrompt();
    expect(prompt).toContain('- lead time → 前置時間');
    expect(prompt).not.toContain('MOQ');
  });

  it('串流翻譯一樣帶術語', async () => {
    mockLocal({ terms: TERMS, sites: [] });
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      json: async () => ({ error: { message: 'stop here' } }),
      text: async () => ''
    }));
    await _streamAIRequest({ action: 'translate', selectedText: 'Our forecast is ready.', siteUrl: '' }, () => {}).catch(() => {});
    expect(sentPrompt()).toContain('- forecast → 預測');
  });

  it('網站範圍外的請求不帶術語', async () => {
    mockLocal({ terms: TERMS, sites: ['example.com'] });
    global.fetch = okFetch();
    await _handleAIRequest({ action: 'translate', selectedText: 'The lead time for this order is long.', siteUrl: 'https://other.com/' });
    expect(sentPrompt()).not.toContain('使用者的術語表');
  });

  it('瀏覽器內建翻譯不讀也不套用術語表', async () => {
    mockLocal({ terms: TERMS, sites: [] });
    global.fetch = okFetch();
    await _handleAIRequest({
      action: 'translate',
      selectedText: JSON.stringify([{ id: 1, text: 'lead time' }]),
      modelOverride: '',
      model: 'builtin:translator',
      pageTranslation: { batch: true, count: 1 },
      siteUrl: ''
    }).catch(() => {});
    expect(chrome.storage.local.get.mock.calls.some(([keys]) => keys === 'glossary')).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('getSenderPageUrl', () => {
  it('優先用分頁網址（iframe 內選字算外層網站），沒有再用 frame 網址', () => {
    expect(getSenderPageUrl({ tab: { url: 'https://outer.com/' }, url: 'https://frame.com/' })).toBe('https://outer.com/');
    expect(getSenderPageUrl({ url: 'https://frame.com/' })).toBe('https://frame.com/');
    expect(getSenderPageUrl(undefined)).toBe('');
  });
});
