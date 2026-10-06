import type { Row, Settings } from "./model";
import {
  agreedCountry,
  type LookupResult,
  type AbuseSection,
  type SourceSection,
} from "../../shared/intelligence";

class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}
async function request(url: string, init: RequestInit, signal: AbortSignal) {
  const response = await fetch(url, {
    ...init,
    signal,
    redirect: "error",
    credentials: "omit",
  });
  if (!response.ok) {
    const body = await response.text();
    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch {
      /* Gateways may return HTML/plain text. */
    }
    const retry = Number(
      response.headers.get("retry-after") || envelope?.error?.retry_after,
    );
    const cloudflare =
      response.status === 403 && /1010|cloudflare|challenge/i.test(body);
    const detail = cloudflare
      ? "Cloudflare 拒絕此請求，請檢查 Server 的 API 路徑／防火牆規則；不是空結果"
      : response.status === 401 || response.status === 403
        ? "驗證或存取權限遭拒，請檢查對應 API Key 與 Server 權限；不是空結果"
        : response.status === 429
          ? "查詢配額或速率限制，請稍後重試"
          : envelope?.error?.code === "warming"
            ? "Server 正在預熱，請稍後重試"
            : response.statusText;
    throw new ApiError(
      `HTTP ${response.status}：${detail}`,
      response.status,
      envelope?.error?.code,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return response;
}
function failure(sourceId: string, e: unknown): SourceSection {
  const error = e instanceof Error ? e : new Error("查詢失敗");
  return {
    sourceId,
    status: "error",
    error: {
      message: error.message,
      ...(e instanceof ApiError
        ? { status: e.status, code: e.code, retryAfter: e.retryAfter }
        : {}),
    },
  };
}
function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
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
  const sections = await Promise.all([
    (async (): Promise<SourceSection | undefined> => {
      if (!settings.radarEnabled) return;
      let data: LookupResult | undefined;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (settings.radarKey)
          headers.Authorization = `Bearer ${settings.radarKey}`;
        const response = await request(
          `${settings.serverUrl.replace(/\/+$/, "")}/api/query/stream`,
          { method: "POST", headers, body: JSON.stringify({ ips: [ip] }) },
          signal,
        );
        if (!response.body) throw new Error("Server 沒有回傳資料");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let done = false;
        const event = (line: string) => {
          if (!line.trim()) return;
          const e = JSON.parse(line);
          if (e.type === "row" && e.result?.ip === ip) {
            if (e.result.error) throw new Error(String(e.result.error));
            data = e.result;
          }
          if (e.type === "done") done = true;
          if (e.type === "error") throw new Error("Server 串流回報錯誤");
        };
        try {
          while (true) {
            const chunk = await reader.read();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            lines.forEach(event);
            if (chunk.done) {
              event(buffer);
              break;
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (!data) throw new Error("Server 沒有回傳此 IP 的結果");
        if (!done) row.errors.push("Radar：串流未完整結束，已保留取得的資料");
        return { sourceId: "ipradar", status: "ok", data };
      } catch (e) {
        if (data) {
          row.errors.push("Radar：串流中斷，已保留取得的資料");
          return { sourceId: "ipradar", status: "ok", data };
        }
        return failure("ipradar", e);
      }
    })(),
    (async (): Promise<SourceSection | undefined> => {
      if (!settings.abuseEnabled) return;
      if (!settings.abuseKey)
        return { sourceId: "abuseipdb", status: "needs-key" };
      try {
        const go = () =>
          request(
            `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
            { headers: { Key: settings.abuseKey, Accept: "application/json" } },
            signal,
          );
        let response;
        try {
          response = await go();
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 429) throw e;
          await wait((e.retryAfter ?? 1) * 1000, signal);
          response = await go();
        }
        const d = (await response.json()).data;
        if (!d || typeof d.abuseConfidenceScore !== "number")
          throw new Error("回應缺少分數");
        const data: AbuseSection = {
          score: d.abuseConfidenceScore,
          totalReports: d.totalReports ?? 0,
          numDistinctUsers: d.numDistinctUsers ?? 0,
          isTor: !!d.isTor,
          countryCode: d.countryCode,
          isp: d.isp,
          usageType: d.usageType,
          lastReportedAt: d.lastReportedAt,
          recentComments: (d.reports ?? [])
            .slice(0, 3)
            .map((r: { comment?: string }) => r.comment)
            .filter(Boolean),
        };
        return { sourceId: "abuseipdb", status: "ok", data };
      } catch (e) {
        return failure("abuseipdb", e);
      }
    })(),
  ]);
  row.sections = sections.filter((s): s is SourceSection => !!s);
  for (const s of row.sections) {
    if (s.status === "error" || s.status === "needs-key")
      row.errors.push(
        `${s.sourceId === "ipradar" ? "Radar" : "AbuseIPDB"}：${s.error?.message || "尚未設定 API Key"}`,
      );
    if (s.status !== "ok") continue;
    if (s.sourceId === "ipradar") {
      const d = s.data as LookupResult;
      row.radarCountry = d.country?.value;
      row.city = d.city?.value;
      row.asn = d.asn?.value;
      row.isp = d.as_name?.value;
      row.verdict = d.threat?.verdict;
    } else {
      const a = s.data as AbuseSection;
      row.score = a.score;
      row.reports = a.totalReports;
      row.abuseCountry = a.countryCode;
      row.tor = a.isTor;
      row.isp ||= a.isp;
    }
  }
  row.country = agreedCountry(row.sections);
  return row;
}
