import { describe, test, expect } from "vitest";
import { nextPollDelay } from "../warming";

describe("nextPollDelay — warming 重查退避(5s 起 ×2 增长,30s 封顶)", () => {
  test("5s → 10s", () => {
    expect(nextPollDelay(5000)).toBe(10000);
  });
  test("16s → 30s(封顶)", () => {
    expect(nextPollDelay(16000)).toBe(30000);
  });
  test("30s → 30s(已封顶保持)", () => {
    expect(nextPollDelay(30000)).toBe(30000);
  });
});
