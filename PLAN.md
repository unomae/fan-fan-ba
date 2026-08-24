# PLAN.md — 翻翻吧施工計劃（活文件）

> 建立於 2026-08-25，由 Ox Alpha 接手輪整理。事實來源以 `MANUAL-QA.md`、`project-overview.html`、`TESTING.md` 與 git 歷史為準；本檔只放「現在與下一步」，歷史脈絡留在上述正本。

## 現況快照

| 項目 | 狀態 |
|------|------|
| 版本 | v1.11.1（package.json；尚未發布到 Chrome Web Store） |
| 自動化單元測試 | 27 suites / 317 tests 全綠（2026-08-25） |
| e2e | `npm run e2e`：Playwright 驅動真 Chrome ＋ 真擴充，45 案（改 code 先 `npm run package`） |
| 手動 QA | 全表 55/78；剩 23 項幾乎全卡「無 API key」或「需外部 App／帳號」（見 `MANUAL-QA.md` 執行順序節） |
| 上架 | 決策＝打磨完再送審；Chrome Web Store 為 release checkpoint |

## 最近完成

- 2026-08-25：修掉「UI 清不掉目前模型 API Key」（`options.js` 清空欄位＋confirm 即移除），3 條回歸測試＋反向驗；e2e legacy §5-2 改鎖新契約。commit `c20639f`。
- v1.10.x：WS-E mirror-only cutover（Tier 1 六案 6/6 PASS）、CSV 公式注入防護（v1.10.1）、半接線 6 條接線完工。

## 下一步（依序）

1. **真瀏覽器跑 e2e 一輪**：`npm run package && npm run e2e`——特別注意 legacy §5-2 本輪為盲改後首次實跑，若 confirm 未出現會精準變紅。
2. **清 Tier 3／4 剩餘項**：需要 KAKA 決定是否配真實 API key（2026-08-14 裁決：QA profile 不配 key，這些項不會被自動化涵蓋）；Obsidian 落檔需真 App。
3. **Tier 5 送審前 gating**：正式 OAuth client_id 確認（T7，需人工進 Google Cloud Console）、1280×800 截圖、依 `STORE-SUBMISSION.md` 打包送審。

## 已知風險／技術債（有證據）

| 風險 | 證據 | 處置建議 |
|------|------|----------|
| cutover 刪庫的 `onblocked` 路徑從未驗證（舊 DB 被佔住時 fire-and-forget，靠下次啟動補刪） | `vocabulary-store.js:229`、`MANUAL-QA.md`〈還沒驗到的〉段 | 低機率；可補一條多 context 的 e2e 或接受現狀並記錄 |
| `replaceAll({clearing:true})` 無 production 觸發者，handleMessage 不轉發 clearing | `vocabulary-store.js:304`、`:375` | 未來加「清空單字本」鈕時必須一起接線＋補驗，否則快照刪除語意靜默失效 |
| `content.css` 整理（2708 行）deferred | `MANUAL-QA.md` 末節 | 維持 deferred，動它前先讀更新規則 |
| 文件版號滯後：overview/TESTING.md 多處停在 v1.10.x／249 tests | 各檔標頭 | 下次文件輪一併校正，避免誤導接手者 |

## 驗證指令速查

```bash
npm test                                  # Jest 30 + jsdom（覆蓋率預設開）
npx jest --testPathIgnorePatterns '/\.claude/'   # 主樹取值用
npm run package                           # 產 dist/pkg + zip（e2e / 載入前必跑）
npm run e2e                               # Playwright 真 Chrome 45 案
```

> 更新規則：完成一個 slice 就回寫本檔「最近完成／下一步」；測試數字異動時同步 `TESTING.md` 標頭與 `MANUAL-QA.md` 頂部計數。
