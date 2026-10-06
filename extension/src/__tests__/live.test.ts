import { it, expect } from "vitest";
import { lookup } from "../api";
import { defaults } from "../model";
import { resultOf } from "../result-model";
// Opt-in only. Secrets are provided through the process environment, never fixtures.
it.skipIf(
  !process.env.RADAR_LIVE_KEY ||
    !process.env.ABUSE_LIVE_KEY ||
    !process.env.RADAR_LIVE_URL,
)(
  "live Radar and AbuseIPDB both succeed for the two reference IPs",
  async () => {
    for (const [ip, code] of [
      ["85.217.149.40", "malicious"],
      ["165.245.176.134", "benign"],
    ]) {
      const row = await lookup(
        ip,
        {
          ...defaults,
          serverUrl: process.env.RADAR_LIVE_URL!,
          radarKey: process.env.RADAR_LIVE_KEY!,
          abuseKey: process.env.ABUSE_LIVE_KEY!,
        },
        AbortSignal.timeout(45000),
      );
      expect(row.errors, `${ip}: ${row.errors.join("; ")}`).toEqual([]);
      expect(row.sections?.map((s) => s.status)).toEqual(["ok", "ok"]);
      expect(resultOf(row).code).toBe(code);
      console.log(
        JSON.stringify({
          ip,
          radar: row.verdict,
          abuseScore: row.score,
          consensus: resultOf(row).consensus,
          country: row.country,
        }),
      );
    }
  },
  100000,
);
