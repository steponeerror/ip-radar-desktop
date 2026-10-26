import { afterEach, expect, it, vi } from "vitest";
import { MAX_RADAR_LINE_BYTES, queryBatch } from "../api";
import { defaults } from "../model";
afterEach(() => vi.unstubAllGlobals());
const encode = (s: string) => new TextEncoder().encode(s);
const row = (ip: string) => ({
  ip,
  queriedAt: "",
  status: "pending" as const,
  errors: [],
});
function mock(chunks: Uint8Array[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("abuseipdb")
        ? new Response(JSON.stringify({ data: { abuseConfidenceScore: 12 } }))
        : new Response(
            new ReadableStream({
              start(c) {
                for (const chunk of chunks) c.enqueue(chunk);
                c.close();
              },
            }),
          ),
    ),
  );
}
it("bounds an unfinished record across network chunks and preserves previous results", async () => {
  mock([
    encode('{"type":"row","result":{"ip":"1.1.1.1"}}\n'),
    encode(" ".repeat(MAX_RADAR_LINE_BYTES)),
    encode(" "),
  ]);
  const emit = vi.fn(async () => {});
  await queryBatch(
    [row("1.1.1.1"), row("8.8.8.8")],
    { ...defaults, abuseEnabled: false },
    new AbortController().signal,
    emit,
  );
  const calls = emit.mock.calls as any[];
  expect(
    calls.find(([ip, s]) => ip === "8.8.8.8" && s.status === "error")[1].error
      .message,
  ).toContain("1 MiB");
  expect(calls.filter(([ip]) => ip === "1.1.1.1").at(-1)[1].status).toBe("ok");
});
it("also bounds complete oversized lines and keeps AbuseIPDB independent", async () => {
  mock([
    encode(
      JSON.stringify({
        type: "row",
        result: { ip: "1.1.1.1", padding: "x".repeat(MAX_RADAR_LINE_BYTES) },
      }) + "\n",
    ),
  ]);
  const emit = vi.fn(async () => {});
  await queryBatch(
    [row("1.1.1.1")],
    { ...defaults, abuseKey: "test" },
    new AbortController().signal,
    emit,
  );
  const calls = emit.mock.calls as any[];
  expect(calls.find(([, s]) => s.sourceId === "ipradar")[1].status).toBe(
    "error",
  );
  expect(calls.find(([, s]) => s.sourceId === "abuseipdb")[1].status).toBe(
    "ok",
  );
});
it("does not limit total chunk size and decodes UTF-8 split across chunks", async () => {
  const bytes = encode(
    '{"type":"row","result":{"ip":"1.1.1.1","city":{"value":"香港"}}}\n{"type":"done"}',
  );
  const split = bytes.indexOf(0xe9) + 1;
  mock([
    encode(" \n".repeat(MAX_RADAR_LINE_BYTES)),
    bytes.subarray(0, split),
    bytes.subarray(split),
  ]);
  const emit = vi.fn(async () => {});
  await queryBatch(
    [row("1.1.1.1")],
    { ...defaults, abuseEnabled: false },
    new AbortController().signal,
    emit,
  );
  expect(emit).toHaveBeenCalledOnce();
  expect((emit.mock.calls as any[])[0][1].data.city.value).toBe("香港");
});
