'use strict';

// 所有 mutable 狀態集中管理（content scripts 的 isolated world 可安全共用）

let toolbar      = null;   // 懸浮工具列 DOM
let resultCard   = null;   // 結果卡 DOM
let floatingBall = null;   // 右側常駐懸浮球 DOM
let savedSel     = null;   // { text, range } 最近一次選取
let activeAction = null;
let activeModel  = FanFanBaModels.DEFAULT_MODEL;
let targetLanguage = 'zh-TW';
let explanationLanguage = 'target';
let ttsLanguageMode = 'auto';
let fanFanBaPaused = false;
let userDragged  = false;  // 使用者手動拖曳後不覆蓋位置
let dragState    = null;   // { startX, startY, origLeft, origTop }
let dragPending  = false;  // rAF 節流旗標
let lastDictData  = null;  // 字典模式解析後的 JSON 物件（供 Obsidian 使用）
let lastRawResult = null;  // 一般模式原始 AI 回傳文字
let isPinned      = false; // 結果卡是否釘住（釘住時點外部不關閉）
let obsidianSaving = false; // 存入 Obsidian 期間暫時防止 mouseup 關閉結果卡

// 相同文字快取：key = `${action}:${text}`，tab 生命週期內有效
const responseCache = new Map();

const MODEL_NAMES = FanFanBaModels.MODEL_NAME_MAP;
