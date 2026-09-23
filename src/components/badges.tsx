// verdict 徽章配色 —— 与 server 前端 VERDICT_STYLE(threatDisplay.ts)逐字对齐。
// 半径系统(成文三规则):控件/输入 = rounded-md(server 家族);verdict 徽章 = rounded 4px(server 同款);
// 结构分区 = 直角 90°(brutalist §5 几何,分区是 hairline 圈出的 zone 不是圆角盒)。
// .tsx:ConsensusBadge 纯展示组件住这里(L1/L2 共用,props 传 t,不引 i18n 上下文)。
import type { Consensus } from "./consensus";

export const VERDICT_STYLE: Record<string, string> = {
  malicious: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  suspicious: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  benign: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  informational: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25",
  reserved: "bg-zinc-600/30 text-zinc-300 ring-1 ring-zinc-500/40",
  // 极性分歧:与 suspicious 同 amber 家族,靠文案区分 —— 分歧本身就是“需要看一眼”的注意级信号
  disagreed: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
};

/** brutalist §3.2 微字标:mono 大写宽字距,用于分区标题/表头/元数据。 */
export const TECH_LABEL = "font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500";

/** AbuseIPDB 分数条色阶:0-24 emerald / 25-59 amber / 60+ red。 */
export function scoreTone(score: number): string {
  if (score >= 60) return "bg-red-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-emerald-500";
}

/** 同色阶的文字版(手风琴 header 的分数徽章)。 */
export function scoreTextTone(score: number): string {
  if (score >= 60) return "text-red-300";
  if (score >= 25) return "text-amber-300";
  return "text-emerald-300";
}

/** 共识徽章(L1 列表行 / L2 身份条共用):纯展示,t 作 props 传入,判定语义在 consensus.ts。
 *  分歧不带数字;非良性共识携带最坏主张源的原生数值(σ 置信度 / abuse 分数)。 */
export function ConsensusBadge({ consensus, t }: {
  consensus: Consensus;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  if (consensus.kind === "none") {
    return <span className="shrink-0 text-[11px] text-zinc-700">-</span>;
  }
  const key = consensus.kind === "disagreed" ? "disagreed"
    : consensus.kind === "reserved" ? "reserved" : consensus.code;
  const label = t(`verdict.${key}`);
  const num = consensus.kind === "verdict"
    && (consensus.code === "malicious" || consensus.code === "suspicious")
    && consensus.value != null ? (
      <span className="ml-1 font-mono text-[10px] opacity-80">{consensus.value}</span>
    ) : null;
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${VERDICT_STYLE[key] ?? VERDICT_STYLE.informational}`}>
      {label}{num}
    </span>
  );
}
