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

    it('also escapes single quotes (defense in depth for single-quoted attributes)', () => {
      expect(escapeHtml("O'Brien")).toBe('O&#39;Brien');
      expect(escapeHtml("' onmouseover='alert(1)")).not.toContain("'");
    });
  });

  describe('formatMarkdown', () => {
    it('should format tags correctly', () => {
      expect(formatMarkdown('This is a {{tag}}')).toContain('<span class="g-tag" data-term="tag">tag</span>');
    });

    it('renders AI-provided HTML payloads as text, not executable markup', () => {
      const html = formatMarkdown('Hello <script>alert(1)</script>\n<img src=x onerror=alert(1)>');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;

      expect(wrapper.querySelector('script')).toBeNull();
      expect(wrapper.querySelector('img')).toBeNull();
      expect(wrapper.textContent).toContain('<script>alert(1)</script>');
      expect(wrapper.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('does not let {{tag}} payloads break out of the tag span attribute', () => {
      const html = formatMarkdown('{{"><img src=x onerror=alert(1)>}}');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = html;

      // 不可生出真的 <img>/onerror，惡意內容只能當文字
      expect(wrapper.querySelector('img')).toBeNull();
      const tag = wrapper.querySelector('.g-tag');
      expect(tag).not.toBeNull();
      expect(tag.getAttribute('onerror')).toBeNull();
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
