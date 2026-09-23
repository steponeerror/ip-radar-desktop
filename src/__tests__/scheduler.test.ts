import { describe, test, expect } from "vitest";
import { runSources } from "../sources/_scheduler";
import type { QuerySource, SourceSection } from "../sources/_types";
import { DEFAULT_SETTINGS } from "../settings";

const S = DEFAULT_SETTINGS;

function section(sourceId: string, tag: string): SourceSection {
  return { sourceId, status: "ok", data: tag };
}

describe("runSources 调度器", () => {
  test("queryMany 源 + maxConcurrency:1 逐 IP 源:每 IP 两段、顺序 [A,B],B 全程不重叠", async () => {
    let bInFlight = false;
    let bOverlap = false;
    const bCalls: string[] = [];
    let releaseB!: () => void;
    const bGate = new Promise<void>(r => (releaseB = r));

    const srcA: QuerySource = {
      id: "a", label: "A",
      query: async () => { throw new Error("A uses queryMany"); },
      async *queryMany(ips) {
        for (const ip of ips) yield { ip, section: section("a", `row-${ip}`) };
      },
    };
    const srcB: QuerySource = {
      id: "b", label: "B", maxConcurrency: 1,
      query: async ip => {
        if (bInFlight) bOverlap = true;
        bInFlight = true;
        await bGate; // 等测试放出(A 的推送先完成,保证顺序确定性)
        bInFlight = false;
        bCalls.push(ip);
        return section("b", `one-${ip}`);
      },
    };

    const running = runSources(["1.1.1.1", "2.2.2.2"], [srcA, srcB], S);
    await new Promise(r => setTimeout(r, 0)); // 宏任务前 A 的微任务已全部排空,顺序确定
    releaseB();
    const out = await running;

    expect([...out.keys()]).toEqual(["1.1.1.1", "2.2.2.2"]);
    expect(out.get("1.1.1.1")).toEqual([section("a", "row-1.1.1.1"), section("b", "one-1.1.1.1")]);
    expect(out.get("2.2.2.2")).toEqual([section("a", "row-2.2.2.2"), section("b", "one-2.2.2.2")]);
    expect(bCalls).toEqual(["1.1.1.1", "2.2.2.2"]);
    expect(bOverlap).toBe(false);
  });

  test("sourceEnabled[id]===false 的源被过滤", async () => {
    const called: string[] = [];
    const src: QuerySource = {
      id: "off", label: "off",
      query: async ip => { called.push(ip); return section("off", ip); },
    };
    const out = await runSources(["1.1.1.1"], [src], { ...S, sourceEnabled: { off: false } });
    expect(called).toEqual([]);
    expect(out.get("1.1.1.1")).toEqual([]);
  });

  test("C1:query 源 transport 抛错 → 每 IP 得 error 段,runSources 正常 resolve", async () => {
    const src: QuerySource = {
      id: "x", label: "X",
      query: async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:8000"); },
    };
    const out = await runSources(["1.1.1.1", "2.2.2.2"], [src], S);
    expect(out.get("1.1.1.1")).toEqual([
      { sourceId: "x", status: "error", error: { message: "connect ECONNREFUSED 127.0.0.1:8000" } },
    ]);
    expect(out.get("2.2.2.2")!.length).toBe(1);
    expect(out.get("2.2.2.2")![0].status).toBe("error");
  });

  test("C1:queryMany 中途抛错 → 已产出保留,未产出 IP 补 error 段,无 unhandled rejection", async () => {
    const ok = section("m", "row-1");
    const src: QuerySource = {
      id: "m", label: "M",
      query: async () => { throw new Error("unreachable"); },
      async *queryMany() {
        yield { ip: "1.1.1.1", section: ok };
        throw new Error("mid-stream boom");
      },
    };
    const out = await runSources(["1.1.1.1", "2.2.2.2", "3.3.3.3"], [src], S);
    expect(out.get("1.1.1.1")).toEqual([ok]);
    expect(out.get("2.2.2.2")![0].error?.message).toBe("mid-stream boom");
    expect(out.get("3.3.3.3")![0].error?.message).toBe("mid-stream boom");
  });
});

describe("runSources onUpdate 渐进流入(v0.1.9 Task 1)", () => {
  test("① 流式源逐行到达时 onUpdate 被调用,快照逐步变大", async () => {
    const src: QuerySource = {
      id: "s", label: "S",
      query: async () => { throw new Error("unreachable"); },
      async *queryMany(ips) {
        for (const ip of ips) {
          yield { ip, section: section("s", `row-${ip}`) };
          await new Promise(r => setTimeout(r, 0)); // 行间宏任务隔开,快照边界确定
        }
      },
    };
    const snapshots: Map<string, SourceSection[]>[] = [];
    const countsAtEmit: number[] = [];
    const total = (m: Map<string, SourceSection[]>) => [...m.values()].reduce((n, a) => n + a.length, 0);
    await runSources(["1.1.1.1", "2.2.2.2", "3.3.3.3"], [src], S, m => {
      snapshots.push(m);
      countsAtEmit.push(total(m)); // 回调时刻测量(内层数组共享,事后读会看到后续追加)
    });
    expect(snapshots.length).toBe(3);
    expect(countsAtEmit).toEqual([1, 2, 3]); // 每行到达时订阅者看到的快照逐步变大
  });

  test("② 快照是外层克隆:完成后改返回 map 不影响已传出的快照", async () => {
    const src: QuerySource = { id: "c", label: "C", query: async ip => section("c", ip) };
    const snapshots: Map<string, SourceSection[]>[] = [];
    const out = await runSources(["1.1.1.1"], [src], S, m => snapshots.push(m));
    expect(snapshots.length).toBe(1);
    expect(snapshots[0]).not.toBe(out);        // 外层 Map 已克隆(React 重渲染的触发条件)
    out.set("9.9.9.9", []);
    expect(snapshots[0].has("9.9.9.9")).toBe(false);
    expect([...snapshots[0].keys()]).toEqual(["1.1.1.1"]);
  });

  test("③ query 抛错转 error section 同样触发 onUpdate", async () => {
    const src: QuerySource = {
      id: "e", label: "E",
      query: async () => { throw new Error("boom"); },
    };
    const snapshots: Map<string, SourceSection[]>[] = [];
    await runSources(["1.1.1.1", "2.2.2.2"], [src], S, m => snapshots.push(m));
    expect(snapshots.length).toBe(2);          // 每 IP 一个 error 段,逐个触发
    const last = snapshots[snapshots.length - 1];
    expect([...last.values()].flat().every(sec => sec.status === "error")).toBe(true);
  });
});
