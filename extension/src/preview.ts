// Development-only, captured reference responses. No API keys or live requests.
import fixtures from "./__tests__/fixtures/intelligence.json";
import { initialState, type Row } from "./model";
export function referencePreview() {
  const state = initialState();
  state.batches = [
    {
      id: "reference",
      createdAt: "2026-10-05T16:37:10Z",
      rows: fixtures.map(({ radar: d, abuse: { data: a } }): Row => ({
        ip: d.ip,
        queriedAt: "2026-10-05T16:37:10Z",
        status: "done",
        errors: [],
        country: d.country.value,
        city: d.city_zh || d.city.value,
        radarCountry: d.country.value,
        abuseCountry: a.countryCode,
        score: a.abuseConfidenceScore,
        reports: a.totalReports,
        isp: d.as_name.value,
        asn: d.asn.value,
        verdict: d.threat.verdict,
        sections: [
          { sourceId: "ipradar", status: "ok", data: d },
          {
            sourceId: "abuseipdb",
            status: "ok",
            data: {
              score: a.abuseConfidenceScore,
              totalReports: a.totalReports,
              numDistinctUsers: a.numDistinctUsers,
              isTor: a.isTor,
              countryCode: a.countryCode,
              isp: a.isp,
              usageType: a.usageType,
              lastReportedAt: a.lastReportedAt,
              recentComments: [],
            },
          },
        ],
      })),
    },
  ];
  // Synthetic, development-only pagination / selection fixtures.
  const scenario = new URLSearchParams(location.search).get("scenario");
  if (scenario === "controls" || scenario === "running") {
    const rows = Array.from({ length: 23 }, (_, i) => {
      const row = structuredClone(state.batches[0].rows[i % 2]);
      row.ip = `192.0.2.${i + 1}`;
      row.score = i * 4;
      const abuse = row.sections?.find((s) => s.sourceId === "abuseipdb");
      if (abuse) (abuse.data as { score: number }).score = row.score;
      return row;
    });
    state.batches = [
      { id: "preview-large", createdAt: "2026-10-14T00:00:00Z", rows },
      ...state.batches,
    ];
    if (scenario === "running")
      state.batches.unshift({
        id: "preview-running",
        createdAt: "2026-10-14T01:00:00Z",
        rows: rows.map((row, i) =>
          i < 3 ? row : { ...row, status: "pending" },
        ),
      });
  }
  return state;
}
