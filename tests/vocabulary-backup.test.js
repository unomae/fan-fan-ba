const Backup = require('../vocabulary-backup');

const entry = (id, word, over = {}) => ({ id, word, lang: 'en', count: 1, createdAt: '2026-06-01T00:00:00.000Z', lastSeenAt: '2026-06-01T00:00:00.000Z', ...over });

describe('vocabulary backup', () => {
  describe('buildBackup / normalize', () => {
    it('wraps a valid keyed map with schema metadata', () => {
      const b = Backup.buildBackup({ 'en:cat': entry('en:cat', 'cat') });
      expect(b).toMatchObject({ app: 'fan-fan-ba', schema: 'vocabulary', version: 1, count: 1 });
      expect(b.items['en:cat'].word).toBe('cat');
      expect(typeof b.exportedAt).toBe('string');
    });

    it('drops entries missing id or word, and tolerates junk input', () => {
      const b = Backup.buildBackup({ 'en:cat': entry('en:cat', 'cat'), bad1: { word: 'x' }, bad2: { id: 'y' }, bad3: null });
      expect(Object.keys(b.items)).toEqual(['en:cat']);
      expect(Backup.buildBackup(null).count).toBe(0);
      expect(Backup.buildBackup([]).count).toBe(0);
    });
  });

  describe('parseBackup', () => {
    it('parses a JSON string produced by buildBackup', () => {
      const json = JSON.stringify(Backup.buildBackup({ 'en:cat': entry('en:cat', 'cat') }));
      expect(Object.keys(Backup.parseBackup(json))).toEqual(['en:cat']);
    });

    it('accepts a bare keyed map (fallback)', () => {
      const map = { 'en:dog': entry('en:dog', 'dog') };
      expect(Backup.parseBackup(map)['en:dog'].word).toBe('dog');
    });

    it('rejects invalid JSON, wrong app, and empty payloads', () => {
      expect(() => Backup.parseBackup('{not json')).toThrow('有效的 JSON');
      expect(() => Backup.parseBackup({ app: 'other-app', schema: 'vocabulary', items: {} })).toThrow('翻翻吧');
      expect(() => Backup.parseBackup({})).toThrow('沒有可匯入');
    });
  });

  describe('mergeBackup', () => {
    it('adds new entries and keeps existing ones (merge mode)', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat') };
      const incoming = { 'en:dog': entry('en:dog', 'dog') };
      const { items, summary } = Backup.mergeBackup(existing, incoming);
      expect(Object.keys(items).sort()).toEqual(['en:cat', 'en:dog']);
      expect(summary).toMatchObject({ added: 1, updated: 0, kept: 1, total: 2 });
    });

    it('merges conflicts by taking the larger count and newest lastSeen', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat', { count: 5, lastSeenAt: '2026-06-10T00:00:00.000Z' }) };
      const incoming = { 'en:cat': entry('en:cat', 'cat', { count: 2, lastSeenAt: '2026-06-20T00:00:00.000Z', pos: 'n.' }) };
      const { items, summary } = Backup.mergeBackup(existing, incoming);
      expect(items['en:cat'].count).toBe(5);
      expect(items['en:cat'].lastSeenAt).toBe('2026-06-20T00:00:00.000Z');
      expect(items['en:cat'].createdAt).toBe('2026-06-01T00:00:00.000Z');
      expect(summary).toMatchObject({ added: 0, updated: 1, total: 1 });
    });

    it('replace mode discards existing entries', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat') };
      const incoming = { 'en:dog': entry('en:dog', 'dog') };
      const { items, summary } = Backup.mergeBackup(existing, incoming, 'replace');
      expect(Object.keys(items)).toEqual(['en:dog']);
      expect(summary).toMatchObject({ added: 1, total: 1 });
    });
  });

  describe('buildXlsxWorkbook', () => {
    it('builds rows with readable vocabulary columns', () => {
      const rows = Backup.buildXlsxRows({
        'en:beacon': entry('en:beacon', 'Beacon', {
          pos: 'noun',
          translations: ['燈塔', '信標'],
          definition: 'A signal light.',
          status: 'learning',
          sources: [{ title: 'Article', url: 'https://example.com', context: 'shipping lane' }]
        })
      });

      expect(rows[0]).toEqual([
        'word', 'lang', 'pos', 'translations', 'definition', 'count', 'createdAt',
        'lastSeenAt', 'status', 'reviewedAt', 'nextReviewAt', 'sourceTitle',
        'sourceUrl', 'sourceContext'
      ]);
      expect(rows[1]).toContain('Beacon');
      expect(rows[1]).toContain('燈塔；信標');
      expect(rows[1]).toContain('https://example.com');
      // D5：status 欄真的匯出值（原 familiarity 欄無寫入端、恆為空字串）
      expect(rows[1]).toContain('learning');
    });

    it('creates a real XLSX zip package with worksheet XML', () => {
      const bytes = Backup.buildXlsxWorkbook({
        'en:signal': entry('en:signal', 'Signal, flare', {
          translations: ['信號彈', '照明彈'],
          definition: 'A bright, "visible" signal.'
        })
      });
      const text = new TextDecoder().decode(bytes);

      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes[0]).toBe(0x50);
      expect(bytes[1]).toBe(0x4b);
      expect(text).toContain('[Content_Types].xml');
      expect(text).toContain('xl/worksheets/sheet1.xml');
      expect(text).toContain('Signal, flare');
      expect(text).toContain('信號彈；照明彈');
      expect(text).toContain('&quot;visible&quot;');
    });
  });
});

describe('import hardening (review fixes)', () => {
  it('does not pollute Object.prototype via __proto__ / constructor ids', () => {
    const malicious = JSON.stringify({
      app: 'fan-fan-ba',
      items: {
        '__proto__': { id: '__proto__', word: 'evil', polluted: 'yes' },
        'constructor': { id: 'constructor', word: 'evil2' },
        'ok': { id: 'ok', word: 'good' }
      }
    });
    const map = Backup.parseBackup(malicious);
    expect(({}).polluted).toBeUndefined();
    expect(Object.prototype.polluted).toBeUndefined();
    expect(Object.keys(map)).toEqual(['ok']);
  });

  it('rejects imports above the item cap', () => {
    const items = {};
    for (let i = 0; i <= Backup.MAX_IMPORT_ITEMS; i += 1) items[`id${i}`] = { id: `id${i}`, word: `w${i}` };
    expect(() => Backup.parseBackup({ app: 'fan-fan-ba', items })).toThrow('超過匯入上限');
  });

  it('still accepts a normal backup within the cap', () => {
    const map = Backup.parseBackup({ app: 'fan-fan-ba', items: { a: { id: 'a', word: 'hello' } } });
    expect(Object.keys(map)).toEqual(['a']);
  });
});
