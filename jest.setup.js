// Mock Chrome API
global.chrome = {
  runtime: {
    onInstalled: { addListener: jest.fn() },
    onMessage: { addListener: jest.fn() },
    onConnect: { addListener: jest.fn() },
    sendMessage: jest.fn(),
    getURL: jest.fn((path) => `chrome-extension://mock-id/${path}`),
    openOptionsPage: jest.fn(),
    getManifest: jest.fn(() => ({
      version: '1.7.2',
      oauth2: {
        client_id: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
      }
    }))
  },
  identity: {
    getAuthToken: jest.fn(),
    launchWebAuthFlow: jest.fn(),
    getRedirectURL: jest.fn(() => 'https://mock-extension-id.chromiumapp.org/'),
    removeCachedAuthToken: jest.fn((details, cb) => cb && cb())
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn((data, cb) => cb && cb()),
      remove: jest.fn((keys, cb) => cb && cb())
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn((data, cb) => cb && cb()),
      remove: jest.fn((keys, cb) => cb && cb())
    }
  },
  tabs: {
    create: jest.fn(),
    query: jest.fn(),
    remove: jest.fn(),
    update: jest.fn()
  },
  windows: {
    update: jest.fn()
  },
  contextMenus: {
    create: jest.fn(),
    onClicked: { addListener: jest.fn() },
    removeAll: jest.fn()
  }
};

// Mock fetch if needed globally
global.fetch = jest.fn();

// Add TextEncoder/TextDecoder for DOM environment if missing
if (typeof global.TextEncoder === 'undefined') {
  const { TextEncoder, TextDecoder } = require('util');
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
}
