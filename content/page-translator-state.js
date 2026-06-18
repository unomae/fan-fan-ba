'use strict';

// 全文翻譯 Beta：頂層狀態與低階狀態 helper
// content scripts 共用同一 isolated world 全域 scope，本檔最先載入，
// 提供其餘 page-translator-* 檔需要的狀態宣告與初始化會用到的 helper。

const PAGE_TRANSLATION_LIMITS = {
  maxBlocks: 8,
  maxChars: 3200,
  minChars: 24,
  minHeadingChars: 4,
  minChoiceChars: 2,
  minListChars: 8,
  maxBlockChars: 1200,
  batchMaxItems: 3,
  batchMaxChars: 1800,
  contextMaxChars: 900,
  contextHeadingMaxChars: 280,
  collapseChars: 420
};

const pageTranslationPairs = new Map();
let pageTranslationPairCounter = 0;
let pageTranslationModel = null;
let pageTranslationRequestCounter = 0;
let pageTranslationActivePort = null;
let pageTranslationLocationKey = getPageTranslationLocationKey();
let pageTranslationNavigationBound = false;

let pageTranslationState = {
  running: false,
  stopped: false,
  stopping: false,
  activated: false,
  canContinue: false,
  scrollBound: false,
  scrollTimer: null,
  selectionBound: false,
  activePairId: null,
  mode: 'bilingual',
  density: 'compact',
  items: [],
  embeddedSummary: null,
  usage: createPageTranslationUsageSummary(0),
  done: 0,
  errors: 0,
  total: 0
};

const PAGE_LEARNING_STOP_WORDS = new Set([
  'around', 'before', 'between', 'during', 'should', 'through', 'without'
]);

function createPageTranslationPairId() {
  pageTranslationPairCounter += 1;
  return `ffb-pair-${Date.now().toString(36)}-${pageTranslationPairCounter}`;
}

function createPageTranslationUsageSummary(total = 0) {
  return {
    paragraphs: Number(total || 0),
    succeeded: 0,
    failed: 0,
    requests: 0,
    batchRequests: 0,
    singleRequests: 0,
    fallbackRequests: 0
  };
}

function recordPageTranslationRequest(kind = 'single') {
  if (!pageTranslationState.usage) {
    pageTranslationState.usage = createPageTranslationUsageSummary(pageTranslationState.total);
  }
  pageTranslationState.usage.requests += 1;
  if (kind === 'batch') pageTranslationState.usage.batchRequests += 1;
  else if (kind === 'fallback') pageTranslationState.usage.fallbackRequests += 1;
  else pageTranslationState.usage.singleRequests += 1;
}

function getPageTranslationLocationKey() {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`;
}

function setPageTranslationModel(model) {
  pageTranslationModel = FanFanBaModels.normalizeModel(model);
  updatePageTranslationPanel();
}

function getPageTranslationModel() {
  return FanFanBaModels.normalizeModel(pageTranslationModel || activeModel);
}
