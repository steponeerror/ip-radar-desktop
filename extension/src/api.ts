import {
  abuseBlocked,
  updateAbuseLimits,
  type AbuseLimits,
} from "./abuse-limits";
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
    readonly exhausted = false,
  ) {
    super(message);
  }
}
async function request(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  onResponse?: (response: Response) => Promise<void>,
) {
  const response = await fetch(url, {
    ...init,
    signal,
    redirect: "error",
    credentials: "omit",
  });
  await onResponse?.(response);
  if (!response.ok) {
    const body = await response.text();
    let envelope;
    try {
      envelope = JSON.parse(body);
    } catch {
      /* Gateways may return HTML/plain text. */
    }
    const retryHeader = response.headers.get("retry-after");
    const numericRetry = Number(retryHeader || envelope?.error?.retry_after);
    const retry = Number.isFinite(numericRetry)
      ? numericRetry
      : Math.max(0, (Date.parse(retryHeader ?? "") - Date.now()) / 1000);
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
            : envelope?.errors
                ?.map((error: { detail?: string }) => error.detail)
                .filter(Boolean)
                .join("; ") ||
              envelope?.error?.message ||
              response.statusText;
    throw new ApiError(
      `HTTP ${response.status}：${detail}`,
      response.status,
      envelope?.error?.code,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
      response.headers.get("x-ratelimit-remaining") === "0",
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

type Emit = (ip: string, section: SourceSection) => Promise<void>;

// Separate source tasks: Radar streams a single batch while AbuseIPDB advances its own queue.
export async function queryBatch(
  rows: Row[],
  settings: Settings,
  parentSignal: AbortSignal,
  emit: Emit,
  quota?: { state?: AbuseLimits; save: (state: AbuseLimits) => Promise<void> },
) {
  const control = new AbortController();
  const signal = AbortSignal.any([parentSignal, control.signal]);
  const missing = (id: string) =>
    rows.filter(
      (r) =>
        r.status === "pending" && !r.sections?.some((s) => s.sourceId === id),
    );
  const tasks = [
    (async () => {
      if (!settings.radarEnabled) return;
      const ips = missing("ipradar").map((r) => r.ip);
      if (!ips.length) return;
      const unseen = new Set(ips);
      const received = new Map<string, SourceSection>();
      const control = new AbortController();
      const combined = AbortSignal.any([signal, control.signal]);
      let timer: ReturnType<typeof setTimeout>;
      const touch = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => control.abort(new Error("Radar 串流逾時")),
          20_000,
        );
      };
      touch();
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (settings.radarKey)
          headers.Authorization = `Bearer ${settings.radarKey}`;
        const response = await request(
          `${settings.serverUrl.replace(/\/+$/, "")}/api/query/stream`,
          { method: "POST", headers, body: JSON.stringify({ ips }) },
          combined,
        );
        if (!response.body) throw new Error("Server 沒有回傳資料");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "",
          done = false;
        const event = async (line: string) => {
          if (!line.trim()) return;
          const e = JSON.parse(line);
          if (e.type === "row" && unseen.has(e.result?.ip)) {
            signal.throwIfAborted();
            const section: SourceSection = e.result.error
              ? failure("ipradar", new Error(String(e.result.error)))
              : { sourceId: "ipradar", status: "ok", data: e.result };
            received.set(e.result.ip, section);
            await emit(e.result.ip, section);
            unseen.delete(e.result.ip);
          }
          if (e.type === "done") done = true;
          if (e.type === "error") throw new Error("Server 串流回報錯誤");
        };
        try {
          while (true) {
            const chunk = await reader.read();
            touch();
            buffer += decoder.decode(chunk.value, { stream: !chunk.done });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            for (const line of lines) await event(line);
            if (chunk.done) {
              await event(buffer);
              break;
            }
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        if (!done || unseen.size)
          throw new Error("Radar 串流未完整結束，未收到此 IP 的結果");
      } catch (e) {
        if (!signal.aborted) {
          for (const ip of unseen) await emit(ip, failure("ipradar", e));
          for (const [ip, section] of received)
            if (section.status === "ok")
              await emit(ip, {
                ...section,
                error: { message: "Radar：串流中斷，已保留取得的資料" },
              });
        }
      } finally {
        clearTimeout(timer!);
      }
    })(),
    (async () => {
      if (!settings.abuseEnabled) return;
      const pending = missing("abuseipdb");
      let limits: AbuseLimits = { ...quota?.state };
      const save = async (next: AbuseLimits) => {
        // Persist before advancing, so a worker restart cannot forget a cooldown.
        await quota?.save(next);
        limits = next;
      };
      const coolingSection = (): SourceSection =>
        failure(
          "abuseipdb",
          new ApiError(
            limits.reason === "quota"
              ? "AbuseIPDB 額度已用完，已停止此來源，未查詢剩餘 IP"
              : "AbuseIPDB 需冷卻，已停止此來源，未查詢剩餘 IP",
            429,
            undefined,
            Math.max(
              0,
              Math.ceil(
                ((limits.blockedUntil ?? Date.now()) - Date.now()) / 1000,
              ),
            ),
          ),
        );
      let blocked: SourceSection | undefined = abuseBlocked(limits)
        ? coolingSection()
        : undefined;
      for (const row of pending) {
        if (signal.aborted) return;
        if (!settings.abuseKey) {
          await emit(row.ip, { sourceId: "abuseipdb", status: "needs-key" });
          continue;
        }
        if (blocked) {
          await emit(row.ip, blocked);
          continue;
        }
        // Storage errors deliberately propagate: do not continue sending with unpersisted limits.
        await wait(
          Math.max(0, (limits.nextRequestAt ?? 0) - Date.now()),
          signal,
        ).catch((e) => {
          if (!signal.aborted) throw e;
        });
        if (signal.aborted) return;
        await save({ ...limits, nextRequestAt: Date.now() + 1000 });
        if (signal.aborted) return;
        // Pace from the actual dispatch, after potentially slow storage writes.
        limits = { ...limits, nextRequestAt: Date.now() + 1000 };
        let response: Response;
        let storageFailure = false;
        let deadlinePersisted = false;
        try {
          response = await request(
            `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(row.ip)}&maxAgeInDays=90`,
            { headers: { Key: settings.abuseKey, Accept: "application/json" } },
            AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
            async (response) => {
              try {
                await save(updateAbuseLimits(limits, response));
                deadlinePersisted = true;
              } catch (e) {
                storageFailure = true;
                throw e;
              }
            },
          );
          const section = await abuseSection(response);
          if (signal.aborted) return;
          await emit(row.ip, section);
          if (abuseBlocked(limits)) blocked = coolingSection();
        } catch (e) {
          if (storageFailure) throw e;
          if (signal.aborted) return;
          const section = failure("abuseipdb", e);
          await emit(row.ip, section);
          if (abuseBlocked(limits)) blocked = coolingSection();
          else if (
            e instanceof ApiError &&
            [429, 401, 403].includes(e.status ?? 0)
          )
            blocked = section;
        } finally {
          // Also retain the actual dispatch deadline after network errors or cancellation.
          if (!storageFailure && !deadlinePersisted) await save(limits);
        }
      }
    })(),
  ];
  try {
    await Promise.all(tasks);
  } catch (error) {
    control.abort(error);
    await Promise.allSettled(tasks);
    throw error;
  }
}

async function abuseSection(response: Response): Promise<SourceSection> {
  const d = (await response.json()).data;
  if (!d || typeof d.abuseConfidenceScore !== "number")
    throw new Error("回應缺少分數");
  const data: AbuseSection = {
    score: d.abuseConfidenceScore,
    totalReports: d.totalReports ?? 0,
    numDistinctUsers: d.numDistinctUsers ?? 0,
    isTor: typeof d.isTor === "boolean" ? d.isTor : undefined,
    domain:
      typeof d.domain === "string" ? d.domain.trim() || undefined : undefined,
    hostnames: Array.isArray(d.hostnames)
      ? d.hostnames.filter(
          (name: unknown): name is string =>
            typeof name === "string" && name.trim().length > 0,
        )
      : undefined,
    isWhitelisted:
      typeof d.isWhitelisted === "boolean" ? d.isWhitelisted : null,
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
}

export function mergeSection(
  previous: Row,
  section: SourceSection,
  sourceIds: string[],
): Row {
  const sections = [
    ...(previous.sections ?? []).filter((s) => s.sourceId !== section.sourceId),
    section,
  ];
  const row: Row = {
    ip: previous.ip,
    queriedAt: new Date().toISOString(),
    errors: [],
    sections,
    status: sourceIds.every((id) => sections.some((s) => s.sourceId === id))
      ? "done"
      : "pending",
  };
  for (const s of sections) {
    if (s.status === "error" || s.status === "needs-key")
      row.errors.push(
        `${s.sourceId === "ipradar" ? "Radar" : "AbuseIPDB"}：${s.error?.message || "尚未設定 API Key"}`,
      );
    if (s.status !== "ok") continue;
    if (s.error?.message) row.errors.push(s.error.message);
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
  row.country = agreedCountry(sections);
  return row;
}

export async function lookup(
  ip: string,
  settings: Settings,
  signal: AbortSignal,
): Promise<Row> {
  let row: Row = { ip, queriedAt: "", errors: [], status: "pending" };
  const ids = [
    settings.radarEnabled ? "ipradar" : "",
    settings.abuseEnabled ? "abuseipdb" : "",
  ].filter(Boolean);
  await queryBatch([row], settings, signal, async (_, section) => {
    row = mergeSection(row, section, ids);
  });
  return row;
}
