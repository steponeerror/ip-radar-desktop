import { afterEach, expect, it, vi } from "vitest";
import { initialState } from "../model";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("discards a delayed snapshot after a newer storage event without repeating the mutation", async () => {
  vi.resetModules();
  const listeners = new Set<Function>();
  const old = initialState();
  const latest = {
    ...initialState(),
    settings: { ...initialState().settings, theme: "light" },
  };
  const sendMessage = vi.fn(async (message) => {
    if (message.type === "settings") {
      for (const listener of listeners)
        listener({ "radar.settings": { newValue: latest.settings } }, "local");
      return { state: old };
    }
    return { state: latest };
  });
  vi.stubGlobal("chrome", {
    runtime: { id: "test", sendMessage },
    storage: {
      onChanged: {
        addListener: (fn: Function) => listeners.add(fn),
        removeListener: (fn: Function) => listeners.delete(fn),
      },
    },
  });
  const { send } = await import("../client");
  expect(
    (await send("settings", { patch: { theme: "light" } })).settings.theme,
  ).toBe("light");
  expect(sendMessage.mock.calls.map(([m]) => m.type)).toEqual([
    "settings",
    "get",
  ]);
  expect(listeners.size).toBe(0);
});
it("removes the temporary listener when a command fails", async () => {
  vi.resetModules();
  const removeListener = vi.fn();
  vi.stubGlobal("chrome", {
    runtime: { id: "test", sendMessage: async () => ({ error: "failed" }) },
    storage: { onChanged: { addListener: vi.fn(), removeListener } },
  });
  const { send } = await import("../client");
  await expect(send("get")).rejects.toThrow("failed");
  expect(removeListener).toHaveBeenCalledOnce();
});
it("rereads completed results when an initial page snapshot arrives after the final event", async () => {
  vi.resetModules();
  const listeners = new Set<Function>();
  const pending = {
    ...initialState(),
    batches: [
      {
        id: "a",
        createdAt: "",
        rows: [{ ip: "1.1.1.1", status: "pending", errors: [], queriedAt: "" }],
      },
    ],
  };
  const complete = structuredClone(pending);
  complete.batches[0].rows[0].status = "done";
  let calls = 0;
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      sendMessage: async () => {
        if (++calls === 1) {
          for (const listener of listeners)
            listener(
              { "radar.batch.a": { newValue: complete.batches[0] } },
              "local",
            );
          return { state: pending };
        }
        return { state: complete };
      },
    },
    storage: {
      onChanged: {
        addListener: (fn: Function) => listeners.add(fn),
        removeListener: (fn: Function) => listeners.delete(fn),
      },
    },
  });
  const { send } = await import("../client");
  expect((await send("get")).batches[0].rows[0].status).toBe("done");
  expect(calls).toBe(2);
  expect(listeners.size).toBe(0);
});
