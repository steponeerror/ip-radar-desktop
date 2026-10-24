import { afterEach, expect, it, vi } from "vitest";
import { initialState } from "../model";
import { memoryStorage } from "./memory-storage";
import { STORAGE } from "../storage";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("export and stop flush pending memory immediately, without waiting for the timer or remaining sources", async () => {
  vi.useFakeTimers();
  vi.resetModules();
  const seed = initialState();
  seed.settings.abuseEnabled = false;
  const storage = memoryStorage(seed);
  let listener: Function = () => {};
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (_url: string, init: RequestInit) =>
        new Response(
          new ReadableStream({
            start(c) {
              stream = c;
              init.signal!.addEventListener("abort", () =>
                c.error(new Error("aborted")),
              );
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
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
    action: { setPopup: vi.fn(), onClicked: { addListener: vi.fn() } },
  });
  await import("../background");
  const command = (type: string, extra = {}) =>
    new Promise<any>((resolve) =>
      listener(
        { type, ...extra },
        { id: "test", url: "chrome-extension://test/index.html" },
        resolve,
      ),
    );
  const reply = await command("start", { text: "1.1.1.1 8.8.8.8 9.9.9.9" });
  expect(reply.error).toBeUndefined();
  await vi.waitFor(() => expect(stream).toBeDefined());
  const id = storage.snapshot().batches[0].id;
  const line = (ip: string) =>
    new TextEncoder().encode(
      JSON.stringify({
        type: "row",
        result: { ip, country: { value: "HK" } },
      }) + "\n",
    );
  storage.local.set.mockClear();
  stream.enqueue(line("1.1.1.1"));
  await vi.advanceTimersByTimeAsync(0);
  expect(storage.local.set).not.toHaveBeenCalled();
  const snapshot = await command("snapshot", { id });
  expect(snapshot.state.batches[0].rows[0].radarCountry).toBe("HK");
  expect(snapshot.state.batches[0].rows[1].status).toBe("pending");
  stream.enqueue(line("8.8.8.8"));
  await vi.advanceTimersByTimeAsync(0);
  expect(storage.snapshot().batches[0].rows[1].sections).toBeUndefined();
  const stopped = await command("cancel");
  expect(stopped.error).toBeUndefined();
  expect(stopped.state.batches[0].cancelled).toBe(true);
  expect(stopped.state.batches[0].rows[1].radarCountry).toBe("HK");
  expect(stopped.state.batches[0].rows[2].errors).toContain(
    "已停止，未完成查詢",
  );
  await vi.advanceTimersByTimeAsync(0);
  await command("delete", { id });
  await vi.advanceTimersByTimeAsync(1000);
  expect(storage.data[STORAGE.batch(id)]).toBeUndefined();
  expect(storage.snapshot().batches).toEqual([]);
});
