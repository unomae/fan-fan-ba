const {
  fanFanBaIsSensitiveHost,
  FFB_SENSITIVE_HOST_DENYLIST,
  getPauseStorageKey
} = require('../../content/site-policy');

describe('site policy — sensitive host denylist', () => {
  it('blocks known login / account hosts', () => {
    expect(fanFanBaIsSensitiveHost('accounts.google.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('appleid.apple.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('login.microsoftonline.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('login.live.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('signin.aws.amazon.com')).toBe(true);
  });

  it('blocks known password manager hosts (incl. subdomains)', () => {
    expect(fanFanBaIsSensitiveHost('lastpass.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('vault.bitwarden.com')).toBe(true);
    expect(fanFanBaIsSensitiveHost('my.1password.com')).toBe(true);
  });

  it('is case-insensitive and tolerates blank input', () => {
    expect(fanFanBaIsSensitiveHost('ACCOUNTS.GOOGLE.COM')).toBe(true);
    expect(fanFanBaIsSensitiveHost('')).toBe(false);
    expect(fanFanBaIsSensitiveHost(null)).toBe(false);
    expect(fanFanBaIsSensitiveHost(undefined)).toBe(false);
  });

  it('does not over-block ordinary reading sites', () => {
    expect(fanFanBaIsSensitiveHost('www.google.com')).toBe(false);
    expect(fanFanBaIsSensitiveHost('news.ycombinator.com')).toBe(false);
    expect(fanFanBaIsSensitiveHost('en.wikipedia.org')).toBe(false);
    expect(fanFanBaIsSensitiveHost('docs.google.com')).toBe(false);
  });

  it('avoids substring false positives (e.g. lookalike hosts)', () => {
    // 不該因為含有品牌字串就誤判（denylist 綁定到完整網域結尾）
    expect(fanFanBaIsSensitiveHost('lastpass.com.evil.example')).toBe(false);
    expect(fanFanBaIsSensitiveHost('notbitwarden.com.attacker.test')).toBe(false);
    expect(fanFanBaIsSensitiveHost('mybank.example.com')).toBe(false);
  });

  it('exposes the denylist as an array of RegExp', () => {
    expect(Array.isArray(FFB_SENSITIVE_HOST_DENYLIST)).toBe(true);
    expect(FFB_SENSITIVE_HOST_DENYLIST.every(re => re instanceof RegExp)).toBe(true);
  });
});

describe('site policy — per-site pause storage key', () => {
  // getPauseStorageKey 從 floating-ball.js 移來此處（所有 frame 都需要，
  // 但 floating-ball.js 在 frame-split 後只在 top frame 載入）。
  it('namespaces the pause flag per host and is deterministic', () => {
    const key = getPauseStorageKey();
    expect(key.startsWith('fanFanBaPaused:')).toBe(true);
    expect(key).toBe(`fanFanBaPaused:${location.hostname || 'local-file'}`);
    expect(getPauseStorageKey()).toBe(key);
  });
});
