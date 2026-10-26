import { expect, it } from "vitest";
import { csvFromBatches, toCsv } from "../csv";
import type { Row } from "../model";
const batches: Record<string, Row[]> = {
  a: [{ ip: "1.1.1.1", queriedAt: "", status: "done", errors: [], score: 0 }],
  empty: [],
  b: [
    {
      ip: "8.8.8.8",
      queriedAt: "now",
      status: "done",
      errors: ['bad,"message"\nnext'],
      isp: "=formula",
      sections: [
        {
          sourceId: "abuseipdb",
          status: "ok",
          data: {
            score: 90,
            totalReports: 3,
            numDistinctUsers: 2,
            recentComments: ["test"],
            domain: "example.org",
            hostnames: ["a.example.org"],
            isWhitelisted: true,
            isTor: false,
          },
        },
      ],
    },
  ],
};
it.each(["zh-Hant", "en"] as const)(
  "matches the existing CSV bytes and dynamic columns in %s",
  async (locale) => {
    const calls: string[] = [];
    let concurrent = 0,
      max = 0;
    const blob = await csvFromBatches(
      ["a", "empty", "b"],
      async (id) => {
        calls.push(id);
        max = Math.max(max, ++concurrent);
        await Promise.resolve();
        concurrent--;
        return structuredClone(batches[id]);
      },
      locale,
    );
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(
      Buffer.from(toCsv([...batches.a, ...batches.b], locale)),
    );
    expect(calls).toEqual(["a", "empty", "b", "a", "empty", "b"]);
    expect(max).toBe(1);
  },
);
it("handles no batches and fails instead of silently exporting incomplete history", async () => {
  expect(
    Buffer.from(await (await csvFromBatches([], async () => [])).arrayBuffer()),
  ).toEqual(Buffer.from(toCsv([])));
  let calls = 0;
  await expect(
    csvFromBatches(["a"], async () => {
      if (++calls === 2) throw new Error("deleted");
      return batches.a;
    }),
  ).rejects.toThrow("deleted");
});
