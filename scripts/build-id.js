'use strict';

// 建置指紋：讓 e2e 分得出「正在跑的 service worker」是不是 dist/pkg 這一版。
//
// 為什麼需要：同一個測試 profile＋同一個版本號時，Chrome 不保證換掉快取的舊 background.js
// （memory feedback_extension_stale_sw_profile：p2 profile 的 SW 一直是舊版，之前的 e2e
// 結論因此都要打問號）。版本號比不出來，所以打包時把「整包內容的 hash」寫進
// dist/pkg/background.js，e2e 啟動時再跟 SW 記憶體裡的值比對。
// 只蓋在打包產物上，原始碼的 background.js 不帶指紋（Jest／直接載入原始碼不受影響）。

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const STAMP_FILE = 'background.js';
const STAMP_RE = /^self\.FFB_BUILD_ID = '([0-9a-f]{12})';$/m;

// 遞迴列出資料夾內所有檔案的相對路徑（一律用 / 分隔、排序，跨平台結果一致）
function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join('/')];
  }).sort();
}

// 整包內容的 sha256 前 12 碼：路徑與內容都算進去，任何一個檔變了指紋就會變
function computeBuildId(stageDir) {
  const hash = crypto.createHash('sha256');
  for (const rel of listFiles(stageDir)) {
    hash.update(rel);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(stageDir, rel)));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

// 算出指紋後附加到 staging 的 background.js 尾端；重複執行會先拿掉舊指紋，結果一樣
function stampBuildId(stageDir) {
  const target = path.join(stageDir, STAMP_FILE);
  const original = fs.readFileSync(target, 'utf8').replace(/\n\/\/ ffb-build-id[\s\S]*$/, '');
  fs.writeFileSync(target, original, 'utf8');
  const id = computeBuildId(stageDir);
  fs.writeFileSync(target, `${original}\n// ffb-build-id：打包時自動產生，e2e 用來確認 SW 是現行版\nself.FFB_BUILD_ID = '${id}';\n`, 'utf8');
  return id;
}

// 從 background.js 原始碼讀出指紋；沒蓋過（例如直接拿原始碼）回 null
function readBuildId(source) {
  const match = STAMP_RE.exec(String(source || ''));
  return match ? match[1] : null;
}

// e2e 啟動時的判斷：ok＝一致；reload＝不一致但還沒 reload 過；fail＝磁碟沒指紋或 reload 後仍不一致
function checkBuildId(diskId, runningId, { reloaded = false } = {}) {
  if (!diskId) return 'fail';
  if (diskId === runningId) return 'ok';
  return reloaded ? 'fail' : 'reload';
}

module.exports = { STAMP_FILE, listFiles, computeBuildId, stampBuildId, readBuildId, checkBuildId };
