'use strict';

// WS-E T-M3 防呆鎖：model registry 閉合性 + PROVIDERS 靜態資料與 manifest 權限對賬。
// 鎖住兩件事：(1) 顯示（getModel）與路由（getProvider）永遠同向，
// 不再出現「popup 顯示 Groq 模型名、key 檢查卻對 Gemini」的同畫面分裂；
// (2) 新增 provider 時 apiBase 忘了加 host_permissions 會直接紅。

const fs = require('fs');
const path = require('path');
const M = require('../models');

describe('model registry 閉合性', () => {
  test('每個在冊 model：getModel 取回自身、provider 與 getProvider 一致、apiKeyName 對齊 PROVIDERS', () => {
    M.MODELS.forEach(entry => {
      expect(M.getModel(entry.id).id).toBe(entry.id);
      expect(M.getProvider(entry.id)).toBe(entry.provider);
      expect(M.PROVIDERS[entry.provider].apiKeyName).toBe(entry.apiKeyName);
    });
  });

  test('每個遷移目標都在冊', () => {
    Object.values(M.MODEL_MIGRATIONS).forEach(target => {
      expect(M.MODELS.some(entry => entry.id === target)).toBe(true);
    });
  });

  test('遺留 no-prefix id（gemini-2.5-flash）：顯示與路由同向', () => {
    const legacy = 'gemini-2.5-flash';
    expect(M.getProvider(legacy)).toBe('gemini');
    // 修正前 getModel 會錯回 MODELS[0]（Groq 條目）→ UI 與路由分裂
    expect(M.getModel(legacy).provider).toBe('gemini');
    expect(M.getModelDisplayName(legacy)).toBe('Gemini 2.5 Flash');
  });

  test('未知前綴 id：getModel 依 getProvider 反查同 provider 條目', () => {
    expect(M.getModel('groq:some-future-model').provider).toBe('groq');
    expect(M.getModel('openrouter:some-future-model').provider).toBe('openrouter');
    expect(M.getModel('some-unknown-gemini-id').provider).toBe('gemini');
  });
});

describe('模型備援觸發條件（Groq／OpenRouter 共用）', () => {
  const withFallback = [
    ['Groq', M.DEFAULT_MODEL, M.GROQ_FALLBACK_MODEL_ID],
    ['OpenRouter', M.OPENROUTER_PRIMARY_MODEL, M.OPENROUTER_FALLBACK_MODEL_ID]
  ];

  test.each(withFallback)('%s 主模型被下架（404）要退到備援，不能直接爆給使用者', (_label, model, fallbackId) => {
    expect(M.getFallbackModelId(model)).toBe(fallbackId);
    expect(M.shouldFallbackModel(model, 404, 'The model does not exist')).toBe(true);
  });

  test.each(withFallback)('%s 節點忙碌（502/503）與 provider 字樣一樣備援', (_label, model) => {
    expect(M.shouldFallbackModel(model, 502, '')).toBe(true);
    expect(M.shouldFallbackModel(model, 503, '')).toBe(true);
    expect(M.shouldFallbackModel(model, 500, 'no available model provider')).toBe(true);
  });

  test.each(withFallback)('%s 的 401/429 不備援（key 無效與額度用完必須如實回報）', (_label, model) => {
    expect(M.shouldFallbackModel(model, 401, 'invalid api key')).toBe(false);
    expect(M.shouldFallbackModel(model, 429, 'rate limit exceeded')).toBe(false);
  });

  test('Gemini 沒有登記備援模型：任何錯誤都不備援', () => {
    expect(M.getFallbackModelId('gemini-3.5-flash')).toBe('');
    expect(M.shouldFallbackModel('gemini-3.5-flash', 404, '')).toBe(false);
  });

  test('備援模型自己掛掉不再往下備援（目前靠備援 id 不在 MODELS 冊上擋掉）', () => {
    expect(M.shouldFallbackModel(`groq:${M.GROQ_FALLBACK_MODEL_ID}`, 404, '')).toBe(false);
    expect(M.shouldFallbackModel(M.OPENROUTER_FALLBACK_MODEL_ID, 404, '')).toBe(false);
  });

  test('每個登記的 fallbackModelId 都跟主模型不同家、不同 id', () => {
    M.MODELS.filter(entry => entry.fallbackModelId).forEach(entry => {
      expect(entry.fallbackModelId).not.toBe(M.toApiModelId(entry.id));
    });
  });
});

describe('PROVIDERS ⟺ manifest host_permissions 對賬', () => {
  test('每個 provider apiBase 的 origin 都被 host_permissions 覆蓋', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const permittedOrigins = manifest.host_permissions.map(p => new URL(p.replace('/*', '/')).origin);
    Object.values(M.PROVIDERS).forEach(info => {
      expect(permittedOrigins).toContain(new URL(info.apiBase).origin);
    });
  });
});
