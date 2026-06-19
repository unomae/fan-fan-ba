'use strict';

// ── 注入面收斂：決定 content script 在這個頁面 / frame 要不要啟用 ──
//
// 背景：manifest 用 <all_urls> + all_frames:true，content scripts 會被注入
// 到「每一個頁面的每一個 frame」。這對廣告 iframe 多的頁面、登入頁、密碼管理
// 等場景既擾民也放大攻擊面。這支檔案提供純函式 guard，讓啟動前先判斷。
//
// 兩個獨立判斷：
//   1. 敏感網域 denylist → 整個 content script 不啟用（不注入字型、不掛事件）。
//      只列高信心的登入 / 密碼管理網域，避免用 'bank' 這種會誤判的 substring。
//      一般「想在某站關掉」交給之後的 per-site 停用 / allowlist 功能（v1.9.6）。
//   2. 子 frame → 不重複生成浮球 UI（避免每個 iframe 都長一顆球）。
//      選取翻譯仍由最上層 frame 透過 contentDocument 讀取，功能不受影響。

const FFB_SENSITIVE_HOST_DENYLIST = [
  // 帳號登入頁
  /(^|\.)accounts\.google\.com$/i,
  /(^|\.)appleid\.apple\.com$/i,
  /(^|\.)login\.microsoftonline\.com$/i,
  /(^|\.)login\.live\.com$/i,
  /(^|\.)signin\.aws\.amazon\.com$/i,
  // 密碼管理服務
  /(^|\.)lastpass\.com$/i,
  /(^|\.)1password\.com$/i,
  /(^|\.)bitwarden\.com$/i,
  /(^|\.)dashlane\.com$/i,
  /(^|\.)keepersecurity\.com$/i
];

// 判斷 hostname 是否落在敏感網域 denylist（純函式，方便單元測試）
function fanFanBaIsSensitiveHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  return FFB_SENSITIVE_HOST_DENYLIST.some(re => re.test(host));
}

// 是否為最上層 frame（非 iframe）
function fanFanBaIsTopFrame() {
  try {
    return window.top === window.self;
  } catch {
    // 跨來源存取 window.top 會丟 SecurityError → 代表自己在子 frame
    return false;
  }
}

// 取得目前頁面 hostname（content script 取不到時回空字串）
function fanFanBaCurrentHostname() {
  try {
    return location.hostname || '';
  } catch {
    return '';
  }
}

// 每站停用旗標的 storage key（per-host）。所有 frame 都會用到，因此放在
// always-loaded 的本檔，而非只在 top frame 載入的 floating-ball.js。
function getPauseStorageKey() {
  const host = fanFanBaCurrentHostname() || 'local-file';
  return `fanFanBaPaused:${host}`;
}

// 整個 content script 是否要在這個頁面啟用（敏感網域則完全不啟用）
function fanFanBaShouldActivate() {
  return !fanFanBaIsSensitiveHost(fanFanBaCurrentHostname());
}

// 是否要顯示常駐浮球：必須已啟用，且在最上層 frame（子 frame 不重複生球）
function fanFanBaShouldShowFloatingBall() {
  return fanFanBaShouldActivate() && fanFanBaIsTopFrame();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FFB_SENSITIVE_HOST_DENYLIST,
    fanFanBaIsSensitiveHost,
    fanFanBaIsTopFrame,
    getPauseStorageKey,
    fanFanBaShouldActivate,
    fanFanBaShouldShowFloatingBall
  };
}
