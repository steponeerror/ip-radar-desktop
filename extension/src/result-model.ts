import {
  consensusOf,
  agreedCountry,
  badgesOf,
  type LookupResult,
  type AbuseSection,
} from "../../shared/intelligence";
import type { Row } from "./model";
export const verdictLabels: Record<string, string> = {
  malicious: "惡意",
  suspicious: "可疑",
  benign: "良性",
  informational: "資訊",
  reserved: "保留",
  disagreed: "分歧",
  none: "未有判定",
};
export const classLabels: Record<string, string> = {
  abuse_reports: "濫用舉報",
  blacklist: "黑名單",
  infected_system: "受感染系統",
  botnet_cc: "C2",
  brute_force: "暴力破解",
  c2_server: "C2",
  ddos: "DDoS 攻擊",
  exploit: "漏洞利用",
  hosting: "機房",
  malware: "惡意軟體",
  malware_distribution: "惡意軟體散播",
  other: "其他",
  phishing: "釣魚",
  proxy: "代理",
  scanner: "掃描",
  spam: "垃圾郵件",
  tor: "Tor",
  vpn: "VPN",
};
export function classLabel(type: string) {
  const key = type.replace(/-/g, "_");
  return classLabels[key] || key.replace(/_/g, " ");
}
export function resultOf(row: Row) {
  const sections = row.sections ?? [];
  const radar = sections.find(
    (s) => s.sourceId === "ipradar" && s.status === "ok",
  )?.data as LookupResult | undefined;
  const abuse = sections.find(
    (s) => s.sourceId === "abuseipdb" && s.status === "ok",
  )?.data as AbuseSection | undefined;
  const consensus = consensusOf(sections);
  const code = consensus.kind === "verdict" ? consensus.code : consensus.kind;
  const value = consensus.kind === "verdict" ? consensus.value : undefined;
  return {
    radar,
    abuse,
    consensus,
    code,
    value,
    label: verdictLabels[code],
    country: row.sections ? agreedCountry(sections) : row.country,
    ...badgesOf(sections),
    legacy: !row.sections && row.status === "done",
  };
}

export function countryLabel(code?: string, locale: string = "zh-Hant") {
  const regionNames = new Intl.DisplayNames([locale], {
    type: "region",
    fallback: "code",
  });
  if (!code) return undefined;
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return code;
  const name = regionNames.of(normalized);
  return name && name !== normalized
    ? locale === "en"
      ? `${normalized} (${name})`
      : `${normalized}（${name}）`
    : normalized;
}
