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
  return state;
}
