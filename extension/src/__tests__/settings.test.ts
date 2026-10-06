import { it, expect, vi, afterEach } from "vitest";
import { initialState, type State } from "../model";
afterEach(() => vi.unstubAllGlobals());
it("autosaves partial input and serializes rapid patches without losing other settings", async () => {
  let stored: State = initialState();
  let listener: Function = () => {};
  const setPopup = vi.fn(async () => {});
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async () => ({ radarState: structuredClone(stored) }),
        set: async ({ radarState }: { radarState: State }) => {
          stored = structuredClone(radarState);
        },
      },
    },
    runtime: {
      id: "test",
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener: (fn: Function) => {
          listener = fn;
        },
      },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    action: { setPopup, onClicked: { addListener: vi.fn() } },
    alarms: { onAlarm: { addListener: vi.fn() } },
  });
  await import("../background");
  const command = (message: object) =>
    new Promise<any>((resolve) =>
      listener(
        message,
        { id: "test", url: "chrome-extension://test/index.html" },
        resolve,
      ),
    );
  const replies = await Promise.all([
    command({ type: "settings", patch: { serverUrl: "https://" } }),
    command({ type: "settings", patch: { radarKey: " example " } }),
    command({ type: "settings", patch: { theme: "light" } }),
    command({ type: "settings", patch: { openInTab: true } }),
  ]);
  expect(replies.every((r) => !r.error)).toBe(true);
  expect(stored.settings).toMatchObject({
    serverUrl: "https://",
    radarKey: "example",
    theme: "light",
    openInTab: true,
  });
  expect(setPopup).toHaveBeenCalledExactlyOnceWith({ popup: "" });
  expect(
    (await command({ type: "start", text: "1.1.1.1" })).error,
  ).toBeTruthy();
  expect(stored.batches).toHaveLength(0);
});
