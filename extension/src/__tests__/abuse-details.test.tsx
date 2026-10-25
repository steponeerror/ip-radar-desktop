import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { queryBatch, mergeSection } from "../api";
import { defaults, type Row } from "../model";
import { FullResult, Results } from "../ResultView";
import { exportRecord, toCsv } from "../csv";
import type { AbuseSection } from "../../../shared/intelligence";
afterEach(() => vi.unstubAllGlobals());
const abuseRow = (patch: Partial<AbuseSection> = {}): Row => ({
  ip: "1.1.1.1",
  queriedAt: "",
  errors: [],
  status: "done",
  sections: [
    {
      sourceId: "abuseipdb",
      status: "ok",
      data: {
        score: 0,
        totalReports: 0,
        numDistinctUsers: 0,
        recentComments: [],
        ...patch,
      },
    },
  ],
});
it("stores hostnames and whitelist from the same check request, without extra DNS requests", async () => {
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          data: {
            abuseConfidenceScore: 0,
            hostnames: ["one.example", null, "two.example", 123, ""],
            domain: "example",
            isWhitelisted: true,
            isTor: false,
          },
        }),
      ),
  );
  vi.stubGlobal("fetch", fetch);
  let row: Row = {
    ip: "1.1.1.1",
    queriedAt: "",
    status: "pending",
    errors: [],
  };
  await queryBatch(
    [row],
    { ...defaults, radarEnabled: false, abuseKey: "test" },
    new AbortController().signal,
    async (_ip, section) => {
      row = mergeSection(row, section, ["abuseipdb"]);
    },
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(row.sections?.[0].data).toMatchObject({
    hostnames: ["one.example", "two.example"],
    isWhitelisted: true,
    isTor: false,
  });
  expect(row.sections?.[0].data).toHaveProperty("domain", "example");
});
it("shows whitelist in compact score and detail only on an explicit true hit", () => {
  const row = abuseRow({
    isWhitelisted: true,
    hostnames: ["one.example", "two.example"],
  });
  expect(renderToStaticMarkup(<Results rows={[row]} />)).toContain("白名單");
  const detail = renderToStaticMarkup(<FullResult row={row} />);
  expect(detail).toContain("one.example、two.example");
  expect(detail).toContain("白名單");
  expect(detail).not.toContain("白名單來源");
  expect(detail).not.toContain("API 未提供白名單");
  for (const isWhitelisted of [false, null, undefined]) {
    const hidden = abuseRow({ isWhitelisted });
    expect(renderToStaticMarkup(<FullResult row={hidden} />)).not.toContain(
      "白名單",
    );
    expect(renderToStaticMarkup(<Results rows={[hidden]} />)).not.toContain(
      "白名單",
    );
    expect(toCsv([hidden])).not.toContain("白名單");
  }
});
it("exports visible data without GPS, accuracy, ASN confidence or duplicate native verdict value", () => {
  const row = abuseRow({
    isWhitelisted: true,
    hostnames: ["one.example"],
    isTor: true,
  });
  row.sections!.push({
    sourceId: "ipradar",
    status: "ok",
    data: {
      ip: row.ip,
      location: { lat: 1, lon: 2, accuracy_radius: 3 },
      asn: { value: 123, confidence: 99 },
    },
  });
  const csv = toCsv([row]);
  expect(csv).toContain('"主機名稱"');
  expect(csv).toContain('"白名單"');
  expect(csv).toContain('"Tor 出口"');
  for (const label of [
    "緯度",
    "經度",
    "定位精度",
    "Radar ASN 信心",
    "判定原生數值",
  ])
    expect(csv).not.toContain(label);
  expect(exportRecord(row).score).toBe(0);
  expect(exportRecord(abuseRow()).tor).toBeUndefined();
  expect(exportRecord(abuseRow({ isTor: false })).tor).toBe(false);
  expect(
    renderToStaticMarkup(<FullResult row={abuseRow({ isTor: false })} />),
  ).not.toContain("Tor 出口");
  expect(renderToStaticMarkup(<FullResult row={row} />)).toContain("Tor 出口");
});
it("does not convert an unknown whitelist or Tor result to a negative answer", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { abuseConfidenceScore: 0, isWhitelisted: null },
          }),
        ),
    ),
  );
  let data: unknown;
  await queryBatch(
    [{ ip: "1.1.1.1", queriedAt: "", errors: [], status: "pending" }],
    { ...defaults, radarEnabled: false, abuseKey: "test" },
    new AbortController().signal,
    async (_ip, section) => {
      data = section.data;
    },
  );
  expect(data).toMatchObject({ isWhitelisted: null, isTor: undefined });
});

it("hides empty domain and hostnames in both details and CSV", () => {
  for (const patch of [
    {},
    { domain: "", hostnames: [] },
    { domain: "  ", hostnames: [" ", ""] },
  ]) {
    const row = abuseRow(patch);
    const html = renderToStaticMarkup(<FullResult row={row} />);
    expect(html).not.toContain("網域");
    expect(html).not.toContain("主機名稱");
    expect(toCsv([row])).not.toContain('"網域"');
    expect(toCsv([row])).not.toContain('"主機名稱"');
  }
  const html = renderToStaticMarkup(
    <FullResult
      row={abuseRow({ domain: "example.org", hostnames: ["host.example.org"] })}
    />,
  );
  expect(html).toContain("example.org");
  expect(html).toContain("host.example.org");
});
it("groups source scores and verdict before the consensus in CSV", () => {
  const row = abuseRow();
  row.sections!.push({
    sourceId: "ipradar",
    status: "ok",
    data: { ip: row.ip, threat: { verdict: "benign", confidence: 0 } },
  });
  const header = toCsv([row]).split("\r\n")[0];
  expect(header).toContain(
    '"AbuseIPDB 分數","Radar 威脅信心","Radar 判定","總判定"',
  );
});
