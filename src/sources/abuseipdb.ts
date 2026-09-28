// abuseipdb 源:云端 IP 信誉查询。免费档 1000 次/天,429 按 retry_after 秒退避、重试一次。
// 无 key → needs-key 占位(渲染与否由设置 showMissingKey 决定,源不关心)。
import { fetch as tf } from "@tauri-apps/plugin-http";
import type { QuerySource } from "./_types";

// 恶意主张门槛(2026-09-28 二定):二元主张,分数 ≥50 才构成恶意主张,0-49 = 弃权。
// 程度由标签数值表达(徽章 value=max 原生刻度,不归一),不设可疑档——两档会把连续分数
// 打包成不同选票,59/61 分界制造假分歧。依据:官方地板 25/行动建议 75-100,生态二元
// 恶意 cutoff 集中在 50-80(GitHub 代码搜索 2026-09-28)。
export const ABUSE_MALICIOUS_MIN = 50;

export interface AbuseSection {
  score: number;
  totalReports: number;
  numDistinctUsers: number;
  isTor: boolean;
  countryCode?: string;
  isp?: string;
  usageType?: string;
  lastReportedAt?: string;
  recentComments: string[];
}

export const abuseipdbSource: QuerySource = {
  id: "abuseipdb",
  label: "AbuseIPDB",
  maxConcurrency: 5,
  claimsOf(sec) {
    if (sec.status !== "ok") return undefined;
    const a = sec.data as AbuseSection;
    return {
      // ≥50 即恶意主张(二元,分数=程度由 value 表达),<50 = 弃权(官方无分带)
      verdict: a.score >= ABUSE_MALICIOUS_MIN ? { code: "malicious", value: a.score } : undefined,
      country: a.countryCode?.toUpperCase(),
    };
  },
  async query(ip, s) {
    if (!s.abuseipdbKey) return { sourceId: "abuseipdb", status: "needs-key" };
    const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`;
    const go = () => tf(url, {
      headers: { Key: s.abuseipdbKey, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    let r = await go();
    if (r.status === 429) {
      const first = await r.json().catch(() => null);
      const waitMs = ((first?.error?.retry_after ?? 1) as number) * 1000;
      await new Promise(res => setTimeout(res, waitMs));
      r = await go();
      if (r.status === 429) {
        const second = await r.json().catch(() => null);
        return {
          sourceId: "abuseipdb", status: "error",
          error: {
            status: 429,
            message: second?.error?.message ?? "rate limited",
            retryAfter: second?.error?.retry_after ?? first?.error?.retry_after,
          },
        };
      }
    }
    if (!r.ok) {
      return { sourceId: "abuseipdb", status: "error", error: { status: r.status, message: r.statusText } };
    }
    const d = (await r.json()).data;
    return {
      sourceId: "abuseipdb", status: "ok",
      data: {
        score: d.abuseConfidenceScore ?? 0,
        totalReports: d.totalReports ?? 0,
        numDistinctUsers: d.numDistinctUsers ?? 0,
        isTor: !!d.isTor,
        countryCode: d.countryCode,
        isp: d.isp,
        usageType: d.usageType,
        lastReportedAt: d.lastReportedAt,
        // 最多 3 条非空评论给 ResultDetail 摘要
        recentComments: (d.reports ?? []).slice(0, 3).map((x: any) => x.comment).filter(Boolean),
      } as AbuseSection,
    };
  },
};

export default abuseipdbSource;
