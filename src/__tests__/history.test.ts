// 查询历史纯函数:去重置顶 / FIFO 裁尾 / verdict 回填。load/save 沿 settings.ts
// store 模式不单测(仓内先例,见 src/__tests__/settings.test.ts 只测纯函数)。
import { describe, test, expect } from "vitest";
import { HISTORY_CAP, recordQuery, stampVerdicts, type HistoryEntry } from "../history";

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
});
