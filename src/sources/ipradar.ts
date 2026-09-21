// ipradar 源:自托管 server 的查询客户端。
// 单 IP 走 GET /api/lookup/{ip}(与流式每行同构);多 IP 走 POST /api/query/stream(NDJSON)。
// 鉴权:有 key 则带 Authorization: Bearer;无 key 照发(旧版 server 放行,新版 401 由 UI 引导)。
// warming(503 + error.code==="warming")只透传 code,重发轮询归 UI 层 —— 源保持无状态。
import { fetch as tf } from "@tauri-apps/plugin-http";
import type { QuerySource, SourceSection, Settings } from "./_types";

// 类型精简自 server frontend/src/api.ts,字段语义一致
export interface LookupResult {
  ip: string; is_reserved?: boolean; error?: string;
  country?: { value: string }; city?: { value: string }; city_zh?: string | null;
  asn?: { value: number | string }; as_name?: { value: string }; ip_range?: { value: string };
  threat?: { verdict: string; confidence: number; types: string[]; is_cdn: boolean };
  location?: { lat: number; lon: number; accuracy_radius?: number } | null;
  classifications?: Record<string, { verdict: string; detected: boolean; confidence: number; malware_names: string[] }>;
}

function authHeaders(s: Settings): Record<string, string> {
  return s.ipradarKey ? { Authorization: `Bearer ${s.ipradarKey}` } : {};
}

function errSection(status: number, code: string | undefined, message: string, retryAfter?: number): SourceSection {
  return { sourceId: "ipradar", status: "error", error: { status, code, message, retryAfter } };
}

async function parseErr(r: Response): Promise<SourceSection> {
  const body = await r.json().catch(() => null);
  return errSection(r.status, body?.error?.code, body?.error?.message ?? r.statusText, body?.error?.retry_after);
}

export const ipradarSource: QuerySource = {
  id: "ipradar", label: "IP Radar",
  async query(ip, s) {
    const base = s.serverUrl.replace(/\/+$/, "");
    const r = await tf(`${base}/api/lookup/${ip}`, {
      headers: authHeaders(s),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return parseErr(r);
    return { sourceId: "ipradar", status: "ok", data: await r.json() };
  },
  async *queryMany(ips, s) {
    const base = s.serverUrl.replace(/\/+$/, "");
    const r = await tf(`${base}/api/query/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(s) },
      body: JSON.stringify({ ips }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) { yield* singleErr(await parseErr(r), ips); return; }
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let sawDone = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop()!;
      for (const line of lines) {
        if (!line.trim()) continue;
        const evt = JSON.parse(line);
        if (evt.type === "row") {
          yield { ip: evt.result.ip, section: { sourceId: "ipradar", status: "ok", data: evt.result } };
        } else if (evt.type === "done") {
          sawDone = true;
        }
      }
    }
    if (!sawDone) throw new Error("stream ended before done");
  },
};

async function* singleErr(sec: SourceSection, ips: string[]) {
  for (const ip of ips) yield { ip, section: sec };
}
