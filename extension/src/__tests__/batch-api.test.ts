import { afterEach, expect, it, vi } from "vitest";
import { queryBatch, mergeSection } from "../api";
import { defaults, type Row, type Batch } from "../model";
import { batchProgress } from "../progress";
const ips = ["1.1.1.1", "8.8.8.8", "9.9.9.9"];
const rows = (): Row[] =>
  ips.map((ip) => ({ ip, status: "pending", errors: [], queriedAt: "" }));
const radarLine = (ip: string) =>
  JSON.stringify({ type: "row", result: { ip, country: { value: "HK" } } }) +
  "\n";
const abuse = (headers = {}) =>
  new Response(JSON.stringify({ data: { abuseConfidenceScore: 12 } }), {
    headers,
  });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("streams the whole Radar batch before Abuse completes, preserves partial results on abort", async () => {
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    if (!url.includes("abuseipdb")) {
      expect(JSON.parse(init.body as string).ips).toEqual(ips);
      return new Response(
        new ReadableStream({
          start(c) {
            stream = c;
          },
        }),
      );
    }
    return new Promise<Response>((_, reject) =>
      init.signal!.addEventListener("abort", () => reject(new Error("abort"))),
    );
  });
  vi.stubGlobal("fetch", fetch);
  const control = new AbortController();
  const saved = rows();
  const emit = vi.fn(async (ip, section) => {
    const i = saved.findIndex((r) => r.ip === ip);
    saved[i] = mergeSection(saved[i], section, ["ipradar", "abuseipdb"]);
  });
  const task = queryBatch(
    saved,
    { ...defaults, abuseKey: "key" },
    control.signal,
    emit,
  );
  await vi.waitFor(() => expect(stream).toBeDefined());
  stream.enqueue(
    new TextEncoder().encode(radarLine(ips[0]) + radarLine(ips[1])),
  );
  await vi.waitFor(() => expect(emit).toHaveBeenCalledTimes(2));
  expect(saved[0].radarCountry).toBe("HK");
  expect(saved[0].status).toBe("pending");
  control.abort();
  stream.error(new Error("abort"));
  await task;
  expect(emit).toHaveBeenCalledTimes(2);
  const batch: Batch = {
    id: "a",
    createdAt: "",
    rows: saved,
    cancelled: true,
    sourceIds: ["ipradar", "abuseipdb"],
  };
  expect(batchProgress(batch, (s) => s)).toContain(
    "Radar 成功 2/3 · 已停止，未查完",
  );
  expect(batchProgress(batch, (s) => s)).toContain(
    "AbuseIPDB 成功 0/3 · 已停止，未查完",
  );
});

it("paces Abuse at one start per second without delaying Radar", async () => {
  vi.useFakeTimers();
  const times: number[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("abuseipdb")) {
        times.push(Date.now());
        return abuse();
      }
      return new Response(ips.map(radarLine).join("") + '{"type":"done"}\n');
    }),
  );
  const emit = vi.fn(async () => {});
  const task = queryBatch(
    rows(),
    { ...defaults, abuseKey: "key" },
    new AbortController().signal,
    emit,
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(emit.mock.calls).toHaveLength(4);
  expect(times).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(times).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(1001);
  await task;
  expect(times[1] - times[0]).toBe(1000);
  expect(times[2] - times[1]).toBe(1000);
});

it("stops on 429 and saves cooldown for later batches without delaying Radar", async () => {
  vi.useFakeTimers();
  let saved: import("../abuse-limits").AbuseLimits = {};
  const save = async (value: typeof saved) => {
    saved = structuredClone(value);
  };
  const fetch = vi.fn(async (url: string) =>
    url.includes("abuseipdb")
      ? new Response(
          JSON.stringify({
            errors: [{ detail: "Too many requests", status: 429 }],
          }),
          { status: 429, headers: { "Retry-After": "3" } },
        )
      : new Response(ips.map(radarLine).join("") + '{"type":"done"}\n'),
  );
  vi.stubGlobal("fetch", fetch);
  const emit = vi.fn(async () => {});
  const task = queryBatch(
    rows(),
    { ...defaults, abuseKey: "key" },
    new AbortController().signal,
    emit,
    { state: saved, save },
  );
  await vi.advanceTimersByTimeAsync(0);
  await task;
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(emit).toHaveBeenCalledTimes(6);
  expect(saved.blockedUntil).toBe(Date.now() + 3000);
  await queryBatch(
    rows(),
    { ...defaults, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
    { state: saved, save },
  );
  expect(fetch).toHaveBeenCalledTimes(3); // Only Radar runs in the next batch.
  await vi.advanceTimersByTimeAsync(3000);
  const retry = queryBatch(
    rows().slice(0, 1),
    { ...defaults, radarEnabled: false, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
    { state: saved, save },
  );
  await vi.advanceTimersByTimeAsync(0);
  await retry;
  expect(fetch).toHaveBeenCalledTimes(4);
});

it.each([200, 429])(
  "stops sending Abuse requests when quota reaches zero (%s)",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        status === 200
          ? abuse({ "X-RateLimit-Remaining": "0" })
          : new Response("{}", {
              status,
              headers: { "X-RateLimit-Remaining": "0", "Retry-After": "3600" },
            }),
      ),
    );
    const emit = vi.fn(async () => {});
    await queryBatch(
      rows(),
      { ...defaults, radarEnabled: false, abuseKey: "key" },
      new AbortController().signal,
      emit,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(3);
  },
);

it("resumes only missing sources and reports fully completed Radar separately", async () => {
  const saved = rows().map((r) =>
    mergeSection(r, { sourceId: "ipradar", status: "ok", data: { ip: r.ip } }, [
      "ipradar",
      "abuseipdb",
    ]),
  );
  saved[0] = mergeSection(
    saved[0],
    { sourceId: "abuseipdb", status: "ok", data: { score: 12 } },
    ["ipradar", "abuseipdb"],
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => abuse({ "X-RateLimit-Remaining": "0" })),
  );
  await queryBatch(
    saved,
    { ...defaults, abuseKey: "key" },
    new AbortController().signal,
    async () => {},
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][0]).toContain("8.8.8.8");
  const text = batchProgress(
    {
      id: "a",
      createdAt: "",
      rows: saved,
      cancelled: true,
      sourceIds: ["ipradar", "abuseipdb"],
    },
    (s) => s,
  );
  expect(text).toContain("Radar 成功 3/3 · 已查完");
  expect(text).toContain("AbuseIPDB 成功 1/3 · 已停止，未查完");
});
