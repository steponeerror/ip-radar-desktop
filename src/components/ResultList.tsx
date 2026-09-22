// 多 IP 左栏列表(双栏窄列):双行行 = 首行 mono IP + verdict 徽章,次行国家 · 运营商小字。
// 行徽章 = ipradar 源 fused verdict(唯一融合语义);源缺/禁用/错误 → "-"。
// 选中行 bg-zinc-800/60(双栏 master 状态);已查询 0 结果 → 内部"无结果"空态。
import type { SourceSection } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";
import { VERDICT_STYLE, scoreTextTone } from "./badges";
import { useI18n } from "../i18n";

export function ipradarOf(sections: SourceSection[]): LookupResult | undefined {
  const sec = sections.find(s => s.sourceId === "ipradar" && s.status === "ok");
  return sec ? (sec.data as LookupResult) : undefined;
}

export function ResultList({
  results,
  selectedIp,
  onSelect,
}: {
  results: Map<string, SourceSection[]>;
  selectedIp: string | null;
  onSelect: (ip: string) => void;
}) {
  const { t } = useI18n();
  const ips = [...results.keys()];
  if (ips.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-zinc-600">
        {t("query.noResults")}
      </div>
    );
  }
  return (
    <div className="overflow-y-auto">
      {ips.map(ip => {
        const secs = results.get(ip)!;
        const d = ipradarOf(secs);
        const ab = secs.find(s => s.sourceId === "abuseipdb" && s.status === "ok")?.data as
          | AbuseSection
          | undefined;
        const verdict = d?.threat?.verdict;
        const selected = ip === selectedIp;
        return (
          <button
            key={ip}
            onClick={() => onSelect(ip)}
            aria-current={selected ? "true" : undefined}
            className={`flex w-full flex-col gap-0.5 border-b border-zinc-800/60 px-4 py-2.5 text-left transition-colors hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-700 active:bg-zinc-800/70 ${
              selected ? "bg-zinc-800/60" : ""
            }`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-sm text-zinc-200">{ip}</span>
              {verdict ? (
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}
                >
                  {t(`verdict.${verdict}`)}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-zinc-700">-</span>
              )}
            </span>
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-[10px] text-zinc-500">
                {d?.country?.value ?? "-"} · {d?.as_name?.value ?? "-"}
              </span>
              {ab && (
                <span className={`shrink-0 font-mono text-[10px] font-semibold ${scoreTextTone(ab.score)}`}>
                  {ab.score}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
