import { describe, test, expect, vi } from "vitest";
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: vi.fn() }));
import { fetch as tf } from "@tauri-apps/plugin-http";
import { abuseipdbSource, type AbuseSection } from "../sources/abuseipdb";
import { DEFAULT_SETTINGS } from "../settings";

const S = { ...DEFAULT_SETTINGS, abuseipdbKey: "ak" };

describe("abuseipdb 源", () => {
  test("正常:Key header + maxAgeInDays=90 + 字段归一化", async () => {
    (tf as any).mockResolvedValueOnce(json(200, { data: {
      abuseConfidenceScore: 85, totalReports: 40, numDistinctUsers: 12, isTor: false,
      countryCode: "CN", isp: "China Telecom", usageType: "isp",
      lastReportedAt: "2026-09-20T00:00:00Z",
      reports: [{ comment: "ssh brute" }, { comment: "" }, { comment: "port scan" }, { comment: "4th" }],
    } }));
    const sec = await abuseipdbSource.query("1.2.3.4", S);
    const url = (tf as any).mock.calls[0][0] as string;
    expect(url).toBe("https://api.abuseipdb.com/api/v2/check?ipAddress=1.2.3.4&maxAgeInDays=90");
    expect((tf as any).mock.calls[0][1].headers.Key).toBe("ak");
    expect((tf as any).mock.calls[0][1].headers.Accept).toBe("application/json");
    const d = sec.data as AbuseSection;
    expect(d.score).toBe(85);
    expect(d.totalReports).toBe(40);
    expect(d.isp).toBe("China Telecom");
    // 只取前 3 条评论,空评论过滤
    expect(d.recentComments).toEqual(["ssh brute", "port scan"]);
  });

  test("无 key → needs-key 占位,不发请求", async () => {
    const sec = await abuseipdbSource.query("1.2.3.4", DEFAULT_SETTINGS);
    expect(sec.status).toBe("needs-key");
    expect(tf).not.toHaveBeenCalled();
  });

  test("429 → 按 retry_after 秒退避重试一次,二次成功则 ok", async () => {
    vi.useFakeTimers();
    (tf as any).mockResolvedValueOnce(json(429, { error: { retry_after: 2, message: "rate" } }))
                .mockResolvedValueOnce(json(200, { data: { abuseConfidenceScore: 0, totalReports: 0, numDistinctUsers: 0, isTor: false } }));
    const p = abuseipdbSource.query("1.2.3.4", S);
    await vi.advanceTimersByTimeAsync(2100);
    expect((await p).status).toBe("ok");
    vi.useRealTimers();
  });

  test("429 二次仍限流 → error 携带二次响应的 retry_after,且只重试一次", async () => {
    vi.useFakeTimers();
    (tf as any).mockResolvedValueOnce(json(429, { error: { retry_after: 2, message: "rate" } }))
                .mockResolvedValueOnce(json(429, { error: { retry_after: 7, message: "still rate" } }));
    const p = abuseipdbSource.query("1.2.3.4", S);
    await vi.advanceTimersByTimeAsync(3000);
    const sec = await p;
    expect(sec.status).toBe("error");
    expect(sec.error?.status).toBe(429);
    expect(sec.error?.retryAfter).toBe(7);
    expect(tf).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  test("maxConcurrency=5(调度器并发上限)", () => {
    expect(abuseipdbSource.maxConcurrency).toBe(5);
  });
});

function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status }); }
