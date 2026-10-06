import { translate, translateError, type Locale } from "./i18n";
import type { Row } from "./model";
import { resultOf, classLabel } from "./result-model";
const columns: [string, string][] = [
  ["ip", "IP"],
  ["country", "地區代碼"],
  ["city", "城市"],
  ["score", "AbuseIPDB 分數"],
  ["consensus", "總判定"],
  ["consensusValue", "判定原生數值"],
  ["isp", "ISP"],
  ["asn", "ASN"],
  ["usage", "用途"],
  ["classifications", "分類命中（判定／信心）"],
  ["malwareNames", "惡意軟體名稱"],
  ["cdn", "CDN"],
  ["tor", "Tor"],
  ["reports", "舉報次數"],
  ["reporters", "舉報人數"],
  ["lastReported", "最後舉報"],
  ["comments", "最近舉報摘要"],
  ["verdict", "Radar 判定"],
  ["radarConfidence", "Radar 威脅信心"],
  ["radarCountry", "Radar 地區"],
  ["abuseCountry", "AbuseIPDB 地區"],
  ["countryConfidence", "Radar 地區信心"],
  ["cityConfidence", "Radar 城市信心"],
  ["asnConfidence", "Radar ASN 信心"],
  ["ispConfidence", "Radar 業者信心"],
  ["range", "IP 範圍"],
  ["rangeConfidence", "Radar IP 範圍信心"],
  ["lat", "緯度"],
  ["lon", "經度"],
  ["accuracy", "定位精度 km"],
  ["queriedAt", "查詢時間"],
  ["status", "狀態"],
  ["radarStatus", "Radar 來源狀態"],
  ["abuseStatus", "AbuseIPDB 來源狀態"],
  ["errors", "來源訊息"],
];
export function csvCell(value: unknown): string {
  let text =
    value == null
      ? ""
      : Array.isArray(value)
        ? value.join(" | ")
        : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportRecord(
  row: Row,
  locale: Locale = "zh-Hant",
): Record<string, unknown> {
  const r = resultOf(row);
  return {
    ...row,
    country: r.country,
    city: r.radar?.city?.value || row.city,
    errors: row.errors.map((e) => translateError(e, locale)),
    consensus:
      row.sections && row.status === "done"
        ? translate(r.label, locale)
        : undefined,
    consensusValue: r.value,
    radarConfidence: r.radar?.threat?.confidence,
    countryConfidence: r.radar?.country?.confidence,
    cityConfidence: r.radar?.city?.confidence,
    asnConfidence: r.radar?.asn?.confidence,
    ispConfidence: r.radar?.as_name?.confidence,
    range: r.radar?.ip_range?.value,
    rangeConfidence: r.radar?.ip_range?.confidence,
    lat: r.radar?.location?.lat,
    lon: r.radar?.location?.lon,
    accuracy: r.radar?.location?.accuracy_radius,
    classifications: r.classes.map(
      (c) =>
        `${translate(classLabel(c.type), locale)}: ${c.verdict} / ${c.confidence}`,
    ),
    malwareNames: Object.values(r.radar?.classifications ?? {})
      .filter((c) => c.detected)
      .flatMap((c) => c.malware_names || []),
    cdn: r.radar?.threat?.is_cdn,
    usage: r.abuse?.usageType,
    reporters: r.abuse?.numDistinctUsers,
    lastReported: r.abuse?.lastReportedAt,
    comments: r.abuse?.recentComments,
    radarStatus: row.sections?.find((s) => s.sourceId === "ipradar")?.status,
    abuseStatus: row.sections?.find((s) => s.sourceId === "abuseipdb")?.status,
  };
}
export function toCsv(input: Row[], locale: Locale = "zh-Hant") {
  const rows = input.map((row) => exportRecord(row, locale));
  const selected = columns.filter(
    ([key]) =>
      ["ip", "country", "city", "score"].includes(key) ||
      rows.some((row) => row[key] != null && String(row[key]) !== ""),
  );
  return (
    "\uFEFF" +
    [
      selected.map(([, label]) => csvCell(translate(label, locale))).join(","),
      ...rows.map((row) =>
        selected.map(([key]) => csvCell(row[key])).join(","),
      ),
    ].join("\r\n")
  );
}
export function downloadCsv(rows: Row[], locale: Locale = "zh-Hant") {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows, locale)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `ip-radar-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
