const { TextDecoder, TextEncoder } = require('util');

const createChromeMock = () => ({
  runtime: {
    getManifest: jest.fn(() => ({
      version: '1.8.6',
      oauth2: {
        client_id: 'REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com',
        scopes: ['https://www.googleapis.com/auth/drive.appdata']
      }
    })),
    getURL: jest.fn(path => `chrome-extension://mock-extension-id/${path}`),
    openOptionsPage: jest.fn(),
    sendMessage: jest.fn((message, callback) => {
      if (typeof callback === 'function') callback();
      return Promise.resolve();
    }),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onInstalled: {
      addListener: jest.fn()
    },
    onConnect: {
      addListener: jest.fn()
    }
  },
  storage: {
    sync: {
      get: jest.fn(async () => ({})),
      set: jest.fn(async () => {}),
      remove: jest.fn(async () => {})
    },
    local: {
      get: jest.fn(async () => ({})),
      set: jest.fn(async () => {}),
      remove: jest.fn(async () => {})
    }
  },
  identity: {
    getAuthToken: jest.fn(),
    launchWebAuthFlow: jest.fn(),
    getRedirectURL: jest.fn(() => 'https://mock-extension-id.chromiumapp.org/'),
    removeCachedAuthToken: jest.fn((details, callback) => {
      if (typeof callback === 'function') callback();
    })
  },
  tabs: {
    create: jest.fn(),
    query: jest.fn(),
    update: jest.fn()
  }
});

global.TextDecoder = TextDecoder;
global.TextEncoder = TextEncoder;
global.chrome = createChromeMock();
global.fetch = jest.fn();

beforeEach(() => {
  global.chrome = createChromeMock();
  global.fetch = jest.fn();
});
