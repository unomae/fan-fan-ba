'use strict';

// WS-E T-GUARD：訊息錯誤契約——所有 message type 對無效輸入必須回「結構化錯誤」，
// 不得讓 validate 同步 throw 逃出 listener（那會使呼叫端只收到 "port closed"）。
// 這是 T-CLEAN 修復（GEMINI_REQUEST / TTS_REQUEST 補 try/catch）的回歸鎖。

require('../background');

function getOnMessageListener() {
  return chrome.runtime.onMessage.addListener.mock.calls[0][0];
}

// 模擬一次 onMessage 派發；回傳 sendResponse 收到的 payload
function dispatch(request) {
  return new Promise((resolve, reject) => {
    const listener = getOnMessageListener();
    let returned;
    try {
      returned = listener(request, { id: chrome.runtime.id }, resolve);
    } catch (error) {
      // 同步 throw 逃出 listener＝契約違反，直接讓測試紅
      reject(new Error(`listener 同步 throw：${error.message}`));
      return;
    }
    if (returned === false) {
      // 同步路徑：reply 應已被呼叫；保底避免測試掛住
      setTimeout(() => resolve('__NO_RESPONSE__'), 20);
    }
  });
}

describe('訊息錯誤契約：無效輸入 → 結構化錯誤，絕不同步 throw', () => {
  test('GEMINI_REQUEST：選取文字超長 → { error }', async () => {
    const res = await dispatch({ type: 'GEMINI_REQUEST', action: 'translate', selectedText: 'x'.repeat(6001) });
    expect(res).toEqual({ error: '選取文字過長' });
  });

  test('GEMINI_REQUEST：未知 action → { error }', async () => {
    const res = await dispatch({ type: 'GEMINI_REQUEST', action: 'hack', selectedText: 'hi' });
    expect(res).toEqual({ error: '未知的操作類型' });
  });

  test('TTS_REQUEST：text 非字串 → { error }', async () => {
    const res = await dispatch({ type: 'TTS_REQUEST', text: 12345 });
    expect(res).toEqual({ error: '朗讀文字格式不正確' });
  });

  test('OBSIDIAN_URI：非 obsidian:// scheme → { ok:false, error }', async () => {
    const res = await dispatch({ type: 'OBSIDIAN_URI', urls: ['https://evil.example/x'] });
    expect(res).toEqual({ ok: false, error: '只允許 obsidian:// 連結' });
  });

  test('VOCABULARY_STORE：未知 action → { ok:false, error }', async () => {
    const res = await dispatch({ type: 'VOCABULARY_STORE', action: 'nuke' });
    expect(res).toEqual({ ok: false, error: '未知的單字本操作' });
  });

  test('未知 type：忽略（回 false、不回應）', async () => {
    const res = await dispatch({ type: 'TOTALLY_UNKNOWN' });
    expect(res).toBe('__NO_RESPONSE__');
  });
});
