import { describe, test, expect } from "vitest";
import { runSources } from "../sources/scheduler";
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
});
