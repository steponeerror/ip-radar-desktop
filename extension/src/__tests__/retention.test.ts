import { afterEach, expect, it, vi } from "vitest";
import { defaults, type Batch, normalizeState } from "../model";
import { memoryStorage } from "./memory-storage";
import { STORAGE } from "../storage";
const now = Date.parse("2026-10-26T00:00:00Z");
const batch = (id: string, hoursAgo: number, pending = false): Batch => ({
  id,
  createdAt: "2020-01-01T00:00:00Z",
  completedAt: new Date(now - hoursAgo * 3600000).toISOString(),
  rows: [
    {
      ip: "1.1.1.1",
      queriedAt: "",
      status: pending ? "pending" : "done",
      errors: [],
    },
  ],
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function setup(batches: Batch[], patch = {}) {
  vi.resetModules();
  const storage = memoryStorage({
    settings: { ...defaults, ...patch },
    batches,
  });
  vi.stubGlobal("chrome", { storage: { local: storage.local } });
  const { cleanupHistory } = await import("../storage");
  return { storage, cleanupHistory };
}
it("enforces count and expiry from completion while protecting the running batch without reading history", async () => {
  const { storage, cleanupHistory } = await setup(
    [
      batch("active", 999, true),
      batch("new", 0),
      batch("old", 2),
      batch("expired", 8 * 24),
    ],
    { historyMaxBatches: 2 },
  );
  await cleanupHistory(now);
  expect(storage.data[STORAGE.index].ids).toEqual(["active", "new"]);
  expect(storage.data[STORAGE.batch("old")]).toBeUndefined();
  expect(storage.data[STORAGE.batch("expired")]).toBeUndefined();
  expect(
    storage.local.get.mock.calls
      .flatMap(([x]) => (typeof x === "string" ? [x] : x))
      .filter((x) => x.startsWith("radar.batch.")),
  ).toEqual([]);
});
it("disables time cleanup but still enforces the count limit", async () => {
  const { storage, cleanupHistory } = await setup(
    [batch("new", 999), batch("old", 1000)],
    { historyMaxBatches: 1, historyRetentionHours: 0 },
  );
  await cleanupHistory(now);
  expect(storage.data[STORAGE.index].ids).toEqual(["new"]);
});
it("supports hourly expiry and stopped batches", async () => {
  const { storage, cleanupHistory } = await setup(
    [{ ...batch("stopped", 2), cancelled: true }, batch("recent", 0.5)],
    { historyRetentionHours: 1 },
  );
  await cleanupHistory(now);
  expect(storage.data[STORAGE.index].ids).toEqual(["recent"]);
});
it("grants old summaries a full retention period and does not restart it on each cleanup", async () => {
  const old = batch("old", 999);
  delete old.completedAt;
  const { storage, cleanupHistory } = await setup([old], {
    historyRetentionHours: 1,
  });
  await cleanupHistory(now);
  expect(storage.data[STORAGE.index].summaries.old.completedAt).toBe(
    new Date(now).toISOString(),
  );
  await cleanupHistory(now + 3599999);
  expect(storage.data[STORAGE.index].ids).toEqual(["old"]);
  await cleanupHistory(now + 3600000);
  expect(storage.data[STORAGE.index].ids).toEqual([]);
});
it("retries physical deletion after an interrupted cleanup", async () => {
  const { storage, cleanupHistory } = await setup([batch("old", 999)]);
  storage.local.remove.mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(cleanupHistory(now)).rejects.toThrow("disk unavailable");
  expect(storage.data[STORAGE.index].cleanupPending).toEqual(["old"]);
  expect(storage.data[STORAGE.batch("old")]).toBeDefined();
  await cleanupHistory(now);
  expect(storage.data[STORAGE.batch("old")]).toBeUndefined();
  expect(storage.data[STORAGE.index].cleanupPending).toBeUndefined();
});
it("supplies defaults for settings saved before retention existed", () => {
  expect(
    normalizeState({ settings: {} as any, batches: [] }).settings,
  ).toMatchObject({ historyMaxBatches: 20, historyRetentionHours: 168 });
});
it("cleans on page opening and on the hourly alarm", async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  const storage = memoryStorage({
    settings: { ...defaults, historyRetentionHours: 1 },
    batches: [batch("old", 2), batch("recent", 0)],
  });
  let message!: Function;
  let alarm!: Function;
  vi.stubGlobal("chrome", {
    storage: { local: storage.local },
    runtime: {
      id: "test",
      getURL: (p: string) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (f: Function) => (message = f) },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: (f: Function) => (alarm = f) },
    },
    action: { onClicked: { addListener: vi.fn() }, setPopup: vi.fn() },
  });
  await import("../background");
  const reply: any = await new Promise((resolve) =>
    message(
      { type: "get" },
      { id: "test", url: "chrome-extension://test/index.html" },
      resolve,
    ),
  );
  expect(reply.error).toBeUndefined();
  expect(reply.state.batches.map((b: Batch) => b.id)).toEqual(["recent"]);
  expect(chrome.alarms.create).toHaveBeenCalledWith("history-cleanup", {
    periodInMinutes: 60,
  });
  vi.setSystemTime(now + 3600000);
  alarm({ name: "history-cleanup" });
  await vi.waitFor(() => expect(storage.data[STORAGE.index].ids).toEqual([]));
  vi.useRealTimers();
});
