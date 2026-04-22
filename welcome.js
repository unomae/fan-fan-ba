// welcome.js — Onboarding 頁面互動邏輯
'use strict';

document.getElementById('btnSettings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('btnClose').addEventListener('click', () => {
  window.close();
});
