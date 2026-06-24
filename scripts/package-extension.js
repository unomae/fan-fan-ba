#!/usr/bin/env node
'use strict';

// Phase A 打包腳本：把擴充功能執行期需要的檔案（白名單）複製到 dist/pkg，
// 再壓成 dist/fan-fan-ba-v<version>.zip 供上傳 Chrome Web Store。
// 白名單制：只收 manifest 真正會載入的檔，絕不誤包 tests / coverage / 文件 / 預覽頁。
// 跨平台：win32 用 PowerShell Compress-Archive，其餘用 zip。

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'dist');
const STAGE = path.join(OUT_DIR, 'pkg');

// 執行期需要的檔（依 manifest / 各 HTML <script> / background importScripts 推導）
const INCLUDE_FILES = [
  'manifest.json',
  'background.js',
  'models.js',
  'storage.js',
  'cloud-sync.js',
  'vocabulary-store.js',
  'vocabulary-backup.js',
  'content.css',
  'popup.html', 'popup.js',
  'options.html', 'options.js',
  'welcome.html', 'welcome.js'
];
const INCLUDE_DIRS = ['content', 'icons', 'fonts'];
// 複製後要從 staging 移除的 dev 資產（原始美術檔等，不該上架）
const PRUNE = ['icons/source.png'];

function readVersion() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')).version;
}

function resetStage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });
}

function copyAllowlisted() {
  const copied = [];
  for (const file of INCLUDE_FILES) {
    const src = path.join(ROOT, file);
    if (!fs.existsSync(src)) throw new Error(`缺少必要檔案：${file}`);
    fs.copyFileSync(src, path.join(STAGE, file));
    copied.push(file);
  }
  for (const dir of INCLUDE_DIRS) {
    const src = path.join(ROOT, dir);
    if (!fs.existsSync(src)) throw new Error(`缺少必要資料夾：${dir}/`);
    // 資料夾只收實際檔（content/ 全是 .js；icons/ png；fonts/ ttf），不過濾以免漏檔
    fs.cpSync(src, path.join(STAGE, dir), { recursive: true });
    copied.push(`${dir}/`);
  }
  for (const rel of PRUNE) {
    fs.rmSync(path.join(STAGE, rel), { force: true });
  }
  return copied;
}

function zipStage(version) {
  const zipPath = path.join(OUT_DIR, `fan-fan-ba-v${version}.zip`);
  fs.rmSync(zipPath, { force: true });
  if (process.platform === 'win32') {
    // Compress-Archive 會產生反斜線路徑，Chrome 載巢狀檔會出錯；
    // 改用 .NET ZipArchive 手動建條目，強制 forward-slash。
    const ps = [
      'Add-Type -AssemblyName System.IO.Compression.FileSystem',
      `$src = '${STAGE}'`,
      `$dst = '${zipPath}'`,
      "$zip = [System.IO.Compression.ZipFile]::Open($dst, 'Create')",
      'Get-ChildItem -Path $src -Recurse -File | ForEach-Object {',
      "  $rel = $_.FullName.Substring($src.Length + 1).Replace('\\','/')",
      "  [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $rel, 'Optimal')",
      '}',
      '$zip.Dispose()'
    ].join('\n');
    const psPath = path.join(OUT_DIR, '_pack.ps1');
    fs.writeFileSync(psPath, ps);
    execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', psPath], { stdio: 'inherit' });
    fs.rmSync(psPath, { force: true });
  } else {
    execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: STAGE, stdio: 'inherit' });
  }
  return zipPath;
}

function main() {
  const version = readVersion();
  resetStage();
  const copied = copyAllowlisted();
  const zipPath = zipStage(version);
  const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);

  console.log('✅ 打包完成');
  console.log(`   版本：v${version}`);
  console.log(`   收錄：${copied.join(', ')}`);
  console.log(`   產出：${path.relative(ROOT, zipPath)}（${sizeKb} KB）`);
  console.log('   下一步：到 chrome://extensions「載入未封裝」用 dist/pkg/ 先本機驗一次，再上傳該 zip。');
}

main();
