## 本次重建

- 網域與主機名稱移到用途下方，空資料仍隱藏。
- 批次選單新增「已停止」標記，不列出各來源成功數；詳細進度仍在選單外顯示。
- 沿用 `v0.1.24` tag 重建。Firefox 因舊包已完成 AMO 簽名，包內版本使用 `0.1.24.1`；下載檔名及其他平台版本維持 0.1.24。

## 擴充功能

- 新增 AbuseIPDB domain 與 hostname，空白或不存在時隱藏；沿用原查詢回應，不額外發出 DNS 請求。
- 白名單命中時在 AbuseIPDB 分數旁標記「白名單」，不改寫原始分數，不顯示沒有詳細資料的白名單卡片。
- CSV 將 AbuseIPDB 分數、Radar 威脅信心、Radar 判定與總判定相鄰排列；移除 GPS、定位精度、ASN 信心及重複判定數值。
- 保留 AbuseIPDB Tor 出口資訊：介面命中才顯示，CSV 未知狀態留空。
- 圓形透明底工具列圖示再放大，Chrome 與 Firefox 共用。
- 修正歷史批次切換時先清空畫面造成的閃動：載入期間暫留上一批並停用操作，新批次到齊後一次替換、釋放舊資料；仍按需讀取歷史。

## 下載與安裝

- Chrome：下載 `IP.Radar.Chrome_v0.1.24.zip` 解壓，在 `chrome://extensions` 載入未封裝項目；既有使用者重新載入。
- Firefox：AMO 簽名成功後下載 `IP.Radar.Firefox_v0.1.24.xpi`，從 `about:addons` 的齒輪選單安裝。目前需手動下載新版更新。
- macOS：下載 DMG，掛載後拖入 Applications。
- Windows：下載 portable EXE，直接執行。

## 驗證與限制

- 新欄位只適用於有保存該欄位的查詢結果，舊紀錄不補造缺失資料。
- 桌面版查詢與匯出行為維持原樣；此版本的資料顯示調整以瀏覽器擴充功能為主。
- 本機測試與建置結果見提交紀錄；平台打包及 AMO 簽名以 Release CI 結果為準。

此版本保持 Draft，由 CI 上傳 Chrome ZIP、已簽名 Firefox XPI、macOS DMG 與 Windows EXE，待維護者確認後手動發佈。
