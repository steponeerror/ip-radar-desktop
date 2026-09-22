// 单 IP 详情(判定优先 + 源手风琴):SummaryCard 瘦身为两行 —— 行1 IP+融合判定
// 徽章(+威胁类型 chips),行2 地理/网络信息 chips(有值才显示,不再六格占位"-")。
// 源区 = 手风琴行:header 常显源名+判定/分数徽章(一眼全览全部源状态),点击展开
// 详情;默认展开 = 有威胁的源(malicious/suspicious)+ 出错的源,全干净时展开
// 第一个 ok 源(优先分数卡)。2 源全收起 ~130px,展开 1 个不滚;源数线性可扩。
import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { SourceSection, Settings } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";
import { VERDICT_STYLE, scoreTone, scoreTextTone, TECH_LABEL } from "./badges";
import { useI18n } from "../i18n";

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

/** AbuseIPDB 分数 → 威胁语义(仅用于手风琴默认展开判定,与 scoreTone 色阶同带)。 */
function abuseThreat(a: AbuseSection | undefined): "malicious" | "suspicious" | undefined {
  if (!a) return undefined;
  if (a.score >= 60) return "malicious";
  if (a.score >= 25) return "suspicious";
  return undefined;
}

/** 默认展开集:有威胁的源 + 出错的源(错误永不折叠);全干净展开第一个 ok 源(优先分数卡)。 */
function defaultOpen(sections: SourceSection[], d: LookupResult | undefined): Set<string> {
  const open = new Set<string>();
  const okIds: string[] = [];
  let threatened = false;
  for (const s of sections) {
    if (s.status === "error") open.add(s.sourceId);
    if (s.status !== "ok") continue;
    okIds.push(s.sourceId);
    const v =
      s.sourceId === "ipradar" ? d?.threat?.verdict : abuseThreat(abuseOf(s));
    if (v === "malicious" || v === "suspicious") {
      open.add(s.sourceId);
      threatened = true;
    }
  }
  if (!threatened) {
    const first = okIds.find(id => id === "abuseipdb") ?? okIds[0];
    if (first) open.add(first);
  }
  return open;
}

/** 信息 chip:微字标 + mono 值,有值才渲染。 */
function InfoChip({ k, v }: { k: string; v: string }) {
  return (
    <span className="inline-flex max-w-full items-baseline gap-1.5 rounded bg-zinc-800/70 px-1.5 py-0.5">
      <span className={`${TECH_LABEL} shrink-0`}>{k}</span>
      <span className="min-w-0 truncate font-mono text-[11px] text-zinc-300" title={v}>{v}</span>
    </span>
  );
}

function SummaryCard({ ip, d }: { ip: string; d: LookupResult | undefined }) {
  const { t } = useI18n();
  const verdict = d?.threat?.verdict;
  const city = d?.city?.value && d.city.value !== "N/A" ? d.city.value : undefined;
  const cityZh = d?.city_zh ?? undefined;
  const geo = [d?.country?.value, city ? `${city}${cityZh ? `(${cityZh})` : ""}` : undefined]
    .filter(Boolean)
    .join("·");
  const gps = d?.location ? `${d.location.lat.toFixed(2)},${d.location.lon.toFixed(2)}` : undefined;
  const chips: Array<[string, string]> = [
    [t("column.country"), geo],
    ["ASN", d?.asn?.value ?? undefined],
    [t("column.operator"), d?.as_name?.value ?? undefined],
    [t("ipDetail.range"), d?.ip_range?.value ?? undefined],
    ["GPS", gps],
  ].filter((c): c is [string, string] => Boolean(c[1]));
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2">
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
        <div className="flex flex-wrap gap-1 border-b border-zinc-800 px-3 py-1.5">
          {d!.threat!.types.map(type => (
            <span key={type} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300">
              {type}
            </span>
          ))}
        </div>
      )}
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2">
          {chips.map(([k, v]) => (
            <InfoChip key={k} k={k} v={v} />
          ))}
        </div>
      )}
    </div>
  );
}

function IpradarBody({ d }: { d: LookupResult }) {
  const { t } = useI18n();
  const entries = Object.entries(d.classifications ?? {})
    .filter(([, c]) => c.detected)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-500">-</p>;
  }
  return (
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
  );
}

/** 横排键值行(紧凑):label 左、mono 值右 truncate。 */
function Row({ label, value }: { label: string; value: string | number | undefined | null }) {
  const shown = value === undefined || value === null || value === "" ? "-" : String(value);
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className={TECH_LABEL}>{label}</span>
      <span className="min-w-0 truncate font-mono text-xs text-zinc-300" title={shown}>{shown}</span>
    </div>
  );
}

function AbuseBody({ a }: { a: AbuseSection }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-2 h-1 w-full rounded-full bg-zinc-800">
        <div
          className={`h-1 rounded-full ${scoreTone(a.score)}`}
          style={{ width: `${Math.min(Math.max(a.score, 0), 100)}%` }}
        />
      </div>
      <div className="divide-y divide-zinc-800/60">
        <Row label={t("abuse.country")} value={a.countryCode} />
        <Row label={t("abuse.isp")} value={a.isp} />
        <Row label={t("abuse.usage")} value={a.usageType} />
        <Row label={t("abuse.tor")} value={a.isTor ? "true" : undefined} />
        <Row label={t("abuse.reports")} value={a.totalReports} />
        <Row label={t("abuse.reporters")} value={a.numDistinctUsers} />
        <Row label={t("abuse.last")} value={a.lastReportedAt?.slice(0, 10)} />
      </div>
      {a.recentComments.length > 0 && (
        <details className="mt-2">
          <summary className={`${TECH_LABEL} cursor-pointer select-none hover:text-zinc-300`}>
            {a.recentComments.length} reports ▾
          </summary>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-zinc-500">
            {a.recentComments.map((c, i) => (
              <li key={i} className="truncate" title={c}>{c}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** 源手风琴行:header 常显(源名 + 右侧徽章),点击展开/收起 body。 */
function SourceRow({ title, badge, defaultOpen: openByDefault, errorTone, children }: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  errorTone?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(openByDefault ?? false);
  return (
    <div className={`overflow-hidden rounded-lg border ${errorTone ? "border-red-500/25" : "border-zinc-800"}`}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-900/60 ${errorTone ? "bg-red-500/5" : ""}`}
      >
        <span className={`min-w-0 truncate ${errorTone ? "font-mono text-[10px] uppercase tracking-[0.1em] text-red-400" : TECH_LABEL}`}>{title}</span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          {open ? (
            <CaretDown size={11} className="text-zinc-500" />
          ) : (
            <CaretRight size={11} className="text-zinc-500" />
          )}
        </span>
      </button>
      {open && children && <div className="border-t border-zinc-800 p-3">{children}</div>}
    </div>
  );
}

export function ResultDetail({
  ip,
  sections,
  settings,
  onGoSettings,
}: {
  ip: string;
  sections: SourceSection[];
  settings: Settings;
  onGoSettings: () => void;
}) {
  const { t } = useI18n();
  const ipradar = sections.find(s => s.sourceId === "ipradar");
  const d = ipradar?.status === "ok" ? (ipradar.data as LookupResult) : undefined;
  const rowKey = (id: string) => `${ip}:${id}`;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 p-4 pb-3">
        <SummaryCard ip={ip} d={d} />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 pt-0">
        {sections.map(sec => {
          if (sec.status === "warming") return null; // App 顶部 warming 横幅已覆盖
          if (sec.status === "ok" && sec.sourceId === "ipradar") {
            const verdict = d?.threat?.verdict;
            return (
              <SourceRow
                key={rowKey(sec.sourceId)}
                title={t("src.ipradar")}
                defaultOpen={defaultOpen(sections, d).has(sec.sourceId)}
                badge={
                  verdict ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}>
                      {t(`verdict.${verdict}`)}
                    </span>
                  ) : undefined
                }
              >
                {d && <IpradarBody d={d} />}
              </SourceRow>
            );
          }
          if (sec.status === "ok" && sec.sourceId === "abuseipdb") {
            const a = abuseOf(sec);
            if (!a) return null;
            return (
              <SourceRow
                key={rowKey(sec.sourceId)}
                title={t("src.abuseipdb")}
                defaultOpen={defaultOpen(sections, d).has(sec.sourceId)}
                badge={<span className={`font-mono text-xs font-semibold ${scoreTextTone(a.score)}`}>{a.score}/100</span>}
              >
                <AbuseBody a={a} />
              </SourceRow>
            );
          }
          if (sec.status === "needs-key") {
            if (!settings.showMissingKey) return null;
            return (
              <SourceRow
                key={rowKey(sec.sourceId)}
                title={t(`src.${sec.sourceId}`)}
                errorTone
                badge={<span className="text-[10px] text-zinc-500">{t("guidance.needsKey")}</span>}
              >
                <p className="text-xs text-zinc-500">{t("guidance.needsKey")}</p>
                <button
                  onClick={onGoSettings}
                  className="mt-2 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 transition active:scale-[0.98] hover:bg-zinc-700"
                >
                  {t("guidance.goSettings")}
                </button>
              </SourceRow>
            );
          }
          if (sec.status === "error" && sec.error?.code !== "warming") {
            return (
              <SourceRow
                key={rowKey(sec.sourceId)}
                title={t(`src.${sec.sourceId}`)}
                errorTone
                badge={<span className="text-[10px] uppercase text-red-400/80">{t("src.error")}</span>}
              >
                <p className="text-xs text-red-400">
                  {errorText(sec.error?.status, sec.error?.message ?? "", sec.error?.retryAfter, t)}
                </p>
              </SourceRow>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
