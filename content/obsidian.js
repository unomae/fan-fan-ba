'use strict';

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
    // 字典模式：結構化 markdown
    const d            = lastDictData;
    const translations = Array.isArray(d.translations)
      ? d.translations.join('; ')
      : (d.translations || '');

    if (translations) lines.push(`## ${translations}`, '');

    const phonetic = d.phonetic ? ` \`${d.phonetic}\`` : '';
    lines.push(`**${d.word || ''}**${phonetic}`, '');

    if (d.pos || d.definition) {
      lines.push(`\`${d.pos || ''}\`　${d.definition || ''}`, '');
    }

    if (d.usage) lines.push(d.usage, '');

    if (d.examples?.length) {
      lines.push('**例句**', '');
      d.examples.forEach(ex => {
        lines.push(`> *${ex.src || ex.en || ''}*`);
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

  // 必須用 encodeURIComponent，URLSearchParams 的 + 號 Obsidian 不認
  const encParts = [
    `filepath=${encodeURIComponent(filePath)}`,
    `data=${encodeURIComponent(block)}`,
    `mode=append`,
    `newline=true`
  ];
  if (obsidianVault?.trim()) encParts.push(`vault=${encodeURIComponent(obsidianVault.trim())}`);

  // 交給 background 觸發，避免 Obsidian app 搶走焦點
  const uri = `obsidian://advanced-uri?${encParts.join('&')}`;
  chrome.runtime.sendMessage({ type: 'OBSIDIAN_URI', url: uri }).catch(() => {});

  await saveRecentFolder(folderPath);
}
