// utils 的格式化函式在執行時才找 ffbEl 等 DOM helper（瀏覽器端由 dom.js 提供），測試端掛到 global
Object.assign(global, require('../../content/dom'));
const {
  escapeHtml,
  formatMarkdown,
  parseJSON,
  getWeekLabel,
  getPosClass,
  extractContext,
  renderDiff
} = require('../../content/utils');

// 格式化函式回傳 DOM 節點：放進容器後再檢查
function renderInto(node) {
  const wrapper = document.createElement('div');
  wrapper.appendChild(node);
  return wrapper;
}

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
      expect(renderInto(formatMarkdown('This is a {{tag}}')).innerHTML).toContain('<span class="g-tag" data-term="tag">tag</span>');
    });

    it('renders AI-provided HTML payloads as text, not executable markup', () => {
      const wrapper = renderInto(formatMarkdown('Hello <script>alert(1)</script>\n<img src=x onerror=alert(1)>'));

      expect(wrapper.querySelector('script')).toBeNull();
      expect(wrapper.querySelector('img')).toBeNull();
      expect(wrapper.textContent).toContain('<script>alert(1)</script>');
      expect(wrapper.textContent).toContain('<img src=x onerror=alert(1)>');
    });

    it('does not let {{tag}} payloads break out of the tag span attribute', () => {
      const wrapper = renderInto(formatMarkdown('{{"><img src=x onerror=alert(1)>}}'));

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
      const html = renderInto(renderDiff('bad', 'good')).innerHTML;
      expect(html).toContain('<del');
      expect(html).toContain('<ins');
    });
  });
});
