import { it, expect, vi, afterEach } from "vitest";
afterEach(() => vi.unstubAllGlobals());
// Firefox 没有 storage.local.setAccessLevel;initialize 必须跳过它并照常完成其余初始化。
// 独立文件:background 模块的监听注册副作用需要全新的模块注册表。
it("initialize survives without setAccessLevel (Firefox)", async () => {
  let onInstalled: Function = () => {};
  const setPopup = vi.fn();
  let state: Record<string, unknown> = {};
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: (f: Function) => (onInstalled = f) },
      onStartup: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: async () => state,
        set: async (v: Record<string, unknown>) => {
          state = v;
        },
        // 故意不提供 setAccessLevel
      },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
    action: { setPopup, onClicked: { addListener: vi.fn() } },
    tabs: { create: vi.fn() },
  });
  await import("../background");
  onInstalled();
  await vi.waitFor(() => expect(setPopup).toHaveBeenCalled());
  expect(setPopup).toHaveBeenCalledWith({ popup: "index.html?mode=popup" });
});
