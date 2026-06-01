const fs = require('fs');
const path = require('path');

describe('content CSS UI safeguards', () => {
  let css;

  beforeAll(() => {
    css = fs.readFileSync(path.join(__dirname, '../../content.css'), 'utf8');
  });

  it('keeps the result card responsive on narrow viewports', () => {
    expect(css).toContain('width:                 min(500px, calc(100vw - 16px)) !important;');
  });

  it('keeps keyboard focus states visible for compact icon controls', () => {
    expect(css).toContain('.g-icon-btn:focus-visible');
    expect(css).toContain('.g-speak-btn:focus-visible');
    expect(css).toContain('.g-vocab-save-btn:focus-visible');
    expect(css).toContain('.g-retry-btn:focus-visible');
    expect(css).toContain('.g-rc-model-select:focus-visible');
  });

  it('keeps the result card model switcher styled inside the compact header', () => {
    expect(css).toContain('.g-rc-model-select');
    expect(css).toContain('flex: 0 1 142px !important;');
  });

  it('respects reduced motion preferences for injected UI', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important;');
    expect(css).toContain('transition: none !important;');
  });
});
