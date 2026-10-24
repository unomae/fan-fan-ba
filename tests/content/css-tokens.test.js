const fs = require('fs');
const path = require('path');

// 浮層色票（Radix token）的靜態守門：token 只活在 5 個浮層根節點裡，
// 根節點內的規則不寫死色碼，根節點外（插進網頁的譯文段落、單字高亮標記）不引用 token。
const ROOTS = ['#gemini-ai-toolbar', '#gemini-result-card', '#fanfanba-floating', '.g-vocab-highlight-tip', '.ffb-page-translation-panel'];
const SCALES = ['olive', 'lime', 'blue', 'red', 'amber', 'violet'];
// 掛在根節點外面的元素：token 在那裡取不到值
const OUTSIDE = /\.g-vocab-highlight(?!-tip)|\.ffb-page-(translation-(block|head|mark|actions|text|list|loading|error|mode|density)|source|expand|collapsible|collapsed|retry)|\.ffb-pair-active|^(html|body|:root)/;
// 句子分析螢光標記是分類色，刻意不併入 6 色系
const EXEMPT = /\.g-ca-mark|\.g-ca-type-|\.g-ca-note-text/;
const COLOR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const COLOR_PROPS = /^(color|fill|stroke|caret-color|background(-color|-image)?|border(-(top|bottom|left|right))?(-color)?|outline(-color)?)$/;

function parseRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const darkStart = clean.indexOf('@media (prefers-color-scheme: dark)');
  return [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({
      selectors: m[1].split(',').map(s => s.trim()).filter(Boolean),
      decls: m[2].split(';').map(d => d.trim()).filter(Boolean).map(d => {
        const i = d.indexOf(':');
        return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() };
      }),
      dark: m.index > darkStart
    }))
    .filter(r => r.selectors.length && !/^(@|from$|to$|[\d.]+%$)/.test(r.selectors[0]));
}

describe('浮層 Radix 色票', () => {
  let css;
  let rules;

  beforeAll(() => {
    css = fs.readFileSync(path.join(__dirname, '../../content.css'), 'utf8');
    rules = parseRules(css);
  });

  const tokenRules = () => rules.filter(r => r.decls.some(d => d.prop === '--ffb-olive-1'));

  it('亮色與深色各有一組完整色階，只掛在 5 個根節點', () => {
    const [light, dark] = tokenRules();
    expect(tokenRules()).toHaveLength(2);
    for (const rule of [light, dark]) {
      expect(rule.selectors).toEqual(ROOTS);
      for (const scale of SCALES) {
        for (let step = 1; step <= 12; step++) {
          const decl = rule.decls.find(d => d.prop === `--ffb-${scale}-${step}`);
          expect(decl && decl.value).toMatch(/^#[0-9a-f]{6}$/);
        }
      }
    }
    expect(light.dark).toBe(false);
    expect(dark.dark).toBe(true);
    // 深色要真的換值，不是抄一份亮色
    const v = (rule, prop) => rule.decls.find(d => d.prop === prop).value;
    expect(v(dark, '--ffb-olive-12')).not.toBe(v(light, '--ffb-olive-12'));
  });

  it('自訂屬性一律加 --ffb- 前綴，且不定義在 :root／html／body', () => {
    const defined = rules.flatMap(r => r.decls.filter(d => d.prop.startsWith('--')).map(d => ({ prop: d.prop, selectors: r.selectors })));
    expect(defined.filter(d => !d.prop.startsWith('--ffb-')).map(d => d.prop)).toEqual([]);
    expect(defined.filter(d => d.selectors.some(s => /^(:root|html|body)\b/.test(s))).map(d => d.prop)).toEqual([]);
  });

  it('引用的色階都有定義（防打錯字）', () => {
    const used = new Set(css.match(/var\(--ffb-(olive|lime|blue|red|amber|violet)-\d+\)/g));
    const defined = new Set(tokenRules()[0].decls.map(d => `var(${d.prop})`));
    expect([...used].filter(u => !defined.has(u))).toEqual([]);
    for (const name of ['surface', 'edge', 'on-solid', 'focus', 'focus-ring']) {
      expect(tokenRules()[0].decls.some(d => d.prop === `--ffb-${name}`)).toBe(true);
    }
  });

  it('根節點內的規則不寫死色碼（陰影、深底 tooltip、分類螢光標記除外）', () => {
    const offenders = [];
    for (const rule of rules) {
      if (rule.selectors.some(s => OUTSIDE.test(s) || EXEMPT.test(s))) continue;
      if (rule.decls.some(d => /rgba\(\s*30\s*,\s*30\s*,\s*30/.test(d.value))) continue; // 深底白字 tooltip：亮暗一樣
      for (const d of rule.decls) {
        if (COLOR_PROPS.test(d.prop) && COLOR.test(d.value)) offenders.push(`${rule.selectors[0]} { ${d.prop}: ${d.value} }`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('根節點外的元素不引用浮層 token（那裡取不到值）', () => {
    const offenders = rules
      .filter(r => r.selectors.some(s => OUTSIDE.test(s)))
      .flatMap(r => r.decls.filter(d => /var\(--ffb-(olive|lime|blue|red|amber|violet)-|var\(--ffb-(surface|edge|on-solid|focus)/.test(d.value))
        .map(d => `${r.selectors.join(', ')} { ${d.prop} }`));
    expect(offenders).toEqual([]);
  });
});
