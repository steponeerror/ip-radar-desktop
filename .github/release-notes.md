## 擴充功能

- 歷史紀錄預設保留 20 批、7 天；設定頁可調整保留數量、按日或小時計算的期限，或停用期限清理。只清理已完成或已停止的批次，不中斷正在執行的查詢。
- AbuseIPDB 分數改用進度條顯示，沿用綠、黃、紅風險顏色。
- Radar 單筆串流資料加入 1 MiB 上限，避免異常回應持續累積記憶體。超限時停止 Radar 來源並保留已有結果，AbuseIPDB 繼續獨立處理。
- 匯出全部紀錄改為逐批讀取、轉換 CSV，減少同時保留完整查詢資料的記憶體用量，保留原有欄位與格式。
- 歷史批次選單最多顯示約 5 筆，超過後可捲動選取。

## 安裝與更新

- Chrome：下載 IP.Radar.Chrome_v0.1.26.zip 解壓，在 chrome://extensions 載入未封裝項目；既有使用者重新載入。
- Firefox：下載 AMO 簽名的 IP.Radar.Firefox_v0.1.26.xpi，從 about:addons 安裝。已安裝含自動更新網址的版本，可依 Firefox 更新設定與排程從 GitHub 最新正式 Release 更新。
- macOS／Windows：下載對應 DMG／portable EXE。

## 發佈前確認

此版本保持 Draft；待 Chrome ZIP、已簽名 Firefox XPI、firefox-updates.json、macOS DMG 與 Windows EXE 齊備後，再手動正式發佈並設為 Latest。Draft 與 prerelease 不推送自動更新。
