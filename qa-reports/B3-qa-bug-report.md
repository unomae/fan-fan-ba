# QA 滿配驗收報告 — B3：Obsidian 設定 — 2026-07-24

**測試範圍：** Obsidian 設定
**測試裝置：** 桌機 1920px + 行動 375px
**測試案例：** 5
**測試結果：** 1 PASS / 0 FAIL / 4 SKIP

## 1. QA 漏測／技術覆盤分析

| 層面 | 本輪觀察 | 為何常規測試可能漏網 |
| --- | --- | --- |
| CSS / RWD | 以 375px 真實 viewport 逐頁量測。 | jsdom 不會驗證實際像素位置。 |
| JS 邏輯 | 以 pageerror 與實際互動補足靜態測試。 | 單元測試若只驗 DOM / class 存在，可能漏掉 runtime 時序與 computed style。 |
| 外部服務 | 4 案例受 manual gate 限制。 | dummy Key 不可取代真實 provider／OAuth／外部 app。 |
| UX | 本輪未發現可重現產品缺陷。 | 熟悉產品的人容易用強制操作繞過入口問題。 |

## 2. 核心阻斷性缺陷（P0）

查無 P0。

## 3. 高／中優先缺陷（P1 / P2）

查無 P1 / P2 產品缺陷。

## 4. UX 摩擦與未驗證項目（P3 / SKIP）

- TC-B3-001：未啟動真實 Obsidian 或寫入測試 Vault。
- TC-B3-002：未啟動真實 Obsidian，目前 Vault fallback 與最近資料夾需人工驗。
- TC-B3-003：未呼叫外部 app；惡意 scheme 白名單由 Jest 與背景訊息測試覆蓋。
- TC-B3-004：Options 可安全儲存 Unicode 路徑；未對外部 Obsidian 執行路徑穿越／URI 寫入。

## 5. 完整修復優先級矩陣

| 優先級 | 缺陷 ID | 描述 | 受影響裝置 | 建議負責人 | 預估工時 |
| --- | --- | --- | --- | --- | --- |
| - | 查無 | 本模組未發現產品缺陷 | - | - | - |

**執行完成度：** 20%（PASS / 全案例，不是產品健康分數）
**可送審建議：** ⚠️ 完成 manual gate 後再判定
