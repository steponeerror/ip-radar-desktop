## Chrome Extension 更新

- 查詢結果每頁 5 筆，分頁只顯示在底部；查詢期間停用 CSV 匯出，完成或停止後才加入紀錄頁。
- 紀錄篩選改為頁內彈出視窗，可組合 IP／地區／ISP、地區、總判定與 AbuseIPDB 分數條件。
- 紀錄支援點擊卡片勾選、跨頁保留選取、重置／取消勾選，以及匯出已選 IP。
- 設定頁新增「紀錄管理與更新」卡片：匯出全部紀錄、進入獨立批次管理畫面，以及手動檢查 GitHub 更新。
- 批次管理支援勾選多批紀錄並確認刪除，完成後返回設定頁。
- 設定開關僅在點擊開關本身時切換，避免文字與外圍區域誤觸。
- 調整匯出位置、垃圾桶圖示與主要操作按鈕，移除多餘頁尾提示。
- 下拉選單改用 Base UI Select，詳情使用 Collapsible，垃圾桶提示使用 Tooltip。
- 分數與查詢數使用文字 Input，保留數值驗證；插件原生捲軸改為 thin。
- 新介面維持繁體中文、簡體中文與英文支援。

## 安裝

- **Chrome**：下載 `IP.Radar.Chrome_v0.1.20.zip` 並解壓；開啟 `chrome://extensions` → 開發人員模式 → 載入未封裝項目，選擇包含 manifest.json 的資料夾。更新既有安裝後請重新載入擴充功能。
- **macOS**：下載 DMG，掛載後開啟或拖入 Applications。
- **Windows**：下載 portable EXE，直接執行。

## 驗證

- 插件 34 項離線測試與 TypeScript／生產建置通過；實際 API 測試未提供金鑰時跳過。
- 已以介面預覽驗證篩選、卡片勾選、跨頁選取、設定開關及 GitHub 更新檢查。

此版本保持 **Draft**。CI 將分別上傳 Chrome ZIP、macOS DMG、Windows EXE，待建置完成後由維護者手動 Publish。
