// 寫作批改結果卡：新舊兩種回應格式、原文標記與計數、複製內容、Obsidian 輸出
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ORIGINAL = 'Dear team, I want to know the status of my order, it was placed two weeks ago. Thank you for your help.';
const REVIEW = [
  '**場合：** 寫給客服的詢問信，語氣要禮貌正式',
  '',
  '**優化後版本：**',
  'Dear team,',
  'I am writing to ask about the status of my order, which I placed two weeks ago. Thank you for your help.',
  '',
  '**改動說明：**',
  '- 把 want to know 改成較正式的 am writing to ask about',
  '- 用關係子句接上逗號拼接句',
  '',
  '**原文標記：**',
  '- 錯誤「my order, it was placed」：逗號拼接兩個句子',
  '- 不自然「I want to know」：對客服略顯直接',
  '- 寫得好「Thank you for your help.」：結尾禮貌得體',
  '- 錯誤「not in the text」：原文沒有這段',
  '- 建議「Dear team」：類型不在三種之內',
  '- 不自然 without quotes：沒有引號，略過',
  '',
  '**總評：** 意思清楚，修正句子結構後就很專業'
].join('\n');
const OLD = '**優化後版本：** Better text\n**改動說明：**\n- 改 A\n- 改 B';

function runContentScript(file, context) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../', file), 'utf8'), context, { filename: file });
}

function loadContent() {
  if (!Element.prototype.animate) Element.prototype.animate = () => ({ cancel() {} });
  document.body.innerHTML = `<p>${ORIGINAL}</p>`;
  const clipboard = { writeText: jest.fn(() => Promise.resolve()) };
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
  const context = vm.createContext({
    window, document, location, navigator, chrome, console, setTimeout, clearTimeout,
    requestAnimationFrame: () => 0,
    FanFanBaModels: require('../../models'),
    loadRecentFolders: jest.fn(async () => []),
    hideAutoSaveToast: jest.fn()
  });
  context.globalThis = context;
  chrome.storage.local.get.mockResolvedValue({});
  chrome.storage.sync.get.mockResolvedValue({});
  chrome.runtime.id = 'mock-id';
  chrome.runtime.sendMessage = jest.fn(() => Promise.resolve({ models: [] }));
  chrome.storage.onChanged = { addListener: jest.fn() };
  ['custom-actions.js', 'content/site-policy.js', 'content/state.js', 'content/utils.js', 'content/dom.js',
    'content/custom-action-render.js', 'content/obsidian.js', 'content/selection-controls.js',
    'content/toolbar.js', 'content/result-card.js', 'content/main.js'].forEach(file => runContentScript(file, context));
  context.saveToHistory = jest.fn();
  vm.runInContext('resultCard = createResultCard(); document.body.appendChild(resultCard);', context);
  return { context, clipboard };
}

function render(context, raw, options = {}) {
  context.renderResult('optimize', raw, ORIGINAL, options);
  return document.querySelector('#gemini-result-card .g-rc-body');
}

describe('寫作批改：新格式', () => {
  it('依序顯示場合、標記過的原文、優化後、改動說明、總評', () => {
    const { context } = loadContent();
    const body = render(context, REVIEW);
    const order = ['.g-opt-setting', '.g-optimize-original', '.g-optimize-result', '.g-optimize-reasons', '.g-opt-summary']
      .map(selector => body.querySelector(selector));
    expect(order.every(Boolean)).toBe(true);
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(body.querySelector('.g-opt-setting').textContent).toBe('場合寫給客服的詢問信，語氣要禮貌正式');
    expect(body.querySelector('.g-opt-summary').textContent).toBe('總評意思清楚，修正句子結構後就很專業');
    expect(body.querySelector('.g-optimize-reasons').textContent).toContain('用關係子句接上逗號拼接句');
    expect(body.querySelector('.g-optimize-reasons').textContent).not.toContain('原文標記');
    expect(context.saveToHistory).toHaveBeenCalledWith('optimize', ORIGINAL, REVIEW, null);
  });

  it('標記標在原文上、原文一字不少；三種類型以外與沒有引號的行略過；原文找不到的只列在下方', () => {
    const { context } = loadContent();
    const original = render(context, REVIEW).querySelector('.g-optimize-original');
    expect(original.textContent).toBe(ORIGINAL);
    expect([...original.querySelectorAll('mark')].map(mark => [mark.textContent, mark.className])).toEqual([
      ['I want to know', 'g-ca-mark g-ca-type-awkward'],
      ['my order, it was placed', 'g-ca-mark g-ca-type-error'],
      ['Thank you for your help.', 'g-ca-mark g-ca-type-good']
    ]);
    const items = [...document.querySelectorAll('.g-opt-marks li')].map(li => li.textContent);
    expect(items).toHaveLength(4);
    expect(items.join('\n')).not.toContain('Dear team');
    expect(items.join('\n')).not.toContain('without quotes');
    const unmatched = document.querySelector('.g-opt-marks .g-ca-unmatched');
    expect(unmatched.textContent).toBe('錯誤not in the text：原文沒有這段');
    expect(unmatched.querySelector('mark')).toBeNull();
  });

  it('標題列計數：各類型數量（含原文找不到的），沒有的類型不顯示', () => {
    const { context } = loadContent();
    const counts = () => [...document.querySelectorAll('.g-opt-count')].map(el => [el.dataset.type, el.textContent]);
    render(context, REVIEW);
    expect(counts()).toEqual([['error', '錯誤 2'], ['awkward', '不自然 1'], ['good', '寫得好 1']]);
    render(context, REVIEW.replace(/\*\*原文標記：\*\*[\s\S]*?(?=\*\*總評)/, '**原文標記：**\n- 無\n\n'));
    expect(counts()).toEqual([]);
    expect(document.querySelector('.g-opt-marks')).toBeNull();
  });

  it('複製鈕複製的是優化後全文（多行保留），不含其他段落', async () => {
    const { context, clipboard } = loadContent();
    render(context, REVIEW).querySelector('.g-opt-copy-btn').click();
    expect(clipboard.writeText).toHaveBeenCalledWith(
      'Dear team,\nI am writing to ask about the status of my order, which I placed two weeks ago. Thank you for your help.');
  });

  it('只回了部分新段落（例如只有總評）也照新版顯示，缺的段落不出現', () => {
    const { context } = loadContent();
    const body = render(context, `${OLD}\n\n**總評：** 還不錯`);
    expect(body.querySelector('.g-opt-summary').textContent).toBe('總評還不錯');
    expect(body.querySelector('.g-opt-setting')).toBeNull();
    expect(body.querySelector('.g-optimize-original').textContent).toBe(ORIGINAL);
    expect(body.querySelector('.g-optimize-reasons').textContent).toBe('改動說明改 A改 B');
  });

  it('模型回傳的 HTML 只當文字', () => {
    const { context } = loadContent();
    const xss = '<img src=x onerror="window.__ffbOptXss=1"><script>window.__ffbOptXss=2</script>';
    const body = render(context, `**場合：** ${xss}\n**優化後版本：** ${xss}\n**原文標記：**\n- 錯誤「Dear team」：${xss}\n**總評：** ${xss}`);
    expect(body.querySelectorAll('img, script')).toHaveLength(0);
    expect(body.textContent).toContain('<script>');
    expect(context.__ffbOptXss).toBeUndefined();
  });
});

describe('寫作批改：舊格式與相容', () => {
  it('沒有新段落時與舊版相同：沒有場合、計數、總評，原文不標記', () => {
    const { context } = loadContent();
    const body = render(context, OLD);
    expect(body.querySelector('.g-opt-setting, .g-opt-counts, .g-opt-summary, .g-opt-marks, mark')).toBeNull();
    expect(body.querySelector('.g-optimize-original').className).toBe('g-optimize-original');
    expect(body.querySelector('.g-optimize-result').textContent).toBe('Better text');
  });

  it('從最近紀錄還原新格式也照新版顯示、不重複寫入紀錄', () => {
    const { context } = loadContent();
    const body = render(context, REVIEW, { fromHistory: true });
    expect(body.querySelector('.g-opt-summary')).not.toBeNull();
    expect(context.saveToHistory).not.toHaveBeenCalled();
  });

  it('Obsidian 輸出含場合與總評', () => {
    const { context } = loadContent();
    render(context, REVIEW);
    const block = vm.runInContext("buildObsidianBlock({ tag: '優化', hm: '10:00', date: '2026/10/1', preview: 'x' })", context);
    expect(block).toContain('**場合：** 寫給客服的詢問信');
    expect(block).toContain('**總評：** 意思清楚');
    expect(block).toContain('**優化後版本：**');
  });
});
