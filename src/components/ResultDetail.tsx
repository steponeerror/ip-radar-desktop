// 单 IP 详情卡:顶部 ipradar 摘要(verdict + threat types + geo/ASN 网格),
// 下面每源一张 section 卡(ipradar classifications 折叠 / abuseipdb 分数条 + 报告)。
import type { SourceSection, Settings } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";
import { VERDICT_STYLE, scoreTone } from "./badges";
import { useI18n } from "../i18n";
import { ArrowLeft } from "@phosphor-icons/react";

function abuseOf(sec: SourceSection): AbuseSection | undefined {
  return sec.sourceId === "abuseipdb" && sec.status === "ok"
    ? (sec.data as AbuseSection)
    : undefined;
}

function errorText(code: number | undefined, message: string, retryAfter: number | undefined, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === 401) return t("err.401");
  if (code === 403) return t("err.403");
  if (code === 429) return t("err.429", { seconds: retryAfter ?? 30 });
  if (/timeout/i.test(message)) return t("err.timeout");
  return message;
}

function GridRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  const shown = value === undefined || value === null || value === "" ? "-" : String(value);
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span className="truncate text-zinc-300" title={shown}>{shown}</span>
    </div>
  );
}

function SummaryCard({ ip, d }: { ip: string; d: LookupResult | undefined }) {
  const { t } = useI18n();
  const verdict = d?.threat?.verdict;
  const city = d?.city?.value && d.city.value !== "N/A" ? d.city.value : undefined;
  const cityZh = d?.city_zh ?? undefined;
  return (
    <div className="space-y-3 rounded-md border border-zinc-800 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-mono text-lg text-zinc-100">{ip}</h2>
        {d?.is_reserved ? (
          <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE.reserved}`}>
            {t("verdict.reserved")}
          </span>
        ) : verdict ? (
          <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}>
            {t(`verdict.${verdict}`)}
            {(verdict === "malicious" || verdict === "suspicious") && (
              <span className="font-mono text-[10px] opacity-80">{d.threat!.confidence}</span>
            )}
          </span>
        ) : null}
      </div>
      {(d?.threat?.types?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {d!.threat!.types.map(type => (
            <span key={type} className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">
              {type}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <GridRow label={t("column.country")} value={d?.country?.value} />
        <GridRow label={t("column.city")} value={cityZh ? `${city ?? ""}(${cityZh})` : city} />
        <GridRow label="ASN" value={d?.asn?.value} />
        <GridRow label={t("column.operator")} value={d?.as_name?.value} />
        <GridRow label={t("ipDetail.range")} value={d?.ip_range?.value} />
        <GridRow
          label="GPS"
          value={d?.location ? `${d.location.lat.toFixed(2)},${d.location.lon.toFixed(2)}` : undefined}
        />
      </div>
    </div>
  );
}

function IpradarCard({ d }: { d: LookupResult }) {
  const { t } = useI18n();
  const entries = Object.entries(d.classifications ?? {})
    .filter(([, c]) => c.detected)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-md border border-zinc-800 p-4">
      <h3 className="mb-2 text-sm font-medium text-zinc-400">{t("src.ipradar")}</h3>
      <details>
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
          {entries.length} classifications ▾
        </summary>
        <ul className="mt-2 space-y-1.5">
          {entries.map(([type, c]) => (
            <li key={type} className="flex items-center gap-2 text-xs">
              <span className="font-mono text-zinc-300">{type}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_STYLE[c.verdict] ?? VERDICT_STYLE.informational}`}>
                {t(`verdict.${c.verdict}`)}
              </span>
              <span className="font-mono text-[10px] text-zinc-500">{c.confidence}</span>
              {c.malware_names.length > 0 && (
                <span className="truncate text-[10px] text-zinc-600" title={c.malware_names.join(", ")}>
                  {c.malware_names.join(", ")}
                </span>
              )}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function AbuseCard({ a }: { a: AbuseSection }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2 rounded-md border border-zinc-800 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-400">{t("src.abuseipdb")}</h3>
        <span className="font-mono text-sm text-zinc-200">{a.score}/100</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div
          className={`h-1.5 rounded-full ${scoreTone(a.score)}`}
          style={{ width: `${Math.min(Math.max(a.score, 0), 100)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <GridRow label={t("abuse.country")} value={a.countryCode} />
        <GridRow label={t("abuse.isp")} value={a.isp} />
        <GridRow label={t("abuse.usage")} value={a.usageType} />
        <GridRow label={t("abuse.tor")} value={a.isTor ? "true" : undefined} />
        <GridRow label={t("abuse.reports")} value={a.totalReports} />
        <GridRow label={t("abuse.reporters")} value={a.numDistinctUsers} />
        <GridRow label={t("abuse.last")} value={a.lastReportedAt?.slice(0, 10)} />
      </div>
      {a.recentComments.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-zinc-500">
          {a.recentComments.map((c, i) => (
            <li key={i} className="truncate" title={c}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResultDetail({
  ip,
  sections,
  settings,
  onBack,
  backLabel,
  onGoSettings,
}: {
  ip: string;
  sections: SourceSection[];
  settings: Settings;
  onBack: () => void;
  backLabel: string;
  onGoSettings: () => void;
}) {
  const { t } = useI18n();
  const ipradar = sections.find(s => s.sourceId === "ipradar");
  const d = ipradar?.status === "ok" ? (ipradar.data as LookupResult) : undefined;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-zinc-800 px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition active:scale-[0.97] hover:bg-zinc-800 hover:text-zinc-300"
        >
          <ArrowLeft size={12} weight="bold" /> {backLabel}
        </button>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <SummaryCard ip={ip} d={d} />
        {sections.map(sec => {
          if (sec.status === "ok" && sec.sourceId === "ipradar" && d) return <IpradarCard key={sec.sourceId} d={d} />;
          if (sec.status === "ok" && sec.sourceId === "abuseipdb") {
            const a = abuseOf(sec);
            if (a) return <AbuseCard key={sec.sourceId} a={a} />;
          }
          if (sec.status === "needs-key") {
            if (!settings.showMissingKey) return null;
            return (
              <div key={sec.sourceId} className="rounded-md border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-zinc-400">{t(`src.${sec.sourceId}`)}</h3>
                <p className="mt-1 text-xs text-zinc-500">{t("guidance.needsKey")}</p>
                <button
                  onClick={onGoSettings}
                  className="mt-2 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-700"
                >
                  {t("guidance.goSettings")}
                </button>
              </div>
            );
          }
          if (sec.status === "error" && sec.error?.code !== "warming") {
            return (
              <div key={sec.sourceId} className="rounded-md border border-red-500/25 bg-red-500/5 p-4">
                <h3 className="text-sm font-medium text-zinc-400">{t(`src.${sec.sourceId}`)}</h3>
                <p className="mt-1 text-xs text-red-400">
                  {errorText(sec.error?.status, sec.error?.message ?? "", sec.error?.retryAfter, t)}
                </p>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
