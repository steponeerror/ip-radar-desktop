import { memoryStorage } from "./memory-storage";
import { it, expect, vi, afterEach } from "vitest";
import { initialState, type State } from "../model";
afterEach(() => vi.unstubAllGlobals());
it("background persists batches, survives UI closure, cancels safely, resumes pending work, and preserves settings", async () => {
  let state: State = {
    ...initialState(),
    settings: {
      ...initialState().settings,
      radarEnabled: true,
      abuseKey: "test",
    },
  };
  let listener: Function = () => {};
  let alarm: Function = () => {};
  let completeFetch: (() => void) | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init: RequestInit) => {
      if (!_url.includes("abuseipdb")) {
        const ips = JSON.parse(init.body as string).ips as string[];
        return Promise.resolve(
          new Response(
            ips
              .map((ip) =>
                JSON.stringify({
                  type: "row",
                  result: { ip, country: { value: "HK" } },
                }),
              )
              .join("\n") + '\n{"type":"done"}\n',
          ),
        );
      }
      return new Promise<Response>((resolve, reject) => {
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
      });
    }),
  );
  const storage = memoryStorage(state, (next) => {
    state = next;
  });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (f: Function) => (listener = f) },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    storage: {
      local: storage.local,
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
  expect(state.batches[0].rows[1].radarCountry).toBe("HK");
  expect(state.batches[0].rows[1].sections?.map((s) => s.sourceId)).toEqual([
    "ipradar",
  ]);
  expect(state.batches[0].sourceIds).toEqual(["ipradar", "abuseipdb"]);
  expect(state.batches[0].rows[1].errors).toContain("已停止，未完成查詢");
  // Simulate a saved pending batch after worker suspension; an alarm picks it up.
  await vi.waitFor(() => expect(chrome.alarms.clear).toHaveBeenCalled());
  state.batches.unshift({
    id: "recovered",
    createdAt: new Date().toISOString(),
    rows: [{ ip: "9.9.9.9", queriedAt: "", status: "pending", errors: [] }],
  });
  storage.restore(state);
  completeFetch = undefined;
  alarm({ name: "resume" });
  await vi.waitFor(() => expect(completeFetch).toBeTypeOf("function"));
  completeFetch!();
  await vi.waitFor(() => expect(state.batches[0].rows[0].status).toBe("done"));
  await command("delete", { id: "recovered" });
  expect(state.batches.some((b) => b.id === "recovered")).toBe(false);
});
