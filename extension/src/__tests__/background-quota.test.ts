import { memoryStorage } from "./memory-storage";
import { afterEach, expect, it, vi } from "vitest";
import { initialState, type State } from "../model";
import { abuseKeyId } from "../abuse-limits";
afterEach(() => vi.unstubAllGlobals());

it("persists cooldown across worker restarts, isolates keys, and leaves Radar running", async () => {
  let state: State = initialState();
  state.settings.abuseKey = "key-a";
  let listener: Function = () => {};
  const clear = vi.fn(async () => true);
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (!url.includes("abuseipdb")) {
      const ips: string[] = JSON.parse(init.body as string).ips;
      return new Response(
        ips
          .map((ip) => JSON.stringify({ type: "row", result: { ip } }))
          .join("\n") + '\n{"type":"done"}\n',
      );
    }
    const key = (init.headers as Record<string, string>).Key;
    if (key === "key-a")
      return new Response(
        JSON.stringify({
          errors: [{ status: 429, detail: "Daily quota exhausted" }],
        }),
        {
          status: 429,
          headers: {
            "Retry-After": "3600",
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Limit": "1000",
            "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + 3600),
          },
        },
      );
    return new Response(
      JSON.stringify({ data: { abuseConfidenceScore: 10 } }),
      {
        headers: { "X-RateLimit-Remaining": "99", "X-RateLimit-Limit": "100" },
      },
    );
  });
  vi.stubGlobal("fetch", fetch);
  const storage = memoryStorage(state, (next) => {
    state = next;
  });
  vi.stubGlobal("chrome", {
    storage: {
      local: storage.local,
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
    alarms: { create: vi.fn(), clear, onAlarm: { addListener: vi.fn() } },
    action: { setPopup: vi.fn(), onClicked: { addListener: vi.fn() } },
  });
  await import("../background");
  const command = (type: string, data = {}) =>
    new Promise<any>((resolve) =>
      listener(
        { type, ...data },
        { id: "test", url: "chrome-extension://test/index.html" },
        resolve,
      ),
    );
  const run = async (finished: number, text = "1.1.1.1 8.8.8.8") => {
    expect((await command("start", { text })).error).toBeUndefined();
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(finished));
  };
  await run(1);
  const idA = await abuseKeyId("key-a");
  expect(state.abuseLimits![idA]).toMatchObject({
    remaining: 0,
    limit: 1000,
    reason: "quota",
  });
  expect(
    state.batches[0].rows.every((row) =>
      row.sections?.some((s) => s.sourceId === "ipradar" && s.status === "ok"),
    ),
  ).toBe(true);
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("abuseipdb")),
  ).toHaveLength(1);
  // Re-import the worker: only persisted browser storage survives.
  vi.resetModules();
  await import("../background");
  await run(2);
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("abuseipdb")),
  ).toHaveLength(1);
  await command("settings", { patch: { abuseKey: "key-b" } });
  await run(3, "9.9.9.9");
  expect(state.abuseLimits![await abuseKeyId("key-b")].remaining).toBe(99);
  await command("settings", { patch: { abuseKey: "key-a" } });
  await run(4);
  expect(
    fetch.mock.calls.filter(([url]) => url.includes("abuseipdb")),
  ).toHaveLength(2);
  expect(JSON.stringify(state.batches)).not.toContain("key-a");
  expect(JSON.stringify(state.abuseLimits)).not.toContain("key-a");
});
