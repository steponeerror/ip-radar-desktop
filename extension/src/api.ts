import type { Row, Settings } from "./model";
async function request(url: string, init: RequestInit, signal: AbortSignal) {
  const response = await fetch(url, {
    ...init,
    signal,
    redirect: "error",
    credentials: "omit",
  });
  if (!response.ok)
    throw new Error(
      `HTTP ${response.status}${response.status === 429 ? "：查詢配額或速率限制，請稍後重試" : response.status === 401 || response.status === 403 ? "：請檢查 API Key／權限" : ""}`,
    );
  return response;
}
export async function lookup(
  ip: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<Row> {
  const row: Row = {
    ip,
    queriedAt: new Date().toISOString(),
    status: "done",
    errors: [],
  };
  let abuseIsp: string | undefined;
  await Promise.all([
    (async () => {
      if (!settings.radarEnabled) return;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (settings.radarKey)
          headers.Authorization = `Bearer ${settings.radarKey}`;
        const r = await request(
          `${settings.serverUrl.replace(/\/+$/, "")}/api/query/stream`,
          { method: "POST", headers, body: JSON.stringify({ ips: [ip] }) },
          signal,
        );
        const events = (await r.text())
          .split("\n")
          .filter((x) => x.trim())
          .map((x) => JSON.parse(x));
        const d = events.find(
          (x) => x.type === "row" && x.result?.ip === ip,
        )?.result;
        if (!d) throw new Error("Server 沒有回傳此 IP 的結果");
        if (d.error) throw new Error(String(d.error));
        row.radarCountry = d.country?.value;
        row.city = d.city_zh || d.city?.value;
        row.asn = d.asn?.value;
        row.isp = d.as_name?.value;
        row.verdict = d.threat?.verdict;
        if (!events.some((x) => x.type === "done"))
          row.errors.push("Radar：串流未完整結束，已保留取得的資料");
      } catch (e) {
        row.errors.push(
          `Radar：${e instanceof Error ? e.message : "查詢失敗"}`,
        );
      }
    })(),
    (async () => {
      if (!settings.abuseEnabled) return;
      if (!settings.abuseKey) {
        row.errors.push("AbuseIPDB：尚未設定 API Key");
        return;
      }
      try {
        const r = await request(
          `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
          { headers: { Key: settings.abuseKey, Accept: "application/json" } },
          signal,
        );
        const d = (await r.json()).data;
        if (!d || typeof d.abuseConfidenceScore !== "number")
          throw new Error("回應缺少分數");
        row.score = d.abuseConfidenceScore;
        row.reports = d.totalReports;
        row.abuseCountry = d.countryCode;
        row.tor = d.isTor;
        // Radar may finish later; give it precedence after both sources complete.
        abuseIsp = d.isp;
      } catch (e) {
        row.errors.push(
          `AbuseIPDB：${e instanceof Error ? e.message : "查詢失敗"}`,
        );
      }
    })(),
  ]);
  row.country = row.radarCountry || row.abuseCountry;
  row.isp ||= abuseIsp;
  return row;
}
