import { describe, test, expect, vi, afterEach } from "vitest";
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
import { fetch as tf } from "@tauri-apps/plugin-http";
import { ipradarSource } from "../sources/ipradar";
import { DEFAULT_SETTINGS } from "../settings";

const S = { ...DEFAULT_SETTINGS, ipradarKey: "k1" };
const okResult = { ip: "1.1.1.1", threat: { verdict: "benign", confidence: 0, types: [], is_cdn: false } };

// fake timers 只影响 idle 看门狗/退避,真实计时器在 afterEach 统一还原
afterEach(() => vi.useRealTimers());

describe("ipradar 源", () => {
  test("单查 GET + Bearer", async () => {
    (tf as any).mockResolvedValueOnce(json(200, okResult));
    const sec = await ipradarSource.query("1.1.1.1", S);
    expect((tf as any).mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/lookup/1.1.1.1");
    expect((tf as any).mock.calls[0][1].headers.Authorization).toBe("Bearer k1");
    expect(sec).toEqual({ sourceId: "ipradar", status: "ok", data: okResult });
  });

  test("无 key 照发(旧 server 兼容)", async () => {
    (tf as any).mockResolvedValueOnce(json(200, okResult));
    await ipradarSource.query("1.1.1.1", DEFAULT_SETTINGS);
    expect((tf as any).mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  test("401 → error.status 401(引导层识别)", async () => {
    (tf as any).mockResolvedValueOnce(json(401, { error: { code: "", message: "unauthorized" } }));
    const sec = await ipradarSource.query("1.1.1.1", S);
    expect(sec.status).toBe("error");
    expect(sec.error?.status).toBe(401);
  });

  test("queryMany NDJSON:row 事件按 idx 聚齐,断流(done 未到)报错", async () => {
    const stream = ndjson([
      { type: "start", total: 2 },
      { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } },
      { type: "row", idx: 0, result: okResult },
    ]); // 无 done —— Review Focus 4
    (tf as any).mockResolvedValueOnce(resp(200, stream));
    const got: string[] = [];
    await expect(async () => {
      for await (const { ip } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) got.push(ip);
    }).rejects.toThrow(/stream ended|done/);
    expect(got).toEqual(["2.2.2.2", "1.1.1.1"]); // 收到的照发,但整体 reject
  });

  test("queryMany POST 端点 + body + Bearer", async () => {
    (tf as any).mockResolvedValueOnce(resp(200, ndjson([
      { type: "start", total: 1 },
      { type: "row", idx: 0, result: okResult },
      { type: "done", invalid_lines: 0 },
    ])));
    const got: string[] = [];
    for await (const { ip } of ipradarSource.queryMany!(["1.1.1.1"], S)) got.push(ip);
    expect(got).toEqual(["1.1.1.1"]);
    expect((tf as any).mock.calls[0][0]).toBe("http://127.0.0.1:8000/api/query/stream");
    expect((tf as any).mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse((tf as any).mock.calls[0][1].body)).toEqual({ ips: ["1.1.1.1"] });
    expect((tf as any).mock.calls[0][1].headers.Authorization).toBe("Bearer k1");
  });

  test("错误信封透传 code/retry_after(warming 由 UI 层识别重发)", async () => {
    (tf as any).mockResolvedValueOnce(json(503, { error: { code: "warming", message: "warming up", retry_after: 30 } }));
    const sec = await ipradarSource.query("1.1.1.1", S);
    expect(sec.status).toBe("error");
    expect(sec.error?.code).toBe("warming");
    expect(sec.error?.retryAfter).toBe(30);
  });

  test("queryMany 非 2xx:错误段广播到每个 IP", async () => {
    (tf as any).mockResolvedValueOnce(json(401, { error: { code: "", message: "unauthorized" } }));
    const out: Array<[string, any]> = [];
    for await (const { ip, section } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) {
      out.push([ip, section]);
    }
    expect(out).toHaveLength(2);
    expect(out.every(([, s]) => s.status === "error" && s.error?.status === 401)).toBe(true);
  });

  test("I2:块间隔 5s(<15s idle)的慢流照常完成", async () => {
    vi.useFakeTimers();
    const chunk1 = ndjson([{ type: "start", total: 2 }, { type: "row", idx: 0, result: okResult }]);
    const chunk2 = ndjson([
      { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } },
      { type: "done", invalid_lines: 0 },
    ]);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(chunk1));
        setTimeout(() => { c.enqueue(enc.encode(chunk2)); c.close(); }, 5_000);
      },
    });
    (tf as any).mockResolvedValueOnce(new Response(stream, { status: 200 }));
    const it = ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)[Symbol.asyncIterator]();
    const r1 = await it.next();          // chunk1 已缓冲,立即返回
    expect(r1.value!.ip).toBe("1.1.1.1");
    const p2 = it.next();                // 等待 chunk2(fake timer 控制)
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await p2).value!.ip).toBe("2.2.2.2");
    expect((await it.next()).done).toBe(true);
  });

  test("I2:块永不到达 → 15s 内以 idle 超时拒绝(而非全身超时)", async () => {
    vi.useFakeTimers();
    const chunk1 = ndjson([{ type: "start", total: 2 }, { type: "row", idx: 0, result: okResult }]);
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(chunk1));
        // 永不 close、不再 enqueue —— 看门狗应在 15s 时触发
      },
    });
    (tf as any).mockResolvedValueOnce(new Response(stream, { status: 200 }));
    const it = ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)[Symbol.asyncIterator]();
    expect((await it.next()).value!.ip).toBe("1.1.1.1");
    const p = it.next();
    const assertion = expect(p).rejects.toThrow(/idle/);
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  test("R5:done.invalid_lines>0 → 末段携带 invalidLines", async () => {
    (tf as any).mockResolvedValueOnce(resp(200, ndjson([
      { type: "start", total: 2 },
      { type: "row", idx: 0, result: okResult },
      { type: "row", idx: 1, result: { ...okResult, ip: "2.2.2.2" } },
      { type: "done", invalid_lines: 3 },
    ])));
    const sections: any[] = [];
    for await (const { section } of ipradarSource.queryMany!(["1.1.1.1", "2.2.2.2"], S)) {
      sections.push(section);
    }
    expect(sections).toHaveLength(2);
    expect(sections[0].invalidLines).toBeUndefined();
    expect(sections[1].invalidLines).toBe(3);
  });
});

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status }); }
function resp(status: number, body: string) { return new Response(body, { status }); }
function ndjson(evs: unknown[]) { return evs.map(e => JSON.stringify(e)).join("\n") + "\n"; }
