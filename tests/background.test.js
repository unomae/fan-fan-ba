const {
  isRetryable,
  buildPrompt,
  checkedFetch,
  formatApiErrorMessage,
  validateAIRequest,
  validateTtsRequest,
  validateObsidianUriRequest,
  withRetry,
  streamOpenAICompat
} = require('../background');
const { ReadableStream } = require('stream/web');

describe('Background module', () => {
  describe('isRetryable', () => {
    it('should return true for 429 and 503', () => {
      expect(isRetryable({ status: 429 })).toBe(true);
      expect(isRetryable({ status: 503 })).toBe(true);
    });
    it('should return false for others', () => {
      expect(isRetryable({ status: 500 })).toBe(false);
    });
  });

  describe('buildPrompt', () => {
    it('should build prompt correctly', () => {
      const prompt = buildPrompt('translate', 'apple', 'I eat an apple.', 'Page Title');
      expect(prompt).toContain('專業多語詞典助手');
    });

    it('uses plain translation prompts for short page-translation headings', () => {
      const prompt = buildPrompt('translate', 'Most viewed', 'Most viewed', 'Page Title', { pageTranslation: true });
      expect(prompt).toContain('專業翻譯助手');
      expect(prompt).toContain('只輸出譯文正文');
      expect(prompt).not.toContain('專業多語詞典助手');
      expect(prompt).not.toContain('"phonetic"');
    });
  });

  describe('buildPrompt batch mode', () => {
    it('uses strict JSON prompts for page translation batches', () => {
      const prompt = buildPrompt(
        'translate',
        '[{"id":1,"text":"First paragraph."},{"id":2,"text":"Second paragraph."}]',
        'Page title: Page Title\nHostname: example.com\nMain headings: Report',
        'Page Title',
        { pageTranslation: { batch: true, count: 2 } }
      );

      expect(prompt).toContain('{"translations":[{"id":1,"translation":"');
      expect(prompt).toContain('Hostname: example.com');
      expect(prompt).toContain('"text":"First paragraph."');
      expect(prompt).not.toContain('"phonetic"');
    });
  });

  describe('checkedFetch', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('should return response if ok', async () => {
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      const res = await checkedFetch('http://test.com', {});
      expect(res.ok).toBe(true);
    });

    it('should throw error if not ok', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: { message: 'Not found' } })
      });
      await expect(checkedFetch('http://test.com', {})).rejects.toThrow('Not found');
    });
  });

  describe('withRetry', () => {
    it('does not start retry work after the signal is aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const fn = jest.fn();

      await expect(withRetry(fn, 3, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('formatApiErrorMessage', () => {
    it('classifies authentication, quota, and provider availability errors', () => {
      expect(formatApiErrorMessage(401, 'Invalid key', 'Groq')).toContain('Groq驗證失敗');
      expect(formatApiErrorMessage(429, 'Rate limit', 'Gemini')).toContain('Gemini請求過於頻繁');
      expect(formatApiErrorMessage(503, 'Busy', 'OpenRouter')).toContain('OpenRouter目前忙碌');
    });

    it('keeps unknown provider messages when no classification exists', () => {
      expect(formatApiErrorMessage(404, 'Model not found', 'Gemini')).toBe('Model not found');
    });
  });

  describe('request validation', () => {
    it('accepts known AI actions and preserves bounded request fields', () => {
      const request = validateAIRequest({
        action: 'translate',
        selectedText: 'hello',
        context: 'page context',
        pageTitle: 'Example',
        pageTranslation: { batch: true, count: 2 }
      });

      expect(request).toMatchObject({
        action: 'translate',
        selectedText: 'hello',
        context: 'page context',
        pageTitle: 'Example',
        pageTranslation: { batch: true, count: 2 }
      });
    });

    it('rejects unknown AI actions and overlong selected text', () => {
      expect(() => validateAIRequest({
        action: 'deleteEverything',
        selectedText: 'hello'
      })).toThrow('未知的操作類型');

      expect(() => validateAIRequest({
        action: 'translate',
        selectedText: 'x'.repeat(6001)
      })).toThrow('選取文字過長');
    });

    it('rejects empty AI text and overlong TTS text', () => {
      expect(() => validateAIRequest({
        action: 'explain',
        selectedText: '   '
      })).toThrow('沒有可處理的文字');

      expect(() => validateTtsRequest({
        text: 'x'.repeat(161),
        lang: 'en'
      })).toThrow('朗讀文字過長');
    });

    it('rejects malformed page translation metadata', () => {
      expect(() => validateAIRequest({
        action: 'translate',
        selectedText: 'hello',
        pageTranslation: 'yes'
      })).toThrow('全文翻譯參數格式不正確');
    });

    it('coerces a numeric requestId instead of throwing (streaming paragraph fix)', () => {
      // content/main.js 串流送的 requestId 是數字；correlation id 不該擋掉整個請求
      const req = validateAIRequest({ action: 'translate', selectedText: 'hello', requestId: 7 });
      expect(req.requestId).toBe('7');
    });

    it('drops non string/number requestId without throwing', () => {
      expect(validateAIRequest({ action: 'translate', selectedText: 'hi', requestId: {} }).requestId).toBe('');
      expect(validateAIRequest({ action: 'translate', selectedText: 'hi' }).requestId).toBe('');
    });
  });

  describe('Obsidian URI validation', () => {
    it('accepts obsidian:// links from urls array and url field', () => {
      expect(validateObsidianUriRequest({ urls: ['obsidian://new?file=a', 'obsidian://open?vault=b'] }))
        .toEqual(['obsidian://new?file=a', 'obsidian://open?vault=b']);
      expect(validateObsidianUriRequest({ url: 'obsidian://new?file=a' }))
        .toEqual(['obsidian://new?file=a']);
    });

    it('rejects non-obsidian schemes (no arbitrary tab opening)', () => {
      expect(() => validateObsidianUriRequest({ urls: ['https://evil.example.com'] }))
        .toThrow('只允許 obsidian:// 連結');
      expect(() => validateObsidianUriRequest({ url: 'javascript:alert(1)' }))
        .toThrow('只允許 obsidian:// 連結');
    });

    it('drops blank / non-string entries and rejects empty results', () => {
      expect(validateObsidianUriRequest({ urls: ['obsidian://x', '', 42, null] }))
        .toEqual(['obsidian://x']);
      expect(() => validateObsidianUriRequest({ urls: [] })).toThrow('沒有可開啟的 Obsidian URI');
      expect(() => validateObsidianUriRequest({})).toThrow('沒有可開啟的 Obsidian URI');
    });

    it('rejects overlong links and caps the number of URIs', () => {
      expect(() => validateObsidianUriRequest({ url: `obsidian://${'x'.repeat(4097)}` }))
        .toThrow('Obsidian 連結過長');
      const many = Array.from({ length: 80 }, (_, i) => `obsidian://n${i}`);
      expect(validateObsidianUriRequest({ urls: many })).toHaveLength(50);
    });
  });

  describe('streamOpenAICompat', () => {
    beforeEach(() => {
      global.fetch = jest.fn();
    });

    it('passes AbortController signal to streaming fetch', async () => {
      const controller = new AbortController();
      const body = new ReadableStream({
        start(streamController) {
          streamController.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'));
          streamController.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          streamController.close();
        }
      });
      global.fetch.mockResolvedValueOnce({ ok: true, body });

      const chunks = [];
      await streamOpenAICompat({
        prompt: 'Translate this',
        action: 'translate',
        modelId: 'test-model',
        apiKey: 'test-key',
        baseUrl: 'https://example.test/chat/completions',
        onChunk: chunk => chunks.push(chunk),
        signal: controller.signal
      });

      expect(global.fetch.mock.calls[0][1].signal).toBe(controller.signal);
      expect(chunks).toEqual(['Hi']);
    });
  });
});
