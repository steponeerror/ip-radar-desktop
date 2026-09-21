import { describe, test, expect } from "vitest";
import { collectSources } from "../sources/registry";

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
});
