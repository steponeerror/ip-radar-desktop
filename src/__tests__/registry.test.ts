import { describe, test, expect } from "vitest";
import { collectSources, getSources } from "../sources/registry";

describe("registry 契约", () => {
  test("好源通过", () => {
    const good = { id: "x", label: "X", query: async () => ({ sourceId: "x", status: "ok" }) };
    expect(collectSources({ "./x.ts": { default: good } })).toHaveLength(1);
  });
  test("缺 id 拒绝", () => {
    expect(() => collectSources({ "./bad.ts": { default: { label: "L", query: async () => ({ sourceId: "", status: "ok" }) } } }))
      .toThrow(/bad/);
  });
  test("缺 query 拒绝", () => {
    expect(() => collectSources({ "./bad2.ts": { default: { id: "b2", label: "L" } } })).toThrow(/bad2/);
  });
  test("_ 前缀文件跳过", () => {
    expect(collectSources({ "./_types.ts": { default: {} } })).toHaveLength(0);
  });
  // 真实 glob 回归(Windows 白屏根因):sources/ 下所有非 _ 前缀模块必须是合法源,
  // 否则 getSources() 在 render 期 throw = 白屏。基础设施模块必须 _ 前缀。
  test("真实 glob:getSources 不 throw 且只返回合法源", () => {
    const sources = getSources();
    expect(sources.map(s => s.id)).toEqual(["abuseipdb", "ipradar"]);
  });
});
