// 单 IP 详情:brutalist 分区制 —— 直角 hairline compartment + gap-px 发丝网格(§8.1),
// 徽章/色语义逐字对齐 server(threatDisplay.ts)。每源一个 Section 分区。
import type { SourceSection, Settings } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";
import { VERDICT_STYLE, scoreTone, TECH_LABEL } from "./badges";
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

/** 发丝网格单元格:微字标 + mono 值。父级 grid gap-px bg-zinc-800 生成 hairline。 */
function Cell({ label, value, wide }: { label: string; value: string | number | undefined | null; wide?: boolean }) {
  const shown = value === undefined || value === null || value === "" ? "-" : String(value);
  return (
    <div className={`bg-zinc-950 px-3 py-2 ${wide ? "col-span-2" : ""}`}>
      <div className={TECH_LABEL}>{label}</div>
      <div className="mt-0.5 truncate font-mono text-xs text-zinc-300" title={shown}>{shown}</div>
    </div>
  );
}

/** 结构分区:直角 hairline 盒,标题条 = 微字标 + 右侧遥测读数。 */
function Section({ title, right, children, tone }: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  tone?: "error";
}) {
  return (
    <div className={`overflow-hidden rounded-lg border ${tone === "error" ? "border-red-500/25 bg-red-500/5" : "border-zinc-800"}`}>
      <div className={`flex items-center justify-between gap-2 border-b px-3 py-1.5 ${tone === "error" ? "border-red-500/20 bg-red-500/5" : "border-zinc-800 bg-zinc-900/60"}`}>
        <span className={tone === "error" ? "font-mono text-[10px] uppercase tracking-[0.1em] text-red-400" : TECH_LABEL}>{title}</span>
        {right}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function SummaryCard({ ip, d }: { ip: string; d: LookupResult | undefined }) {
  const { t } = useI18n();
  const verdict = d?.threat?.verdict;
  const city = d?.city?.value && d.city.value !== "N/A" ? d.city.value : undefined;
  const cityZh = d?.city_zh ?? undefined;
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
        <h2 className="min-w-0 truncate font-mono text-xl tracking-tight text-zinc-100" title={ip}>{ip}</h2>
        {d?.is_reserved ? (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE.reserved}`}>
            {t("verdict.reserved")}
          </span>
        ) : verdict ? (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}>
            {t(`verdict.${verdict}`)}
            {(verdict === "malicious" || verdict === "suspicious") && (
              <span className="font-mono text-[10px] opacity-80">{d.threat!.confidence}</span>
            )}
          </span>
        ) : null}
      </div>
      {(d?.threat?.types?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-3 py-2">
          {d!.threat!.types.map(type => (
            <span key={type} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300">
              {type}
            </span>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-px bg-zinc-800/70">
        <Cell label={t("column.country")} value={d?.country?.value} />
        <Cell label={t("column.city")} value={cityZh ? `${city ?? ""}(${cityZh})` : city} />
        <Cell label="ASN" value={d?.asn?.value} />
        <Cell label={t("column.operator")} value={d?.as_name?.value} />
        <Cell label={t("ipDetail.range")} value={d?.ip_range?.value} />
        <Cell label="GPS" value={d?.location ? `${d.location.lat.toFixed(2)},${d.location.lon.toFixed(2)}` : undefined} />
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
    <Section title={t("src.ipradar")} right={<span className="font-mono text-xs text-zinc-500">{entries.length} cls</span>}>
      <ul className="space-y-1.5">
        {entries.map(([type, c]) => (
          <li key={type} className="flex items-center gap-2 text-xs">
            <span className="font-mono text-zinc-300">{type}</span>
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_STYLE[c.verdict] ?? VERDICT_STYLE.informational}`}>
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
    </Section>
  );
}

function AbuseCard({ a }: { a: AbuseSection }) {
  const { t } = useI18n();
  return (
    <Section title={t("src.abuseipdb")} right={<span className="font-mono text-sm text-zinc-200">{a.score}/100</span>}>
      <div className="mb-3 h-1 w-full rounded-full bg-zinc-800">
        <div
          className={`h-1 rounded-full ${scoreTone(a.score)}`}
          style={{ width: `${Math.min(Math.max(a.score, 0), 100)}%` }}
        />
      </div>
      <div className="-mx-3 -mb-3 grid grid-cols-2 gap-px bg-zinc-800/70">
        <Cell label={t("abuse.country")} value={a.countryCode} />
        <Cell label={t("abuse.isp")} value={a.isp} />
        <Cell label={t("abuse.usage")} value={a.usageType} />
        <Cell label={t("abuse.tor")} value={a.isTor ? "true" : undefined} />
        <Cell label={t("abuse.reports")} value={a.totalReports} />
        <Cell label={t("abuse.reporters")} value={a.numDistinctUsers} />
        <Cell label={t("abuse.last")} value={a.lastReportedAt?.slice(0, 10)} wide />
      </div>
      {a.recentComments.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-zinc-500">
          {a.recentComments.map((c, i) => (
            <li key={i} className="truncate" title={c}>{c}</li>
          ))}
        </ul>
      )}
    </Section>
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
      <div className="space-y-3 overflow-y-auto p-4">
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
              <Section key={sec.sourceId} title={t(`src.${sec.sourceId}`)}>
                <p className="text-xs text-zinc-500">{t("guidance.needsKey")}</p>
                <button
                  onClick={onGoSettings}
                  className="mt-2 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-700"
                >
                  {t("guidance.goSettings")}
                </button>
              </Section>
            );
          }
          if (sec.status === "error" && sec.error?.code !== "warming") {
            return (
              <Section key={sec.sourceId} title={t(`src.${sec.sourceId}`)} tone="error">
                <p className="text-xs text-red-400">
                  {errorText(sec.error?.status, sec.error?.message ?? "", sec.error?.retryAfter, t)}
                </p>
              </Section>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
