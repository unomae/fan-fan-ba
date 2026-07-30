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

    // red-team F1（2026-07-30）：帶 schema 的空備份原本只有裸 map 分支在擋，
    // 於是它會回一個空 map、一路走到 replaceAll({})，被下游判成「使用者要清空」
    // 而刪掉救援快照——正好發生在「單字刪光了想匯入救回」的時刻。
    it('rejects a schema-tagged backup that yields zero usable entries', () => {
      expect(() => Backup.parseBackup({ app: 'fan-fan-ba', schema: 'vocabulary', items: {} }))
        .toThrow('沒有可匯入');
      expect(() => Backup.parseBackup('{"app":"fan-fan-ba","schema":"vocabulary","items":{}}'))
        .toThrow('沒有可匯入');
      expect(() => Backup.parseBackup({ schema: 'vocabulary', items: [] })).toThrow('沒有可匯入');
      expect(() => Backup.parseBackup({ schema: 'vocabulary', items: null })).toThrow('沒有可匯入');
      // 條目在，但全部缺 id/word → normalize 後同樣是零有效條目
      expect(() => Backup.parseBackup({ schema: 'vocabulary', items: { a: { id: 'a' }, b: { word: 'b' } } }))
        .toThrow('沒有可匯入');
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

    // 回歸：舊版勝方判定先比 count，count 高的一方會整組蓋掉另一方較新的複習進度
    it('keeps the newer review progress even when the other side has a larger count', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat', { count: 9, status: 'learning', reviewedAt: '2026-06-01T00:00:00.000Z', nextReviewAt: '2026-06-03T00:00:00.000Z' }) };
      const incoming = { 'en:cat': entry('en:cat', 'cat', { count: 2, status: 'known', reviewedAt: '2026-06-20T00:00:00.000Z', nextReviewAt: '2026-07-20T00:00:00.000Z' }) };
      const { items } = Backup.mergeBackup(existing, incoming);
      expect(items['en:cat']).toMatchObject({
        status: 'known',
        reviewedAt: '2026-06-20T00:00:00.000Z',
        nextReviewAt: '2026-07-20T00:00:00.000Z'
      });
      expect(items['en:cat'].count).toBe(9); // count 仍取較大值
    });

    it('does not let a stale import roll back local review progress', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat', { count: 1, status: 'known', reviewedAt: '2026-06-20T00:00:00.000Z', nextReviewAt: '2026-07-20T00:00:00.000Z' }) };
      const incoming = { 'en:cat': entry('en:cat', 'cat', { count: 8, status: 'learning', reviewedAt: '2026-06-01T00:00:00.000Z', nextReviewAt: '2026-06-03T00:00:00.000Z' }) };
      const { items } = Backup.mergeBackup(existing, incoming);
      expect(items['en:cat']).toMatchObject({
        status: 'known',
        reviewedAt: '2026-06-20T00:00:00.000Z',
        nextReviewAt: '2026-07-20T00:00:00.000Z'
      });
      expect(items['en:cat'].count).toBe(8);
    });

    // 裁決明文：`entryTime` 原樣保留給 lastSeenAt 選擇，**不跟著勝方整組走**。
    // （2026-07-30 突變測試發現這條契約當時沒有任何測試咬住：把 lastSeenAt 改成
    //  base.lastSeenAt 後全套依然全綠。）
    // 造一個「勝方是 existing、但 incoming 的 lastSeenAt 較新」的局：
    // existing 剛複習過（reviewedAt 最新 → mergeClock 勝），incoming 剛遇到過。
    it('picks lastSeenAt independently of the merge winner', () => {
      const existing = { 'en:cat': entry('en:cat', 'cat', {
        lastSeenAt: '2026-06-01T00:00:00.000Z',
        status: 'known', reviewedAt: '2026-06-25T00:00:00.000Z'
      }) };
      const incoming = { 'en:cat': entry('en:cat', 'cat', {
        lastSeenAt: '2026-06-10T00:00:00.000Z',
        status: 'learning', reviewedAt: '2026-06-02T00:00:00.000Z'
      }) };
      const { items } = Backup.mergeBackup(existing, incoming);
      // 複習三欄跟著勝方（existing）整組走
      expect(items['en:cat']).toMatchObject({ status: 'known', reviewedAt: '2026-06-25T00:00:00.000Z' });
      // 但「最後遇到」取兩邊較新者，不因為輸掉就被回滾
      expect(items['en:cat'].lastSeenAt).toBe('2026-06-10T00:00:00.000Z');
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
