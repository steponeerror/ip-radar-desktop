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
    // 连接/响应头阶段 15s 超时;到达即停 —— AbortSignal 若挂到 body 读取期,
    // 15s 定时器照样会把慢流拦腰斩断(I2),故用一次性手动控制器
    const connectCtl = new AbortController();
    const connectTimer = setTimeout(() => connectCtl.abort(), 15_000);
    let r: Response;
    try {
      r = await tf(`${base}/api/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(s) },
        body: JSON.stringify({ ips }),
        signal: connectCtl.signal,
      });
    } finally {
      clearTimeout(connectTimer);
    }
    if (!r.ok) { yield* singleErr(await parseErr(r), ips); return; }
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let sawDone = false;
    // 每读一块 15s 空闲看门狗(块间重置);超时 cancel reader 后抛 —— 100 IP 慢流
    // 只要还在吐数据就不算超时(idle 语义,对齐 server 前端 120s idle 的精神)
    const readWithIdle = (): Promise<ReadableStreamReadResult<Uint8Array>> => {
      const readP = reader.read();
      readP.catch(() => {}); // race 已定后迟到的拒绝不外溢为 unhandled
      let timer: ReturnType<typeof setTimeout> | undefined;
      const idleP = new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error("idle timeout (15s without stream data)")), 15_000);
      });
      return Promise.race([readP, idleP]).finally(() => clearTimeout(timer));
    };
    // done.invalid_lines 回填在末段(R5):scheduler 按引用入 map,
    // done 事件必然晚于全部 row 事件,消费完成后 UI 才渲染 —— 事后补字段安全
    let lastSection: SourceSection | null = null;
    try {
      while (true) {
        const { done, value } = await readWithIdle();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const evt = JSON.parse(line);
          if (evt.type === "row") {
            lastSection = { sourceId: "ipradar", status: "ok", data: evt.result };
            yield { ip: evt.result.ip, section: lastSection };
          } else if (evt.type === "done") {
            sawDone = true;
            if ((evt.invalid_lines ?? 0) > 0 && lastSection) {
              lastSection.invalidLines = evt.invalid_lines as number;
            }
          }
        }
      }
    } catch (e) {
      await reader.cancel().catch(() => {});
      throw e;
    }
    if (!sawDone) throw new Error("stream ended before done");
  },
};

async function* singleErr(sec: SourceSection, ips: string[]) {
  for (const ip of ips) yield { ip, section: sec };
}

export default ipradarSource;
