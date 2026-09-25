// 单 IP 详情(对比台 L2/L3):L2 身份条 = IP + 共识徽章(consensusOf,极性制),
// 之下每源手风琴行 —— header 常显源名 + 本源主张(ipradar 判定徽章 / abuse 色阶分数),
// 对比层即默认视图:全部收起,唯一例外是出错源恒展开(错误不是情报,得让人看见)。
// L3 展开体:ipradar = geo 行 + 威胁类型 chips + 命中清单(零命中 → N 组分类 · 0 命中);
// abuse 卡体不变。N 源线性可扩:主张语义在各源 claimsOf,展示经 ConsensusBadge 共用。
import { useState } from "react";
import { CaretDown, CaretRight } from "@phosphor-icons/react";
import type { SourceSection, Settings } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";
import { VERDICT_STYLE, scoreTone, scoreTextTone, confTone, TECH_LABEL, ConsensusBadge } from "./badges";
import { consensusOf } from "./consensus";
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

function IpradarBody({ d }: { d: LookupResult }) {
  const { t } = useI18n();
  const city = d.city?.value && d.city.value !== "N/A" ? d.city.value : undefined;
  const cityZh = d.city_zh ?? undefined;
  const gps = d.location ? `${d.location.lat.toFixed(2)},${d.location.lon.toFixed(2)}` : undefined;
  const entries = Object.entries(d.classifications ?? {})
    .filter(([, c]) => c.detected)
    .sort((a, b) => b[1].confidence - a[1].confidence);
  return (
    <div>
      <div className="divide-y divide-zinc-800/60">
        <Row label={t("column.country")} value={d.country?.value} conf={d.country?.confidence} />
        {city && <Row label={t("column.city")} value={cityZh ? `${city}(${cityZh})` : city} conf={d.city?.confidence} />}
        <Row label="ASN" value={d.asn?.value} conf={d.asn?.confidence} />
        <Row label={t("column.operator")} value={d.as_name?.value} conf={d.as_name?.confidence} />
        <Row label={t("ipDetail.range")} value={d.ip_range?.value} conf={d.ip_range?.confidence} />
        <Row label="GPS" value={gps} title={d.location?.accuracy_radius ? `±${d.location.accuracy_radius} km` : undefined} />
      </div>
      {(d.threat?.types?.length ?? 0) > 0 || d.threat?.is_cdn ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {d.threat?.types?.map(type => (
            <span key={type} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300">
              {type}
            </span>
          ))}
          {d.threat?.is_cdn && (
            <span key="cdn" className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] font-medium text-zinc-300">
              CDN
            </span>
          )}
        </div>
      ) : null}
      {entries.length === 0 ? (
        <p className="mt-2 text-xs text-zinc-500">
          {t("ipDetail.noHits", { n: Object.keys(d.classifications ?? {}).length })}
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
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
      )}
    </div>
  );
}

/** 横排键值行(紧凑):label 左、mono 值右 truncate;conf 为 MergedField 置信度裸数字(带色阶)。 */
function Row({ label, value, conf, title }: {
  label: string;
  value: string | number | undefined | null;
  conf?: number;
  title?: string;
}) {
  const shown = value === undefined || value === null || value === "" ? "-" : String(value);
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5" title={title}>
      <span className={TECH_LABEL}>{label}</span>
      <span className="flex min-w-0 items-baseline justify-end">
        <span className="min-w-0 truncate font-mono text-xs text-zinc-300" title={shown}>{shown}</span>
        {conf != null && <span className={`ml-1 text-[10px] ${confTone(conf)}`}>{conf}</span>}
      </span>
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
    <div key={ip} className="fade-in flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
        <h2 className="min-w-0 truncate font-mono text-xl tracking-tight text-zinc-100" title={ip}>{ip}</h2>
        <ConsensusBadge consensus={consensusOf(sections)} t={t} />
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {sections.map(sec => {
          if (sec.status === "warming") return null; // App 顶部 warming 横幅已覆盖
          if (sec.status === "ok" && sec.sourceId === "ipradar") {
            const verdict = d?.threat?.verdict;
            return (
              <SourceRow
                key={rowKey(sec.sourceId)}
                title={t("src.ipradar")}
                badge={
                  d?.is_reserved ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_STYLE.reserved}`}>
                      {t("verdict.reserved")}
                    </span>
                  ) : verdict ? (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}>
                      {t(`verdict.${verdict}`)}
                      {(verdict === "malicious" || verdict === "suspicious") && d?.threat?.confidence != null && (
                        <span className="ml-1 font-mono text-[10px] opacity-80">{d.threat.confidence}</span>
                      )}
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
                defaultOpen
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
