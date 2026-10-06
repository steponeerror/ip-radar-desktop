import type { SourceSection } from "../../shared/intelligence";
export interface Settings {
  serverUrl: string;
  radarKey: string;
  abuseKey: string;
  radarEnabled: boolean;
  abuseEnabled: boolean;
  theme: "dark" | "light";
  openInTab: boolean;
  language: import("./i18n").Language;
}
export const defaults: Settings = {
  serverUrl: "http://127.0.0.1:8000",
  radarKey: "",
  abuseKey: "",
  radarEnabled: true,
  abuseEnabled: true,
  theme: "dark",
  openInTab: false,
  language: "auto",
};
export interface Row {
  ip: string;
  queriedAt: string;
  status: "pending" | "done";
  country?: string;
  city?: string;
  score?: number;
  reports?: number;
  isp?: string;
  asn?: string | number;
  verdict?: string;
  tor?: boolean;
  radarCountry?: string;
  abuseCountry?: string;
  errors: string[];
  /** Absent in pre-detail history; never invent missing source data. */
  sections?: SourceSection[];
}
export interface Batch {
  id: string;
  createdAt: string;
  rows: Row[];
  cancelled?: boolean;
}
export interface State {
  settings: Settings;
  batches: Batch[];
}
export const initialState = (): State => ({
  settings: { ...defaults },
  batches: [],
});
export const activeBatch = (state: State) =>
  state.batches.find(
    (b) => !b.cancelled && b.rows.some((r) => r.status === "pending"),
  );
export function parseIps(text: string) {
  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const ip = token.replace(/^\[|\]$/g, "");
    if (
      /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
      ip
        .split(".")
        .every((x) => Number(x) <= 255 && (x === "0" || !x.startsWith("0")))
    )
      valid.add(ip);
    else if (ip.includes(":")) {
      try {
        valid.add(new URL(`http://[${ip}]/`).hostname.slice(1, -1));
      } catch {
        invalid.push(token);
      }
    } else invalid.push(token);
  }
  return { ips: [...valid], invalid };
}
export function serverOrigin(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Server 請使用 http(s) 網址，不包含帳密、查詢參數或 #。");
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error("Server 請使用 http(s) 網址，不包含帳密、查詢參數或 #。");
  return `${parsed.protocol}//${parsed.hostname}/*`;
}
export function validateSettings(s: Settings) {
  if (s.radarEnabled) serverOrigin(s.serverUrl);
  if (!s.radarEnabled && !s.abuseEnabled)
    throw new Error("請至少啟用一個查詢來源。");
}

export function normalizeState(state?: State): State {
  return {
    settings: { ...defaults, ...state?.settings },
    batches: state?.batches ?? [],
  };
}
