import { afterEach, expect, it, vi } from "vitest";
import { defaults, initialState } from "../model";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
async function client(granted: boolean) {
  const request = vi.fn(async () => granted);
  const sendMessage = vi.fn(async () => ({ state: initialState() }));
  vi.stubGlobal("chrome", {
    runtime: { id: "test", sendMessage },
    permissions: { request },
  });
  const { beginLookup } = await import("../client");
  return { beginLookup, request, sendMessage };
}
it("requests access directly from the click and starts after approval without opening another window", async () => {
  const c = await client(true);
  const pending = c.beginLookup("1.1.1.1", defaults);
  expect(c.request).toHaveBeenCalledTimes(1);
  expect(c.sendMessage).not.toHaveBeenCalled();
  await pending;
  expect(c.sendMessage).toHaveBeenCalledExactlyOnceWith({
    type: "start",
    text: "1.1.1.1",
  });
});
it("does not start a query when access is denied", async () => {
  const c = await client(false);
  await expect(c.beginLookup("1.1.1.1", defaults)).rejects.toThrow(
    "需要 Server",
  );
  expect(c.sendMessage).not.toHaveBeenCalled();
});
it("does not request Radar access when that source is disabled", async () => {
  const c = await client(false);
  await c.beginLookup("1.1.1.1", { ...defaults, radarEnabled: false });
  expect(c.request).not.toHaveBeenCalled();
  expect(c.sendMessage).toHaveBeenCalledWith({
    type: "start",
    text: "1.1.1.1",
  });
});
