// welcome.js — Onboarding 頁面互動邏輯
'use strict';

const Storage = globalThis.FanFanBaStorage || require('./storage');

// 手動勾選的狀態存這裡。step 1／2 不存——它們每次都從真實狀態重算，
// 存下來只會多一份會過期的副本。
const ONBOARDING_KEY = 'fanFanBaOnboarding';

// 徽章文字集中在這裡，`computeStepStates` 只回傳布林，避免同一組字散在兩處
const STEP_LABELS = {
  apikey:   { doneText: '已設定', todoText: '還沒設定' },
  firstuse: { doneText: '已用過', todoText: '還沒用過' },
  obsidian: { doneText: '已完成', todoText: '標記完成' }
};

async function readManualState() {
  try {
    const stored = await chrome.storage.local.get(ONBOARDING_KEY);
    const value = stored?.[ONBOARDING_KEY];
    return { obsidianDone: Boolean(value && value.obsidianDone) };
  } catch {
    // 讀不到就當沒勾。onboarding 頁壞掉不該擋住使用者。
    return { obsidianDone: false };
  }
}

async function writeManualState(state) {
  try {
    await chrome.storage.local.set({ [ONBOARDING_KEY]: state });
  } catch { /* 存不進去就只影響這次顯示，不值得打斷 */ }
}

/**
 * 算出三個 step 的完成狀態。
 *
 * step 1／2 自動偵測：API Key 有沒有設、有沒有真的用過一次，都有現成的真實來源
 * （secrets 與 diagnostics 計數），問使用者反而不準。
 *
 * step 3 沒有對應計數器（diagnostics 只記 translate／explain／optimize／pageTranslations，
 * 沒有「存進 Obsidian 幾次」），所以交給使用者自己勾。單字本的 `exported` 旗標理論上可以
 * 當代理指標，但那要向 background 要整份單字本，為一個提示性的勾不划算。
 */
async function computeStepStates() {
  const [secrets, diagnostics, manual] = await Promise.all([
    Storage.getSecrets({ apiKey: '', groqApiKey: '', openrouterApiKey: '' }),
    Storage.getDiagnostics(),
    readManualState()
  ]);

  const hasAnyKey = ['apiKey', 'groqApiKey', 'openrouterApiKey'].some(key => secrets?.[key]);
  const actions = diagnostics?.actions || {};
  const usedOnce = Number(actions.translate || 0) + Number(actions.explain || 0)
    + Number(actions.optimize || 0) + Number(diagnostics?.pageTranslations || 0) > 0;

  return { apikey: hasAnyKey, firstuse: usedOnce, obsidian: manual.obsidianDone };
}

function renderStepStates(states) {
  Object.entries(STEP_LABELS).forEach(([name, labels]) => {
    const step = document.querySelector(`[data-step="${name}"]`);
    if (!step) return;
    const done = Boolean(states?.[name]);
    step.classList.toggle('is-done', done);
    const badge = step.querySelector('[data-step-state]');
    if (badge) badge.textContent = done ? labels.doneText : labels.todoText;
  });
}

async function refreshSteps() {
  let states;
  try {
    states = await computeStepStates();
  } catch {
    // 讀不到真實狀態就全部顯示未完成。這是提示性的清單，不該因為 storage 抖一下
    // 就讓整頁停在「檢查中…」或丟出未處理的 rejection（頁面載入時就會炸）。
    states = {};
  }
  renderStepStates(states);
}

function wireUp() {
  document.getElementById('btnSettings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btnClose')?.addEventListener('click', () => {
    window.close();
  });

  document.querySelector('[data-step-toggle]')?.addEventListener('click', async () => {
    const manual = await readManualState();
    await writeManualState({ obsidianDone: !manual.obsidianDone });
    await refreshSteps();
  });

  // 使用者按「前往設定」去設 key，再切回這個分頁時要看到 step 1 變成已設定——
  // 沒有這段，閉環就斷在「設完了但這頁還說你沒設」。
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshSteps();
  });

  refreshSteps();
}

wireUp();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { computeStepStates, renderStepStates, refreshSteps, ONBOARDING_KEY };
}
