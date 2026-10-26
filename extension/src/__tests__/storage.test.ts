import { afterEach, expect, it, vi } from "vitest";
import { initialState, type Batch } from "../model";
import { applyStorageChanges, STORAGE } from "../storage";
import { memoryStorage } from "./memory-storage";
afterEach(() => vi.unstubAllGlobals());
const batch = (id: string): Batch => ({
  id,
  createdAt: "",
  rows: [{ ip: "1.1.1.1", queriedAt: "", errors: [], status: "done" }],
});

it("preserves settings and cooldowns once but does not migrate legacy history", async () => {
  vi.resetModules();
  const legacy = {
    ...initialState(),
    batches: [batch("old")],
    abuseLimits: { key: { blockedUntil: Date.now() + 3600000 } },
  };
  legacy.settings.serverUrl = "https://saved.example";
  const storage = memoryStorage(initialState());
  for (const key of Object.keys(storage.data)) delete storage.data[key];
  storage.data.radarState = structuredClone(legacy);
  vi.stubGlobal("chrome", { storage: { local: storage.local } });
  const { readState } = await import("../storage");
  const state = await readState();
  expect(state.settings).toEqual(legacy.settings);
  expect(state.abuseLimits).toEqual(legacy.abuseLimits);
  expect(state.batches).toEqual([]);
  expect(storage.data.radarState).toEqual(legacy); // Old records are left untouched.
  storage.local.get.mockClear();
  vi.resetModules();
  await (await import("../storage")).readState();
  expect(
    storage.local.get.mock.calls.some(([keys]) => keys === "radarState"),
  ).toBe(false);
});

it("retains only the query batch when applying storage events", () => {
  const state = {
    ...initialState(),
    batches: [batch("current"), batch("history")],
  };
  const changed = { ...state.batches[0], cancelled: true };
  const next = applyStorageChanges(state, {
    [STORAGE.batch("current")]: { newValue: changed },
  });
  expect(next.batches[0]).toBe(changed);
  expect(next.batches).toHaveLength(1);
  const quota = applyStorageChanges(next, {
    [STORAGE.limits]: { newValue: { key: { remaining: 58 } } },
  });
  expect(quota.batches).toBe(next.batches);
  const inserted = applyStorageChanges(quota, {
    [STORAGE.index]: { newValue: { ids: ["new", "current"] } },
    [STORAGE.batch("new")]: { newValue: batch("new") },
  });
  expect(inserted.batches.map((b) => b.id)).toEqual(["new"]);
  expect(
    applyStorageChanges(inserted, {
      [STORAGE.batch("new")]: { oldValue: batch("new") },
    }).batches.map((b) => b.id),
  ).toEqual([]);
});

it("coalesces streamed results into one batch write without reading 49 historical batches", async () => {
  vi.resetModules();
  const state = initialState();
  state.settings.abuseEnabled = false;
  state.settings.historyMaxBatches = 50;
  state.batches = Array.from({ length: 49 }, (_, i) => batch(`history-${i}`));
  const storage = memoryStorage(state);
  let listener: Function = () => {};
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const clear = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(c) {
              stream = c;
            },
          }),
        ),
    ),
  );
  vi.stubGlobal("chrome", {
    storage: { local: storage.local },
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
  const reply: any = await new Promise((resolve) =>
    listener(
      { type: "start", text: "1.1.1.1 8.8.8.8 9.9.9.9" },
      { id: "test", url: "chrome-extension://test/index.html" },
      resolve,
    ),
  );
  expect(reply.error).toBeUndefined();
  await vi.waitFor(() => expect(stream).toBeDefined());
  const currentKey = STORAGE.batch(storage.snapshot().batches[0].id);
  storage.local.get.mockClear();
  storage.local.set.mockClear();
  const lines = ["1.1.1.1", "8.8.8.8", "9.9.9.9"].map((ip) =>
    JSON.stringify({ type: "row", result: { ip } }),
  );
  stream.enqueue(
    new TextEncoder().encode(lines.join("\n") + '\n{"type":"done"}\n'),
  );
  stream.close();
  await vi.waitFor(() => expect(clear).toHaveBeenCalled());
  const readKeys = storage.local.get.mock.calls.flatMap(([keys]) =>
    typeof keys === "string" ? [keys] : keys,
  );
  const writes = storage.local.set.mock.calls.map(([value]) =>
    Object.keys(value),
  );
  expect(readKeys.filter((key) => key.startsWith("radar.batch."))).toEqual([]);
  expect(writes.filter((keys) => keys.includes(currentKey))).toEqual([
    [currentKey, STORAGE.index],
  ]);
  expect(readKeys).not.toContain("radarState");
  expect(writes.flat().some((key) => key.includes("history-"))).toBe(false);
  expect(storage.snapshot().batches.slice(1)).toEqual(state.batches);
});

it("loads only the latest batch on startup and only the requested batch on selection", async () => {
  vi.resetModules();
  const seed = {
    ...initialState(),
    batches: Array.from({ length: 50 }, (_, i) => batch(`batch-${i}`)),
  };
  const storage = memoryStorage(seed);
  vi.stubGlobal("chrome", { storage: { local: storage.local } });
  const { readState } = await import("../storage");
  const current = await readState();
  expect(current.batches.map((b) => b.id)).toEqual(["batch-0"]);
  expect(current.summaries).toHaveLength(50);
  expect(JSON.stringify(current.summaries)).not.toContain('"rows"');
  expect(
    storage.local.get.mock.calls
      .flatMap(([keys]) => (typeof keys === "string" ? [keys] : keys))
      .filter((key) => key.startsWith("radar.batch.")),
  ).toEqual([STORAGE.batch("batch-0")]);
  storage.local.get.mockClear();
  const history = await readState("batch-37");
  expect(history.batches.map((b) => b.id)).toEqual(["batch-37"]);
  expect(
    storage.local.get.mock.calls
      .flatMap(([keys]) => (typeof keys === "string" ? [keys] : keys))
      .filter((key) => key.startsWith("radar.batch.")),
  ).toEqual([STORAGE.batch("batch-37")]);
  expect((await readState("deleted")).batches).toEqual([]);
});

it("does not retain unselected history delivered by storage events", () => {
  const current = batch("current");
  const state = { ...initialState(), batches: [current] };
  const next = applyStorageChanges(state, {
    [STORAGE.batch("old")]: { newValue: batch("old") },
  });
  expect(next.batches).toBe(state.batches);
  expect(next.batches).toEqual([current]);
});

it("does not scan older batches to build missing summaries", async () => {
  vi.resetModules();
  const storage = memoryStorage({
    ...initialState(),
    batches: [batch("latest"), batch("old")],
  });
  delete storage.data[STORAGE.index].summaries;
  vi.stubGlobal("chrome", { storage: { local: storage.local } });
  const state = await (await import("../storage")).readState();
  expect(state.summaries).toEqual([
    { id: "latest", finished: true },
    { id: "old", finished: true },
  ]);
  expect(
    storage.local.get.mock.calls.flatMap(([keys]) =>
      typeof keys === "string" ? [keys] : keys,
    ),
  ).not.toContain(STORAGE.batch("old"));
});

it("builds only the selected old summary and deletes summarized history without loading its rows", async () => {
  vi.resetModules();
  const storage = memoryStorage({
    ...initialState(),
    batches: [batch("latest"), batch("old"), batch("other")],
  });
  delete storage.data[STORAGE.index].summaries.old;
  let listener: Function = () => {};
  vi.stubGlobal("chrome", {
    storage: { local: storage.local },
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
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
    action: { setPopup: vi.fn(), onClicked: { addListener: vi.fn() } },
  });
  await import("../background");
  const command = (type: string, id: string) =>
    new Promise<any>((resolve) =>
      listener(
        { type, id },
        { id: "test", url: "chrome-extension://test/index.html" },
        resolve,
      ),
    );
  const selected = await command("batch", "old");
  expect(selected.error).toBeUndefined();
  expect(selected.state.batches.map((b: Batch) => b.id)).toEqual(["old"]);
  expect(storage.data[STORAGE.index].summaries.old.total).toBe(1);
  const reads = () =>
    storage.local.get.mock.calls
      .flatMap(([keys]) => (typeof keys === "string" ? [keys] : keys))
      .filter((key) => key.startsWith("radar.batch."));
  expect(new Set(reads())).toEqual(new Set([STORAGE.batch("old")]));
  storage.local.get.mockClear();
  const deleted = await command("delete", "old");
  expect(deleted.error).toBeUndefined();
  expect(storage.data[STORAGE.index].summaries.old).toBeUndefined();
  expect(storage.data[STORAGE.batch("old")]).toBeUndefined();
  expect(reads()).toEqual([STORAGE.batch("latest")]);
});
