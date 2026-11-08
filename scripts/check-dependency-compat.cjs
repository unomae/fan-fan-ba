// Offline integration checks for the actual Jest consumers of the pinned glob.
// Kept outside Jest's test filename convention so application test counts stay separate.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');

test('Jest expands project globs, preserves module suggestions, and enforces glob coverage thresholds', () => {
  for (const parent of ['jest-config', 'jest-runtime', '@jest/reporters']) {
    const consumer = createRequire(require.resolve(parent));
    assert.equal(consumer('glob/package.json').version, '14.0.2', parent);
    const globConsumer = createRequire(consumer.resolve('glob'));
    assert.equal(globConsumer('minimatch/package.json').version, '11.0.1', parent);
  }
  // Jest canonicalizes paths; macOS temp directories can be /var -> /private/var aliases.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jest compat ')));
  const put = (file, contents) => {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  };
  try {
    put('deny-network.cjs', `
      const fs = require('node:fs');
      const deny = () => { fs.writeFileSync(${JSON.stringify(path.join(root, 'network-attempt'))}, 'attempt'); throw Error('Offline fixture forbids network'); };
      require('node:net').Socket.prototype.connect = deny;
      require('node:dns').lookup = deny;
      global.fetch = deny;
    `);
    for (const name of ['alpha', 'beta']) {
      put(`packages/${name}/jest.config.cjs`, `module.exports = {testEnvironment:'node', testMatch:['<rootDir>/src/*.test.js'], moduleFileExtensions:['js','json','node']};`);
      put(`packages/${name}/src/value.js`, 'module.exports = (a, b) => a + b;\n');
      put(`packages/${name}/src/unknown.fixture`, 'dummy text, not executable\n');
      put(`packages/${name}/src/value.test.js`, `
        test('dummy arithmetic and extension suggestion', () => {
          expect(require('./value')(2, 3)).toBe(5);
          let message;
          try { require('./unknown'); } catch (error) { message = error.message; }
          expect(message).toContain('unknown.fixture');
          expect(message).toContain('moduleFileExtensions');
        });
      `);
    }
    put('packages/excluded/should-not-run.test.js', "throw Error('Project glob selected an unrelated directory');");
    put('jest.config.cjs', `module.exports = {
      rootDir: ${JSON.stringify(root)},
      projects: ['<rootDir>/packages/{alpha,beta}'],
      collectCoverage: true,
      coverageReporters: ['json-summary'],
      coverageDirectory: '<rootDir>/coverage',
      coverageThreshold: {'./packages/*/src/value.js': {lines:100}}
    };`);
    const run = () => spawnSync(process.execPath, ['--require', path.join(root, 'deny-network.cjs'), require.resolve('jest/bin/jest'), '--config', path.join(root, 'jest.config.cjs'), '--runInBand', '--json'], {
      cwd: root, encoding: 'utf8', timeout: 60000,
      env: {...process.env, HOME: root, USERPROFILE: root, XDG_CACHE_HOME: path.join(root, 'cache')}
    });
    const good = run();
    process.stderr.write(good.stderr || '');
    assert.ifError(good.error);
    if (good.status !== 0) {
      const consumer = createRequire(require.resolve('@jest/reporters'));
      const pattern = path.join(root, 'packages', '*', 'src', 'value.js');
      process.stderr.write(JSON.stringify({
        fixtureRoot: root,
        nativePattern: pattern,
        nativeMatches: consumer('glob').glob.sync(pattern, {windowsPathsNoEscape:true}),
        forwardSlashMatches: consumer('glob').glob.sync(pattern.replaceAll('\\', '/'), {windowsPathsNoEscape:true}),
        coverageFiles: Object.keys(JSON.parse(good.stdout).coverageMap || {})
      }) + '\n');
    }
    assert.equal(good.status, 0, good.stdout + good.stderr);
    const result = JSON.parse(good.stdout);
    assert.equal(result.numPassedTestSuites, 2);
    assert.equal(result.numPassedTests, 2);
    assert.equal(result.numPendingTests, 0);
    assert.deepEqual(result.testResults.map(item => path.relative(root, item.name).replaceAll('\\', '/')).sort(), ['packages/alpha/src/value.test.js', 'packages/beta/src/value.test.js']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'coverage/coverage-summary.json'))).total.lines.pct, 100);
    put('packages/alpha/src/value.js', 'module.exports = (a, b) => a + b;\nexports.unused = () => {\n  return 99;\n};\n');
    const bad = run();
    process.stderr.write(bad.stderr || '');
    assert.ifError(bad.error);
    assert.equal(bad.status, 1, bad.stdout + bad.stderr);
    assert.match(bad.stderr, /Coverage for lines \(66\.66%\) does not meet .*packages[/\\]alpha[/\\]src[/\\]value\.js.*threshold \(100%\)/);
    assert.equal(JSON.parse(bad.stdout).numPassedTests, 2, 'negative control must fail coverage, not test execution');
    assert.equal(fs.existsSync(path.join(root, 'network-attempt')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
