## Chrome Extension

- 簡易卡片同列顯示 AbuseIPDB 分數與 IP Radar 來源判定；攻擊類型集中於詳情，以可橫向捲動的膠囊標籤顯示分類信心值。
- 點擊卡片可展開／收起詳情；勾選模式優先勾選，仍可按「查看詳情」展開。
- 詳情移除 ASN、GPS、定位精度與分類信心說明句；其他欄位信心值和 CSV 原始資料保留。
- 地區篩選新增「地區分歧」。
- 開啟查詢介面時，只有剪貼簿整段都是有效 IPv4／IPv6 清單才自動填入空白輸入框，不覆蓋已編輯內容、不自動查詢。新增 clipboardRead 權限，Chrome 可能提示允許讀取複製貼上的資料。
- 輸入框內 Enter 開始查詢、Alt+Space 換行；輸入法組字期間不觸發查詢。

## Desktop

- 歷史紀錄保存完整來源資料，支援詳細檢視、條件篩選、勾選與 CSV 匯出。
- 相容既有歷史摘要，並改善來源缺少金鑰、配額與匯出狀態處理。

## 下載與安裝

- Chrome：下載 `IP.Radar.Chrome_v0.1.21.zip` 並解壓，在 `chrome://extensions` 使用開發人員模式載入未封裝項目。已有安裝請重新載入並確認新增權限。
- macOS：下載 DMG，掛載後拖入 Applications。
- Windows：下載 portable EXE，直接執行。

此版本保持 Draft。CI 將上傳 Chrome ZIP、macOS DMG、Windows EXE，待建置完成後由維護者手動 Publish。
