import type { Row } from "./model";
const columns: [keyof Row, string][] = [
  ["ip", "IP"],
  ["country", "地區"],
  ["score", "AbuseIPDB 分數"],
  ["city", "城市"],
  ["reports", "舉報次數"],
  ["isp", "ISP"],
  ["asn", "ASN"],
  ["verdict", "Radar 判定"],
  ["tor", "Tor"],
  ["radarCountry", "Radar 地區"],
  ["abuseCountry", "AbuseIPDB 地區"],
  ["queriedAt", "查詢時間"],
  ["status", "狀態"],
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
export function toCsv(rows: Row[]) {
  const selected = columns.filter(
    ([key]) =>
      ["ip", "country", "score"].includes(key) ||
      rows.some((row) => row[key] != null && String(row[key]) !== ""),
  );
  return (
    "\uFEFF" +
    [
      selected.map(([, label]) => csvCell(label)).join(","),
      ...rows.map((row) =>
        selected.map(([key]) => csvCell(row[key])).join(","),
      ),
    ].join("\r\n")
  );
}
export function downloadCsv(rows: Row[]) {
  const url = URL.createObjectURL(
    new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `ip-radar-${new Date().toISOString().replace(/[:.]/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
