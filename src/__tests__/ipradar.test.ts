import { describe, test, expect, vi, afterEach } from "vitest";
// queryMany 流式走 invoke("http_stream") + Channel(均出 @tauri-apps/api/core):
// mock 该模块 —— invoke 捕获 onChunk(假 Channel,onmessage 由测试手工触发),
// chunk 流与 HttpReply 回复全在测试手里,场景对齐旧 plugin-http fetch mock。
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
  Channel: class { onmessage: ((data: number[]) => void) | null = null; },
}));
import { invoke } from "@tauri-apps/api/core";
import { ipradarSource } from "../sources/ipradar";
import { DEFAULT_SETTINGS } from "../settings";

const S = { ...DEFAULT_SETTINGS, ipradarKey: "k1" };
const okResult = { ip: "1.1.1.1", threat: { verdict: "benign", confidence: 0, types: [], is_cdn: false } };

// 接管一次 http_stream:invoke 挂起待 reply;channel.onmessage 由测试推 chunk。
// ready 在 mock 实参到手后兑现(chunk 必须等 channel 捕获后才能推)。
function mockStream() {
  let chan: { onmessage: ((d: number[]) => void) | null } | null = null;
  let reply!: (r: { status: number; body: string }) => void;
  let onReady!: () => void;
  const ready = new Promise<void>(r => { onReady = r; });
  (invoke as any).mockImplementationOnce((_cmd: string, args: any) => {
    chan = args.onChunk;
    onReady();
    return new Promise(res => { reply = res; });
  });
  return {
    ready,
    chunk(s: string) { chan!.onmessage!(Array.from(new TextEncoder().encode(s))); },
    reply(r: { status: number; body: string }) { reply(r); },
  };
}

// fake timers 只影响 idle 看门狗/退避,真实计时器在 afterEach 统一还原
afterEach(() => vi.useRealTimers());

describe("ipradar 源", () => {
  test("queryMany NDJSON:row 事件按 idx 聚齐,断流(done 未到)报错", async () => {
    const fx = mockStream();
    const got: string[] = [];
    const p = (async () => {
      for await (const { ip } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) got.push(ip);
    })();
    await fx.ready;
    fx.chunk(ndjson([{ type: "start", total: 2 }, { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } }]));
    fx.chunk(ndjson([{ type: "row", idx: 0, result: okResult }])); // 无 done —— Review Focus 4
    fx.reply({ status: 200, body: "" });
    await expect(p).rejects.toThrow(/stream ended|done/);
    expect(got).toEqual(["2.2.2.2", "1.1.1.1"]); // 收到的照发,但整体 reject
  });

  test("queryMany invoke 参数:POST 流端点 + body + Bearer", async () => {
    const fx = mockStream();
    const got: string[] = [];
    const p = (async () => {
      for await (const { ip } of ipradarSource.queryMany!(["1.1.1.1"], S)) got.push(ip);
    })();
    await fx.ready;
    fx.chunk(ndjson([{ type: "row", idx: 0, result: okResult }, { type: "done", invalid_lines: 0 }]));
    fx.reply({ status: 200, body: "" });
    await p;
    expect(got).toEqual(["1.1.1.1"]);
    // 命令恒 POST(Rust 侧固定),前端断言:命令名/URL/body/鉴权头
    expect((invoke as any).mock.calls[0][0]).toBe("http_stream");
    expect((invoke as any).mock.calls[0][1].url).toBe("http://127.0.0.1:8000/api/query/stream");
    expect(JSON.parse((invoke as any).mock.calls[0][1].body)).toEqual({ ips: ["1.1.1.1"] });
    expect((invoke as any).mock.calls[0][1].headers.Authorization).toBe("Bearer k1");
    expect((invoke as any).mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
  });

  test("queryMany 非 2xx:零 chunk,错误段广播到每个 IP", async () => {
    const fx = mockStream();
    const out: Array<[string, any]> = [];
    const p = (async () => {
      for await (const { ip, section } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) out.push([ip, section]);
    })();
    await fx.ready;
    fx.reply({ status: 401, body: JSON.stringify({ error: { code: "", message: "unauthorized" } }) });
    await p;
    expect(out).toHaveLength(2);
    expect(out.every(([, s]) => s.status === "error" && s.error?.status === 401)).toBe(true);
  });

  test("queryMany warming:503 + error.code=warming 透传 code", async () => {
    const fx = mockStream();
    const out: Array<[string, any]> = [];
    const p = (async () => {
      for await (const { ip, section } of ipradarSource.queryMany!(["1.1.1.1"], S)) out.push([ip, section]);
    })();
    await fx.ready;
    fx.reply({ status: 503, body: JSON.stringify({ error: { code: "warming", message: "db warming up" } }) });
    await p;
    expect(out).toHaveLength(1);
    expect(out[0][1].status).toBe("error");
    expect(out[0][1].error.code).toBe("warming"); // UI 靠它起预热轮询
  });

  test("I2:块间隔 5s(<15s idle)的慢流照常完成", async () => {
    vi.useFakeTimers();
    const fx = mockStream();
    const it = ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)[Symbol.asyncIterator]();
    const n1 = it.next(); // 发起 invoke 并挂起等第一块
    fx.chunk(ndjson([{ type: "start", total: 2 }, { type: "row", idx: 0, result: okResult }]));
    expect((await n1).value!.ip).toBe("1.1.1.1"); // chunk1 已缓冲,立即返回
    setTimeout(() => { // 5s 后才来第二块(fake timer 控制)
      fx.chunk(ndjson([
        { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } },
        { type: "done", invalid_lines: 0 },
      ]));
      fx.reply({ status: 200, body: "" });
    }, 5_000);
    const n2 = it.next(); // 等待 chunk2(fake timer 控制)
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await n2).value!.ip).toBe("2.2.2.2");
    expect((await it.next()).done).toBe(true);
  });

  test("I2:块永不到达 → 15s 内以 idle 超时拒绝(而非全身超时)", async () => {
    vi.useFakeTimers();
    const fx = mockStream();
    const it = ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)[Symbol.asyncIterator]();
    const n1 = it.next();
    fx.chunk(ndjson([{ type: "start", total: 2 }, { type: "row", idx: 0, result: okResult }]));
    expect((await n1).value!.ip).toBe("1.1.1.1");
    const p = it.next(); // 永无下一块、invoke 不 resolve —— 看门狗应在 15s 时触发
    const assertion = expect(p).rejects.toThrow(/idle/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  test("R5:多 chunk 多行,done.invalid_lines>0 → 末段携带 invalidLines", async () => {
    const fx = mockStream();
    const sections: any[] = [];
    const p = (async () => {
      for await (const { section } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) sections.push(section);
    })();
    await fx.ready;
    fx.chunk(ndjson([{ type: "start", total: 2 }, { type: "row", idx: 0, result: okResult }]));
    fx.chunk(ndjson([
      { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } },
      { type: "done", invalid_lines: 3 },
    ]));
    fx.reply({ status: 200, body: "" });
    await p;
    expect(sections).toHaveLength(2);
    expect(sections[0].invalidLines).toBeUndefined();
    expect(sections[1].invalidLines).toBe(3);
  });
});

function ndjson(evs: unknown[]) { return evs.map(e => JSON.stringify(e)).join("\n") + "\n"; }
