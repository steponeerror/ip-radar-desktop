// Shared by desktop and Chrome: pure intelligence semantics, no platform APIs.
import type {
  SourceSection,
  SourceClaims,
  VerdictCode,
} from "../src/sources/_types";
export type {
  SourceSection,
  SourceClaims,
  VerdictCode,
} from "../src/sources/_types";
export interface LookupResult {
  ip: string;
  is_reserved?: boolean;
  error?: string;
  country?: { value: string; confidence?: number };
  city?: { value: string; confidence?: number };
  city_zh?: string | null;
  asn?: { value: number | string; confidence?: number };
  as_name?: { value: string; confidence?: number };
  ip_range?: { value: string; confidence?: number };
  threat?: {
    verdict: string;
    confidence: number;
    types: string[];
    is_cdn: boolean;
  };
  location?: { lat: number; lon: number; accuracy_radius?: number } | null;
  classifications?: Record<
    string,
    {
      verdict: string;
      detected: boolean;
      confidence: number;
      malware_names: string[];
    }
  >;
}

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

export type Consensus =
  | { kind: "reserved" }
  | { kind: "disagreed" }
  | { kind: "verdict"; code: VerdictCode; value?: number }
  | { kind: "none" };

export const ABUSE_MALICIOUS_MIN = 50;
const VERDICT_CODES: readonly VerdictCode[] = [
  "malicious",
  "suspicious",
  "benign",
];
export function radarClaims(sec: SourceSection): SourceClaims | undefined {
  if (sec.status !== "ok") return undefined;
  const d = sec.data as LookupResult;
  const v = d.threat?.verdict;
  const code = VERDICT_CODES.includes(v as VerdictCode)
    ? (v as VerdictCode)
    : undefined;
  return {
    verdict: code ? { code, value: d.threat?.confidence } : undefined,
    country: d.country?.value?.trim().toUpperCase(),
    reserved: !!d.is_reserved,
  };
}
export function abuseClaims(sec: SourceSection): SourceClaims | undefined {
  if (sec.status !== "ok") return undefined;
  const a = sec.data as AbuseSection;
  return {
    verdict:
      a.score >= ABUSE_MALICIOUS_MIN
        ? { code: "malicious", value: a.score }
        : undefined,
    country: a.countryCode?.toUpperCase(),
  };
}
export function claimsOf(sections: SourceSection[]): SourceClaims[] {
  return sections.flatMap((s) => {
    const claim =
      s.sourceId === "ipradar"
        ? radarClaims(s)
        : s.sourceId === "abuseipdb"
          ? abuseClaims(s)
          : undefined;
    return claim ? [claim] : [];
  });
}
export const consensusOf = (sections: SourceSection[]) =>
  consensusFromClaims(claimsOf(sections));
export const agreedCountry = (sections: SourceSection[]) =>
  countryFromClaims(claimsOf(sections));
export const abuseScoreBand = (score: number) =>
  score >= 60 ? "danger" : score >= 25 ? "warning" : "success";
export const confidenceBand = (conf: number) =>
  conf >= 70 ? "success" : conf >= 30 ? "warning" : "danger";
export function consensusFromClaims(all: SourceClaims[]): Consensus {
  if (all.some((c) => c.reserved)) return { kind: "reserved" };
  const verdicts = all
    .map((c) => c.verdict)
    .filter((v): v is { code: VerdictCode; value?: number } => !!v);
  if (verdicts.length === 0) return { kind: "none" };
  // 全票制:唯一 code 才出 verdict,任何混合 = 分歧(用户拍板 2026-09-28:
  // 同时都恶意才显恶意;可疑×恶意不再塌缩到恶意)
  const codes = new Set(verdicts.map((v) => v.code));
  if (codes.size > 1) return { kind: "disagreed" };
  const code = verdicts[0].code;
  // 恶意定罪需全员实际主张:任一参与源弃权(claimsOf 返回但无 verdict)= 不支持 → 分歧
  if (code === "malicious" && verdicts.length < all.length)
    return { kind: "disagreed" };
  let value: number | undefined;
  if (code !== "benign") {
    const vals = verdicts
      .map((v) => v.value)
      .filter((n): n is number => typeof n === "number");
    if (vals.length > 0) value = Math.max(...vals);
  }
  return { kind: "verdict", code, value };
}

export function countryFromClaims(all: SourceClaims[]): string | undefined {
  const countries = all.map((c) => c.country).filter((c): c is string => !!c);
  if (countries.length === 0) return undefined;
  return countries.every((c) => c === countries[0]) ? countries[0] : undefined;
}

/** 威胁分类徽章模型(ipradar classifications 的 detected 项,type 原样透传)。 */
export interface ClassBadge {
  type: string;
  verdict: string;
  confidence: number;
}

/** info 徽章模型:cdn ← ipradar threat.is_cdn;torExit ← abuseipdb isTor;usage ← abuseipdb usageType 原文。 */
export interface InfoBadge {
  kind: "cdn" | "torExit" | "usage";
  value?: string;
}

/** info 三件套固定秩:cdn → torExit → usage。运行时 sections 序 = 调度器并发完成序,
 *  输出序不能依赖输入序(否则 cdn 可能落到 Tor 出口之后)。 */
const INFO_RANK: Record<InfoBadge["kind"], number> = {
  cdn: 0,
  torExit: 1,
  usage: 2,
};

/** 从 sections 抽徽章带数据(纯函数,不引 i18n):classifications 仅 detected、按
 *  confidence 降序(同分按 type 字典序,全序确定);info 三件套按固定秩 cdn→torExit→usage
 *  (不依赖 sections 序)且与分类命中不去重(tor 分类 + TOR 出口并存 = 双源佐证);
 *  needs-key/error 源的徽章自然缺失,不占位。 */
export function badgesOf(sections: SourceSection[]): {
  classes: ClassBadge[];
  infos: InfoBadge[];
} {
  const classes: ClassBadge[] = [];
  const infos: InfoBadge[] = [];
  for (const sec of sections) {
    if (sec.status !== "ok") continue;
    if (sec.sourceId === "ipradar") {
      const d = sec.data as LookupResult;
      for (const [type, c] of Object.entries(d.classifications ?? {})) {
        if (c.detected)
          classes.push({ type, verdict: c.verdict, confidence: c.confidence });
      }
      if (d.threat?.is_cdn) infos.push({ kind: "cdn" });
    } else if (sec.sourceId === "abuseipdb") {
      const a = sec.data as AbuseSection;
      if (a.isTor) infos.push({ kind: "torExit" });
      if (a.usageType) infos.push({ kind: "usage", value: a.usageType });
    }
  }
  classes.sort(
    (x, y) =>
      y.confidence - x.confidence ||
      (x.type < y.type ? -1 : x.type > y.type ? 1 : 0),
  );
  infos.sort((x, y) => INFO_RANK[x.kind] - INFO_RANK[y.kind]);
  return { classes, infos };
}
