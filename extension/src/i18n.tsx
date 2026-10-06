import { createContext, useContext } from "react";
export type Locale = "zh-Hant" | "zh-Hans" | "en";
export type Language = "auto" | Locale;
export function resolveLanguage(
  language: Language = "auto",
  browserLanguages: readonly string[] = typeof navigator === "undefined"
    ? ["en"]
    : navigator.languages,
): Locale {
  if (language !== "auto") return language;
  for (const tag of browserLanguages) {
    if (/^zh(?:-|$)/i.test(tag))
      return /hant|tw|hk|mo/i.test(tag) ? "zh-Hant" : "zh-Hans";
    if (/^en(?:-|$)/i.test(tag)) return "en";
  }
  return "en";
}
// Source keys are the original Traditional Chinese UI strings.
const entries = `
儲存中…|保存中…|Saving…
儲存失敗，請重新輸入。|保存失败，请重新输入。|Could not save. Please edit the field again.
請完成連線設定。|请完成连接设置。|Complete the connection settings.
連線與偏好設定|连接与偏好设置|Connection & preferences
API Key 只保存在這台瀏覽器，不會加入 CSV。|API Key 仅保存在此浏览器，不会加入 CSV。|API keys stay in this browser and are excluded from CSV.
使用 Server 的 Bearer Token；未啟用驗證時可留空。|使用 Server 的 Bearer Token；未启用验证时可留空。|Use the server's bearer token. Leave blank if authentication is disabled.
每個 IP 消耗一次查詢，受你的 API 配額限制。|每个 IP 消耗一次查询，受你的 API 配额限制。|Each IP uses one request, subject to your API quota.
預設以瀏覽器分頁開啟|默认以浏览器标签页打开|Open in a browser tab by default
深色模式|深色模式|Dark mode
設定已保留，修正後即可查詢。|设置已保留，修正后即可查询。|Settings are retained. Fix the issue before querying.
操作失敗|操作失败|Operation failed
需要 Server 存取權限才能查詢。|需要 Server 访问权限才能查询。|Server access is required to query. You can retry below.
無法開始查詢|无法开始查询|Could not start the query
切換明暗模式|切换明暗模式|Toggle light / dark mode
在分頁中開啟|在标签页中打开|Open in a tab
介面預覽 · 載入 Chrome 擴充功能後即可查詢。|界面预览 · 加载 Chrome 扩展后即可查询。|UI preview · Load the Chrome extension to query.
查詢|查询|Query
紀錄|记录|History
設定|设置|Settings
批量查詢 IP|批量查询 IP|Batch IP lookup
IPv4 / IPv6 · 換行、逗號或空格分隔 · 最多 100 個|IPv4 / IPv6 · 换行、逗号或空格分隔 · 最多 100 个|IPv4 / IPv6 · Separate with lines, commas or spaces · Up to 100
IP 清單|IP 列表|IP list
無效項目：|无效项：|Invalid entries: 
超過 100 個，請分批查詢。|超过 100 个，请分批查询。|Over 100 IPs. Split them into smaller batches.
個不重複 IP|个不重复 IP|unique IPs
停止查詢|停止查询|Stop lookup
開始查詢|开始查询|Start lookup
最新結果|最新结果|Latest results
背景查詢中，關閉視窗後可從紀錄查看進度。|后台查询中，关闭窗口后可从记录查看进度。|Lookup runs in the background. Check history for progress after closing this window.
查詢批次|查询批次|Lookup batch
尚無紀錄|暂无记录|No history
· 已停止|· 已停止|· Stopped
篩選紀錄|筛选记录|Filter history
搜尋 IP、地區或 ISP…|搜索 IP、地区或 ISP…|Search IP, region or ISP…
分頁顯示（每頁 10 筆）|分页显示（每页 10 条）|Pagination (10 per page)
匯出篩選結果 (|导出筛选结果 (|Export filtered (
匯出全部紀錄|导出全部记录|Export all history
刪除此批次|删除此批次|Delete batch
刪除此批次紀錄？|删除此批次记录？|Delete this batch?
刪除|删除|Delete
取消|取消|Cancel
上一頁|上一页|Previous
下一頁|下一页|Next
保留最近 50 個批次。CSV 包含篩選後所有頁面，缺失資料留空。|保留最近 50 个批次。CSV 包含筛选后所有页面，缺失数据留空。|Keeps the latest 50 batches. CSV includes all filtered pages; missing values stay blank.
命中分類|命中分类|Detected categories
Tor 出口|Tor 出口|Tor exit
舊紀錄只保存摘要，請重新查詢取得桌面版完整判定與欄位。|旧记录仅保存摘要，请重新查询获取桌面版完整判定与字段。|This older record only contains a summary. Query again for the full verdict and fields.
信心|置信度|Confidence
威脅分類|威胁分类|Threat categories
組分類 ·|组分类 ·|categories ·
命中|命中|detected
惡意軟體：|恶意软件：|Malware: 
組分類 · 0 命中|组分类 · 0 命中|categories · 0 detected
信心值表示 Radar 對該項資料的確定程度，並非惡意分數。|置信度表示 Radar 对该项数据的确定程度，并非恶意分数。|Confidence measures Radar's certainty about a field, not how malicious it is.
網路資訊|网络信息|Network information
業者|运营商|Operator
IP 範圍|IP 范围|IP range
地理位置|地理位置|Location
地區|地区|Region
城市|城市|City
定位精度|定位精度|Location accuracy
AbuseIPDB 分數|AbuseIPDB 分数|AbuseIPDB score
用途|用途|Usage
是|是|Yes
否|否|No
舉報次數|举报次数|Reports
舉報人數|举报人数|Reporters
最後舉報|最后举报|Last reported
最近舉報摘要（|最近举报摘要（|Recent report excerpts (
來源詳情|来源详情|Source details
尚未完成|尚未完成|Not completed
Radar 判定|Radar 判定|Radar verdict
尚未設定 API Key|尚未设置 API Key|API key not configured
預熱中|预热中|Warming up
查詢失敗|查询失败|Lookup failed
建議|建议|Retry in
秒後重試|秒后重试|seconds
地區分歧|地区分歧|Region disagreement
地區未知|地区未知|Unknown region
等待查詢…|等待查询…|Pending…
舊版摘要|旧版摘要|Legacy summary
業者未知|运营商未知|Unknown operator
次舉報|次举报|reports
人|人|reporters
收起詳情|收起详情|Hide details
查看詳情|查看详情|View details
尚無結果|暂无结果|No results yet
貼上 IP 清單開始查詢，或調整紀錄篩選條件。|粘贴 IP 列表开始查询，或调整记录筛选条件。|Paste IPs to start a lookup, or adjust your history filter.
惡意|恶意|Malicious
可疑|可疑|Suspicious
良性|良性|Benign
資訊|信息|Informational
保留|保留|Reserved
分歧|分歧|Disagreement
未有判定|暂无判定|No verdict
濫用舉報|滥用举报|Abuse reports
黑名單|黑名单|Blacklist
受感染系統|受感染系统|Infected system
暴力破解|暴力破解|Brute force
DDoS 攻擊|DDoS 攻击|DDoS attack
漏洞利用|漏洞利用|Exploit
機房|机房|Hosting
惡意軟體|恶意软件|Malware
惡意軟體散播|恶意软件传播|Malware distribution
其他|其他|Other
釣魚|钓鱼|Phishing
代理|代理|Proxy
掃描|扫描|Scanner
垃圾郵件|垃圾邮件|Spam
地區代碼|地区代码|Region code
總判定|总判定|Overall verdict
判定原生數值|判定原始数值|Original verdict value
分類命中（判定／信心）|分类命中（判定／置信度）|Detected categories (verdict / confidence)
惡意軟體名稱|恶意软件名称|Malware names
最近舉報摘要|最近举报摘要|Recent report excerpts
Radar 威脅信心|Radar 威胁置信度|Radar threat confidence
Radar 地區|Radar 地区|Radar region
AbuseIPDB 地區|AbuseIPDB 地区|AbuseIPDB region
Radar 地區信心|Radar 地区置信度|Radar region confidence
Radar 城市信心|Radar 城市置信度|Radar city confidence
Radar ASN 信心|Radar ASN 置信度|Radar ASN confidence
Radar 業者信心|Radar 运营商置信度|Radar operator confidence
Radar IP 範圍信心|Radar IP 范围置信度|Radar IP range confidence
緯度|纬度|Latitude
經度|经度|Longitude
定位精度 km|定位精度 km|Location accuracy km
查詢時間|查询时间|Queried at
狀態|状态|Status
Radar 來源狀態|Radar 来源状态|Radar source status
AbuseIPDB 來源狀態|AbuseIPDB 来源状态|AbuseIPDB source status
來源訊息|来源消息|Source messages
Server 請使用 http(s) 網址，不包含帳密、查詢參數或 #。|Server 请使用 http(s) 地址，不包含账号密码、查询参数或 #。|Use an HTTP(S) server URL without credentials, query parameters or a fragment.
請至少啟用一個查詢來源。|请至少启用一个查询来源。|Enable at least one lookup source.
Cloudflare 拒絕此請求，請檢查 Server 的 API 路徑／防火牆規則；不是空結果|Cloudflare 拒绝此请求，请检查 Server 的 API 路径／防火墙规则；不是空结果|Cloudflare blocked the request. Check the server API route / firewall rules; this is not an empty result.
驗證或存取權限遭拒，請檢查對應 API Key 與 Server 權限；不是空結果|验证或访问权限被拒，请检查对应 API Key 与 Server 权限；不是空结果|Authentication or access denied. Check the API key and server permissions; this is not an empty result.
查詢配額或速率限制，請稍後重試|查询配额或速率限制，请稍后重试|Quota or rate limit reached. Try again later.
Server 正在預熱，請稍後重試|Server 正在预热，请稍后重试|Server is warming up. Try again later.
Server 沒有回傳資料|Server 没有返回数据|Server returned no data
Server 串流回報錯誤|Server 数据流报告错误|Server stream reported an error
Server 沒有回傳此 IP 的結果|Server 没有返回此 IP 的结果|Server returned no result for this IP
Radar：串流未完整結束，已保留取得的資料|Radar：数据流未完整结束，已保留已获取的数据|Radar: stream did not finish; received data retained
Radar：串流中斷，已保留取得的資料|Radar：数据流中断，已保留已获取的数据|Radar: stream interrupted; received data retained
回應缺少分數|响应缺少分数|Response has no score
已有批次正在查詢，請等待完成或停止。|已有批次正在查询，请等待完成或停止。|A batch is running. Wait for it to finish or stop it first.
請先設定 AbuseIPDB API Key。|请先设置 AbuseIPDB API Key。|Configure an AbuseIPDB API key first.
請輸入 1–100 個有效 IP，並修正無效項目。|请输入 1–100 个有效 IP，并修正无效项。|Enter 1–100 valid IPs and correct invalid entries.
已停止，未完成查詢|已停止，未完成查询|Stopped before lookup completed
請先停止查詢再刪除。|请先停止查询再删除。|Stop the lookup before deleting it.
未知操作|未知操作|Unknown operation
語言|语言|Language
Auto（跟隨瀏覽器）|Auto（跟随浏览器）|Auto (browser language)
目前是介面預覽。請在 Chrome 載入 extension/dist 後使用查詢與儲存功能。|当前为界面预览。请在 Chrome 加载 extension/dist 后使用查询与保存功能。|This is a preview. Load extension/dist in Chrome to query and save.
`;
const messages = Object.fromEntries(
  entries
    .trim()
    .split("\n")
    .map((line) => {
      const [key, hans, en] = line.split("|");
      return [key, { "zh-Hans": hans, en }];
    }),
);
export function translate(text: string, locale: Locale): string {
  if (locale === "zh-Hant") return text;
  const key = text.trim();
  const translated = messages[key]?.[locale];
  return translated == null ? text : text.replace(key, translated);
}
// Errors may include a source prefix / HTTP code. Translate known messages only.
export function translateError(text: string, locale: Locale): string {
  if (locale === "zh-Hant") return text;
  if (messages[text]) return translate(text, locale);
  for (const key of Object.keys(messages)
    .filter((k) => k.length > 8)
    .sort((a, b) => b.length - a.length)) {
    if (text.includes(key)) return text.replace(key, translate(key, locale));
  }
  return text;
}
export const I18nContext = createContext<Locale>("zh-Hant");
export function useI18n() {
  const locale = useContext(I18nContext);
  return {
    locale,
    t: (text: string) => translate(text, locale),
    errorText: (text: string) => translateError(text, locale),
  };
}
