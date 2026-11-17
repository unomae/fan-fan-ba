const byId = id => document.getElementById(id);
const file = byId('pdf-file');
const documentSection = byId('document');
const documentStatus = byId('document-status');
const pageNumber = byId('page-number');
const pageTotal = byId('page-total');
const previous = byId('previous');
const next = byId('next');
const pageStatus = byId('page-status');
const preview = byId('preview');
const translate = byId('translate');
const cancel = byId('cancel-translation');
const translationStatus = byId('translation-status');
const translationText = byId('translation-text');

const MAX_PDF_BYTES = 32 * 1024 * 1024;
const MAX_PAGE_TEXT = 30000;
const CHUNK_SIZE = 1500;
const PDF_ASSETS = new URL('../vendor/pdfjs/', import.meta.url);
const PICK_FILE = '請選擇本機 PDF 檔案。';

let loadRevision = 0;
let pageRevision = 0;
let download;
let loadingTask;
let pdf;
let renderTask;
let currentPage;
let pageIndex = 1;
let translating;

function stopTranslation() {
  translating?.abort();
  translating = undefined;
  cancel.hidden = true;
  translationStatus.textContent = '';
  translationText.textContent = '';
  translate.disabled = !currentPage;
}

function resetDocument() {
  ++loadRevision;
  ++pageRevision;
  download?.abort();
  stopTranslation();
  renderTask?.cancel();
  renderTask = undefined;
  if (loadingTask) void loadingTask.destroy().catch(() => {});
  loadingTask = undefined;
  currentPage = undefined;
  pdf = undefined;
  preview.replaceChildren();
  documentSection.hidden = true;
  documentStatus.textContent = '正在開啟 PDF…';
  return loadRevision;
}

function assertPdfSize(size) {
  if (size > MAX_PDF_BYTES) throw new Error('PDF 超過 32 MB。');
}

async function openDocument(getBytes, label) {
  const revision = resetDocument();
  try {
    const bytes = await getBytes();
    if (revision !== loadRevision) return;
    if (!new TextDecoder().decode(bytes.subarray(0, 1024)).includes('%PDF-')) {
      throw new Error('沒有取得有效 PDF，來源可能需要登入。');
    }
    let lib;
    try {
      lib = await import(new URL('pdf.min.mjs', PDF_ASSETS));
    } catch {
      throw new Error('閱讀器元件載入失敗。請重新載入已打包的擴充功能。');
    }
    if (revision !== loadRevision) return;
    lib.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', PDF_ASSETS).href;
    loadingTask = lib.getDocument({
      data: bytes,
      cMapUrl: new URL('cmaps/', PDF_ASSETS).href,
      standardFontDataUrl: new URL('standard_fonts/', PDF_ASSETS).href,
      useWasm: false,
      isEvalSupported: false,
      stopAtErrors: true,
      maxImageSize: 16000000
    });
    const opened = await loadingTask.promise;
    if (revision !== loadRevision) return;
    pdf = opened;
    documentStatus.textContent = label;
    pageNumber.max = String(pdf.numPages);
    pageTotal.textContent = '／ ' + pdf.numPages;
    documentSection.hidden = false;
    await showPage(1);
  } catch (error) {
    if (revision !== loadRevision) return;
    if (loadingTask) void loadingTask.destroy().catch(() => {});
    loadingTask = undefined;
    const message = error.name === 'PasswordException'
      ? '這份 PDF 有密碼保護，請先用 PDF 軟體解鎖。'
      : (error.name === 'InvalidPDFException' ? '無法解析這份 PDF。' : error.message);
    documentStatus.textContent = message + ' ' + PICK_FILE;
  }
}

async function showPage(number) {
  if (!pdf || !Number.isInteger(number) || number < 1 || number > pdf.numPages) return;
  const revision = ++pageRevision;
  const document = pdf;
  currentPage = undefined;
  stopTranslation();
  renderTask?.cancel();
  renderTask = undefined;
  pageIndex = number;
  pageNumber.value = String(number);
  previous.disabled = number === 1;
  next.disabled = number === document.numPages;
  preview.replaceChildren();
  pageStatus.textContent = '正在載入第 ' + number + ' 頁…';
  try {
    const page = await document.getPage(number);
    if (revision !== pageRevision) return;
    const initial = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1800 / Math.max(initial.width, initial.height));
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'PDF 原文第 ' + number + ' 頁');
    renderTask = page.render({ canvas, viewport });
    await renderTask.promise;
    if (revision !== pageRevision) return;
    preview.replaceChildren(canvas);
    currentPage = page;
    pageStatus.textContent = '';
    translate.disabled = false;
  } catch {
    if (revision === pageRevision) pageStatus.textContent = '無法顯示這一頁。請切換頁次或選擇另一份 PDF。';
  } finally {
    if (revision === pageRevision) renderTask = undefined;
  }
}

async function fetchPdf(url, signal) {
  let response;
  try {
    // 不帶登入資料、不跟隨重導向。需要重導向時請先在 Chrome 開啟最終 PDF。
    response = await fetch(url, { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal });
  } catch {
    throw new Error('無法讀取原檔。若網址會跳轉，請先開啟最終 PDF 再試。');
  }
  if (response.status === 401 || response.status === 403) throw new Error('PDF 需要登入或網站拒絕取檔。');
  if (response.status !== 200 || !response.body) throw new Error('無法取得完整 PDF。');
  if (response.headers.get('content-type')?.toLowerCase().includes('text/html')) {
    throw new Error('來源回傳網頁，可能需要登入。');
  }
  assertPdfSize(Number(response.headers.get('content-length')));
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assertPdfSize(size);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function openTabSource() {
  const fragment = location.hash.slice(1);
  if (!fragment) return;
  history.replaceState(null, '', location.pathname);
  const match = /^source=([0-9a-f-]{36})$/.exec(fragment);
  if (!match) {
    const message = fragment === 'cross-origin'
      ? '請先在新分頁開啟 PDF 連結，再從翻翻吧 Popup 開啟該 PDF。'
      : '目前沒有可讀的 PDF 來源，或網站存取未授權。';
    documentStatus.textContent = message + ' ' + PICK_FILE;
    return;
  }

  await openDocument(async () => {
    download = new AbortController();
    const signal = AbortSignal.any([download.signal, AbortSignal.timeout(15000)]);
    const key = 'ffbPdfSource:' + match[1];
    const stored = (await chrome.storage.session.get(key))[key];
    await chrome.storage.session.remove(key);
    if (!stored || stored.expiresAt < Date.now()) throw new Error('PDF 來源已失效，請從原分頁再開一次。');
    const tab = await chrome.tabs.get(stored.tabId).catch(() => null);
    if (!tab?.url || tab.url.split('#')[0] !== stored.pageUrl) {
      throw new Error('來源分頁已變更，或網站存取未授權。');
    }
    return fetchPdf(stored.url, signal);
  }, '已開啟來源 PDF');
}

function splitPage(text) {
  const chunks = [];
  let remaining = text;
  while (remaining.length > CHUNK_SIZE) {
    const whitespace = Math.max(remaining.lastIndexOf('\n', CHUNK_SIZE), remaining.lastIndexOf(' ', CHUNK_SIZE));
    let end = whitespace > CHUNK_SIZE / 2 ? whitespace : CHUNK_SIZE;
    if (/[\uD800-\uDBFF]/.test(remaining[end - 1])) end -= 1;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

function translateChunk(text, model, settings, signal) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const port = chrome.runtime.connect({ name: 'ai-stream' });
    const requestId = crypto.randomUUID();
    let output = '';
    let settled = false;

    function finish(error) {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      try { port.disconnect(); } catch { /* Chrome 已關閉連線 */ }
      if (error) reject(error);
      else resolve(output.trim());
    }

    const abort = () => finish(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    port.onDisconnect.addListener(() => finish(new Error('翻譯連線已中斷。')));
    port.onMessage.addListener(message => {
      if (message.requestId !== requestId || settled) return;
      if (message.chunk) output += message.chunk;
      if (message.status?.kind === 'download-progress') {
        translationStatus.textContent = '正在下載裝置端翻譯模型… ' + message.status.percent + '%';
      }
      if (message.error) finish(new Error(message.error));
      else if (message.done) finish(output.trim() ? undefined : new Error('模型沒有回傳譯文。'));
    });
    try {
      port.postMessage({
        requestId,
        action: 'translate',
        selectedText: text,
        model,
        pageTranslation: true,
        targetLanguage: settings.targetLanguage,
        explanationLanguage: settings.explanationLanguage,
        browserLanguage: navigator.language
      });
    } catch (error) {
      finish(error);
    }
  });
}

async function translatePage() {
  if (!currentPage || translating) return;
  const page = currentPage;
  const controller = new AbortController();
  translating = controller;
  translate.disabled = true;
  cancel.hidden = false;
  translationText.textContent = '';
  translationStatus.textContent = '正在讀取第 ' + pageIndex + ' 頁文字…';
  try {
    const { items } = await page.getTextContent();
    controller.signal.throwIfAborted();
    const text = items.map(item => typeof item.str === 'string'
      ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
    if (!text) throw new Error('這一頁沒有可翻譯的文字，可能是掃描頁。');
    if (text.length > MAX_PAGE_TEXT) throw new Error('這一頁的文字超過 30,000 字元上限。');
    const [route, settings] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'PDF_TRANSLATION_ROUTE' }),
      chrome.storage.sync.get({ targetLanguage: 'zh-TW', explanationLanguage: 'target' })
    ]);
    controller.signal.throwIfAborted();
    if (!route?.model || route.error) throw new Error(route?.error || '無法讀取翻譯設定。');
    const chunks = splitPage(text);
    const results = [];
    for (const chunk of chunks) {
      translationStatus.textContent = '正在翻譯第 ' + pageIndex + ' 頁…';
      results.push(await translateChunk(chunk, route.model, settings, controller.signal));
      controller.signal.throwIfAborted();
    }
    translationText.textContent = results.join('\n\n');
    translationStatus.textContent = '第 ' + pageIndex + ' 頁已翻譯。';
  } catch (error) {
    if (!controller.signal.aborted) translationStatus.textContent = error.message;
  } finally {
    if (translating === controller) {
      translating = undefined;
      translate.disabled = false;
      cancel.hidden = true;
    }
  }
}

file.addEventListener('change', () => {
  const chosen = file.files[0];
  file.value = '';
  if (!chosen) return;
  void openDocument(async () => {
    assertPdfSize(chosen.size);
    return new Uint8Array(await chosen.arrayBuffer());
  }, chosen.name);
});
pageNumber.addEventListener('change', () => {
  const number = pageNumber.valueAsNumber;
  if (Number.isInteger(number) && number >= 1 && number <= (pdf?.numPages ?? 0)) void showPage(number);
  else pageNumber.value = String(pageIndex);
});
previous.addEventListener('click', () => { void showPage(pageIndex - 1); });
next.addEventListener('click', () => { void showPage(pageIndex + 1); });
translate.addEventListener('click', () => { void translatePage(); });
cancel.addEventListener('click', () => {
  stopTranslation();
  translationStatus.textContent = '已取消翻譯。';
});
void openTabSource();

