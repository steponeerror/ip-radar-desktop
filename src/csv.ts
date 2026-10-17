// CSV 导出(纯函数):插件端 csv.ts 的 sections 形状对应物,富列/BOM/公式注入防护照搬(共识 Q7)。
// 列头走桌面 i18n key 制(csv.col.*);落盘经 Rust save_csv(rfd 原生另存为)。
import { badgesOf } from "../shared/intelligence";
import type { SourceSection } from "../shared/intelligence";
import { resultOf } from "./result-model";

export interface CsvRow {
  ip: string;
  sections: SourceSection[];
  at: number; // 查询时间(epoch ms)
}

// [输出键, i18n key]:35 富列照搬插件端
const columns: [string, string][] = [
  ["ip", "csv.col.ip"],
  ["country", "csv.col.country"],
  ["city", "csv.col.city"],
  ["score", "csv.col.score"],
  ["consensus", "csv.col.consensus"],
  ["consensusValue", "csv.col.consensusValue"],
  ["isp", "csv.col.isp"],
  ["asn", "csv.col.asn"],
  ["usage", "csv.col.usage"],
  ["classifications", "csv.col.classifications"],
  ["malwareNames", "csv.col.malwareNames"],
  ["cdn", "csv.col.cdn"],
  ["tor", "csv.col.tor"],
  ["reports", "csv.col.reports"],
  ["reporters", "csv.col.reporters"],
  ["lastReported", "csv.col.lastReported"],
  ["comments", "csv.col.comments"],
  ["verdict", "csv.col.verdict"],
  ["radarConfidence", "csv.col.radarConfidence"],
  ["radarCountry", "csv.col.radarCountry"],
  ["abuseCountry", "csv.col.abuseCountry"],
  ["countryConfidence", "csv.col.countryConfidence"],
  ["cityConfidence", "csv.col.cityConfidence"],
  ["asnConfidence", "csv.col.asnConfidence"],
  ["ispConfidence", "csv.col.ispConfidence"],
  ["range", "csv.col.range"],
  ["rangeConfidence", "csv.col.rangeConfidence"],
  ["lat", "csv.col.lat"],
  ["lon", "csv.col.lon"],
  ["accuracy", "csv.col.accuracy"],
  ["queriedAt", "csv.col.queriedAt"],
  ["status", "csv.col.status"],
  ["radarStatus", "csv.col.radarStatus"],
  ["abuseStatus", "csv.col.abuseStatus"],
  ["errors", "csv.col.errors"],
];

type T = (key: string, vars?: Record<string, string | number>) => string;

export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : Array.isArray(value)
        ? value.join(" | ")
        : String(value);
  // 公式注入防护:=+-@ 开头或前导空白/制表符 → 前缀单引号
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportRecord(row: CsvRow, t: T): Record<string, unknown> {
  const r = resultOf(row.sections);
  return {
    ip: row.ip,
    country: r.country,
    city: r.city,
    score: r.score,
    consensus: t(`verdict.${r.code}`),
    consensusValue: r.value,
    isp: r.isp,
    asn: r.radar?.asn?.value,
    usage: r.abuse?.usageType,
    classifications: badgesOf(row.sections).classes.map(
      c => `${t(`class.${c.type.replace(/-/g, "_")}`)}: ${c.verdict} / ${c.confidence}`,
    ),
    malwareNames: Object.values(r.radar?.classifications ?? {})
      .filter(c => c.detected)
      .flatMap(c => c.malware_names || []),
    cdn: r.radar?.threat?.is_cdn,
    tor: r.abuse?.isTor,
    reports: r.abuse?.totalReports,
    reporters: r.abuse?.numDistinctUsers,
    lastReported: r.abuse?.lastReportedAt,
    comments: r.abuse?.recentComments,
    verdict: r.radar?.threat?.verdict,
    radarConfidence: r.radar?.threat?.confidence,
    radarCountry: r.radar?.country?.value,
    abuseCountry: r.abuse?.countryCode,
    countryConfidence: r.radar?.country?.confidence,
    cityConfidence: r.radar?.city?.confidence,
    asnConfidence: r.radar?.asn?.confidence,
    ispConfidence: r.radar?.as_name?.confidence,
    range: r.radar?.ip_range?.value,
    rangeConfidence: r.radar?.ip_range?.confidence,
    lat: r.radar?.location?.lat,
    lon: r.radar?.location?.lon,
    accuracy: r.radar?.location?.accuracy_radius,
    queriedAt: new Date(row.at).toISOString(),
    status: "done", // 桌面回填仅在查询完成后发生(共识 Q8:中途关窗落骨架)
    radarStatus: row.sections.find(s => s.sourceId === "ipradar")?.status,
    abuseStatus: row.sections.find(s => s.sourceId === "abuseipdb")?.status,
    errors: row.sections
      .filter(s => s.status === "error")
      .map(s => `${t(`src.${s.sourceId}`)}: ${s.error?.message ?? ""}`),
  };
}

/** BOM + CRLF;ip/country/city/score 恒选,其余列任一行非空才选(照搬插件端列选择规则)。 */
export function toCsv(rows: CsvRow[], t: T): string {
  const records = rows.map(row => exportRecord(row, t));
  const selected = columns.filter(
    ([key]) =>
      ["ip", "country", "city", "score"].includes(key) ||
      records.some(rec => rec[key] != null && String(rec[key]) !== ""),
  );
  return (
    "\uFEFF" +
    [
      selected.map(([, key]) => csvCell(t(key))).join(","),
      ...records.map(rec => selected.map(([key]) => csvCell(rec[key])).join(",")),
    ].join("\r\n")
  );
}

/** 默认导出文件名:ip-radar-YYYYMMDD-HHmmss.csv(共识 Q7)。 */
export function defaultCsvName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `ip-radar-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}.csv`;
}
