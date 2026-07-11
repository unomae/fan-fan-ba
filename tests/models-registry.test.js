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

describe('PROVIDERS ⟺ manifest host_permissions 對賬', () => {
  test('每個 provider apiBase 的 origin 都被 host_permissions 覆蓋', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
    const permittedOrigins = manifest.host_permissions.map(p => new URL(p.replace('/*', '/')).origin);
    Object.values(M.PROVIDERS).forEach(info => {
      expect(permittedOrigins).toContain(new URL(info.apiBase).origin);
    });
  });
});
