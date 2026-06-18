const {
  isTextSelectionControl,
  isSensitiveTextSelectionControl
} = require('../../content/selection-controls');

function input(attrs = {}) {
  const el = document.createElement('input');
  Object.entries(attrs).forEach(([key, value]) => {
    if (key === 'className') el.className = value;
    else el.setAttribute(key, value);
  });
  return el;
}

describe('selection control security', () => {
  it('allows ordinary text-like fields that can be translated intentionally', () => {
    expect(isTextSelectionControl(input({ type: 'text' }))).toBe(true);
    expect(isTextSelectionControl(input({ type: 'search' }))).toBe(true);
    expect(isTextSelectionControl(input({ type: 'url' }))).toBe(true);
    expect(isTextSelectionControl(input())).toBe(true);

    const textarea = document.createElement('textarea');
    expect(isTextSelectionControl(textarea)).toBe(true);
  });

  it('blocks password, contact, and numeric fields before selected text can be read', () => {
    expect(isTextSelectionControl(input({ type: 'password' }))).toBe(false);
    expect(isTextSelectionControl(input({ type: 'email' }))).toBe(false);
    expect(isTextSelectionControl(input({ type: 'tel' }))).toBe(false);
    expect(isTextSelectionControl(input({ type: 'number' }))).toBe(false);
  });

  it('blocks text fields that are likely OTP, payment, or personal identity inputs', () => {
    const cases = [
      input({ type: 'text', autocomplete: 'one-time-code' }),
      input({ type: 'text', name: 'verification_code' }),
      input({ type: 'text', id: 'credit-card-number' }),
      input({ type: 'text', placeholder: 'CVV' }),
      input({ type: 'text', className: 'billing-phone-field' }),
      input({ type: 'text', 'aria-label': 'Email address' })
    ];

    cases.forEach(el => {
      expect(isSensitiveTextSelectionControl(el)).toBe(true);
      expect(isTextSelectionControl(el)).toBe(false);
    });
  });

  it('blocks sensitive textareas by metadata while preserving generic textareas', () => {
    const generic = document.createElement('textarea');
    generic.setAttribute('placeholder', 'Paste paragraph to rewrite');

    const sensitive = document.createElement('textarea');
    sensitive.setAttribute('name', 'billingAddressAndPhone');

    expect(isTextSelectionControl(generic)).toBe(true);
    expect(isSensitiveTextSelectionControl(sensitive)).toBe(true);
    expect(isTextSelectionControl(sensitive)).toBe(false);
  });
});
