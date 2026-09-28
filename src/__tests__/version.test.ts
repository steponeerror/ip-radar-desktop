// 版本比较纯函数:钉住「数字段比较」语义,防字符串比较陷阱("0.1.10" < "0.1.9")。
import { describe, test, expect } from "vitest";
import { isNewerVersion, stripTag } from "../version";

describe("isNewerVersion", () => {
  test("数字段比较:0.1.10 > 0.1.9(字符串比较陷阱)", () => {
    expect(isNewerVersion("0.1.10", "0.1.9")).toBe(true);
  });

  test("去 v 前缀:v0.2.0 > 0.1.11", () => {
    expect(isNewerVersion("v0.2.0", "0.1.11")).toBe(true);
  });

  test("相等 → false(含去 v 前缀后相等)", () => {
    expect(isNewerVersion("0.1.11", "0.1.11")).toBe(false);
    expect(isNewerVersion("v0.1.11", "0.1.11")).toBe(false);
  });

  test("缺段补 0:0.1 vs 0.1.0 相等 → false", () => {
    expect(isNewerVersion("0.1", "0.1.0")).toBe(false);
    expect(isNewerVersion("0.2", "0.1.9")).toBe(true);
  });

  test("非数字段解析失败 → false", () => {
    expect(isNewerVersion("abc", "0.1.11")).toBe(false);
    expect(isNewerVersion("0.1.11", "abc")).toBe(false);
  });
});

describe("stripTag", () => {
  test("剥 v 前缀;无前缀原样(双 v 回归钉住)", () => {
    expect(stripTag("v0.1.12")).toBe("0.1.12");
    expect(stripTag("0.1.12")).toBe("0.1.12");
  });
});
