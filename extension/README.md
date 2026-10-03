# IP Radar Chrome Extension

React 19 + shadcn/ui（Base UI / base-nova）+ Tailwind CSS 4，Manifest V3。與桌面程式獨立建置。

## 安裝

在 `extension` 目錄執行：

```sh
npm ci
npm run build
```

1. Chrome 開啟 `chrome://extensions`，啟用「開發人員模式」。
2. 按「載入未封裝項目」，選擇此目錄的 `dist` 資料夾。
3. 將 IP Radar 釘選到工具列；點圖示預設開啟 540px 小工具。
4. 在「設定」填入 Server URL、Radar API Key、AbuseIPDB API Key 並儲存。Chrome 會請求設定的 Server 主機存取權限。
5. 可關閉不使用的來源。Radar 未設驗證時 Key 可留空，AbuseIPDB 需要 Key。

也可解壓 `ip-radar-extension.zip`，載入解壓後包含 `manifest.json` 的資料夾。

## 功能

- 一批最多 100 個 IPv4 / IPv6；換行、逗號、分號或空格分隔，去重並提示無效項目。
- 背景逐 IP 查詢，同一 IP 的兩個來源並行。每筆完成即保存，關閉 popup 不會清空工作；worker 被回收時，由每分鐘 alarm 接續。中斷時尚未保存的請求可能重送並再次消耗配額。
- 可停止批次。單一來源失敗仍保留另一來源資料，顯示 401/403、429、逾時等訊息。
- 保存最近 50 批紀錄，可選批次、搜尋 IP／地區／ISP、刪除批次、切換每頁 10 筆或全部顯示。
- 匯出目前批次、篩選結果的所有頁面，或全部紀錄。
- CSV 全部在前端生成，使用 UTF-8 BOM、CRLF，處理公式注入與逗號、引號、換行。必含 IP、地區、AbuseIPDB 分數，其餘欄位依已有資料加入。缺失資料留空，0 分保留為 0。進行中／已停止項目包含狀態／訊息。
- 深色／淺色模式；可單次開啟分頁，或設定工具列按鈕預設以分頁開啟。

## API 與儲存

Radar 沿用桌面版合約：`POST {serverUrl}/api/query/stream`，JSON `{ "ips": ["1.1.1.1"] }`，NDJSON `row`（`result`）與 `done` 事件。Key 使用 `Authorization: Bearer`。AbuseIPDB 使用 `/api/v2/check`、`Key` header、90 日觀察範圍。

合併地區優先採用 Radar，其次 AbuseIPDB；CSV 亦保留兩個來源各自的地區。分數是 AbuseIPDB 原始 0–100 分。

Key 存在 `chrome.storage.local`，不會同步、匯出或寫入批次紀錄；這是本機儲存，並非加密金鑰庫。查詢時僅送往對應服務。沒有 content scripts，也不讀取目前瀏覽網頁。

權限設計依 [Chrome 跨來源請求文件](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)：AbuseIPDB 為固定主機權限，自訂 Server 則於使用者操作時請求 optional host permission。

## 開發與驗證

```sh
npm run dev
npm test
npm run build
```

Vite 預覽可檢查介面、輸入與明暗模式；查詢、設定持久化及背景流程需載入 Chrome 擴充功能。

11 個自動測試涵蓋 IP 驗證／去重、CSV 跳脫／空值／公式防護、API 部分失敗／串流不完整、批次保存／停止／alarm 恢復，以及查詢時儲存設定。API 與 Chrome API 使用測試替身，不消耗真實查詢配額。

已通過 TypeScript、生產建置與測試，並檢查瀏覽器介面的深淺色、設定、輸入驗證。尚未使用真實 Server、AbuseIPDB Key 驗證端到端連線，尚未发布至 Chrome Web Store。
