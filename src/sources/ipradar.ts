// ipradar 源:自托管 server 的查询客户端。
// 多 IP 走 POST /api/query/stream(NDJSON,行事件随 chunk 到达逐步 yield),经
// invoke("http_stream") 走 Rust 侧池化 STREAM_CLIENT(启动预热共享,免每查询
// 冷启动 DNS+TCP+TLS),chunk 经 Channel 流入。完结信号 = Rust 在全部块之后补发的
// End 帧(与块同通道,index 全序):Channel 投递(eval/内嵌 fetch)与 invoke 返回
// (IPC 应答)是两条无序传输路径,以 invoke resolve 收尾会丢竞态中晚到的末块。
// 鉴权:有 key 则带 Authorization: Bearer;无 key 照发(旧版 server 放行,新版 401 由 UI 引导)。
// warming(503 + error.code==="warming")只透传 code,重发轮询归 UI 层 —— 源保持无状态。
import { Channel, invoke } from "@tauri-apps/api/core";
import type { QuerySource, SourceSection, Settings, VerdictCode } from "./_types";

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

// invoke("http_stream") 的返回(与 Rust HttpReply 对齐):非 2xx 时 body 是
// server 错误信封 JSON(零 chunk);2xx 流尽后 body 恒空。
interface HttpReply { status: number; body: string }

function errFromReply(r: HttpReply): SourceSection {
  let env: any = null;
  try { env = JSON.parse(r.body); } catch { /* 非 JSON 信封(网关裸页等),裸 status 兜底 */ }
  return errSection(r.status, env?.error?.code, env?.error?.message ?? `HTTP ${r.status}`, env?.error?.retry_after);
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
  async *queryMany(ips, s) {
    const base = s.serverUrl.replace(/\/+$/, "");
    // invoke 不可中止,无 AbortController;被新查询取代的残留流由 App 的 epoch
    // 丢弃兜底(调度器照常消费完整个流,UI 层不认旧结果),不另造取消机制。
    // 连接期 15s 超时在 Rust 侧 STREAM_CLIENT 的 connect_timeout 兜底。
    // 事件队列(块帧 / End 帧 / invoke 返回 / 传输层错误)按到达序消费:
    // ①块间顺序由 Channel index 保序;②完结只认 End 帧 —— invoke 2xx 返回与块
    // 投递无序(双传输路径),仅当回执丢弃;非 2xx 返回零帧,信封在返回值里
    // (此时它就是终态信号);③传输层错误(Err)先于 End 帧,照常抛。
    type Ev = { t: "chunk"; data: number[] } | { t: "end"; r: HttpReply } | { t: "err"; e: unknown };
    const queue: Ev[] = [];
    let wake: (() => void) | null = null;
    const push = (ev: Ev) => { queue.push(ev); const w = wake; wake = null; w?.(); };
    // Rust StreamFrame 的 JS 对应物(serde tag="t",变体名小写化)
    type Frame = { t: "chunk"; data: number[] } | { t: "end"; status: number };
    const channel = new Channel<Frame>();
    channel.onmessage = f =>
      push(f.t === "chunk" ? { t: "chunk", data: f.data } : { t: "end", r: { status: f.status, body: "" } });
    invoke<HttpReply>("http_stream", {
      url: `${base}/api/query/stream`,
      headers: { "Content-Type": "application/json", ...authHeaders(s) },
      body: JSON.stringify({ ips }),
      onChunk: channel,
    }).then(
      // 2xx 返回值:流完结由 End 帧负责,这里只当传输层回执丢弃(可能先于末帧到);
      // 非 2xx:零帧,信封就在返回值里 —— 终态信号。End 帧极端丢失(webview 已死)
      // 由 15s idle 看门狗兜底。
      r => { if (r.status >= 300) push({ t: "end", r }); },
      e => push({ t: "err", e }),
    );
    // 每块 15s 空闲看门狗(块间重置):100 IP 慢流只要还在吐数据就不算超时
    // (idle 语义,对齐 server 前端 120s idle 的精神),从 chunk 间隔驱动。
    const nextEv = (): Promise<Ev> => {
      const head = queue.shift();
      if (head) return Promise.resolve(head);
      return new Promise<Ev>((resolve, reject) => {
        const timer = setTimeout(
          () => { wake = null; reject(new Error("idle timeout (15s without stream data)")); },
          15_000,
        );
        wake = () => { clearTimeout(timer); resolve(queue.shift()!); };
      });
    };
    const dec = new TextDecoder();
    let buf = "";
    let sawDone = false;
    // done.invalid_lines 回填在末段(R5):scheduler 按引用入 map,
    // done 事件必然晚于全部 row 事件,消费完成后 UI 才渲染 —— 事后补字段安全
    let lastSection: SourceSection | null = null;
    let reply: HttpReply | undefined;
    while (true) {
      const ev = await nextEv();
      if (ev.t === "err") throw ev.e;
      if (ev.t === "end") { reply = ev.r; break; }
      buf += dec.decode(new Uint8Array(ev.data), { stream: true });
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
    // 非 2xx:命令零 chunk,body 是错误信封 → 转该源每 IP 单错 section
    // (warming 503 的 error.code 原样透传,UI 靠它起预热轮询)
    if (reply!.status >= 300) { yield* singleErr(errFromReply(reply!), ips); return; }
    if (!sawDone) throw new Error("stream ended before done");
  },
};

async function* singleErr(sec: SourceSection, ips: string[]) {
  for (const ip of ips) yield { ip, section: sec };
}

export default ipradarSource;
