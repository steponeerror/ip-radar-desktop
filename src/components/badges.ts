// verdict 徽章配色,对齐 server 前端 VERDICT_STYLE 语义(zinc 暗色基调)。
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
