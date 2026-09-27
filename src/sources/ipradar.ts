// ipradar 源:自托管 server 的查询客户端。
// 单 IP 走 GET /api/lookup/{ip}(与流式每行同构);多 IP 走 POST /api/query/stream(NDJSON)。
// 单查经 invoke("http_get") 走 Rust 池化代理(复用热连接,划词热路径免 TLS 冷启动);流式仍走 plugin-http。
// 鉴权:有 key 则带 Authorization: Bearer;无 key 照发(旧版 server 放行,新版 401 由 UI 引导)。
// warming(503 + error.code==="warming")只透传 code,重发轮询归 UI 层 —— 源保持无状态。
import { fetch as tf } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";
import type { QuerySource, SourceSection, Settings, VerdictCode } from "./_types";

// Rust 池化命令 http_get 的回复契约(src-tauri main.rs HttpReply):
// 非 2xx 不 reject,status+body 原样透传;仅 reqwest 层错误(连接/超时)才 reject invoke
interface HttpReply { status: number; body: string }

// 类型精简自 server frontend/src/api.ts,字段语义一致
export interface LookupResult {
  ip: string; is_reserved?: boolean; error?: string;
  country?: { value: string; confidence?: number }; city?: { value: string; confidence?: number }; city_zh?: string | null;
  asn?: { value: number | string; confidence?: number }; as_name?: { value: string; confidence?: number };
  ip_range?: { value: string; confidence?: number };
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

// HttpReply 错误解析:信封键映射与 parseErr 一致(retry_after→retryAfter);
// 非 JSON 错误体(HTML 网关页等)无 statusText 可用 → message 兜底 "HTTP {status}"
function errFromReply(r: HttpReply): SourceSection {
  let body: any = null;
  try { body = JSON.parse(r.body); } catch { /* 非 JSON 错误体 */ }
  return errSection(r.status, body?.error?.code, body?.error?.message ?? `HTTP ${r.status}`, body?.error?.retry_after);
}

const VERDICT_CODES: readonly VerdictCode[] = ["malicious", "suspicious", "benign"];

export const ipradarSource: QuerySource = {
  id: "ipradar", label: "IP Radar",
  claimsOf(sec) {
    if (sec.status !== "ok") return undefined;
    const d = sec.data as LookupResult;
    const v = d.threat?.verdict;
    const code = VERDICT_CODES.includes(v as VerdictCode) ? (v as VerdictCode) : undefined;
    return {
      verdict: code ? { code, value: d.threat?.confidence } : undefined,
      country: d.country?.value?.trim().toUpperCase(),
      reserved: !!d.is_reserved,
    };
  },
  async query(ip, s) {
    const base = s.serverUrl.replace(/\/+$/, "");
    // 池化 GET:15s 超时由 Rust 侧 CLIENT 兜底(此处无需 AbortSignal);非 2xx 不是
    // invoke 错误 —— status+body 原样回,由 errFromReply 分支出错误段
    const r = await invoke<HttpReply>("http_get", {
      url: `${base}/api/lookup/${ip}`,
      headers: authHeaders(s), // 无 key 时传空对象,Rust 端不构造 Authorization
    });
    if (r.status < 200 || r.status >= 300) return errFromReply(r);
    return { sourceId: "ipradar", status: "ok", data: JSON.parse(r.body) };
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
