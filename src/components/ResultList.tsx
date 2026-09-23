// 多 IP 左栏列表(双栏窄列):L1 扫描层 —— 首行 mono IP + 共识徽章,次行仅多源一致的国家。
// 源细节零泄漏:判定走 consensus.ts(跨源等权),运营商/abuse 分数等单源数据在 L2/L3。
// 选中行 bg-zinc-800/60(双栏 master 状态);已查询 0 结果 → 内部"无结果"空态。
import type { SourceSection } from "../sources/_types";
import { consensusOf, agreedCountry } from "./consensus";
import { ConsensusBadge } from "./badges";
import { useI18n } from "../i18n";

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
        const country = agreedCountry(secs);
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
              <ConsensusBadge consensus={consensusOf(secs)} t={t} />
            </span>
            {country && (
              <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500">{country}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
