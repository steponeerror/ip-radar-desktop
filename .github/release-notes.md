## Chrome Extension

- 新增 React + shadcn/ui（Base UI）+ Tailwind CSS 4 Chrome Extension。
- 補齊擴充功能管理頁、工具列及分頁圖示，沿用 IP Radar 桌面版圖示。
- 預設工具列小視窗，可改以瀏覽器分頁開啟，支援深色／淺色模式。
- 批量查詢最多 100 個 IPv4／IPv6，整合 IP Radar 與 AbuseIPDB 分數、地區資料。
- 本機保存最近 50 批搜尋紀錄，可搜尋、分頁及在前端匯出 CSV。
- 可設定 Server URL、Radar API Key、AbuseIPDB API Key。

### 安裝

- **Chrome**：下載 `IP.Radar.Chrome_v0.1.18.zip` 並解壓；開啟 `chrome://extensions` → 開發人員模式 → 載入未封裝項目，選擇解壓後的資料夾。再於擴充功能設定自己的 Server 與 API Key。
- **macOS**：下載 DMG，挂載後開啟或拖入 Applications。
- **Windows**：下載 portable EXE，直接執行。

### 驗證與限制

擴充功能通過 TypeScript、生產建置及 11 個自動測試；API 測試使用模擬回應，實際連線需使用自己的 Server／Key。此版本未上架 Chrome Web Store。

CI 分別建置 Chrome ZIP、macOS DMG 與 Windows EXE；此 release 保持 draft，待三項產物上傳完成後手動發布。
