// 结果派生与筛选(纯函数,无 React):插件端 result-model/result-controls 的 sections 形状对应物。
// 主视图当前结果与历史回看共用同一套筛选(共识 Q5);筛选只决行去留,不破 L1 零泄漏(CONTEXT.md)。
// 与插件端行为一致性由 __tests__/result-model.test.ts 用插件同一 fixtures 钉住。
import type { LookupResult, AbuseSection, Consensus, SourceSection } from "../shared/intelligence";
import { consensusOf, agreedCountry } from "./components/consensus";

export interface DerivedResult {
  radar?: LookupResult;
  abuse?: AbuseSection;
  consensus: Consensus;
  /** 共识 code 或 kind:malicious/suspicious/benign/disagreed/reserved/none */
  code: string;
  value?: number;
  country?: string; // 多源一致国家
  city?: string;
  isp?: string;
  score?: number; // AbuseIPDB 分数
}

export function resultOf(sections: SourceSection[]): DerivedResult {
  const radar = sections.find((s) => s.sourceId === "ipradar" && s.status === "ok")
    ?.data as LookupResult | undefined;
  const abuse = sections.find((s) => s.sourceId === "abuseipdb" && s.status === "ok")
    ?.data as AbuseSection | undefined;
  const consensus = consensusOf(sections);
  return {
    radar,
    abuse,
    consensus,
    code: consensus.kind === "verdict" ? consensus.code : consensus.kind,
    value: consensus.kind === "verdict" ? consensus.value : undefined,
    country: agreedCountry(sections),
    city: radar?.city?.value,
    isp: radar?.as_name?.value ?? abuse?.isp,
    score: abuse?.score,
  };
}

/** 国家代码 → 本地化展示(CA → CA(加拿大));非法代码原样返回。与插件端 countryLabel 同语义。 */
export function countryLabel(code?: string, locale: string = "zh"): string | undefined {
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return code;
  const regionNames = new Intl.DisplayNames([locale === "en" ? "en" : "zh"], {
    type: "region",
    fallback: "code",
  });
  const name = regionNames.of(normalized);
  return name && name !== normalized
    ? locale === "en"
      ? `${normalized} (${name})`
      : `${normalized}（${name}）`
    : normalized;
}

export type ScoreOperator = "any" | "gt" | "gte" | "lt" | "lte" | "eq" | "between" | "missing";

export interface ResultFilters {
  text: string;
  operator: ScoreOperator;
  score: string;
  upper: string;
  country: string;
  verdict: string;
}

export const emptyFilters: ResultFilters = {
  text: "",
  operator: "any",
  score: "50",
  upper: "100",
  country: "",
  verdict: "",
};

/** 筛选下拉的共识 code 全集(= resultOf().code 的值域)。 */
export const VERDICT_CODES = [
  "malicious",
  "suspicious",
  "benign",
  "disagreed",
  "reserved",
  "none",
] as const;

export function validScoreFilter(f: ResultFilters): boolean {
  if (f.operator === "any" || f.operator === "missing") return true;
  const valid = (value: string) =>
    value.trim() !== "" &&
    Number.isFinite(Number(value)) &&
    Number(value) >= 0 &&
    Number(value) <= 100;
  return (
    valid(f.score) &&
    (f.operator !== "between" || (valid(f.upper) && Number(f.upper) >= Number(f.score)))
  );
}

export type ResultRow = [ip: string, sections: SourceSection[]];

/** 筛选主函数:无效分数条件 → 空(输入即反馈);其余维度语义照搬插件端 filterResults。 */
export function filterResults(rows: ResultRow[], f: ResultFilters, locale: string): ResultRow[] {
  if (!validScoreFilter(f)) return [];
  return rows.filter(([ip, sections]) => {
    const r = resultOf(sections);
    const text = [ip, r.country, countryLabel(r.country, locale), r.city, r.isp]
      .join(" ")
      .toLowerCase();
    if (
      !text.includes(f.text.trim().toLowerCase()) ||
      (f.country && r.country !== f.country) ||
      (f.verdict && r.code !== f.verdict)
    )
      return false;
    const score = r.score;
    if (f.operator === "any") return true;
    if (f.operator === "missing") return score == null;
    if (score == null) return false;
    const value = Number(f.score);
    switch (f.operator) {
      case "gt":
        return score > value;
      case "gte":
        return score >= value;
      case "lt":
        return score < value;
      case "lte":
        return score <= value;
      case "eq":
        return score === value;
      case "between":
        return score >= value && score <= Number(f.upper);
    }
  });
}

/** 当前数据里出现过的国家代码(排序去重),供筛选下拉。 */
export function availableCountries(rows: ResultRow[]): string[] {
  return [...new Set(rows.map(([, sections]) => resultOf(sections).country).filter((c): c is string => !!c))].sort();
}
