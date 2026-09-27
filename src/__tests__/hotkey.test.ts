// 划词热键载荷路由(Task 3):纯函数 routeHotkey 全分支。
// 契约 = Rust HotkeyCapture 序列化形状(selected/reason 一一对应)。
import { describe, test, expect } from "vitest";
import { routeHotkey } from "../hotkey";

describe("routeHotkey 热键路由", () => {
  test("captured 带文本 → dispatch 该文本", () => {
    expect(routeHotkey({ selected: "1.2.3.4 hi", reason: "captured" }))
      .toEqual({ action: "dispatch", text: "1.2.3.4 hi" });
  });

  test("captured 但 selected 为 null → dispatch 空串(走 noIpHint,不查剪贴板)", () => {
    expect(routeHotkey({ selected: null, reason: "captured" })).toEqual({ action: "dispatch", text: "" });
  });

  test("clipboard-fallback → 读剪贴板", () => {
    expect(routeHotkey({ selected: null, reason: "clipboard-fallback" })).toEqual({ action: "clipboard" });
  });

  test("timeout → capture-failed(不查剪贴板)", () => {
    expect(routeHotkey({ selected: null, reason: "timeout" })).toEqual({ action: "capture-failed" });
  });

  test("non-text-clipboard → capture-failed(不查剪贴板)", () => {
    expect(routeHotkey({ selected: null, reason: "non-text-clipboard" })).toEqual({ action: "capture-failed" });
  });
});
