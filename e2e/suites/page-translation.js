'use strict';

const assert = require('node:assert/strict');

const ROUTE = '/page-translation-p0';
const SOURCE = 'The lighthouse stands on a rocky island far from the harbor.';
const REPLACEMENT = 'The warehouse stores replacement batteries beside the loading bay.';
const OLD_RESULT = '燈塔立在離港口很遠的岩石島上。';
const NEW_RESULT = '倉庫在裝卸區旁存放替換電池。';

async function run(session, rec) {
  session.pages[ROUTE] = `<style>main{max-width:640px;margin:70px auto}body{min-height:1600px}</style><main><p id="source">${SOURCE}</p></main>`;
  const optionsPage = await session.ctx.newPage();
  let page;
  let worker;
  try {
    await optionsPage.goto(session.optionsUrl);
    const workerUrl = `chrome-extension://${session.cfg.extId}/background.js`;
    // 喚醒真實 SW，但不用真實模型或金鑰。僅在隔離測試 profile 換掉供應商 HTTP。
    await optionsPage.evaluate(() => chrome.runtime.sendMessage({ type: 'MODEL_AVAILABILITY' }));
    worker = session.ctx.serviceWorkers().find(sw => sw.url() === workerUrl)
      || await session.ctx.waitForEvent('serviceworker', { predicate: sw => sw.url() === workerUrl, timeout: 12000 });
    await worker.evaluate(async () => {
      const previousSecrets = await chrome.storage.local.get('groqApiKey');
      const previousSettings = await chrome.storage.sync.get(['model', 'pageTranslationModel', 'targetLanguage']);
      self.ffbTranslationFixture = {
        previousSecrets, previousSettings, fetch: self.fetch,
        reply: null, held: null, requests: []
      };
      await chrome.storage.local.set({ groqApiKey: 'dummy-local-test-only' });
      await chrome.storage.sync.set({ model: 'groq:openai/gpt-oss-120b', pageTranslationModel: '', targetLanguage: 'zh-TW' });
      self.fetch = async (url, init) => {
        if (url !== 'https://api.groq.com/openai/v1/chat/completions') throw new Error('非預期的測試請求');
        const fixture = self.ffbTranslationFixture;
        fixture.requests.push(JSON.parse(init.body).messages.map(message => message.content).join('\n'));
        const { hold, result } = fixture.reply;
        if (hold) {
          await new Promise((resolve, reject) => {
            fixture.held = resolve;
            init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
          });
        }
        if (result === null) {
          return new Response(JSON.stringify({ error: { message: 'FFB fixture rejected translation' } }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          });
        }
        const chunk = { choices: [{ delta: { content: result } }] };
        return new Response('data: ' + JSON.stringify(chunk) + '\n\ndata: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' }
        });
      };
    });

    const setReply = (result, hold = false) => worker.evaluate(reply => {
      self.ffbTranslationFixture.reply = reply;
    }, { result, hold });
    const release = () => worker.evaluate(async () => {
      const fixture = self.ffbTranslationFixture;
      const deadline = Date.now() + 5000;
      while (!fixture.held && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (!fixture.held) throw new Error('測試供應商未收到待釋放的請求');
      fixture.held();
      fixture.held = null;
    });
    const requests = () => worker.evaluate(() => self.ffbTranslationFixture.requests);
    const start = async () => {
      await page.goto(session.origin + ROUTE);
      await page.bringToFront();
      await page.waitForSelector('#fanfanba-floating');
      const delivered = await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        return handleCommand('toggle-page-translation', tab);
      });
      assert.equal(delivered, true);
      await page.waitForSelector('.ffb-page-translation-panel');
    };
    const waitForResult = result => page.waitForFunction(text =>
      document.querySelector('.ffb-page-translation-text')?.textContent === text, result);
    const replaceText = () => page.evaluate(text => {
      const source = document.getElementById('source');
      window.ffbOriginalSource = source;
      source.firstChild.data = text;
    }, REPLACEMENT);
    const runCase = async (id, fn) => {
      page = await session.newPage(ROUTE, { width: 1140, height: 780 });
      try {
        await fn();
      } catch (error) {
        await session.shot(page, `${id}-failed`);
        rec.fail(id, error.message);
      } finally {
        await page.close();
        page = null;
      }
    };

    await runCase('P0-原文顯示', async () => {
      await setReply(null, true);
      await start();
      await page.waitForSelector('.ffb-page-translation-loading');
      await page.locator('[data-mode="translation"]').click();
      const source = page.locator('#source');
      assert.equal(await source.isVisible(), true, '等待中原文應可見');
      await session.shot(page, 'ffb-p0-original-loading-fixed');
      await release();
      await page.waitForSelector('.ffb-page-translation-error');
      assert.equal(await source.isVisible(), true, 'HTTP 400 後原文應可見');
      assert.match(await page.locator('.ffb-page-translation-text').innerText(), /HTTP 400/);
      await session.shot(page, 'ffb-p0-original-failure-fixed');
      await setReply(OLD_RESULT);
      await page.locator('.ffb-page-retry').click();
      await waitForResult(OLD_RESULT);
      assert.equal(await source.isVisible(), false, '成功後才可隱藏原文');
      await page.locator('[data-mode="bilingual"]').click();
      assert.equal(await source.isVisible(), true);
      rec.pass('P0-原文顯示', true, '僅譯文：等待與 HTTP 400 時原文可見；重試成功才隱藏，雙語模式可讀');
    });

    await runCase('P0-同節點換文', async () => {
      await setReply(OLD_RESULT);
      await start();
      await waitForResult(OLD_RESULT);
      const before = (await requests()).length;
      await setReply(NEW_RESULT);
      await replaceText();
      await page.mouse.move(500, 260);
      await page.mouse.wheel(0, 32);
      await page.waitForFunction(text => !document.querySelector('main').textContent.includes(text), OLD_RESULT);
      await waitForResult(NEW_RESULT);
      assert.equal(await page.evaluate(() => window.ffbOriginalSource === document.getElementById('source')), true);
      const after = await requests();
      assert.equal(after.length, before + 1);
      assert.ok(after.at(-1).includes(REPLACEMENT));
      assert.equal(await page.locator('.ffb-page-panel-count').innerText(), '1/1');
      await session.shot(page, 'ffb-p0-stale-translation-fixed');
      await page.locator('[data-action="restore"]').click();
      assert.equal(await page.locator('.ffb-page-translation-block').count(), 0);
      rec.pass('P0-同節點換文', true, '燈塔換成倉庫後撤下舊譯文、只發一筆新請求，面板為 1/1');
    });

    await runCase('P0-在途過期', async () => {
      await setReply(OLD_RESULT, true);
      await start();
      await page.waitForSelector('.ffb-page-translation-loading');
      await page.evaluate(oldResult => {
        window.ffbStaleRendered = false;
        new MutationObserver(records => {
          window.ffbStaleRendered ||= records.some(record => [...record.addedNodes]
            .some(node => node.textContent?.includes(oldResult)));
        }).observe(document.querySelector('main'), { childList: true, subtree: true });
      }, OLD_RESULT);
      await replaceText();
      await page.waitForSelector('.ffb-page-translation-block', { state: 'detached' });
      await setReply(NEW_RESULT);
      await release();
      await waitForResult(NEW_RESULT);
      assert.equal(await page.evaluate(() => window.ffbStaleRendered), false);
      assert.equal(await page.locator('.ffb-page-panel-count').innerText(), '1/1');
      rec.pass('P0-在途過期', true, '先放行舊 HTTP 回應，舊譯文從未插回 DOM，只有新譯文完成');
    });
  } finally {
    await page?.close();
    await optionsPage.close();
    if (worker) {
      await worker.evaluate(async () => {
        const fixture = self.ffbTranslationFixture;
        if (!fixture) return;
        self.fetch = fixture.fetch;
        delete self.ffbTranslationFixture;
        const restore = async (area, keys, previous) => {
          await area.remove(keys);
          await area.set(previous);
        };
        await restore(chrome.storage.local, ['groqApiKey'], fixture.previousSecrets);
        await restore(chrome.storage.sync, ['model', 'pageTranslationModel', 'targetLanguage'], fixture.previousSettings);
      });
    }
    delete session.pages[ROUTE];
  }
}

module.exports = { name: 'page-translation', description: '全文翻譯原文顯示、來源重用與過期回應', run };
