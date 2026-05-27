const {
  escapeHtml,
  formatMarkdown,
  parseJSON,
  getWeekLabel,
  getPosClass,
  extractContext,
  renderDiff
} = require('../../content/utils');

describe('Utils module', () => {
  describe('escapeHtml', () => {
    it('should escape html entities', () => {
      const input = '<div id="test">Test & Demo</div>';
      const expected = '&lt;div id=&quot;test&quot;&gt;Test &amp; Demo&lt;/div&gt;';
      expect(escapeHtml(input)).toBe(expected);
    });
  });

  describe('formatMarkdown', () => {
    it('should format tags correctly', () => {
      expect(formatMarkdown('This is a {{tag}}')).toContain('<span class="g-tag" data-term="tag">tag</span>');
    });
  });

  describe('parseJSON', () => {
    it('should parse normal JSON string', () => {
      expect(parseJSON('{"key": "value"}')).toEqual({ key: 'value' });
    });
    it('should parse markdown JSON', () => {
      expect(parseJSON('```json\n{"key": "value"}\n```')).toEqual({ key: 'value' });
    });
  });

  describe('getPosClass', () => {
    it('should return correct class', () => {
      expect(getPosClass('noun')).toBe('g-pos-n');
      expect(getPosClass('adj')).toBe('g-pos-adj');
    });
  });

  describe('renderDiff', () => {
    it('should generate diff', () => {
      const html = renderDiff('bad', 'good');
      expect(html).toContain('<del');
      expect(html).toContain('<ins');
    });
  });
});
