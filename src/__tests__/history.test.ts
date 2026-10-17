// 查询历史纯函数:去重置顶 / FIFO 裁尾 / verdict+sections 回填 / 存档行数配额。
// load/save 沿 settings.ts store 模式不单测(仓内先例,见 src/__tests__/settings.test.ts 只测纯函数)。
import { describe, test, expect } from "vitest";
import {
  ARCHIVE_ROW_CAP,
  HISTORY_CAP,
  enforceArchiveCap,
  recordQuery,
  stampVerdicts,
  type HistoryEntry,
} from "../history";
import type { SourceSection } from "../sources/_types";

const ok = (data: unknown): SourceSection => ({ sourceId: "ipradar", status: "ok", data });

describe("recordQuery", () => {
  test("新条目插头", () => {
    const prev: HistoryEntry[] = [{ at: 1, ips: ["1.1.1.1"] }];
    const out = recordQuery(prev, ["8.8.8.8"]);
    expect(out).toHaveLength(2);
    expect(out[0].ips).toEqual(["8.8.8.8"]);
    expect(out[0].at).toBeGreaterThan(0);
    expect(out[1]).toEqual(prev[0]);
  });

  test("相同 IP 集合去重置顶(顺序不同算同集合,旧 verdicts 作废)", () => {
    const prev: HistoryEntry[] = [
      { at: 1, ips: ["1.1.1.1"] },
      { at: 2, ips: ["8.8.8.8", "1.1.1.1"], verdicts: { "1.1.1.1": "malicious" } },
    ];
    const out = recordQuery(prev, ["1.1.1.1", "8.8.8.8"]);
    expect(out).toHaveLength(2);
    expect(out[0].ips).toEqual(["1.1.1.1", "8.8.8.8"]); // 保输入顺序
    expect(out[0].at).toBeGreaterThan(2); // 置顶且刷新时间
    expect(out[0].verdicts).toBeUndefined(); // 重查未完成,不继承旧回填
    expect(out[1].ips).toEqual(["1.1.1.1"]);
  });

  test(`FIFO 超 ${HISTORY_CAP} 裁尾`, () => {
    const prev: HistoryEntry[] = Array.from({ length: HISTORY_CAP }, (_, i) => ({
      at: i,
      ips: [`10.0.0.${i}`],
    }));
    const out = recordQuery(prev, ["8.8.8.8"]);
    expect(out).toHaveLength(HISTORY_CAP);
    expect(out[0].ips).toEqual(["8.8.8.8"]);
    expect(out[out.length - 1].ips).toEqual([`10.0.0.${HISTORY_CAP - 2}`]); // 尾条被裁
  });

  test("空输入 → 原样返回(不记空集合条目)", () => {
    const prev: HistoryEntry[] = [{ at: 1, ips: ["1.1.1.1"] }];
    expect(recordQuery(prev, [])).toBe(prev);
    expect(recordQuery([], [])).toEqual([]);
  });
});

describe("stampVerdicts", () => {
  test("回填头部匹配条目,仅覆盖给出的键", () => {
    const prev: HistoryEntry[] = [
      { at: 2, ips: ["1.1.1.1", "8.8.8.8"], verdicts: { "1.1.1.1": "benign" } },
      { at: 1, ips: ["9.9.9.9"] },
    ];
    const out = stampVerdicts(prev, ["8.8.8.8", "1.1.1.1"], { "8.8.8.8": "suspicious" });
    expect(out[0].verdicts).toEqual({ "1.1.1.1": "benign", "8.8.8.8": "suspicious" });
    expect(out[1]).toEqual(prev[1]); // 其余条目不动
  });

  test("无匹配条目 → 原样返回", () => {
    const prev: HistoryEntry[] = [{ at: 1, ips: ["1.1.1.1"] }];
    expect(stampVerdicts(prev, ["9.9.9.9"], { "9.9.9.9": "malicious" })).toBe(prev);
  });

  test("空 ips → 原样返回", () => {
    const prev: HistoryEntry[] = [{ at: 1, ips: ["1.1.1.1"] }];
    expect(stampVerdicts(prev, [], { "1.1.1.1": "malicious" })).toBe(prev);
  });

  test("第四参 sections 随 verdicts 整份写入匹配条目", () => {
    const prev: HistoryEntry[] = [
      { at: 2, ips: ["1.1.1.1"] },
      { at: 1, ips: ["9.9.9.9"] },
    ];
    const sections = { "1.1.1.1": [ok({ score: 1 })] };
    const out = stampVerdicts(prev, ["1.1.1.1"], { "1.1.1.1": "malicious" }, sections);
    expect(out[0].sections).toEqual(sections);
    expect(out[0].verdicts).toEqual({ "1.1.1.1": "malicious" });
    expect(out[1].sections).toBeUndefined();
  });

  test("无第四参 → 已有 sections 原样保留", () => {
    const sections = { "1.1.1.1": [ok({ score: 1 })] };
    const prev: HistoryEntry[] = [{ at: 1, ips: ["1.1.1.1"], sections }];
    const out = stampVerdicts(prev, ["1.1.1.1"], { "1.1.1.1": "benign" });
    expect(out[0].sections).toBe(sections);
  });
});

describe("enforceArchiveCap(存档行数配额)", () => {
  const archived = (at: number, ips: string[], rows: number): HistoryEntry => ({
    at,
    ips,
    verdicts: Object.fromEntries(ips.map((ip) => [ip, "malicious" as const])),
    sections: Object.fromEntries(
      Array.from({ length: rows }, (_, i) => [`10.0.0.${i}`, [ok({ score: i })]]),
    ),
  });

  test(`ARCHIVE_ROW_CAP = 1000,单条 ${ARCHIVE_ROW_CAP} 行恰好保留,更老第二条整条降级`, () => {
    expect(ARCHIVE_ROW_CAP).toBe(1000);
    const entries = [archived(2, ["1.1.1.1"], ARCHIVE_ROW_CAP), archived(1, ["9.9.9.9"], 1)];
    const out = enforceArchiveCap(entries);
    expect(out[0].sections).toBeDefined(); // 恰好用满预算:保留
    expect(Object.keys(out[0].sections!)).toHaveLength(ARCHIVE_ROW_CAP);
    expect(out[1].sections).toBeUndefined(); // 预算耗尽,更老整条剥
    expect(out[1].ips).toEqual(["9.9.9.9"]); // 条目保留
    expect(out[1].verdicts).toEqual({ "9.9.9.9": "malicious" }); // verdicts 保留
  });

  test("累计超额 → 最老存档条目降级,骨架条目与无 sections 条目不受影响", () => {
    const entries: HistoryEntry[] = [
      archived(4, ["1.1.1.1"], 600),
      archived(3, ["2.2.2.2"], 400), // 恰好累计 1000
      archived(2, ["3.3.3.3"], 1), // 超额 → 降级
      { at: 1, ips: ["4.4.4.4"], verdicts: { "4.4.4.4": "suspicious" } }, // 骨架,不动
    ];
    const out = enforceArchiveCap(entries);
    expect(out[0].sections).toBeDefined();
    expect(out[1].sections).toBeDefined();
    expect(out[2].sections).toBeUndefined();
    expect(out[2].verdicts).toEqual({ "3.3.3.3": "malicious" });
    expect(out[3]).toEqual(entries[3]);
  });

  test("stampVerdicts 返回前收口:回填新存档挤出更老存档", () => {
    const entries: HistoryEntry[] = [
      { at: 2, ips: ["1.1.1.1"] },
      archived(1, ["9.9.9.9"], 1000),
    ];
    const sections = { "1.1.1.1": [ok({ score: 1 })] };
    const out = stampVerdicts(entries, ["1.1.1.1"], { "1.1.1.1": "malicious" }, sections);
    expect(out[0].sections).toEqual(sections);
    expect(out[1].sections).toBeUndefined(); // 1001 > 1000,老存档降级
    expect(out[1].verdicts).toEqual({ "9.9.9.9": "malicious" });
  });

  test("预算内不改动原条目引用", () => {
    const entries = [archived(1, ["1.1.1.1"], 10)];
    expect(enforceArchiveCap(entries)[0]).toBe(entries[0]);
  });
});
