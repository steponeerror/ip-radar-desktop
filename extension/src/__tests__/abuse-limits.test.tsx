import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { abuseKeyId, updateAbuseLimits, abuseBlocked } from "../abuse-limits";
import { defaults, normalizeState } from "../model";
import { AbuseStatusView } from "../AbuseStatus";

const now = Date.parse("2026-10-24T01:00:00Z");
it("uses the later cooldown/reset, preserves zero quota, and retains state through storage normalization", async () => {
  const id = await abuseKeyId("first-key");
  const value = updateAbuseLimits(
    {},
    new Response("", {
      status: 429,
      headers: {
        "Retry-After": "10",
        "X-RateLimit-Limit": "1000",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": String(now / 1000 + 3600),
      },
    }),
    now,
  );
  expect(value).toMatchObject({
    limit: 1000,
    remaining: 0,
    blockedUntil: now + 3600000,
    resetAt: now + 3600000,
    reason: "quota",
    estimated: false,
  });
  const restored = normalizeState(
    JSON.parse(
      JSON.stringify({
        settings: defaults,
        batches: [],
        abuseLimits: { [id]: value },
      }),
    ),
  );
  expect(abuseBlocked(restored.abuseLimits![id], now + 60000)).toBe(true);
  expect(abuseBlocked(restored.abuseLimits![id], now + 3600000)).toBe(false);
  expect(id).not.toContain("first-key");
  expect(await abuseKeyId("other-key")).not.toBe(id);
  expect(await abuseKeyId(" first-key ")).toBe(id);
});
it("supports HTTP-date and makes missing/invalid cooldown headers an explicit fallback", () => {
  const dated = updateAbuseLimits(
    {},
    new Response("", {
      status: 429,
      headers: { "Retry-After": new Date(now + 120000).toUTCString() },
    }),
    now,
  );
  expect(dated.blockedUntil).toBe(now + 120000);
  const missing = updateAbuseLimits(
    {},
    new Response("", {
      status: 429,
      headers: { "X-RateLimit-Remaining": "invalid" },
    }),
    now,
  );
  expect(missing).toMatchObject({ blockedUntil: now + 60000, estimated: true });
  expect(missing.remaining).toBeUndefined();
  expect(missing.limit).toBeUndefined();
});
it("does not invent fresh quota after cooldown and displays expired snapshots honestly", () => {
  const limits = {
    limit: 1000,
    remaining: 0,
    blockedUntil: now - 1,
    resetAt: now - 1,
    updatedAt: now - 10000,
    reason: "quota" as const,
  };
  const html = renderToStaticMarkup(
    <AbuseStatusView limits={limits} hasKey now={now} />,
  );
  expect(html).toContain("冷卻已結束");
  expect(html).toContain("實際額度待下次回應確認");
  expect(html).toContain(">0</dd>");
  expect(html).not.toContain("AbuseIPDB 需冷卻");
});
it("renders active cooldown notice and unknown quota without claiming a zero balance", () => {
  const limits = {
    blockedUntil: now + 60000,
    estimated: true,
    reason: "rate-limit" as const,
  };
  const html = renderToStaticMarkup(
    <AbuseStatusView limits={limits} hasKey now={now} />,
  );
  expect(html).toContain("AbuseIPDB 需冷卻");
  expect(html).toContain("Radar 不受影響");
  expect(html).toContain("60 秒");
  expect(html).toContain("未知");
  expect(
    renderToStaticMarkup(
      <AbuseStatusView limits={limits} hasKey={false} now={now} compact />,
    ),
  ).toBe("");
});
