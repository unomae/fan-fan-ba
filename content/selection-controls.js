'use strict';

// 關鍵字加詞界：搭配 camelCase / 底線正規化，避免誤擋 class="card-body"、id="shipping"、name="hotel" 等一般輸入欄
const SENSITIVE_TEXT_CONTROL_PATTERN = [
  'password',
  'passcode',
  'pin',
  'otp',
  'one[-_\\s]*time',
  'verification',
  '2fa',
  'mfa',
  'auth[-_\\s]*code',
  'security[-_\\s]*code',
  'card[-_\\s]*(?:num|number|no|holder|name|exp|cvv|cvc|code|info|pin)',
  '(?:credit|debit|payment|bank)[-_\\s]*card',
  'credit',
  'cc[-_\\s]*num',
  'cvv',
  'cvc',
  'expiry',
  'expiration',
  'payment',
  'billing',
  'email',
  'e[-_\\s]*mail',
  'phone',
  'mobile',
  'tel',
  'ssn',
  'social[-_\\s]*security',
  'tax[-_\\s]*id'
].join('|');

const SENSITIVE_TEXT_CONTROL_RE = new RegExp(`(?:^|[^a-z0-9])(?:${SENSITIVE_TEXT_CONTROL_PATTERN})(?=$|[^a-z0-9])`, 'i');
const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
  'current-password',
  'new-password',
  'one-time-code',
  'email',
  'tel',
  'tel-national',
  'tel-country-code',
  'tel-area-code',
  'tel-local',
  'tel-extension',
  'cc-name',
  'cc-given-name',
  'cc-additional-name',
  'cc-family-name',
  'cc-number',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'cc-csc'
]);

function isTextSelectionControl(el) {
  if (!el) return false;
  if (isSensitiveTextSelectionControl(el)) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return /^(?:text|search|url)?$/i.test(el.type || 'text');
}

function isSensitiveTextSelectionControl(el) {
  if (!el) return false;
  const tagName = String(el.tagName || '').toUpperCase();
  const type = String(el.type || '').toLowerCase();

  if (tagName === 'INPUT' && /^(?:password|email|tel|number)$/i.test(type)) return true;
  if (tagName !== 'INPUT' && tagName !== 'TEXTAREA') return false;

  const autocompleteTokens = String(el.getAttribute?.('autocomplete') || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (autocompleteTokens.some(token => SENSITIVE_AUTOCOMPLETE_TOKENS.has(token))) return true;

  const text = [
    el.id,
    el.name,
    el.className,
    el.getAttribute?.('aria-label'),
    el.getAttribute?.('placeholder'),
    el.getAttribute?.('data-testid'),
    el.getAttribute?.('data-test'),
    el.getAttribute?.('inputmode')
  ]
    .map(value => String(value || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' '))
    .join(' ');

  return SENSITIVE_TEXT_CONTROL_RE.test(text);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    isTextSelectionControl,
    isSensitiveTextSelectionControl
  };
}
