## Firefox 修正

- 修正 popup 寬度設定位置，將 600px 寬度設於 body，改善 Firefox 與 Chrome 的尺寸差異；分頁模式不受影響。
- Release 流程新增 AMO unlisted 簽名，成功後提供 `IP.Radar.Firefox_v0.1.23.xpi`，供永久安裝。
- 簽名與上傳分開執行，已簽名 XPI 保留為 CI 產物 30 天；若只有上傳失敗，可重跑失敗工作，不必重新簽名。

## CI 改善

- Chrome 與 Firefox 共用依賴安裝，減少重複工作。
- 僅修改擴充功能時跳過桌面版三平台編譯；共用程式與 CI 改動仍執行完整驗證。
- 新增 workflow 靜態檢查、自動取消過時測試，以及 Windows EXE 產物數量檢查。

## 下載與安裝

- Chrome：下載 `IP.Radar.Chrome_v0.1.23.zip` 解壓，在 `chrome://extensions` 載入未封裝項目；既有使用者重新載入。
- Firefox：簽名成功後下載 `IP.Radar.Firefox_v0.1.23.xpi`，在 `about:addons` 的齒輪選單選擇「從檔案安裝附加元件…」。目前沒有自動更新，升級需重新下載安裝。
- macOS：下載 DMG，掛載後拖入 Applications。
- Windows：下載 portable EXE，直接執行。

## 驗證與限制

- popup 修正已通過 Chrome／Firefox 建置，尚待實機驗證尺寸。
- workflow 靜態檢查與 4 項 CI 範圍測試通過。本次版本建置、AMO 簽名及平台產物以 Release CI 結果為準。
- 原有 Radar／AbuseIPDB 查詢、冷卻、部分匯出、結果緩存及歷史按需載入功能保留。

此版本保持 Draft，等待 CI 上傳 Chrome ZIP、AMO 已簽名 Firefox XPI、macOS DMG 與 Windows EXE，由維護者檢查後手動發佈。
