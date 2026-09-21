import { describe, test, expect } from "vitest";
import { DEFAULT_SETTINGS, mergeSettings } from "../settings";

describe("settings", () => {
  test("默认值", () => {
    expect(DEFAULT_SETTINGS.serverUrl).toBe("http://127.0.0.1:8000");
    expect(DEFAULT_SETTINGS.maxIps).toBe(100);
    expect(DEFAULT_SETTINGS.hotkey).toBe("CmdOrCtrl+Alt+I");
    expect(DEFAULT_SETTINGS.sourceEnabled).toEqual({ ipradar: true, abuseipdb: true });
  });
  test("存量部分字段合并默认值(升级兼容)", () => {
    expect(mergeSettings({ maxIps: 50 })).toEqual({ ...DEFAULT_SETTINGS, maxIps: 50 });
  });
  test("sourceEnabled 局部覆盖不丢默认键", () => {
    expect(mergeSettings({ sourceEnabled: { ipradar: false } }).sourceEnabled).toEqual({
      ipradar: false,
      abuseipdb: true,
    });
  });
  test("null/undefined 入参回默认", () => {
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });
});
