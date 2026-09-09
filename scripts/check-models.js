#!/usr/bin/env node
'use strict';

// 模型下架離線對賬（P-17）。
//
// 為什麼需要：`models.js` 是靜態清單，而模型 id 無預警下架是本專案的常態風險
// （2026-08-14 一次死兩顆、Groq 兩個 llama 2026-08-16 也下架）。下架後 provider 回 404，
// 使用者側就是「翻譯壞掉」。單元測試鎖得住「清冊沒被人改壞」，鎖不住「上游把模型下架了」——
// 那只有對線上清單比對才驗得出來。
//
// 範圍（**刻意只做 OpenRouter**）：OpenRouter 的 /v1/models 是公開端點、免金鑰，
// 所以這支可以無條件掛進 CI。Groq 與 Gemini 的清單端點都需要金鑰，而 QA 不配 key 是
// 2026-08-14 的既有裁決，故本腳本**不涵蓋那兩家**（含預設模型），輸出會明講。
//
// exit code 三態，刻意不合併：
//   0 = 對賬通過（查到的 id 都還在架上）
//   1 = 有 id 不在線上清單（真的下架了，要處理）
//   2 = 未檢（連不上或回應不合預期）——**不等於通過**
// 把 2 和 0 合併就會讓「網路掛掉」和「模型都在」在 CI 上長得一樣，
// 那正是 gate 死掉卻沒人發現的典型死法。

const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const TIMEOUT_MS = 20000;

/** 從 models.js 收集所有要對賬的 OpenRouter 側 id（主模型 ＋ 備援）。 */
function collectOpenRouterIds(M) {
  const ids = M.MODELS
    .filter(entry => entry.provider === 'openrouter')
    .map(entry => M.toApiModelId(entry.id));
  // 備援 id 沒有 provider 前綴、也不在 MODELS 冊上（那是刻意的，見 models-registry.test.js），
  // 但它下架一樣會讓備援失效，所以一起對。
  if (M.OPENROUTER_FALLBACK_MODEL_ID) ids.push(M.OPENROUTER_FALLBACK_MODEL_ID);
  return [...new Set(ids)];
}

/** 純函式：拿線上清單比對期望 id。分離出來才驗得了失敗路徑（見 --selftest）。 */
function reconcile(liveIds, expectedIds) {
  const live = new Set(liveIds);
  const present = expectedIds.filter(id => live.has(id));
  const missing = expectedIds.filter(id => !live.has(id));
  return { present, missing };
}

async function fetchLiveIds() {
  const response = await fetch(MODELS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  const body = await response.json();
  if (!body || !Array.isArray(body.data)) throw new Error('回應沒有 data 陣列，格式與預期不符');
  const ids = body.data.map(item => item && item.id).filter(id => typeof id === 'string');
  if (ids.length === 0) throw new Error('回應的 data 陣列裡沒有任何 id');
  return ids;
}

async function main() {
  const M = require('../models');
  const expected = collectOpenRouterIds(M);
  console.log(`=== 模型下架對賬（OpenRouter，免金鑰）===`);
  console.log(`對賬 ${expected.length} 個 id：${expected.join('、')}`);

  let liveIds;
  try {
    liveIds = await fetchLiveIds();
  } catch (error) {
    console.error(`\n❌ 未檢：取不到 OpenRouter 線上清單（${error.message}）`);
    console.error('   這不等於通過——沒有比對到任何東西。');
    return 2;
  }

  const { present, missing } = reconcile(liveIds, expected);
  console.log(`線上清單共 ${liveIds.length} 個 model id\n`);
  present.forEach(id => console.log(`✅ 仍在架上：${id}`));
  missing.forEach(id => console.log(`❌ 已不在清單上：${id}`));

  console.log('\n未涵蓋（需金鑰，依 2026-08-14「QA 不配 key」裁決不做）：');
  M.MODELS.filter(entry => entry.provider !== 'openrouter')
    .forEach(entry => console.log(`   ➖ ${entry.id}（${entry.provider}）`));
  console.log(`   ➖ ${M.GROQ_FALLBACK_MODEL_ID}（groq 備援）`);

  if (missing.length > 0) {
    console.error(`\n對賬失敗：${missing.length} 個 id 已不在 OpenRouter 清單上，請更新 models.js。`);
    return 1;
  }
  console.log('\n對賬通過：OpenRouter 側的 id 都還在架上。');
  return 0;
}

// ── self-test（離線，不碰網路）──────────────────────────────────────────
// 只驗這支自己的判斷邏輯：對賬函式會不會漏抓下架、收集函式有沒有把備援一起收進來。
function selftest() {
  const cases = [];
  const check = (name, actual, expected) => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    cases.push([name, ok, ok ? '' : `got ${JSON.stringify(actual)} want ${JSON.stringify(expected)}`]);
  };

  check('全部在架上 → missing 為空',
    reconcile(['a', 'b', 'c'], ['a', 'c']), { present: ['a', 'c'], missing: [] });
  check('有一個下架 → 抓得到',
    reconcile(['a', 'c'], ['a', 'b']), { present: ['a'], missing: ['b'] });
  check('線上清單為空 → 全部算下架（不得靜默放行）',
    reconcile([], ['a', 'b']), { present: [], missing: ['a', 'b'] });
  check('id 要精確比對，前綴相同不算命中',
    reconcile(['google/gemma-4-31b-it'], ['google/gemma-4-31b-it:free']),
    { present: [], missing: ['google/gemma-4-31b-it:free'] });

  const M = require('../models');
  const ids = collectOpenRouterIds(M);
  check('收集函式有把 OpenRouter 備援一起收進來',
    ids.includes(M.OPENROUTER_FALLBACK_MODEL_ID), true);
  check('收集函式回傳的是去前綴的 API id',
    ids.includes(M.toApiModelId(M.OPENROUTER_PRIMARY_MODEL)), true);
  check('不含其他 provider 的 id',
    ids.some(id => id.startsWith('gemini')), false);

  cases.forEach(([name, ok, detail]) => console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`));
  const passed = cases.filter(([, ok]) => ok).length;
  const allOk = passed === cases.length;
  console.log(allOk ? `SELFTEST ${passed}/${cases.length} PASS` : `SELFTEST ${passed}/${cases.length} FAIL`);
  return allOk ? 0 : 1;
}

if (require.main === module) {
  // 一律用 process.exitCode 而不是 process.exit()：Win 上 fetch 的 undici handle 還在關閉時
  // 強制退出會噴 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` 並把 exit code
  // 蓋成 127——輸出明明是對的，CI 卻讀到垃圾碼，三態契約就廢了（2026-09-09 實際踩到）。
  if (process.argv.includes('--selftest')) {
    process.exitCode = selftest();
  } else {
    main().then(code => { process.exitCode = code; }).catch(error => {
      console.error(`未檢：非預期錯誤 ${error.stack || error.message}`);
      process.exitCode = 2;
    });
  }
}

module.exports = { reconcile, collectOpenRouterIds };
