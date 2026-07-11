'use strict';

// WS-E T-GUARD：敏感站 denylist 三份鏡射（manifest 兩個 content_scripts 區塊的
// exclude_matches + content/site-policy.js 的 FFB_SENSITIVE_HOST_DENYLIST）機械對賬。
// site-policy.js:16-18 註解要求「改這裡記得同步改 manifest」——本測試把人肉紀律換成紅燈。
// 注意：FFB_SENSITIVE_CONTEXT_HOST_DENYLIST（T5 上下文降級清單）刻意不在對賬範圍，
// 它只影響 extractContext，不鏡射到 manifest。

const fs = require('fs');
const path = require('path');
const { FFB_SENSITIVE_HOST_DENYLIST } = require('../content/site-policy');

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
}

// denylist regex（形如 /(^|\.)accounts\.google\.com$/i）→ 網域字串
function denylistDomains() {
  return FFB_SENSITIVE_HOST_DENYLIST.map(re => {
    const m = re.source.match(/^\(\^\|\\\.\)(.+)\$$/);
    if (!m) {
      throw new Error(`denylist regex 形狀無法解析，請同步更新對賬測試：${re.source}`);
    }
    return m[1].replace(/\\\./g, '.');
  });
}

// manifest match pattern（*://x/* 或 *://*.x/*）→ 網域字串
function patternDomain(pattern) {
  const m = pattern.match(/^\*:\/\/(\*\.)?([^/]+)\/\*$/);
  if (!m) {
    throw new Error(`exclude_matches pattern 形狀無法解析，請同步更新對賬測試：${pattern}`);
  }
  return m[2];
}

describe('敏感站 denylist 三份鏡射對賬（manifest ⟺ site-policy）', () => {
  test('manifest 兩個 content_scripts 區塊的 exclude_matches 完全一致', () => {
    const manifest = loadManifest();
    expect(manifest.content_scripts).toHaveLength(2);
    const [core, pageTranslator] = manifest.content_scripts;
    expect(pageTranslator.exclude_matches).toEqual(core.exclude_matches);
  });

  test('manifest exclude_matches 網域集合 === site-policy denylist 網域集合', () => {
    const manifest = loadManifest();
    const manifestDomains = [...new Set(manifest.content_scripts[0].exclude_matches.map(patternDomain))].sort();
    const policyDomains = [...new Set(denylistDomains())].sort();
    expect(manifestDomains).toEqual(policyDomains);
  });
});
