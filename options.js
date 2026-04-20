// options.js — 設定頁邏輯：儲存 / 載入 API Key、測試連線

'use strict';

const $ = id => document.getElementById(id);

// ── 載入已儲存的設定 ─────────────────────────────────
chrome.storage.sync.get(['apiKey', 'groqApiKey', 'openrouterApiKey', 'model', 'obsidianVault', 'ttsApiKey'],
  ({ apiKey, groqApiKey, openrouterApiKey, model, obsidianVault, ttsApiKey }) => {
    if (apiKey)           $('apiKey').value           = apiKey;
    if (groqApiKey)       $('groqApiKey').value       = groqApiKey;
    if (openrouterApiKey) $('openrouterApiKey').value = openrouterApiKey;
    if (model)            $('model').value            = model;
    if (obsidianVault)    $('obsidianVault').value    = obsidianVault;
    if (ttsApiKey)        $('ttsApiKey').value        = ttsApiKey;
  }
);

// ── 顯示 / 隱藏 Gemini API Key ───────────────────────
$('toggleVis').addEventListener('click', () => {
  const input    = $('apiKey');
  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';
  $('eye-show').style.display = isHidden ? 'none' : '';
  $('eye-hide').style.display = isHidden ? ''     : 'none';
});

// ── 顯示 / 隱藏 Groq API Key ─────────────────────────
$('toggleGroqVis').addEventListener('click', () => {
  const input    = $('groqApiKey');
  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';
  $('groq-eye-show').style.display = isHidden ? 'none' : '';
  $('groq-eye-hide').style.display = isHidden ? ''     : 'none';
});

// ── 顯示 / 隱藏 OpenRouter API Key ───────────────────
$('toggleOrVis').addEventListener('click', () => {
  const input    = $('openrouterApiKey');
  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';
  $('or-eye-show').style.display = isHidden ? 'none' : '';
  $('or-eye-hide').style.display = isHidden ? ''     : 'none';
});

// ── 顯示 / 隱藏 TTS API Key ──────────────────────────
$('toggleTtsVis').addEventListener('click', () => {
  const input    = $('ttsApiKey');
  const isHidden = input.type === 'password';
  input.type     = isHidden ? 'text' : 'password';
  $('tts-eye-show').style.display = isHidden ? 'none' : '';
  $('tts-eye-hide').style.display = isHidden ? ''     : 'none';
});

// ── 儲存設定 ─────────────────────────────────────────
$('btnSave').addEventListener('click', () => {
  const apiKey           = $('apiKey').value.trim();
  const groqApiKey       = $('groqApiKey').value.trim();
  const openrouterApiKey = $('openrouterApiKey').value.trim();
  const model            = $('model').value;
  const isGroq           = model.startsWith('groq:');
  const isOpenRouter     = model.startsWith('openrouter:');

  // 依選擇的模型驗證對應 API Key
  if (isGroq) {
    if (!groqApiKey) { showStatus('err', '使用 Groq 模型請輸入 Groq API Key'); return; }
    if (!groqApiKey.startsWith('gsk_')) { showStatus('err', 'Groq API Key 格式不正確，應以 gsk_ 開頭'); return; }
  } else if (isOpenRouter) {
    if (!openrouterApiKey) { showStatus('err', '使用 OpenRouter 模型請輸入 OpenRouter API Key'); return; }
    if (!openrouterApiKey.startsWith('sk-or-')) { showStatus('err', 'OpenRouter API Key 格式不正確，應以 sk-or- 開頭'); return; }
  } else {
    if (!apiKey) { showStatus('err', '請輸入 Gemini API Key'); return; }
    if (!apiKey.startsWith('AIza')) { showStatus('err', 'Gemini API Key 格式不正確，應以 AIza 開頭'); return; }
  }

  const obsidianVault = $('obsidianVault').value.trim();
  const ttsApiKey     = $('ttsApiKey').value.trim();

  chrome.storage.sync.set(
    { apiKey, groqApiKey, openrouterApiKey, model, obsidianVault, ttsApiKey },
    () => showStatus('ok', '✓ 設定已儲存')
  );
});

// ── 測試連線 ─────────────────────────────────────────
$('btnTest').addEventListener('click', async () => {
  const model        = $('model').value || 'gemini-3-flash-preview';
  const isGroq       = model.startsWith('groq:');
  const isOpenRouter = model.startsWith('openrouter:');

  let apiKey, displayName, fetchUrl, fetchBody, fetchHeaders;

  if (isGroq) {
    apiKey      = $('groqApiKey').value.trim();
    displayName = 'Llama 4 Scout (Groq)';
    fetchUrl    = 'https://api.groq.com/openai/v1/chat/completions';
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
    fetchBody    = JSON.stringify({ model: model.replace('groq:', ''), messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
  } else if (isOpenRouter) {
    apiKey      = $('openrouterApiKey').value.trim();
    displayName = model.replace('openrouter:', '');
    fetchUrl    = 'https://openrouter.ai/api/v1/chat/completions';
    fetchHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'X-Title': 'Fan Fan Ba' };
    fetchBody    = JSON.stringify({ model: model.replace('openrouter:', ''), messages: [{ role: 'user', content: '回覆 OK 即可' }], max_tokens: 10 });
  } else {
    apiKey      = $('apiKey').value.trim();
    displayName = model;
    fetchUrl    = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    fetchHeaders = { 'Content-Type': 'application/json' };
    fetchBody    = JSON.stringify({ contents: [{ parts: [{ text: '回覆 OK 即可' }] }], generationConfig: { maxOutputTokens: 10 } });
  }

  if (!apiKey) {
    showStatus('err', `請先輸入 ${isGroq ? 'Groq' : isOpenRouter ? 'OpenRouter' : 'Gemini'} API Key`);
    return;
  }

  showStatus('info', '測試中...');
  $('btnTest').disabled = true;

  try {
    const res = await fetch(fetchUrl, { method: 'POST', headers: fetchHeaders, body: fetchBody });
    if (res.ok) {
      showStatus('ok', `✓ 連線成功！模型：${displayName}`);
    } else {
      const err = await res.json().catch(() => ({}));
      showStatus('err', `連線失敗：${err.error?.message || `HTTP ${res.status}`}`);
    }
  } catch (e) {
    showStatus('err', `網路錯誤：${e.message}`);
  } finally {
    $('btnTest').disabled = false;
  }
});

// ── 工具函式 ─────────────────────────────────────────
function showStatus(type, msg) {
  const el = $('status');
  el.className   = type;
  el.textContent = msg;
  if (type === 'ok') setTimeout(() => { el.className = ''; el.textContent = ''; }, 3000);
}
