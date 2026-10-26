## 擴充功能

- 快捷鍵更正為 Shift+Enter 換行，Enter 開始查詢。
- Firefox 本次重建包內版本為 0.1.25.1，避免重用已送交 AMO 的版本；Release/tag 仍為 v0.1.25。

- 新增「擷取有效 IP」按鈕：手動清理混合文字，保留完整合法的 IPv4／IPv6 並去重，只更新清單，不自動查詢。沒有有效 IP 時保留原文。
- 收緊 IPv6 驗證，拒絕含多餘括號、路徑或片段的無效輸入，避免默默截短為另一個 IP。
- 修復延遲返回的舊快照覆蓋最新串流結果：期間收到儲存更新時重新讀取，只重讀狀態，不重複執行查詢或刪除。
- 修復額度儲存失敗後 Radar 未一起停止、背景重啟後完成批次未出現在紀錄，以及儲存延遲導致 AbuseIPDB 請求間隔不足一秒。
- Firefox 加入自動更新網址；CI 將實際簽名版本與 SHA-512 驗證資訊寫入 firefox-updates.json，隨 XPI 上傳。

## 安裝與更新

- Chrome：下載 IP.Radar.Chrome_v0.1.25.zip 解壓，在 chrome://extensions 載入未封裝項目；既有使用者重新載入。
- Firefox：下載 AMO 簽名的 IP.Radar.Firefox_v0.1.25.xpi，從 about:addons 安裝。舊版沒有自動更新網址，需要先手動安裝此版；之後依 Firefox 自動更新設定與排程，從 GitHub 最新正式 Release 更新。
- macOS／Windows：下載對應 DMG／portable EXE。

## 發佈前確認

此版本保持 Draft；待 Chrome ZIP、已簽名 Firefox XPI、firefox-updates.json、macOS DMG 與 Windows EXE 齊備後，再手動正式發佈並設為 Latest。Draft 與 prerelease 不推送自動更新。
