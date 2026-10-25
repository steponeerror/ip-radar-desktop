## 擴充功能

- Radar 整批送出並串流接收，結果先到先顯示；AbuseIPDB 獨立逐 IP 查詢，每秒最多啟動一次請求。
- AbuseIPDB 額度與冷卻跨批次保存；遇到限流停止後續 AbuseIPDB 查詢，Radar 繼續進行，設定頁顯示額度與冷卻狀態。
- 停止時保存已取得的部分結果；查詢中可導出目前資料，歷史紀錄顯示各來源完成數。單次 IP 上限可自行調整。
- 結果約每 200ms 合併保存，停止、完成與導出時立即保存。各批次分開儲存，歷史列表只讀摘要，選取後才載入明細，減少完整歷史常駐記憶體。
- 簡易卡片與詳情顯示來源判定、攻擊分類與信心值；支援地區分歧篩選。有效 IP 剪貼簿內容可填入空白查詢欄，Enter 開始查詢，Alt+Space 換行。
- 新增 Firefox 打包、獨立更新檢查及新版圖示；Firefox 桌面版最低 140。

## 桌面版

- 歷史紀錄保存完整來源資料，支援詳細檢視、條件篩選、勾選與 CSV 匯出。
- 相容既有歷史摘要，改善來源缺少金鑰、配額與匯出狀態處理。

## 下載與安裝

- Chrome：下載 `IP.Radar.Chrome_v<版本>.zip` 解壓，在 `chrome://extensions` 使用開發人員模式載入未封裝項目；既有使用者重新載入並確認權限。
- Firefox：下載 `IP.Radar.Firefox_v<版本>.xpi`（AMO 已簽名），在 `about:addons` → 齿輪選單 → 「從檔案安裝附加元件…」永久安裝。臨時載入可解壓 XPI 後在 `about:debugging` 選 `manifest.json`。目前沒有自動更新，升級請重新下載安裝。
- macOS：下載 DMG，掛載後拖入 Applications。
- Windows：下載 portable EXE，直接執行。

## 驗證與已知限制

- 77 項擴充功能測試、135 項桌面版測試與 Chrome／Firefox 建置通過；實際 API 連線測試未執行。
- Firefox 靜態檢查無錯誤，2 項警告來自 React 內部 innerHTML 實作；AMO unlisted 簽名已納入 Release CI。
- 舊版單一 radarState 的歷史不自動遷移；既有分批紀錄在首次選取時補建缺少的摘要。

此版本保持 Draft。CI 將上傳 Chrome ZIP、AMO 已簽名 Firefox XPI、macOS DMG 與 Windows EXE，待維護者確認後手動發佈。
