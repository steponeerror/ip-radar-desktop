// verdict 徽章配色 —— 与 server 前端 VERDICT_STYLE(threatDisplay.ts)逐字对齐。
// 半径系统(成文三规则):控件/输入 = rounded-md(server 家族);verdict 徽章 = rounded 4px(server 同款);
// 结构分区 = 直角 90°(brutalist §5 几何,分区是 hairline 圈出的 zone 不是圆角盒)。
export const VERDICT_STYLE: Record<string, string> = {
  malicious: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  suspicious: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  benign: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  informational: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25",
  reserved: "bg-zinc-600/30 text-zinc-300 ring-1 ring-zinc-500/40",
};

/** brutalist §3.2 微字标:mono 大写宽字距,用于分区标题/表头/元数据。 */
export const TECH_LABEL = "font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500";

/** AbuseIPDB 分数条色阶:0-24 emerald / 25-59 amber / 60+ red。 */
export function scoreTone(score: number): string {
  if (score >= 60) return "bg-red-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-emerald-500";
}
