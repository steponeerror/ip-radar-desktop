## 本次新增

- 新增「單次最大查詢數」設定：預設 100，可調整 1–1,000，輸入後自動儲存。
- 以去重後的 IP 數量計算，前端與背景程式均驗證；超限時阻止查詢並提示分批，不會截斷清單。
- 本機批量上限不會改變 Radar／AbuseIPDB 的服務端配額或速率限制。

## Chrome Extension 更新

- 查詢判定、分類、信心值與桌面版共用邏輯；完整保留 Radar 與 AbuseIPDB 來源資料。
- 簡易結果優先顯示 AbuseIPDB 分數，分類標籤保持同一行；每筆可展開詳情，AbuseIPDB 在上、Radar 在下。
- 地區顯示代碼及名稱；簡易城市採原文，詳情保留原文與來源提供的中文名稱。
- 新增 Auto（跟隨瀏覽器）、繁體中文、簡體中文、English；介面與 CSV 欄名同步切換。
- 設定輸入即自動儲存；小工具寬度調整為 600px。
- CSV 優先排列 IP、地區代碼、城市、AbuseIPDB 分數，其餘欄位按可用資料匯出。
- 授權恢復原本的查詢按鈕流程，不另開獨立授權視窗。Chrome 仍會在首次存取自訂 Server 時要求許可。
- HTTP 403 等來源錯誤明確呈現，不會當作空資料或良性結果。

## 安裝

- **Chrome**：下載 `IP.Radar.Chrome_v0.1.19.zip` 並解壓；開啟 `chrome://extensions` → 開發人員模式 → 載入未封裝項目，選擇包含 manifest.json 的資料夾。更新既有安裝後請重新載入擴充功能。
- **macOS**：下載 DMG，掛載後開啟或拖入 Applications。
- **Windows**：下載 portable EXE，直接執行。

## 驗證與注意事項

- 插件 28 項離線測試、桌面版 93 項測試通過，兩者 TypeScript 與前端生產建置通過。
- 實際 API 測試需額外提供金鑰，CI 預設跳過；API 原始文字不會自動翻譯。
- 此版本尚未上架 Chrome Web Store。Chrome 原生權限對話框可能使工具列 popup 關閉，屬於恢復原流程後的已知行為。

此版本保持 **Draft**。CI 將分別上傳 Chrome ZIP、macOS DMG、Windows EXE，待建置完成後由維護者手動 Publish。
