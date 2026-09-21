// 多 IP 紧凑行列表:IP · verdict 徽章 · 国家 · ASN 名;点行进详情。
// 行徽章 = ipradar 源 fused verdict(唯一融合语义);源缺/禁用/错误 → "-"。
import type { SourceSection } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import { VERDICT_STYLE, TECH_LABEL } from "./badges";
import { useI18n } from "../i18n";

export function ipradarOf(sections: SourceSection[]): LookupResult | undefined {
  const sec = sections.find(s => s.sourceId === "ipradar" && s.status === "ok");
  return sec ? (sec.data as LookupResult) : undefined;
}

export function ResultList({
  results,
  onSelect,
}: {
  results: Map<string, SourceSection[]>;
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
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-4 py-1.5">
        <span className={`${TECH_LABEL} min-w-0 flex-1`}>IP</span>
        <span className={TECH_LABEL}>{t("column.verdict")}</span>
        <span className={`${TECH_LABEL} ml-auto max-w-24 truncate`}>{t("column.country")}</span>
        <span className={`${TECH_LABEL} w-28 shrink-0 text-right`}>ASN</span>
      </div>
      {ips.map(ip => {
        const d = ipradarOf(results.get(ip)!);
        const verdict = d?.threat?.verdict;
        return (
          <button
            key={ip}
            onClick={() => onSelect(ip)}
            className="flex w-full items-center gap-3 border-b border-zinc-800/60 px-4 py-2.5 text-left transition-colors hover:bg-zinc-900 focus-visible:bg-zinc-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-zinc-700 active:bg-zinc-800/70"
          >
            <span className="font-mono text-sm text-zinc-200">{ip}</span>
            {verdict ? (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[verdict] ?? VERDICT_STYLE.informational}`}
              >
                {t(`verdict.${verdict}`)}
              </span>
            ) : (
              <span className="text-[11px] text-zinc-700">-</span>
            )}
            <span className="ml-auto truncate font-mono text-xs text-zinc-500">{d?.country?.value ?? "-"}</span>
            <span className="w-28 shrink-0 truncate text-right font-mono text-xs text-zinc-500">
              {d?.as_name?.value ?? "-"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
