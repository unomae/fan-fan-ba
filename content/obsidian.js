'use strict';

const OBSIDIAN_KNOWN_FILES_KEY = 'fanFanBaObsidianKnownFiles';

// 讀取最近使用的資料夾（最多 5 個）
async function loadRecentFolders() {
  const { obsidianFolders } = await chrome.storage.local.get('obsidianFolders');
  return obsidianFolders || [];
}

// 儲存資料夾到最近清單（去重複、保留 5 個）
async function saveRecentFolder(folder) {
  const { obsidianFolders } = await chrome.storage.local.get('obsidianFolders');
  const list    = obsidianFolders || [];
  const updated = [folder, ...list.filter(f => f !== folder)].slice(0, 5);
  await chrome.storage.local.set({ obsidianFolders: updated });
}

// 將結果卡資料組裝成 Obsidian markdown 區塊
function buildObsidianBlock({ tag, hm, date, preview }) {
  const lines = [
    '',
    '---',
    '',
    `### ${tag} · ${hm}`,
    `**原文：** \`${preview}\``,
    `> 來源：[${document.title}](${window.location.href}) · ${date}`,
    ''
  ];

  if (lastDictData) {
    // 字典模式：順序與結果卡一致（單字說明 → 涵義與用法 → 近義詞 → 例句）
    const d            = lastDictData;
    const translations = Array.isArray(d.translations)
      ? d.translations.join('; ')
      : (d.translations || '');

    // 1. 單字說明區塊
    const phonetic = d.phonetic ? ` \`${d.phonetic}\`` : '';
    lines.push(`**${d.word || ''}**${phonetic}`, '');
    if (d.pos || d.definition) {
      lines.push(`\`${d.pos || ''}\`　${d.definition || ''}`, '');
    }

    // 2. 詞彙涵義與用法
    if (translations) lines.push('', `**涵義：** ${translations}`);
    if (d.usage) lines.push('', d.usage);

    // 3. 近義詞
    if (d.synonym?.word) {
      lines.push('', `**近義詞：** ${d.synonym.word}　${d.synonym.diff || ''}`);
    }

    // 4. 例句
    if (d.examples?.length) {
      lines.push('', '**例句**', '');
      d.examples.forEach(ex => {
        const label = ex.type === 'context' ? '語境' : '通用';
        lines.push(`> [${label}] *${ex.src || ex.en || ''}*`);
        lines.push(`> ${ex.zh || ''}`);
        lines.push('');
      });
    }
  } else {
    // 一般模式：清除 UI 標記再存入
    const clean = (lastRawResult || '')
      .replace(/\{\{([^}]+)\}\}/g, '$1')   // {{tag}} → 純文字
      .replace(/===DEEP===/g, '---');        // DEEP 分隔標記 → markdown 分隔線
    lines.push(clean, '');
  }

  return lines.join('\n');
}

// 組裝筆記並透過 Advanced URI 存入 Obsidian（append 模式）
async function saveToObsidian(folderPath) {
  if (!resultCard || !savedSel) return;

  const tag    = resultCard.querySelector('.g-rc-tag')?.textContent || '';
  const now    = new Date();
  const taipei = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
  const hm     = taipei.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date   = taipei.toLocaleDateString('zh-TW');

  const week     = getWeekLabel();
  const cleanDir = folderPath.replace(/\/+$/, '');
  const filePath = cleanDir ? `${cleanDir}/${week}.md` : `${week}.md`;

  const preview = savedSel.text.length > 60
    ? savedSel.text.slice(0, 60) + '…'
    : savedSel.text;

  const block = buildObsidianBlock({ tag, hm, date, preview });

  const { obsidianVault } = await chrome.storage.sync.get('obsidianVault');
  const knownFile = await isKnownObsidianFile(filePath, obsidianVault);

  const uri = buildObsidianAdvancedUri({
    filePath,
    block,
    mode: knownFile ? 'append' : '',
    newline: knownFile,
    vault: obsidianVault
  });

  // 交給 background 觸發，避免 click 事件冒泡關掉結果卡
  // 設旗標防止 tab 切換時的合成 mouseup 關閉結果卡（macOS 尤其需要）
  obsidianSaving = true;
  const response = await chrome.runtime.sendMessage({ type: 'OBSIDIAN_URI', url: uri }).catch(error => ({ ok: false, error: error?.message || 'sendMessage failed' }));
  setTimeout(() => { obsidianSaving = false; }, 4000);

  await saveRecentFolder(folderPath);
  if (response?.ok !== false) await markKnownObsidianFile(filePath, obsidianVault);
  return { ...response, filePath, action: knownFile ? 'append' : 'write' };
}

async function isKnownObsidianFile(filePath, vault = '') {
  const files = await loadKnownObsidianFiles();
  return Boolean(files[getKnownObsidianFileKey(filePath, vault)]);
}

async function markKnownObsidianFile(filePath, vault = '') {
  const files = await loadKnownObsidianFiles();
  const key = getKnownObsidianFileKey(filePath, vault);
  await chrome.storage.local.set({
    [OBSIDIAN_KNOWN_FILES_KEY]: {
      ...files,
      [key]: {
        filePath,
        vault: String(vault || '').trim(),
        usedAt: new Date().toISOString()
      }
    }
  });
}

async function loadKnownObsidianFiles() {
  const { [OBSIDIAN_KNOWN_FILES_KEY]: files = {} } = await chrome.storage.local.get(OBSIDIAN_KNOWN_FILES_KEY);
  return files && typeof files === 'object' && !Array.isArray(files) ? files : {};
}

function getKnownObsidianFileKey(filePath, vault = '') {
  return `${String(vault || '').trim()}::${String(filePath || '').trim()}`;
}

function buildObsidianAdvancedUri({ filePath, data, block, mode = '', newline = false, vault = '' }) {
  // 必須用 encodeURIComponent，URLSearchParams 的 + 號 Obsidian 不認
  const encParts = [
    `filepath=${encodeURIComponent(filePath)}`,
    `data=${encodeURIComponent(data ?? block ?? '')}`
  ];
  if (mode) encParts.push(`mode=${encodeURIComponent(mode)}`);
  if (newline) encParts.push('newline=true');
  if (vault?.trim()) encParts.push(`vault=${encodeURIComponent(vault.trim())}`);
  return `obsidian://advanced-uri?${encParts.join('&')}`;
}
