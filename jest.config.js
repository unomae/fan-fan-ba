// 固定時區：render-parity 基準檔裡的查詢時間是台北時間，CI（UTC）會差 8 小時。
// 設定檔在主程序載入、worker 之後才開，所以這裡設的 TZ 會被所有測試繼承。
process.env.TZ = 'Asia/Taipei';

module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['./jest.setup.js'],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
};
