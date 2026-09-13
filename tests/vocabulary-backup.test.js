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

  describe('buildVocabularyCsv', () => {
    it('builds rows with readable vocabulary columns', () => {
      const rows = Backup.buildCsvRows({
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

    it('emits BOM, CRLF and quotes cells containing commas or quotes', () => {
      const csv = Backup.buildVocabularyCsv({
        'en:signal': entry('en:signal', 'Signal, flare', {
          translations: ['信號彈', '照明彈'],
          definition: 'A bright, "visible" signal.'
        })
      });

      // BOM 不是裝飾：少了它 Excel 會用系統 ANSI 解讀，中文欄位變亂碼
      expect(csv.startsWith('\ufeff')).toBe(true);
      expect(csv).toContain('\r\n');
      expect(csv).toContain('"Signal, flare"');
      expect(csv).toContain('信號彈；照明彈');
      // 內含的雙引號要 double 起來，不是脫逃字元
      expect(csv).toContain('"A bright, ""visible"" signal."');
    });

    it('prefixes formula-leading cells so spreadsheets keep them as text', () => {
      const csv = Backup.buildVocabularyCsv({
        'en:evil': entry('en:evil', "=cmd|' /C calc'!A0", {
          definition: '+SUM(A1)',
          sources: [{ title: '@handle', url: '-1' }]
        })
      });

      // 每一個被試算表當公式起頭的字元都要補上單引號。這格沒有逗號也沒有雙引號，
      // 所以只補前綴、不包引號（`|` 與 `\'` 都不是需要引號包裹的字元）。
      expect(csv).toContain("'=cmd|' /C calc'!A0");
      expect(csv).toContain("'+SUM(A1)");
      expect(csv).toContain("'@handle");
      expect(csv).toContain("'-1");
    });

    it('補前綴的順序在引號包裹之前（含逗號的惡意值才不會逃脫）', () => {
      // 順序反過來的話會得到 "=with,comma" —— 引號包住了，但開頭仍是 `=`，
      // 試算表照樣當公式算。這條鎖的就是這個順序。
      expect(Backup.escapeCsvCell('=with,comma')).toBe('"\'=with,comma"');
    });
  });

  // 取代原本「請用真 Excel 開一次」的人工關卡（2026-09-13，KAKA 遠端無法開 Excel）。
  // 這裡用**獨立寫的 RFC4180 讀取器**把產出的 CSV 讀回來，驗的是「引號有沒有寫壞導致
  // 欄位錯位」——那才是結構性風險；單看 BOM／前綴的字串斷言抓不到錯位。
  //
  // ⚠️ 這證明不了「Excel 顯示成什麼樣」。Excel 的渲染行為沒有自動化證據，
  // 也不在本檔宣稱範圍內；`MANUAL-QA.md` 已把那條改成「不宣稱」。
  describe('CSV round-trip（獨立解析器讀回來，驗欄位不錯位）', () => {
    // 刻意不用被測程式的任何函式，照 RFC4180 自己讀一遍
    function parseCsv(text) {
      const body = text.replace(/^\ufeff/, '');
      const rows = [];
      let row = [];
      let field = '';
      let inQuotes = false;
      for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (inQuotes) {
          if (ch !== '"') { field += ch; continue; }
          if (body[i + 1] === '"') { field += '"'; i += 1; continue; }
          inQuotes = false;
          continue;
        }
        if (ch === '"') { inQuotes = true; continue; }
        if (ch === ',') { row.push(field); field = ''; continue; }
        // 斷列條件刻意比 RFC4180 寬：CRLF、裸 LF、裸 CR 都當記錄結束。
        // 真實試算表就是這樣讀的——只認 CRLF 的解析器會把「沒被引號包住的裸 \n」
        // 當成欄位內容還原回去，於是漏掉引號的缺陷在測試裡看起來沒事
        // （2026-09-13 第一版就是這樣寫，突變測試漏掉，改成這樣才抓到）。
        if (ch === '\r' || ch === '\n') {
          if (ch === '\r' && body[i + 1] === '\n') i += 1;
          row.push(field); rows.push(row); row = []; field = ''; continue;
        }
        field += ch;
      }
      if (field !== '' || row.length) { row.push(field); rows.push(row); }
      return rows;
    }

    it('每一列都是 14 欄，惡意與多行值都完整讀回', () => {
      const csv = Backup.buildVocabularyCsv({
        'en:nasty': entry('en:nasty', 'Signal, flare', {
          translations: ['信號彈', '照明彈'],
          // 同時塞逗號、雙引號、換行——三種都要靠引號包裹才不會錯位
          definition: 'A bright, "visible" signal.\nSecond line, with comma.',
          sources: [{ title: '航運專欄, 第二篇', url: 'https://example.com/a', context: 'the "lane"' }]
        }),
        'en:evil': entry('en:evil', "=cmd|' /C calc'!A0", {
          definition: '+SUM(A1)',
          sources: [{ title: '@handle', url: '-1' }]
        }),
        'ja:touge': entry('ja:touge', '峠', { translations: ['山頂、隘口'], definition: '山道の最高地点。' }),
        // **只有換行、沒有逗號也沒有雙引號**。這一筆是刻意的：如果只塞「逗號＋引號＋換行」
        // 混在一起的值，引號包裹會因為逗號而觸發，換行自己從來不決定任何事，
        // 於是「漏掉 \n 判斷」這個缺陷就驗不出來（2026-09-13 突變測試實際漏掉一次）。
        'en:multiline': entry('en:multiline', 'multiline', { definition: '第一行\n第二行' })
      });

      const rows = parseCsv(csv);
      const header = rows[0];
      expect(header).toHaveLength(14);
      expect(rows).toHaveLength(5);
      rows.forEach(row => expect(row).toHaveLength(14));

      const byWord = new Map(rows.slice(1).map(row => [row[0], row]));
      const col = (word, name) => byWord.get(word)[header.indexOf(name)];

      // 含逗號／雙引號／換行的值原封不動讀回來
      expect(col('Signal, flare', 'definition')).toBe('A bright, "visible" signal.\nSecond line, with comma.');
      expect(col('Signal, flare', 'sourceTitle')).toBe('航運專欄, 第二篇');
      expect(col('Signal, flare', 'sourceContext')).toBe('the "lane"');
      expect(col('Signal, flare', 'translations')).toBe('信號彈；照明彈');

      // 公式起頭的值讀回來時應**帶著**那個保護用的單引號（它是輸出的一部分，不是脫逃字元）
      expect(col("'=cmd|' /C calc'!A0", 'definition')).toBe("'+SUM(A1)");
      expect(col("'=cmd|' /C calc'!A0", 'sourceTitle')).toBe("'@handle");
      expect(col("'=cmd|' /C calc'!A0", 'sourceUrl')).toBe("'-1");

      // 非 ASCII 不受引號邏輯影響
      expect(col('峠', 'definition')).toBe('山道の最高地点。');

      // 換行必須被引號包住，否則這一列會在換行處斷成兩列、後面整份錯位
      expect(col('multiline', 'definition')).toBe('第一行\n第二行');
    });

    it('BOM 與 CRLF 是硬需求（少了 Excel 會用 ANSI 解讀中文）', () => {
      const csv = Backup.buildVocabularyCsv({
        'zh:test': entry('zh:test', '測試', { definition: '中文定義' })
      });
      expect(csv.codePointAt(0)).toBe(0xfeff);
      expect(csv.split('\r\n')).toHaveLength(2);
      // 不得出現落單的 \n 當行尾（會讓部分試算表把整份讀成一列）
      expect(csv.replace(/\r\n/g, '')).not.toContain('\n');
    });
  });

  // 防漂移：MV3 下 content script 與 options 頁不共用模組，所以公式防護有兩份實作
  // （此檔的 escapeCsvCell 與 content/vocabulary.js 的 escapeVocabularyCsvCell）。
  // 拿同一組惡意樣本斷言兩份輸出完全相同——任一邊被改動、另一邊沒跟上就會紅。
  describe('CSV 公式防護：兩份實作不得漂移', () => {
    it('escapeCsvCell 與 content/vocabulary.js 的版本輸出一致', () => {
      const fs = require('fs');
      const path = require('path');
      const vm = require('vm');

      const source = fs.readFileSync(path.join(__dirname, '../content/vocabulary.js'), 'utf8');
      const sandbox = vm.createContext({ console, Date, chrome: { runtime: { sendMessage() {} } } });
      vm.runInContext(source, sandbox, { filename: 'content/vocabulary.js' });
      const contentEscape = sandbox.escapeVocabularyCsvCell;
      // 抓不到就不能算過——靜默 undefined 會讓下面的比對變成 no-op
      expect(typeof contentEscape).toBe('function');

      const samples = [
        "=cmd|' /C calc'!A0", '+SUM(A1)', '-1', '@handle', '\tleading tab', '\rleading cr',
        'plain', '', 'has,comma', 'has"quote', 'has\nnewline', 'has\r\ncrlf',
        '=with,comma', '中文字', '  leading spaces', '0', 'a=b'
      ];
      for (const sample of samples) {
        expect(Backup.escapeCsvCell(sample)).toBe(contentEscape(sample));
      }
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
