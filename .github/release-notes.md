## 擴充功能

- Radar 查詢結果的威脅分類下方新增研究掃描廠商標籤:命中 scanner_ranges 自報段的 IP 會顯示「研究扫描 · 廠商(自报段)」(標籤文字來自服務端數據,簡體直出)。僅採信 scanner_ranges 源,跨證人行去重後以頓號連接,避免一般掃描計數噪聲進入結果面。

## 安裝與更新

- Chrome:下載 IP.Radar.Chrome_v0.1.27.zip 解壓,在 chrome://extensions 載入未封裝項目;既有使用者重新載入。
- Firefox:下載 AMO 簽名的 IP.Radar.Firefox_v0.1.27.xpi,從 about:addons 安裝。已安裝含自動更新網址的版本,可依 Firefox 更新設定與排程從 GitHub 最新正式 Release 更新。
- macOS/Windows:下載對應 DMG/portable EXE。

## 發佈前確認

此版本保持 Draft;待 Chrome ZIP、已簽名 Firefox XPI、firefox-updates.json、macOS DMG 與 Windows EXE 齊備後,再手動正式發佈並設為 Latest。Draft 與 prerelease 不推送自動更新。
