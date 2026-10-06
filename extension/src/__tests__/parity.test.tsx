import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import fixtures from "./fixtures/intelligence.json";
import { lookup } from "../api";
import { defaults, normalizeState, type Row } from "../model";
import { resultOf } from "../result-model";
import { Results, FullResult } from "../ResultView";
import { toCsv } from "../csv";
import {
  abuseScoreBand,
  consensusOf,
  type SourceSection,
} from "../../../shared/intelligence";
afterEach(() => vi.unstubAllGlobals());
async function fixtureRow(index: number) {
  const f = fixtures[index];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("abuseipdb")
        ? new Response(JSON.stringify(f.abuse))
        : new Response(
            `${JSON.stringify({ type: "row", result: f.radar })}\n${JSON.stringify({ type: "done" })}`,
          ),
    ),
  );
  return lookup(
    f.radar.ip,
    { ...defaults, abuseKey: "test" },
    new AbortController().signal,
  );
}
describe("desktop parity with captured real responses", () => {
  it.each([0, 1])(
    "retains complete source data and identical verdict/country/badges for reference %s",
    async (index) => {
      const row = await fixtureRow(index);
      const result = resultOf(row);
      expect(result.country).toBe(index === 0 ? "CA" : "SG");
      expect(result.radar).toEqual(fixtures[index].radar);
      expect(result.abuse?.usageType).toBe(
        fixtures[index].abuse.data.usageType,
      );
      expect(result.code).toBe(index === 0 ? "malicious" : "benign");
      expect(result.value).toBe(index === 0 ? 100 : undefined);
    },
  );
  it("simple and full views show the same verdict; full view includes every desktop detail", async () => {
    const row = await fixtureRow(0);
    const simple = renderToStaticMarkup(<Results rows={[row]} />);
    const full = renderToStaticMarkup(<FullResult row={row} />);
    for (const text of [
      "惡意",
      "100",
      "黑名單",
      "掃描",
      "濫用舉報",
      "Data Center",
      "5649",
    ]) {
      expect(simple).toContain(text);
      expect(full).toContain(text);
    }
    for (const text of [
      "IP 範圍",
      "85.217.149.0/24",
      "GPS",
      "定位精度",
      "信心 97",
      "舉報人數",
      "409",
      "最後舉報",
      "2026-10-05",
    ])
      expect(full).toContain(text);
    expect(simple).not.toContain("GPS");
  });
  it("benign label has no aggregate number and shows zero hits", async () => {
    const row = await fixtureRow(1);
    const html = renderToStaticMarkup(<FullResult row={row} />);
    expect(html).toContain("良性");
    expect(html).not.toContain("良性 0");
    expect(html).toContain("0 命中");
    expect(html).toContain("Singapore");
    expect(html).toContain("新加坡");
  });
  it("CSV preserves consensus, confidence, classifications and reporters", async () => {
    const csv = toCsv([await fixtureRow(0), await fixtureRow(1)]);
    for (const text of [
      "總判定",
      "惡意",
      "良性",
      "判定原生數值",
      "Radar 地區信心",
      "IP 範圍",
      "分類命中",
      "黑名單: malicious / 94",
      "舉報人數",
      "409",
    ])
      expect(csv).toContain(text);
    expect(csv).not.toContain("[object Object]");
  });
});
describe("boundary conditions", () => {
  const radar = (code: string): SourceSection => ({
    sourceId: "ipradar",
    status: "ok",
    data: { threat: { verdict: code, confidence: 72 } },
  });
  const abuse = (score: number): SourceSection => ({
    sourceId: "abuseipdb",
    status: "ok",
    data: { score },
  });
  it("keeps the 50 verdict cutoff separate from 25/60 display colors", () => {
    expect(consensusOf([radar("malicious"), abuse(49)])).toEqual({
      kind: "disagreed",
    });
    expect(consensusOf([radar("malicious"), abuse(50)])).toEqual({
      kind: "verdict",
      code: "malicious",
      value: 72,
    });
    expect(consensusOf([radar("benign"), abuse(50)])).toEqual({
      kind: "disagreed",
    });
    expect(consensusOf([radar("benign"), abuse(49)])).toMatchObject({
      kind: "verdict",
      code: "benign",
    });
    expect([24, 25, 49, 50, 59, 60].map(abuseScoreBand)).toEqual([
      "success",
      "warning",
      "warning",
      "warning",
      "warning",
      "danger",
    ]);
  });
  it("makes source errors visible instead of treating 403 as empty data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error code: 1010", { status: 403 })),
    );
    const row = await lookup(
      "1.1.1.1",
      { ...defaults, abuseEnabled: false },
      new AbortController().signal,
    );
    expect(row.sections?.[0]).toMatchObject({
      status: "error",
      error: { status: 403 },
    });
    const html = renderToStaticMarkup(<Results rows={[row]} />);
    expect(html).toContain("Cloudflare");
    expect(html).toContain("403");
    expect(html).toContain("不是空結果");
    expect(resultOf(row).code).toBe("none");
  });
  it("defaults older settings to simple and does not fabricate old-history confidence", () => {
    expect(normalizeState().settings).not.toHaveProperty("fullResults");
    const row: Row = {
      ip: "1.1.1.1",
      status: "done",
      queriedAt: "",
      verdict: "malicious",
      score: 100,
      errors: [],
    };
    expect(resultOf(row).legacy).toBe(true);
    expect(resultOf(row).value).toBeUndefined();
    expect(renderToStaticMarkup(<FullResult row={row} />)).toContain(
      "請重新查詢",
    );
  });
});
