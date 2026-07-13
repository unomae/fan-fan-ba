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
    expect(css).toContain('.g-btn:focus-visible');
    expect(css).toContain('.g-opt-copy-btn:focus-visible');
    expect(css).toContain('.ffb-page-panel-actions button:focus-visible');
    expect(css).toContain('.g-obs-confirm-btn:focus-visible');
  });

  it('keeps the result card model switcher styled inside the compact header', () => {
    expect(css).toContain('.g-rc-model-select');
    expect(css).toContain('flex: 0 1 142px !important;');
  });

  it('keeps the pinned status line inside the result-card header', () => {
    expect(css).toContain('.g-rc-header::after');
    expect(css).toContain('#gemini-result-card.g-pinned .g-rc-header::after');
  });

  it('hides the autosave-bar bottom border until it is shown (no leaked green line)', () => {
    // 收合狀態 border 寬度必須是 0，避免 max-height:0 時漏出一條綠線
    expect(css).toContain('border-bottom:   0 solid #bbf7d0 !important;');
    // 只有 .show 時才補回 1px 分隔線
    expect(css).toMatch(/\.g-autosave-bar\.show\s*{[^}]*border-bottom-width:\s*1px\s*!important;/);
  });

  it('respects reduced motion preferences for injected UI', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none !important;');
    expect(css).toContain('transition: none !important;');
  });

  it('lets the result card header wrap cleanly on small viewports', () => {
    expect(css).toContain('@media (max-width: 560px)');
    expect(css).toContain('flex-wrap: wrap !important;');
    expect(css).toContain('order: 3 !important;');
  });

  it('keeps page translation progress notes hidden from users', () => {
    expect(css).toMatch(/\.ffb-page-panel-status\s*{[^}]*display:\s*none\s*!important;/);
  });

  it('keeps embedded content detector notes available in the page translation panel', () => {
    expect(css).toContain('.ffb-page-embedded-summary');
    expect(css).toMatch(/\.ffb-page-embedded-summary\[hidden\]\s*{[^}]*display:\s*none\s*!important;/);
  });

  it('keeps local usage summary available in the page translation panel', () => {
    expect(css).toContain('.ffb-page-usage-summary');
    expect(css).toMatch(/\.ffb-page-usage-summary\[hidden\]\s*{[^}]*display:\s*none\s*!important;/);
  });

  it('keeps page translation text one step smaller without prefix markers', () => {
    expect(css).toContain('--ffb-page-translation-font-size: clamp(11px, calc(var(--ffb-page-source-font-size, 14px) - 1px), 15px)');
    expect(css).toMatch(/\.ffb-page-translation-block::before\s*{[^}]*content:\s*none\s*!important;/);
    expect(css).toMatch(/\.ffb-page-translation-text\s*{[^}]*padding-left:\s*0\s*!important;/);
    expect(css).toMatch(/\.ffb-page-translation-block\s*{[^}]*box-shadow:\s*none\s*!important;/);
  });

  it('does not inject the removed paragraph hover translate button', () => {
    expect(css).not.toContain('.ffb-single-translate-btn');
  });
});
