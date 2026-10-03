import { it, expect, vi, afterEach } from "vitest";
import { initialState, type State } from "../model";
afterEach(() => vi.unstubAllGlobals());
it("background persists batches, survives UI closure, cancels safely, resumes pending work, and preserves settings", async () => {
  let state: State = {
    ...initialState(),
    settings: {
      ...initialState().settings,
      radarEnabled: false,
      abuseKey: "test",
    },
  };
  let listener: Function = () => {};
  let alarm: Function = () => {};
  let completeFetch: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          completeFetch = () =>
            resolve(
              new Response(
                JSON.stringify({
                  data: { abuseConfidenceScore: 12, countryCode: "HK" },
                }),
              ),
            );
          init.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          );
        }),
    ),
  );
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (f: Function) => (listener = f) },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: async () => ({ radarState: structuredClone(state) }),
        set: async (value: { radarState: State }) => {
          state = structuredClone(value.radarState);
        },
        setAccessLevel: vi.fn(),
      },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: (f: Function) => (alarm = f) },
    },
    action: { setPopup: vi.fn(), onClicked: { addListener: vi.fn() } },
    tabs: { create: vi.fn() },
  });
  await import("../background");
  const command = (type: string, data = {}) =>
    new Promise<any>((resolve) =>
      listener(
        { type, ...data },
        { id: "test", url: "chrome-extension://test/index.html?mode=popup" },
        resolve,
      ),
    );
  expect(
    (await command("start", { text: "1.1.1.1 8.8.8.8" })).error,
  ).toBeUndefined();
  await vi.waitFor(() => expect(completeFetch).toBeTypeOf("function"));
  expect((await command("start", { text: "9.9.9.9" })).error).toContain(
    "已有批次",
  );
  await command("settings", {
    settings: { ...state.settings, theme: "light" },
  });
  completeFetch!();
  completeFetch = undefined;
  await vi.waitFor(() => expect(state.batches[0].rows[0].score).toBe(12));
  await vi.waitFor(() => expect(completeFetch).toBeTypeOf("function"));
  expect(state.settings.theme).toBe("light");
  await command("cancel");
  await vi.waitFor(() => expect(state.batches[0].cancelled).toBe(true));
  expect(state.batches[0].rows[0].score).toBe(12);
  expect(state.batches[0].rows[1].errors).toContain("已停止，未完成查詢");
  // Simulate a saved pending batch after worker suspension; an alarm picks it up.
  await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalled());
  state.batches.unshift({
    id: "recovered",
    createdAt: new Date().toISOString(),
    rows: [{ ip: "9.9.9.9", queriedAt: "", status: "pending", errors: [] }],
  });
  completeFetch = undefined;
  alarm({ name: "resume" });
  await vi.waitFor(() => expect(completeFetch).toBeTypeOf("function"));
  completeFetch!();
  await vi.waitFor(() => expect(state.batches[0].rows[0].status).toBe("done"));
  await command("delete", { id: "recovered" });
  expect(state.batches.some((b) => b.id === "recovered")).toBe(false);
});
