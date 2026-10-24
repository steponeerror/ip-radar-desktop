import { exportRecord, toCsv } from "../csv";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultPanel, QueryExport } from "../ResultPanel";
import { HistoryView } from "../HistoryView";
import { initialState, type Row, type Batch } from "../model";
import {
  batchFinished,
  queriedRows,
  deleteBatches,
  emptyFilters,
  filterResults,
  toggleSelection,
  validScoreFilter,
} from "../result-controls";
const row = (ip: string, score?: number): Row => ({
  ip,
  score,
  country: "CA",
  city: "Toronto",
  status: "done",
  queriedAt: "",
  errors: [],
});
const batch = (id: string, rows = [row("1.1.1.1", 0)]): Batch => ({
  id,
  createdAt: "2026-10-14T00:00:00Z",
  rows,
});
describe("result filters", () => {
  const rows = [
    row("1.1.1.1", 0),
    row("1.1.1.2", 50),
    row("1.1.1.3", 51),
    row("1.1.1.4"),
  ];
  it("keeps greater-than strict and excludes missing scores from numeric comparisons", () => {
    expect(
      filterResults(
        rows,
        { ...emptyFilters, operator: "gt", score: "50" },
        "zh-Hant",
      ).map((r) => r.score),
    ).toEqual([51]);
    expect(
      filterResults(
        rows,
        { ...emptyFilters, operator: "gte", score: "50" },
        "zh-Hant",
      ).map((r) => r.score),
    ).toEqual([50, 51]);
    expect(
      filterResults(
        rows,
        { ...emptyFilters, operator: "eq", score: "0" },
        "zh-Hant",
      ).map((r) => r.score),
    ).toEqual([0]);
    expect(
      filterResults(rows, { ...emptyFilters, operator: "missing" }, "zh-Hant"),
    ).toEqual([rows[3]]);
  });
  it("combines text, region and score; invalid or reversed ranges match nothing", () => {
    expect(
      filterResults(
        rows,
        {
          ...emptyFilters,
          country: "CA",
          text: "加拿大",
          operator: "between",
          score: "0",
          upper: "50",
        },
        "zh-Hant",
      ),
    ).toHaveLength(2);
    expect(
      filterResults(rows, { ...emptyFilters, country: "SG" }, "en"),
    ).toEqual([]);
    for (const score of ["", "-1", "abc", "101"])
      expect(validScoreFilter({ ...emptyFilters, operator: "gt", score })).toBe(
        false,
      );
    expect(
      filterResults(
        rows,
        { ...emptyFilters, operator: "between", score: "60", upper: "50" },
        "en",
      ),
    ).toEqual([]);
  });
});
it("preserves selections across page slices and filters without mutating the previous set", () => {
  const rows = Array.from({ length: 21 }, (_, i) => row(`10.0.0.${i + 1}`, i));
  const first = toggleSelection(new Set(), rows[0].ip, true);
  const second = toggleSelection(first, rows[10].ip, true);
  expect(first.size).toBe(1);
  expect(rows.slice(0, 10).filter((r) => second.has(r.ip))).toEqual([rows[0]]);
  const filtered = filterResults(
    rows,
    { ...emptyFilters, operator: "gt", score: "15" },
    "en",
  );
  expect(filtered.filter((r) => second.has(r.ip))).toHaveLength(0);
  expect(rows.filter((r) => second.has(r.ip))).toEqual([rows[0], rows[10]]);
});
it("offers current-results export during a lookup, hides it on completion, and keeps it out of history", () => {
  const running = batch("running", [
    row("1.1.1.1", 80),
    { ...row("8.8.8.8"), status: "pending" },
  ]);
  expect(batchFinished(running)).toBe(false);
  const html = renderToStaticMarkup(<QueryExport batch={running} />);
  expect(html).toMatch(/<button[^>]* disabled=""[^>]*>/);
  expect(html).toMatch(
    /<button(?![^>]* disabled="")[^>]*>.*?導出已查詢.*?1.*?<\/button>/,
  );
  expect(renderToStaticMarkup(<QueryExport />)).not.toContain("導出已查詢");
  expect(
    renderToStaticMarkup(
      <QueryExport batch={{ ...running, cancelled: true }} />,
    ),
  ).not.toContain("導出已查詢");
  const history = renderToStaticMarkup(
    <HistoryView
      batches={[running, batch("finished")]}
      onDelete={async () => {}}
    />,
  );
  expect(history).not.toContain('value="running"');
  expect(history).toContain("查詢批次");
  expect(history).not.toContain("導出已查詢");
  running.rows[1].status = "done";
  expect(batchFinished(running)).toBe(true);
  expect(renderToStaticMarkup(<QueryExport batch={running} />)).not.toContain(
    "導出已查詢",
  );
});
it("initially renders only five IP cards and no row selection controls", () => {
  const rows = Array.from({ length: 23 }, (_, i) => row(`10.0.0.${i + 1}`));
  const html = renderToStaticMarkup(
    <ResultPanel batch={batch("large", rows)} />,
  );
  expect(html).toContain("10.0.0.5");
  expect(html).not.toContain("10.0.0.6");
  expect(html.match(/data-slot="pagination"/g)).toHaveLength(1);
  expect(html.indexOf('data-slot="pagination"')).toBeGreaterThan(
    html.indexOf("10.0.0.5"),
  );
  expect(html).not.toContain('role="checkbox"');
  expect(html).not.toContain("開始勾選");
});
it("bulk deletion is atomic and protects pending batches", () => {
  const state = initialState();
  state.batches = [
    batch("first"),
    batch("second"),
    batch("pending", [{ ...row("8.8.8.8"), status: "pending" }]),
  ];
  expect(() => deleteBatches(state, ["first", "pending"])).toThrow();
  expect(state.batches).toHaveLength(3);
  deleteBatches(state, ["first", "second"]);
  expect(state.batches.map((b) => b.id)).toEqual(["pending"]);
});

it("filters country disagreement separately from verdict and missing countries", () => {
  const conflict = {
    ...row("1.1.1.1"),
    radarCountry: "CA",
    abuseCountry: "US",
  };
  const same = { ...row("1.1.1.2"), radarCountry: "ca", abuseCountry: "CA" };
  const missing = { ...row("1.1.1.3"), radarCountry: "CA" };
  const failed = { ...conflict, ip: "1.1.1.4", sections: [] };
  expect(
    filterResults(
      [conflict, same, missing, failed],
      {
        ...emptyFilters,
        country: "disagreed",
      },
      "zh-Hant",
    ),
  ).toEqual([conflict]);
});

it("exports all 217 Radar results with the 58 available Abuse results without changing the running batch", () => {
  const rows: Row[] = Array.from({ length: 217 }, (_, i) => ({
    ip: `10.0.0.${i + 1}`,
    queriedAt: "2026-10-24T00:00:00Z",
    errors: [],
    status: i < 58 ? "done" : "pending",
    score: i < 58 ? i : undefined,
    sections: [
      {
        sourceId: "ipradar",
        status: "ok",
        data: { ip: `10.0.0.${i + 1}`, country: { value: "HK" } },
      },
      ...(i < 58
        ? [
            {
              sourceId: "abuseipdb",
              status: "ok" as const,
              data: { score: i, countryCode: "HK" },
            },
          ]
        : []),
    ],
  }));
  const running = batch("partial", [
    ...rows,
    { ip: "8.8.8.8", queriedAt: "", errors: [], status: "pending" },
  ]);
  const snapshot = structuredClone(running);
  const exported = queriedRows(running);
  expect(exported).toHaveLength(217);
  const records = exported.map((r) => exportRecord(r));
  expect(records.filter((r) => r.radarStatus === "ok")).toHaveLength(217);
  expect(records.filter((r) => typeof r.score === "number")).toHaveLength(58);
  expect(records[58].score).toBeUndefined();
  expect(records[58].abuseStatus).toBeUndefined();
  expect(toCsv(exported).split("\r\n")).toHaveLength(218);
  expect(toCsv(exported)).not.toContain('"8.8.8.8"');
  expect(running).toEqual(snapshot);
  expect(renderToStaticMarkup(<QueryExport batch={running} />)).toContain(
    "217",
  );
});

it("keeps the stopped source summary outside the selector and beside the history delete button", () => {
  const stopped: Batch = {
    ...batch("stopped", [
      {
        ...row("1.1.1.1"),
        sections: [
          { sourceId: "ipradar", status: "ok", data: { ip: "1.1.1.1" } },
        ],
      },
    ]),
    cancelled: true,
    sourceIds: ["ipradar", "abuseipdb"],
  };
  const html = renderToStaticMarkup(
    <HistoryView batches={[stopped]} onDelete={async () => {}} />,
  );
  const summary = html.match(/<p[^>]*role="status"[^>]*>(.*?)<\/p>/)?.[1];
  expect(summary).toContain("已停止");
  expect(summary).toContain("Radar 成功 1/1");
  expect(summary).toContain("AbuseIPDB 成功 0/1");
  expect(html.indexOf(summary!)).toBeLessThan(
    html.indexOf('aria-label="刪除此批次"'),
  );
  expect(html).not.toContain("導出已查詢");
});
