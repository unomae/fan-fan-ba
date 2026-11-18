const fs = require('fs');
const path = require('path');

// 歡迎頁的色彩守門：顏色一律取自 ui-tokens.css（Radix Colors），深色模式才會跟著切換。
// 寫死的色碼在淺色下看不出問題，切到深色才會變成低對比，所以用靜態檢查擋下來。
const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'welcome.html'), 'utf8');
const tokensCss = fs.readFileSync(path.join(ROOT, 'ui-tokens.css'), 'utf8');

const styleBlock = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
const styleNoComments = styleBlock.replace(/\/\*[\s\S]*?\*\//g, '');
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgba?|hsla?)\(/;

describe('歡迎頁色彩 token', () => {
  it('在自己的 <style> 之前載入 ui-tokens.css', () => {
    const link = html.indexOf('<link rel="stylesheet" href="ui-tokens.css">');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(html.indexOf('<style>'));
  });

  it('<style> 裡不寫死色碼', () => {
    const offending = styleNoComments.split('\n').map(l => l.trim()).filter(l => COLOR_LITERAL.test(l));
    expect(offending).toEqual([]);
  });

  it('頁面元素不用 inline style 設顏色', () => {
    const inline = [...html.matchAll(/style="([^"]*)"/g)].map(m => m[1]).filter(s => /color|background/i.test(s));
    expect(inline).toEqual([]);
  });

  it('用到的每個 token 都在 ui-tokens.css 有定義', () => {
    const used = [...new Set([...styleNoComments.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))];
    const undefinedTokens = used.filter(name => !new RegExp(`${name}\\s*:`).test(tokensCss));
    expect(used.length).toBeGreaterThan(0);
    expect(undefinedTokens).toEqual([]);
  });
});
