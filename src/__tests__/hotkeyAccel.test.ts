import { describe, test, expect } from "vitest";
import { buildAccel } from "../hotkeyAccel";

const ev = (key: string, mods: Partial<{
  ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean;
}> = {}) => ({
  ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, key, ...mods,
});

describe("buildAccel", () => {
  test("Ctrl/Cmd 归一为 CmdOrCtrl,字母大写", () => {
    expect(buildAccel(ev("i", { ctrlKey: true, altKey: true }))).toBe("CmdOrCtrl+Alt+I");
    expect(buildAccel(ev("i", { metaKey: true, altKey: true }))).toBe("CmdOrCtrl+Alt+I");
  });
  test("F 键与数字键位原样保留", () => {
    expect(buildAccel(ev("F5", { ctrlKey: true }))).toBe("CmdOrCtrl+F5");
    expect(buildAccel(ev("1", { altKey: true }))).toBe("Alt+1");
  });
  test("无修饰键 / 修饰键单按 / 非法键位 → null", () => {
    expect(buildAccel(ev("i"))).toBeNull();
    expect(buildAccel(ev("Shift", { shiftKey: true }))).toBeNull();
    expect(buildAccel(ev("Tab", { ctrlKey: true }))).toBeNull();
  });
  test("完整修饰序 CmdOrCtrl+Alt+Shift+K", () => {
    expect(buildAccel(ev("k", { ctrlKey: true, altKey: true, shiftKey: true })))
      .toBe("CmdOrCtrl+Alt+Shift+K");
  });
});
