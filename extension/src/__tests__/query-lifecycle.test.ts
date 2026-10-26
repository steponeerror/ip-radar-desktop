import { afterEach, expect, it, vi } from "vitest";
import { queryBatch } from "../api";
import { defaults, type Row, activeBatch } from "../model";
import { indexSummaries } from "../storage";
const rows = (): Row[] =>
  ["1.1.1.1", "8.8.8.8"].map((ip) => ({
    ip,
    status: "pending",
    errors: [],
    queriedAt: "",
  }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("aborts Radar before returning a quota persistence error", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(c) {
              stream = c;
              init.signal.addEventListener("abort", () =>
                c.error(init.signal.reason),
              );
            },
          }),
        ),
    ),
  );
  const emit = vi.fn(async () => {});
  await expect(
    queryBatch(
      rows(),
      { ...defaults, abuseKey: "key" },
      new AbortController().signal,
      emit,
      {
        save: async () => {
          throw new Error("storage failure");
        },
      },
    ),
  ).rejects.toThrow("storage failure");
  expect(emit).not.toHaveBeenCalled();
  expect(() => stream.enqueue(new Uint8Array())).toThrow();
  expect(emit).not.toHaveBeenCalled();
});
it("paces actual request starts despite delayed quota persistence", async () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      starts.push(Date.now());
      return new Response(
        JSON.stringify({ data: { abuseConfidenceScore: 0 } }),
      );
    }),
  );
  let saves = 0;
  const task = queryBatch(
    rows(),
    { ...defaults, radarEnabled: false, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
    {
      save: async () => {
        if (++saves === 1) await new Promise((r) => setTimeout(r, 1200));
      },
    },
  );
  await vi.advanceTimersByTimeAsync(3000);
  await task;
  expect(starts).toHaveLength(2);
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
});
it("keeps query UI active until stream finalization", () => {
  const batch = {
    id: "active",
    createdAt: "",
    rows: rows().map((r) => ({ ...r, status: "done" as const })),
  };
  const summaries = indexSummaries({
    ids: [batch.id],
    activeId: batch.id,
    summaries: { [batch.id]: { id: batch.id, finished: true } },
  });
  expect(summaries[0].finished).toBe(false);
  expect(
    activeBatch({ settings: defaults, batches: [batch], summaries }),
  ).toEqual(batch);
});
it("worker startup recovers a completed batch whose activeId survived", async () => {
  vi.resetModules();
  const { memoryStorage } = await import("./memory-storage");
  const { STORAGE } = await import("../storage");
  const batch = {
    id: "active",
    createdAt: "",
    rows: rows().map((r) => ({ ...r, status: "done" as const })),
  };
  const storage = memoryStorage({ settings: defaults, batches: [batch] });
  storage.data[STORAGE.index].activeId = batch.id;
  let startup!: () => void;
  vi.stubGlobal("chrome", {
    storage: { local: storage.local },
    runtime: {
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: {
        addListener: (fn: () => void) => {
          startup = fn;
        },
      },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
    action: { setPopup: vi.fn(), onClicked: { addListener: vi.fn() } },
  });
  await import("../background");
  startup();
  await vi.waitFor(() => expect(chrome.action.setPopup).toHaveBeenCalled());
  const state = await (await import("../storage")).readState();
  expect(state.batches[0].rows.every((r) => r.status === "done")).toBe(true);
  expect(state.summaries![0].finished).toBe(true);
  expect(chrome.alarms.create).toHaveBeenCalledExactlyOnceWith(
    "history-cleanup",
    { periodInMinutes: 60 },
  );
});
it("retains actual request spacing across batches after a network failure", async () => {
  vi.useFakeTimers();
  const starts: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      starts.push(Date.now());
      throw new Error("network error");
    }),
  );
  let saved: import("../abuse-limits").AbuseLimits = {};
  let writes = 0;
  const save = async (value: typeof saved) => {
    if (++writes === 1)
      await new Promise((resolve) => setTimeout(resolve, 1200));
    saved = structuredClone(value);
  };
  const first = queryBatch(
    rows().slice(0, 1),
    { ...defaults, radarEnabled: false, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
    { save },
  );
  await vi.advanceTimersByTimeAsync(1200);
  await first;
  const next = queryBatch(
    rows().slice(0, 1),
    { ...defaults, radarEnabled: false, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
    { state: saved, save },
  );
  await vi.advanceTimersByTimeAsync(1000);
  await next;
  expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1000);
});
it("does not dispatch a request if cancelled during a storage write", async () => {
  vi.useFakeTimers();
  const control = new AbortController();
  vi.stubGlobal("fetch", vi.fn());
  const task = queryBatch(
    rows(),
    { ...defaults, radarEnabled: false, abuseKey: "key" },
    control.signal,
    async () => {},
    {
      save: async () => {
        control.abort();
      },
    },
  );
  await vi.advanceTimersByTimeAsync(0);
  await task;
  expect(fetch).not.toHaveBeenCalled();
});
