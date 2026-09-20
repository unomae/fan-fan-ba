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

// 2026-09-09：清冊本身沒有任何鎖——popup.test.js 只驗 `MODELS.length > 0`，
// 少一顆、改一個 id 或改一個顯示名，全部測試照樣綠。而「模型無預警下架」是本專案的
// 常態風險（2026-08-14 一次死兩顆、Groq 兩個 llama 08-16 也下架），正是最需要
// 「改動必須是刻意的」那種地方。這裡把四顆逐一寫死：要增刪改就得同步改這支測試。
describe('模型清冊完整性（增刪改都必須是刻意的）', () => {
  // 期望清冊：[id, 顯示名, provider, 是否登記備援]
  const EXPECTED = [
    ['groq:openai/gpt-oss-120b', 'GPT-OSS 120B', 'groq', true],
    ['gemini-3.5-flash', 'Gemini 3.5 Flash', 'gemini', false],
    ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite', 'gemini', false],
    ['openrouter:google/gemma-4-31b-it:free', 'Gemma 4 31B', 'openrouter', true],
    // 瀏覽器內建 Translator API：無 endpoint、無 key、無備援模型（掛掉就回報，讓使用者改選雲端）
    ['builtin:translator', '瀏覽器內建翻譯', 'builtin', false]
  ];

  test('清冊剛好是這五顆、順序不變（popup 依此順序渲染選項）', () => {
    expect(M.MODELS.map(entry => entry.id)).toEqual(EXPECTED.map(([id]) => id));
  });

  test.each(EXPECTED)('%s 仍在冊：顯示名／provider／備援登記都沒被動到', (id, name, provider, hasFallback) => {
    const entry = M.MODELS.find(item => item.id === id);
    expect(entry).toBeDefined();
    expect(entry.name).toBe(name);
    expect(entry.provider).toBe(provider);
    expect(Boolean(entry.fallbackModelId)).toBe(hasFallback);
  });

  test('預設模型是 Groq GPT-OSS 120B，且它在冊', () => {
    expect(M.DEFAULT_MODEL).toBe('groq:openai/gpt-oss-120b');
    expect(M.MODELS.some(entry => entry.id === M.DEFAULT_MODEL)).toBe(true);
  });
});

describe('PROVIDERS ⟺ manifest host_permissions 對賬', () => {
  test('每個 provider apiBase 的 origin 都被 host_permissions 覆蓋', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const permittedOrigins = manifest.host_permissions.map(p => new URL(p.replace('/*', '/')).origin);
    // keyless provider（瀏覽器內建）沒有 endpoint，沒有 origin 可對；略過但要**證明它真的是 keyless**，
    // 免得日後某個有 endpoint 的 provider 漏填 apiBase 時，被這個分支靜默放行。
    const entries = Object.entries(M.PROVIDERS);
    const skipped = entries.filter(([, info]) => !info.apiBase);
    skipped.forEach(([name, info]) => expect(info.keyless).toBe(true));
    expect(skipped.map(([name]) => name)).toEqual(['builtin']);

    entries.filter(([, info]) => info.apiBase).forEach(([, info]) => {
      expect(permittedOrigins).toContain(new URL(info.apiBase).origin);
    });
  });
});
