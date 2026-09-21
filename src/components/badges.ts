// verdict 徽章配色,对齐 server 前端 VERDICT_STYLE 语义(zinc 暗色基调)。
// 半径系统(taste-skill §4.4,成文两规则):控件/输入/卡片 = rounded-md,徽章/芯片 = pill(rounded-full)。
// 交互主色 = 中性 zinc-100/emerald 留给 verdict 语义,防语义撞车(§4.2 Color Lock)。
export const VERDICT_STYLE: Record<string, string> = {
  malicious: "bg-red-500/15 text-red-400 ring-1 ring-red-500/25",
  suspicious: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
  benign: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25",
  informational: "bg-sky-500/15 text-sky-400 ring-1 ring-sky-500/25",
  reserved: "bg-zinc-700/40 text-zinc-400 ring-1 ring-zinc-600/40",
};

/** AbuseIPDB 分数条色阶:0-24 emerald / 25-59 amber / 60+ red。 */
export function scoreTone(score: number): string {
  if (score >= 60) return "bg-red-500";
  if (score >= 25) return "bg-amber-500";
  return "bg-emerald-500";
}
