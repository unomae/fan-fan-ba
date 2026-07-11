'use strict';

// WS-E A1'''：content script 一律經 VOCABULARY_STORE 訊息存取單字本
//（chrome.storage.local 直寫 fallback 已移除）後，測試 harness 改用本回應者
// 忠實模擬 background 的 vocabulary store。權威 map 直接落在 localStore 的
// 鏡像鍵（fanFanBaVocabularyItems）上，讓既有「斷言 localStore」的測試不需改。
function createVocabularyStoreResponder(localStore) {
  return async message => {
    if (!message || message.type !== 'VOCABULARY_STORE') return undefined;
    const map = { ...(localStore.fanFanBaVocabularyItems || {}) };
    const commit = () => { localStore.fanFanBaVocabularyItems = map; };
    switch (message.action) {
      case 'list':
        return { ok: true, items: Object.values(map) };
      case 'get':
        return { ok: true, item: map[String(message.id || '').trim()] || null };
      case 'upsert': {
        const item = message.item;
        if (!item?.id || !item?.word) return { ok: false, error: '單字資料格式不正確' };
        map[item.id] = item;
        commit();
        return { ok: true, item };
      }
      case 'delete': {
        const key = String(message.id || '').trim();
        const existed = Boolean(map[key]);
        delete map[key];
        commit();
        return { ok: true, deleted: existed };
      }
      case 'replaceAll':
        localStore.fanFanBaVocabularyItems = { ...(message.items || {}) };
        return { ok: true, count: Object.keys(message.items || {}).length };
      case 'merge': {
        Object.assign(map, message.items || {});
        commit();
        return { ok: true, count: Object.keys(map).length };
      }
      default:
        return { ok: false, error: '未知的單字本操作' };
    }
  };
}

module.exports = { createVocabularyStoreResponder };
