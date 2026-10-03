import { describe, it, expect, vi, afterEach } from "vitest";
import { parseIps, serverOrigin, defaults, type Row } from "../model";
import { toCsv, csvCell } from "../csv";
import { lookup } from "../api";
afterEach(() => vi.unstubAllGlobals());
describe("IP input", () => {
  it("deduplicates IPv4 and canonical IPv6", () => {
    expect(parseIps("1.1.1.1,1.1.1.1;[2001:0db8::1]\n2001:db8::1").ips).toEqual(
      ["1.1.1.1", "2001:db8::1"],
    );
  });
  it("rejects malformed IPs without silently dropping input", () => {
    expect(parseIps("256.1.1.1 01.1.1.1 abc ::gg").invalid).toHaveLength(4);
  });
  it("retains mapped IPv6 as one address", () =>
    expect(parseIps("::ffff:1.2.3.4").ips).toEqual(["::ffff:102:304"]));
  it("restricts server URLs and derives Chrome host patterns", () => {
    expect(serverOrigin("http://localhost:8000/base")).toBe(
      "http://localhost/*",
    );
    for (const url of [
      "file:///tmp",
      "https://key@example.com",
      "https://example.com/?token=secret",
    ])
      expect(() => serverOrigin(url)).toThrow();
  });
});
describe("CSV export", () => {
  it("preserves zero, false, Chinese, quotes and newlines; leaves absent score blank", () => {
    const rows: Row[] = [
      {
        ip: "1.1.1.1",
        country: "香港",
        score: 0,
        tor: false,
        isp: 'ISP,"A"\nB',
        errors: [],
        queriedAt: "today",
        status: "done",
      },
      { ip: "8.8.8.8", errors: [], queriedAt: "today", status: "done" },
    ];
    const csv = toCsv(rows);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"0"');
    expect(csv).toContain('"false"');
    expect(csv).toContain('"ISP,""A""\nB"');
    expect(csv).toContain('"8.8.8.8","",""');
    expect(csv).not.toContain("城市");
  });
  it("neutralizes formula injection", () => {
    for (const s of ["=1+1", "+cmd", "-cmd", "@SUM(A1)", " \t=cmd", "\tcmd"])
      expect(csvCell(s).startsWith("\"'")).toBe(true);
  });
});
describe("API integration", () => {
  it("merges independently returned sources and keeps score zero", async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes("abuseipdb"))
        return new Response(
          JSON.stringify({
            data: {
              abuseConfidenceScore: 0,
              totalReports: 0,
              countryCode: "US",
              isp: "Abuse ISP",
              isTor: false,
            },
          }),
        );
      expect(JSON.parse(init.body as string)).toEqual({ ips: ["1.1.1.1"] });
      expect(init.headers).toMatchObject({
        Authorization: "Bearer test-radar",
      });
      return new Response(
        JSON.stringify({
          type: "row",
          result: {
            ip: "1.1.1.1",
            country: { value: "AU" },
            city: { value: "Sydney" },
            as_name: { value: "Radar ISP" },
          },
        }) +
          "\n" +
          JSON.stringify({ type: "done" }),
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const row = await lookup(
      "1.1.1.1",
      { ...defaults, radarKey: "test-radar", abuseKey: "test-abuse" },
      new AbortController().signal,
    );
    expect(row).toMatchObject({
      score: 0,
      country: "AU",
      abuseCountry: "US",
      isp: "Radar ISP",
      errors: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("keeps AbuseIPDB data when Radar fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("abuseipdb")
          ? new Response(
              JSON.stringify({
                data: { abuseConfidenceScore: 87, countryCode: "HK" },
              }),
            )
          : new Response("", { status: 503 }),
      ),
    );
    const row = await lookup(
      "1.1.1.1",
      { ...defaults, abuseKey: "test" },
      new AbortController().signal,
    );
    expect(row).toMatchObject({ score: 87, country: "HK" });
    expect(row.errors[0]).toContain("503");
  });
  it("does not invent zero when source is missing or rate limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 429 })),
    );
    const row = await lookup(
      "1.1.1.1",
      { ...defaults, radarEnabled: false, abuseKey: "test" },
      new AbortController().signal,
    );
    expect(row.score).toBeUndefined();
    expect(row.errors[0]).toContain("429");
  });
  it("warns on truncated Radar stream while retaining results", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              type: "row",
              result: { ip: "1.1.1.1", country: { value: "HK" } },
            }),
          ),
      ),
    );
    const row = await lookup(
      "1.1.1.1",
      { ...defaults, abuseEnabled: false },
      new AbortController().signal,
    );
    expect(row.country).toBe("HK");
    expect(row.errors).toHaveLength(1);
  });
});
