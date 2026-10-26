import { describe, expect, it } from "vitest";
import { clipboardIpList, queryInputKey } from "../query-input";

describe("clipboard IP import", () => {
  it("accepts and deduplicates full IPv4 / IPv6 lists", () => {
    expect(
      clipboardIpList("205.210.31.175, 205.210.31.175\n[2001:db8::1];8.8.8.8"),
    ).toBe("205.210.31.175\n2001:db8::1\n8.8.8.8");
  });
  it.each([
    "",
    "  ",
    "複製 IP 1.1.1.1",
    "https://1.1.1.1",
    "1.1.1.1 password",
    "1.1.1.1 999.1.1.1",
    "2001:gg::1",
    "1.1.1.1/24",
    "1.1.1.1:80",
  ])("ignores non-IP or mixed content: %s", (value) => {
    expect(clipboardIpList(value)).toBeUndefined();
  });
});

describe("query keyboard shortcuts", () => {
  const event = {
    key: "Enter",
    code: "Enter",
    altKey: false,
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    keyCode: 13,
  };
  it("submits on Enter but not during IME composition", () => {
    expect(queryInputKey(event)).toBe("submit");
    expect(queryInputKey({ ...event, isComposing: true })).toBeUndefined();
    expect(queryInputKey({ ...event, keyCode: 229 })).toBeUndefined();
  });
  it("inserts a newline on Shift+Enter without submitting", () => {
    expect(queryInputKey({ ...event, shiftKey: true })).toBe("newline");
    expect(queryInputKey({ ...event, altKey: true })).toBeUndefined();
    expect(
      queryInputKey({ ...event, code: "NumpadEnter", shiftKey: true }),
    ).toBe("newline");
    expect(
      queryInputKey({ ...event, shiftKey: true, isComposing: true }),
    ).toBeUndefined();
    expect(
      queryInputKey({ ...event, key: " ", code: "Space", shiftKey: true }),
    ).toBeUndefined();
    expect(
      queryInputKey({ ...event, key: "\u00a0", code: "Space", shiftKey: true }),
    ).toBeUndefined();
  });
});
