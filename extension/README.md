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
3. 將 IP Radar 釘選到工具列；點圖示預設開啟 600px 小工具。
4. 在「設定」填入 Server URL、Radar API Key、AbuseIPDB API Key ，輸入即自動儲存。首次查詢新的 Server 時，Chrome 會要求該主機的存取權限。授權由原本的查詢按鈕觸發，不另開視窗。
5. 可關閉不使用的來源。Radar 未設驗證時 Key 可留空，AbuseIPDB 需要 Key。

也可解壓 `ip-radar-extension.zip`，載入解壓後包含 `manifest.json` 的資料夾。

## 功能

- 一批預設最多 100 個 IPv4 / IPv6，可在設定調整單次最大查詢數（1–1,000）；換行、逗號、分號或空格分隔，去重並提示無效項目。
- 背景逐 IP 查詢，同一 IP 的兩個來源並行。每筆完成即保存，關閉 popup 不會清空工作；worker 被回收時，由每分鐘 alarm 接續。中斷時尚未保存的請求可能重送並再次消耗配額。
- 可停止批次。單一來源失敗仍保留另一來源資料，顯示 401/403、429、逾時等訊息。
- 保存最近 50 批紀錄，可選批次、搜尋 IP／地區／ISP、刪除批次、切換每頁 10 筆或全部顯示。
- 匯出目前批次、篩選結果的所有頁面，或全部紀錄。
- CSV 全部在前端生成，使用 UTF-8 BOM、CRLF，處理公式注入與逗號、引號、換行。必含 IP、地區、AbuseIPDB 分數，其餘欄位依已有資料加入。缺失資料留空，0 分保留為 0。進行中／已停止項目包含狀態／訊息。
- 語言：Auto（跟隨瀏覽器）、繁體中文、簡體中文、English；Auto 不支援的語言回退英文。介面與 CSV 欄名隨語言切換，API 原始內容不翻譯。
- 簡易結果使用原文城市；詳情保留原文及來源提供的中文城市，例如 Dar es Salaam（达累斯萨拉姆）。
- 深色／淺色模式；可單次開啟分頁，或設定工具列按鈕預設以分頁開啟。

## API 與儲存

Radar 沿用桌面版合約：`POST {serverUrl}/api/query/stream`，JSON `{ "ips": ["1.1.1.1"] }`，NDJSON `row`（`result`）與 `done` 事件。Key 使用 `Authorization: Bearer`。AbuseIPDB 使用 `/api/v2/check`、`Key` header、90 日觀察範圍。

地區與桌面版一致：成功來源的地區一致才顯示總地區；不同時顯示地區分歧，各來源地區仍保留於完整模式及 CSV。AbuseIPDB 顯示原始 0–100 分。

Key 存在 `chrome.storage.local`，不會同步、匯出或寫入批次紀錄；這是本機儲存，並非加密金鑰庫。查詢時僅送往對應服務。沒有 content scripts，也不讀取目前瀏覽網頁。

權限設計依 [Chrome 跨來源請求文件](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)：AbuseIPDB 為固定主機權限，自訂 Server 則於使用者操作時請求 optional host permission。

## 開發與驗證

```sh
npm run dev
npm test
npm run build
```

Vite 預覽可檢查介面、輸入與明暗模式；查詢、設定持久化及背景流程需載入 Chrome 擴充功能。

離線測試涵蓋 IP／CSV／背景流程，以及與桌面版相同的共識、分類、色階與完整欄位。另有可選實際連線測試，透過 `RADAR_LIVE_URL`、`RADAR_LIVE_KEY`、`ABUSE_LIVE_KEY` 環境變數啟用，沒有金鑰時自動跳過。

## 結果顯示

預設簡易結果：IP、共識地區、總判定、AbuseIPDB 分數、分類徽章、CDN／Tor／用途、業者、ASN、舉報次數與人數。查詢失敗會直接顯示，不會被當成空資料或良性。

點擊每筆結果的「查看詳情」後，顯示兩個來源的完整桌面版欄位：地區、城市、ASN、業者、IP 範圍及各自信心值、GPS／精度、命中分類／惡意軟體名称，以及 AbuseIPDB 的 ISP、用途、Tor、舉報次數、人數、最後舉報、可用的最近舉報摘要。詳情固定 AbuseIPDB 在上、IP Radar 在下；可按「收起詳情」關閉，展開不會重新呼叫 API。

與桌面版共用 `shared/intelligence.ts`：AbuseIPDB ≥50 主張惡意，低於 50 不表態；成功來源判定不同或惡意缺乏其他成功來源支持時為分歧。非良性共識取最大原生數值，不平均；良性和分歧不帶綜合數字。AbuseIPDB 色階為 0–24／25–59／60–100，與 50 分判定門檻不同。

舊版紀錄僅有摘要，不會虛構完整資料或計算不可靠的共識；重新查詢後才有完整細節。CSV 前四欄固定為 IP、地區代碼、城市、AbuseIPDB 分數；不受詳情展開狀態影響，匯出已取得的信心、分類與其他欄位。

2026-10-06 驗證：兩個服務的實際請求均成功；85.217.149.40 為惡意 100、AbuseIPDB 100；165.245.176.134 為良性、AbuseIPDB 0。結果為當時快照，可能隨來源更新。Python 預設 HTTP 客戶端曾遇到 Cloudflare 403/1010；正常 curl 及插件 `fetch` 實作成功，未改動伺服器防火牆。403 會保留 HTTP 狀態及明確失敗提示。

開發時可開啟 `/?mode=popup&sample=reference`，查看上述不含金鑰的實際回應快照；此資料入口不包含於生產建置。
