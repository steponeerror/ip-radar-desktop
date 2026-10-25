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

## Firefox

在 `extension` 目錄執行 `npm run build:firefox`：產出獨立的 `dist-firefox`（不覆蓋 Chrome 的 `dist`），並打包 `IP.Radar.Firefox_v<版本>.zip`。接著執行 `npm run lint:firefox` 做 Mozilla 靜態檢查。CI 會建置與檢查 Firefox 包；版本標籤的 Release 工作流程會上傳未簽名 ZIP 到 Draft。

- Firefox 桌面版最低 140；Android manifest 最低 142（本專案尚未做 Android 實機驗證）。manifest 使用事件頁及模組，並宣告查詢 IP 與 API 憑證傳送給所選服務涉及的資料種類，由 Firefox 在安裝時顯示同意要求。沒有讀取瀏覽歷史或分析追蹤功能。
- 臨時安裝：解壓 ZIP，在 Firefox 開啟 `about:debugging#/runtime/this-firefox`，按「Load Temporary Add-on」，選擇 `dist-firefox` 或解壓目錄內的 `manifest.json`。臨時附加元件重啟 Firefox 後即消失。
- 永久安裝需 AMO 簽名（免費，unlisted 不會公開上架）：建立 `amo.env`（內含 `WEB_EXT_API_KEY`、`WEB_EXT_API_SECRET`），執行 `set -a; . ./amo.env; set +a` 後再 `npx web-ext sign --source-dir dist-firefox --channel unlisted`。上述載入環境檔指令適用 bash/zsh；簽好的 XPI 在 `web-ext-artifacts/`，需另行上傳 Release 供使用者安裝。簽名憑證不進 Git 或一般打包流程。
- gecko id 為 `ip-radar-extension@steponeerror.github.io`，首次簽名後必須維持不變。
- **unlisted 重新簽名不會讓已安裝者自動更新**。目前沒有設定 `update_url`，使用者需從 Release 下載新版已簽名 XPI 手動更新；若未來要自動更新，需另行維護 HTTPS 更新清單及已簽名 XPI。詳見 [Mozilla 自發佈說明](https://extensionworkshop.com/documentation/publish/self-distribution/)。
- Firefox「檢查更新」只接受對應版本的 `IP.Radar.Firefox_v<版本>.zip` 或 `.xpi`；ZIP 僅供臨時安裝／提交簽名，不能當作永久安裝包。Chrome 仍只比對 Chrome ZIP。
- Mozilla lint 可能對 React 套件內部的 `innerHTML` 實作產生警告；應逐項檢查輸出。本專案目前沒有直接使用 `innerHTML` 或 `dangerouslySetInnerHTML` 顯示 API 回應。靜態檢查通過不代表 AMO 已核准或已簽名。

## 功能

- 一批預設最多 100 個 IPv4 / IPv6，可在設定調整單次最大查詢數（任意正整數，移除 1,000 上限；仍受服務端與本機資源限制）；換行、逗號、分號或空格分隔，去重並提示無效項目。
- Radar 整批送出並串流接收，AbuseIPDB 獨立逐 IP 查詢，每秒最多啟動一次請求。各來源結果到達後先更新記憶體，約每 200ms 合併保存並更新畫面，關閉 popup 不會清空工作；worker 被回收時，由每分鐘 alarm 接續。中斷時尚未保存的請求可能重送並再次消耗配額。
- 可停止批次，保留各來源已取得的部分結果；查詢頁與紀錄標明各來源成功數、失敗／未查詢數，以及已查完或已停止未查完。停止是結束此批次，並非暫停後自動續查。單一來源失敗仍保留另一來源資料，顯示 401/403、429、逾時等訊息。
- 紀錄頁在垃圾桶同列左側以小字顯示停止狀態與各來源成功數，批次選單只顯示時間與 IP 數。
- 頁面只常駐最新查詢明細與正在查看的一批歷史明細；歷史列表從批次索引讀取日期、IP 數、完成／停止狀態及來源統計，選取批次後才讀取該批內容，切換或離開紀錄頁即解除上一批明細引用。尚無摘要的分批紀錄不會啟動時整批掃描，只在首次選取時補建摘要；舊版 `radarState` 歷史仍不遷移。匯出全部紀錄時才逐批讀取，CSV 產生期間會暫時占用所有待匯出資料的記憶體。
- 保存最近 50 批紀錄；查詢頁與紀錄頁固定每頁 5 筆，分頁只顯示在結果底部。只有已完成或已停止的批次會出現在紀錄頁，進行中進度在查詢頁查看。
- 紀錄頁點「篩選紀錄」開啟頁內彈出視窗，可搜尋 IP／地區／ISP，並組合地區、總判定與 AbuseIPDB 分數條件（大於、大於等於、小於、小於等於、等於、區間、沒有分數）。例如選「大於 >」並輸入 50，只保留分數超過 50 的結果。
- 在設定頁獨立的「紀錄管理與更新」卡片點「管理批次」可勾選多個批次，確認數量後批量刪除；也可直接刪除目前批次。
- 紀錄頁點「開始勾選」才顯示 IP 卡片的勾選框，點擊卡片即可切換勾選（查詢頁不提供勾選），跨頁與篩選保留選取；「重置勾選」清空選取並留在勾選模式，「取消勾選」清空並退出。
- 查詢進行中，查詢頁提供「導出已查詢」及筆數，匯出當下所有已收到來源結果的 IP（跨頁，包含部分結果與來源錯誤），沿用既有 CSV 格式；未完成來源留空，完全未收到結果的 IP 排除，沒有資料時停用。匯出不停止查詢。批次完成或停止後隱藏此按鈕，紀錄頁不提供。完整 CSV 匯出仍須批次結束；完成後可匯出目前批次、篩選結果的所有頁面、已勾選 IP（包含篩選外的已選項目），或全部已完成紀錄。
- CSV 全部在前端生成，使用 UTF-8 BOM、CRLF，處理公式注入與逗號、引號、換行。必含 IP、地區、AbuseIPDB 分數，其餘欄位依已有資料加入。缺失資料留空，0 分保留為 0。已停止項目包含狀態／訊息。
- 語言：Auto（跟隨瀏覽器）、繁體中文、簡體中文、English；Auto 不支援的語言回退英文。介面與 CSV 欄名隨語言切換，API 原始內容不翻譯。
- 簡易結果使用原文城市；詳情保留原文及來源提供的中文城市，例如 Dar es Salaam（达累斯萨拉姆）。
- 設定頁的「紀錄管理與更新」卡片提供全部紀錄匯出、批次管理及手動檢查更新。更新檢查讀取 GitHub 最新正式 Release，排除 Draft／Prerelease，確認擴充功能 ZIP 已上傳後提示前往下載；不自動安裝。
- 深色／淺色模式；可單次開啟分頁，或設定工具列按鈕預設以分頁開啟。

## API 與儲存

Radar 沿用桌面版合約：`POST {serverUrl}/api/query/stream`，JSON `{ "ips": ["1.1.1.1"] }`，NDJSON `row`（`result`）與 `done` 事件。Key 使用 `Authorization: Bearer`。AbuseIPDB 使用 `/api/v2/check`、`Key` header、90 日觀察範圍。

AbuseIPDB 遇到 429 即停止本批次該來源的後續請求，不在原批次重試；冷卻依 `Retry-After`（秒數或 HTTP 日期）及額度耗盡時的 `X-RateLimit-Reset` 計算，缺少有效時間時暫採 60 秒並明確提示。冷卻與額度以 Key 指紋分開保存在本機，跨批次及背景工作重啟有效；冷卻期間新批次跳過 AbuseIPDB，Radar 正常查詢。到期後可另開新批次，不會自動補查已停止的項目。401/403 也停止該來源。

設定頁顯示「AbuseIPDB 額度與冷卻」：最近回應的剩餘額度、每日上限、重置時間、更新時間及可再次查詢時間。查詢頁另顯示冷卻通知。缺少額度標頭顯示未知，已過重置時間的舊額度會標明待下次回應確認，不額外呼叫 API 更新狀態。背景工作重啟時只補查缺失的來源。

地區與桌面版一致：成功來源的地區一致才顯示總地區；不同時顯示地區分歧，各來源地區仍保留於完整模式及 CSV。AbuseIPDB 顯示原始 0–100 分。

儲存分為 `radar.settings`（設定）、`radar.abuseLimits`（額度與冷卻）、`radar.batchIndex`（批次索引、摘要及進行中批次 ID），以及每批獨立的 `radar.batch.<id>`。來源結果先更新目前批次的記憶體資料，約每 200ms 合併保存一次，串流不等待逐筆寫入。停止與完成時立即等待最後寫入；「導出已查詢」向背景取得並保存當下快照，再產生 CSV。AbuseIPDB 額度與冷卻仍立即單獨保存。畫面依批次儲存事件更新。開啟介面只讀取摘要與最新批次，歷史明細按選取讀取；一般操作回覆不包含全部歷史。背景工作意外終止時，尚未落盤的少量結果可能在恢復後重查；正常停止會保留全部已收到的結果。

首次使用分開儲存時，只保留舊格式的設定與冷卻資訊；不自動遷移舊查詢紀錄。舊 `radarState` 原始資料保留但不再供新紀錄頁使用，後續查詢不會讀寫它。

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

預設簡易結果：IP、共識地區、總判定、同列的 AbuseIPDB 分數與 IP Radar 來源判定、CDN／Tor／用途、業者、ASN、舉報次數與人數。查詢失敗會直接顯示，不會被當成空資料或良性。

點擊結果卡片或「查看詳情」後，顯示兩個來源的詳細欄位：地區、城市、業者、IP 範圍及各自信心值、橫向捲動的命中分類／惡意軟體名稱（橫向膠囊標籤顯示分類信心數值），以及 AbuseIPDB 的 ISP、用途、Tor、舉報次數、人數、最後舉報、可用的最近舉報摘要。詳情固定 AbuseIPDB 在上、IP Radar 在下；可按「收起詳情」關閉，展開不會重新呼叫 API。勾選模式點卡片只會勾選，需按「查看詳情」展開。地區篩選也支援「地區分歧」。

與桌面版共用 `shared/intelligence.ts`：AbuseIPDB ≥50 主張惡意，低於 50 不表態；成功來源判定不同或惡意缺乏其他成功來源支持時為分歧。非良性共識取最大原生數值，不平均；良性和分歧不帶綜合數字。AbuseIPDB 色階為 0–24／25–59／60–100，與 50 分判定門檻不同。

舊版紀錄僅有摘要，不會虛構完整資料或計算不可靠的共識；重新查詢後才有完整細節。CSV 前四欄固定為 IP、地區代碼、城市、AbuseIPDB 分數；不受詳情展開狀態影響，匯出已取得的信心、分類與其他欄位。

2026-10-06 驗證：兩個服務的實際請求均成功；85.217.149.40 為惡意 100、AbuseIPDB 100；165.245.176.134 為良性、AbuseIPDB 0。結果為當時快照，可能隨來源更新。Python 預設 HTTP 客戶端曾遇到 Cloudflare 403/1010；正常 curl 及插件 `fetch` 實作成功，未改動伺服器防火牆。403 會保留 HTTP 狀態及明確失敗提示。

開發時可開啟 `/?mode=popup&sample=reference`，查看上述不含金鑰的實際回應快照；此資料入口不包含於生產建置。

開啟查詢介面時會讀取剪貼簿，只有完整有效的 IPv4／IPv6 清單才自動填入空白輸入框；不會自動查詢或覆蓋已編輯內容。需 `clipboardRead` 權限。輸入框內 Enter 開始查詢，Alt+Space 在游標位置換行；輸入法組字時不觸發查詢。
