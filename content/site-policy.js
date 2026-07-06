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

// ⚠️ 同步提醒：這份 denylist 同時鏡射在 manifest.json 的兩個 content_scripts
// 的 exclude_matches（瀏覽器層就不注入，T4）。改這裡的網域時，記得同步改 manifest；
// manifest 用 match pattern（不支援 regex），apex 與子網域要分別列 *://x.com/* 與 *://*.x.com/*。
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

// ── T5：高敏類別（金融 / 醫療）站點的「上下文降級」清單 ──────────────
//
// 與上方 denylist 的差別：denylist 是「整站不啟用」；這張清單只讓擴充「照常翻譯，
// 但不擷取選字周邊上下文送第三方 provider」（extractContext 回傳空字串）。因此使用者
// 在銀行 / 醫療頁仍可翻譯個別詞句，但鄰近的餘額 / 帳號 / 病歷等文字不會一起外送。
//
// 這是「策展式」清單（curated，非窮舉）：只列低誤判的具體網域，涵蓋常見金融 /
// 醫療站與台灣本地銀行，可依需要擴充。刻意不用 'bank' 這類 substring 以免誤判。
const FFB_SENSITIVE_CONTEXT_HOST_DENYLIST = [
  // 金融：支付 / 券商 / 國際銀行
  /(^|\.)paypal\.com$/i,
  /(^|\.)stripe\.com$/i,
  /(^|\.)chase\.com$/i,
  /(^|\.)bankofamerica\.com$/i,
  /(^|\.)wellsfargo\.com$/i,
  /(^|\.)citi(?:bank)?\.com$/i,
  /(^|\.)hsbc\.com(\.\w+)?$/i,
  // 金融：台灣本地銀行（KAKA 常用地區）
  /(^|\.)cathaybk\.com\.tw$/i,
  /(^|\.)esunbank\.com\.tw$/i,
  /(^|\.)ctbcbank\.com$/i,
  /(^|\.)fubon\.com$/i,
  /(^|\.)megabank\.com\.tw$/i,
  /(^|\.)bot\.com\.tw$/i,
  // 醫療 / 健康入口（具代表性，可擴充）
  /(^|\.)mychart\..+/i,
  /(^|\.)healthcare\.gov$/i,
  /(^|\.)nhi\.gov\.tw$/i
];

// hostname 是否屬「上下文降級」高敏類別（純函式，方便單元測試）
function fanFanBaShouldOmitPageContext(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  return FFB_SENSITIVE_CONTEXT_HOST_DENYLIST.some(re => re.test(host));
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
    FFB_SENSITIVE_CONTEXT_HOST_DENYLIST,
    fanFanBaIsSensitiveHost,
    fanFanBaShouldOmitPageContext,
    fanFanBaIsTopFrame,
    getPauseStorageKey,
    fanFanBaShouldActivate,
    fanFanBaShouldShowFloatingBall
  };
}
