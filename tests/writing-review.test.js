// 優化升級為寫作批改：句子分支的 prompt 多了場合／原文標記／總評；單字分支不變
const { buildPrompt, buildRequestPrompt } = require('../background');
const BASELINE = require('./__fixtures__/prompt-parity-baseline.json');

const SENTENCE = 'I am writing to ask about the status of my order, which I placed two weeks ago.';

describe('寫作批改 prompt（優化的句子分支）', () => {
  const prompt = buildPrompt('optimize', SENTENCE, 'ctx', 'title', { targetLanguage: 'zh-TW', explanationLanguage: 'target' });

  it('保留舊的「優化後版本／改動說明」兩段，另外依序要求場合、原文標記、總評', () => {
    const order = ['**場合：**', '**優化後版本：**', '**改動說明：**', '**原文標記：**', '**總評：**']
      .map(head => prompt.indexOf(head));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('原文標記限定三種類型、片段逐字取自原文，說明用解釋語言、台灣用語', () => {
    expect(prompt).toContain('類型只能用「錯誤」「不自然」「寫得好」三種');
    expect(prompt).toContain('原文片段必須逐字取自原文');
    expect(prompt).toContain('- 類型「原文片段」：說明');
    expect(prompt).toContain('台灣慣用語');
    expect(prompt).toContain('用繁體中文一句話總評');
    expect(prompt).toContain('優化後版本的語言必須與原文相同');
  });

  it('解釋語言設成英文時，場合與總評跟著用英文', () => {
    const en = buildPrompt('optimize', SENTENCE, '', '', { targetLanguage: 'zh-TW', explanationLanguage: 'en' });
    expect(en).toContain('用English一句話判斷這段文字的使用場合');
  });

  it('原文放在 prompt 最後；內建動作仍沒有系統提示', () => {
    expect(prompt.endsWith(`原始內容：\n「${SENTENCE}」`)).toBe(true);
    expect(buildRequestPrompt({ action: 'optimize', selectedText: SENTENCE }).system).toBe('');
  });

  it('單字分支（20 字以內）與改版前逐字相同', () => {
    expect(buildPrompt('optimize', 'apple', 'I eat an apple every morning before work.', 'Page Title', {}))
      .toBe(BASELINE['optimize|word|empty|normal']);
  });
});
