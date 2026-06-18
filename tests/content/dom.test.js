const { ffbText, ffbEl, ffbClear } = require('../../content/dom');

describe('safe DOM builder (dom.js)', () => {
  it('ffbText wraps any value as an inert text node', () => {
    const node = ffbText('<script>alert(1)</script>');
    expect(node.nodeType).toBe(Node.TEXT_NODE);
    const host = document.createElement('div');
    host.appendChild(node);
    expect(host.querySelector('script')).toBeNull();
    expect(host.textContent).toBe('<script>alert(1)</script>');
  });

  it('ffbText coerces null/undefined to empty string', () => {
    expect(ffbText(null).textContent).toBe('');
    expect(ffbText(undefined).textContent).toBe('');
    expect(ffbText(42).textContent).toBe('42');
  });

  it('ffbEl sets class, dataset and attributes without parsing HTML', () => {
    const el = ffbEl('button', { class: 'g-x', dataset: { id: '7' }, title: 'hi' }, 'go');
    expect(el.tagName).toBe('BUTTON');
    expect(el.className).toBe('g-x');
    expect(el.dataset.id).toBe('7');
    expect(el.getAttribute('title')).toBe('hi');
    expect(el.textContent).toBe('go');
  });

  it('ffbEl renders malicious string children as text, never as markup', () => {
    const el = ffbEl('div', { class: 'g-y' }, '<img src=x onerror=alert(1)>');
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('ffbEl accepts node children and skips null/false', () => {
    const child = ffbEl('span', null, 'inner');
    const el = ffbEl('div', null, [child, null, false, ' tail']);
    expect(el.querySelector('span').textContent).toBe('inner');
    expect(el.textContent).toBe('inner tail');
  });

  it('ffbEl skips null/false attribute values (conditional attrs)', () => {
    const el = ffbEl('div', { title: null, 'data-keep': false, id: 'ok' });
    expect(el.hasAttribute('title')).toBe(false);
    expect(el.hasAttribute('data-keep')).toBe(false);
    expect(el.id).toBe('ok');
  });

  it('ffbClear empties a node and returns it', () => {
    const el = document.createElement('div');
    el.appendChild(document.createElement('span'));
    el.appendChild(document.createElement('span'));
    expect(ffbClear(el)).toBe(el);
    expect(el.childNodes.length).toBe(0);
  });
});
