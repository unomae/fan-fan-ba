# E3 — Service Worker、Options 啟動與跨元件訊息測試規格文件
**版本：** v1.0
**涵蓋維度：** 正向主流程 / 替代流程 / 負向流程 / 邊界測試 / 權限驗證 / 狀態轉換 / RWD
**已知風險：** QA-P2-002 對應 TC-E3-003，修正前預期失敗。

---

## TC-E3-001 Service Worker 啟動、休眠與喚醒

**維度：** 正向主流程 / 狀態轉換
**前置條件：** v1.9.9 已啟用；DevTools console 已清楚區分歷史與本輪訊息。
**測試裝置：** 桌機 1920px

### 測試步驟
1. 由非使用中狀態觸發 Popup、Options 與一次 content-script 訊息。
2. 觀察 Service Worker 啟動、處理完成與再次休眠。

### 預期結果
- Worker 可被喚醒並正確回應；console 無 error／unhandled rejection。

### 失敗定義
- Worker 無法啟動、訊息無回應、持續異常存活或 console 出現錯誤。

---

## TC-E3-002 跨元件請求 correlation

**維度：** 替代流程 / 狀態轉換
**前置條件：** 測試 Key 可用；可同時開兩個分頁。
**測試裝置：** 桌機 1920px

### 測試步驟
1. 兩個分頁同時執行翻譯／解釋，並在其中一頁切換模型。
2. 中途關閉一頁，再由另一頁完成請求。
3. 比對 request ID、結果卡與診斷計數。

### 預期結果
- 回應只送回原請求／frame；關閉頁不污染另一頁；計數正確。

### 失敗定義
- 回應串台、舊請求覆蓋新請求、格式錯誤或 orphan promise。

---

## TC-E3-003 Options 啟動不得發生 TDZ 錯誤

**維度：** 負向流程 / 狀態轉換
**前置條件：** 重新載入擴充功能；Edge 擴充功能錯誤清單可觀察。
**測試裝置：** 桌機 1920px

### 測試步驟
1. 開啟 Options，切到備份還原頁。
2. 檢查「上次單字本備份」提醒。
3. 檢查 Options console 與 `edge://extensions/?errors=<id>`。

### 預期結果
- 啟動無未捕捉錯誤；提醒依 storage 顯示「尚未匯出」或實際時間。

### 失敗定義
- 出現 `LAST_VOCAB_BACKUP_KEY before initialization`、提醒空白或留下錯誤紀錄。

---

## TC-E3-004 惡意訊息、重複安裝與權限邊界

**維度：** 邊界測試 / 權限驗證
**前置條件：** 另有一份不同 ID 的停用版；可注入 malformed message 測試。
**測試裝置：** 桌機 1920px

### 測試步驟
1. 傳送缺欄位、錯誤 request ID、未知 action、超長 payload 與非預期 sender 訊息。
2. 驗證停用版不回應；啟用版只接受允許來源與格式。
3. 重載啟用版並重複操作。

### 預期結果
- 無效訊息安全拒絕且不執行；不同 ID 的 storage／context 不混用。

### 失敗定義
- 權限繞過、任意 URL／scheme 執行、錯誤版回應或 Worker 崩潰。

---

## TC-E3-005 雙端 extension page 與背景一致性

**維度：** RWD
**前置條件：** Options、Popup、Welcome 分別以 1920px 與 375px 開啟。
**測試裝置：** 雙端

### 測試步驟
1. 雙端切換設定、開啟 Popup／Welcome 並觸發唯讀訊息。
2. 比對 UI 狀態與 Service Worker console。

### 預期結果
- viewport 只影響版面，不改變背景狀態、訊息格式或權限判定。

### 失敗定義
- 小螢幕造成訊息漏送／重送、背景狀態分歧或新增 console error。
