// 術語表資料層：正規化、網站範圍、命中篩選、CSV（含公式注入防護）
const Glossary = require('../content/glossary');
const VocabBackup = require('../vocabulary-backup');

const { normalizeGlossary, isSiteEnabled, findMatchingTerms, extractRequestText, buildGlossaryCsv, parseGlossaryCsv } = Glossary;

describe('normalizeGlossary', () => {
  it('缺原文或譯文的列略過；原文不分大小寫重複時留第一筆；空備註不帶', () => {
    const { terms } = normalizeGlossary({
      terms: [
        { source: 'Lead time', target: '前置時間', note: '' },
        { source: 'lead TIME', target: '交期' },
        { source: '', target: '空原文' },
        { source: 'MOQ', target: '' },
        'not-an-object',
        { source: ' safety\nstock ', target: '安全\t庫存', note: '供應鏈' }
      ]
    });
    expect(terms).toEqual([
      { source: 'Lead time', target: '前置時間' },
      { source: 'safety stock', target: '安全 庫存', note: '供應鏈' }
    ]);
  });

  it('超過上限截掉、過長的字截斷', () => {
    const many = Array.from({ length: Glossary.MAX_TERMS + 5 }, (_, i) => ({ source: `term${i}`, target: `詞${i}` }));
    const { terms } = normalizeGlossary({ terms: [{ source: 'x'.repeat(300), target: 'y' }, ...many] });
    expect(terms).toHaveLength(Glossary.MAX_TERMS);
    expect(terms[0].source).toHaveLength(Glossary.MAX_SOURCE_CHARS);
  });

  it('網站只取主機名稱：去掉 scheme、路徑、port、*.；看不懂的丟掉、重複合併', () => {
    const { sites } = normalizeGlossary({
      sites: ['https://Docs.Example.com/path?q=1', '*.foo.org', 'bar.net:8080', 'docs.example.com', 'not a site', '', 'localhost']
    });
    expect(sites).toEqual(['docs.example.com', 'foo.org', 'bar.net', 'localhost']);
  });

  it('不是物件就當空術語表', () => {
    expect(normalizeGlossary(null)).toEqual({ terms: [], sites: [] });
    expect(normalizeGlossary('glossary')).toEqual({ terms: [], sites: [] });
  });
});

describe('isSiteEnabled', () => {
  it('網站清單空的＝全部網站', () => {
    expect(isSiteEnabled([], 'https://any.com/')).toBe(true);
  });

  it('符合主機或其子網域才生效；只是結尾相同的別家網域不算', () => {
    const sites = ['example.com'];
    expect(isSiteEnabled(sites, 'https://example.com/a')).toBe(true);
    expect(isSiteEnabled(sites, 'https://www.example.com/a')).toBe(true);
    expect(isSiteEnabled(sites, 'https://notexample.com/')).toBe(false);
    expect(isSiteEnabled(sites, 'https://example.com.evil.io/')).toBe(false);
  });

  it('有網站清單但不知道來源網址時不套用', () => {
    expect(isSiteEnabled(['example.com'], '')).toBe(false);
    expect(isSiteEnabled(['example.com'], 'not a url')).toBe(false);
  });
});

describe('findMatchingTerms', () => {
  const terms = [
    { source: 'art', target: '藝術' },
    { source: 'lead time', target: '前置時間' },
    { source: 'lead', target: '帶領' },
    { source: 'C++', target: 'C++ 語言' },
    { source: '供應鏈', target: 'supply chain' }
  ];

  it('只挑實際出現的；不分大小寫、英文要完整的詞', () => {
    const hit = findMatchingTerms(terms, 'The Start of LEAD TIME planning.');
    expect(hit.map(term => term.source)).toEqual(['lead time', 'lead']);
  });

  it('art 不會比到 start／artist；特殊符號照字面比對', () => {
    expect(findMatchingTerms(terms, 'start an artist')).toEqual([]);
    expect(findMatchingTerms(terms, 'I write C++ daily').map(term => term.source)).toEqual(['C++']);
  });

  it('中文不檢查詞界，出現就算', () => {
    expect(findMatchingTerms(terms, '台灣的供應鏈管理').map(term => term.source)).toEqual(['供應鏈']);
  });

  it('長的詞排前面，一次最多附 30 條', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ source: `w${i}`, target: `詞${i}` }));
    const text = many.map(term => term.source).join(' ');
    const hit = findMatchingTerms(many, text);
    expect(hit).toHaveLength(Glossary.MAX_TERMS_PER_REQUEST);
    expect(hit[0].source.length).toBeGreaterThanOrEqual(hit[hit.length - 1].source.length);
  });

  it('全文翻譯批次只比對 text，不比對 JSON 的鍵', () => {
    const batch = JSON.stringify([{ id: 1, text: 'hello world' }]);
    const keyTerms = [{ source: 'text', target: '文字' }, { source: 'id', target: '編號' }, { source: 'world', target: '世界' }];
    expect(findMatchingTerms(keyTerms, extractRequestText(batch, { batch: true })).map(term => term.source)).toEqual(['world']);
    // 不是批次就照原字串
    expect(extractRequestText('text id', false)).toBe('text id');
  });
});

describe('CSV', () => {
  const escape = VocabBackup.escapeCsvCell;

  it('匯出：BOM、CRLF、表頭；= + - @ 開頭補單引號，含逗號／引號／換行的加引號', () => {
    const csv = buildGlossaryCsv([
      { source: '=cmd|\' /C calc\'!A0', target: '+1', note: '@SUM(A1)' },
      { source: 'a,b', target: 'say "hi"', note: 'line1\nline2' },
      { source: '-x', target: 'y' }
    ], escape);
    expect(csv.startsWith('﻿source,target,note\r\n')).toBe(true);
    const lines = csv.slice(1).split('\r\n');
    expect(lines[1]).toBe('\'=cmd|\' /C calc\'!A0,\'+1,\'@SUM(A1)');
    expect(lines[2]).toBe('"a,b","say ""hi""","line1\nline2"');
    expect(lines[3]).toBe('\'-x,y,');
  });

  it('匯出再匯入內容不變（防注入的單引號會拿掉）', () => {
    const terms = [
      { source: '=cmd', target: '+1', note: '@x' },
      { source: 'a,b', target: 'say "hi"', note: 'n' },
      { source: 'lead time', target: '前置時間' }
    ];
    const { terms: back, skipped } = parseGlossaryCsv(buildGlossaryCsv(terms, escape));
    expect(skipped).toBe(0);
    expect(back).toEqual(terms);
  });

  it('沒有表頭也能讀；缺原文或譯文的列算略過；空行忽略', () => {
    const { terms, skipped } = parseGlossaryCsv('MOQ,最小訂購量\n,沒有原文\n只有原文,\n\nSKU,品項,庫存單位\n');
    expect(terms).toEqual([
      { source: 'MOQ', target: '最小訂購量' },
      { source: 'SKU', target: '品項', note: '庫存單位' }
    ]);
    expect(skipped).toBe(2);
  });

  it('原文本來就以單引號開頭（後面不是公式字元）時保留', () => {
    expect(parseGlossaryCsv("'tis,這是").terms).toEqual([{ source: "'tis", target: '這是' }]);
  });
});
