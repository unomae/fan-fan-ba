const {
  isRetryable,
  buildPrompt,
  checkedFetch
} = require('../background');

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
});
