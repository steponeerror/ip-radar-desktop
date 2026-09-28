// verdict 徽章配色 —— 与 server 前端 VERDICT_STYLE(threatDisplay.ts)逐字对齐。
// 半径系统(成文三规则):控件/输入 = rounded-md(server 家族);verdict 徽章 = rounded 4px(server 同款);
// 结构分区 = 直角 90°(brutalist §5 几何,分区是 hairline 圈出的 zone 不是圆角盒)。
// .tsx:ConsensusBadge 纯展示组件住这里(L1/L2 共用,props 传 t,不引 i18n 上下文)。
import type { Consensus } from "./consensus";
import type { SourceSection } from "../sources/_types";
import type { LookupResult } from "../sources/ipradar";
import type { AbuseSection } from "../sources/abuseipdb";

export const VERDICT_STYLE: Record<string, string> = {
  malicious: "bg-red-500/15 text-red-300 ring-1 ring-red-500/30",
  suspicious: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
  benign: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  informational: "bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/25",
  reserved: "bg-zinc-600/30 text-zinc-300 ring-1 ring-zinc-500/40",
  // 分歧:与 suspicious 同 amber 家族 —— 分歧本身就是“需要看一眼”的注意级信号
  disagreed: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30",
};

/** brutalist §3.2 微字标:mono 大写宽字距,用于分区标题/表头/元数据。 */
export const TECH_LABEL = "font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-500";

/** info 幽灵徽章样式(L2 徽章带):信息级非定罪级,zinc 基调明显弱于彩色 verdict 徽章;
 *  与 VERDICT_STYLE 同构(bg + text + ring-1),半径同 4px rounded(由使用方拼)。 */
export const INFO_STYLE = "bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/40";

/** 威胁分类徽章模型(ipradar classifications 的 detected 项,type 原样透传)。 */
export interface ClassBadge { type: string; verdict: string; confidence: number }

/** info 徽章模型:cdn ← ipradar threat.is_cdn;torExit ← abuseipdb isTor;usage ← abuseipdb usageType 原文。 */
export interface InfoBadge { kind: "cdn" | "torExit" | "usage"; value?: string }

/** 从 sections 抽徽章带数据(纯函数,不引 i18n):classifications 仅 detected、按
 *  confidence 降序(同分按 type 字典序,全序确定);info 三件套与分类命中不去重
 *  (tor 分类 + TOR 出口并存 = 双源佐证);needs-key/error 源的徽章自然缺失,不占位。 */
export function badgesOf(sections: SourceSection[]): { classes: ClassBadge[]; infos: InfoBadge[] } {
  const classes: ClassBadge[] = [];
  const infos: InfoBadge[] = [];
  for (const sec of sections) {
    if (sec.status !== "ok") continue;
    if (sec.sourceId === "ipradar") {
      const d = sec.data as LookupResult;
      for (const [type, c] of Object.entries(d.classifications ?? {})) {
        if (c.detected) classes.push({ type, verdict: c.verdict, confidence: c.confidence });
      }
      if (d.threat?.is_cdn) infos.push({ kind: "cdn" });
    } else if (sec.sourceId === "abuseipdb") {
      const a = sec.data as AbuseSection;
      if (a.isTor) infos.push({ kind: "torExit" });
      if (a.usageType) infos.push({ kind: "usage", value: a.usageType });
    }
  }
  classes.sort((x, y) => y.confidence - x.confidence || (x.type < y.type ? -1 : x.type > y.type ? 1 : 0));
  return { classes, infos };
}

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

/** MergedField 置信度文字色阶(server threatDisplay.ts confTextColor 同款):≥70 绿/30–69 琥珀/<30 红。 */
export function confTone(conf: number): string {
  if (conf >= 70) return "text-emerald-400";
  if (conf >= 30) return "text-amber-400";
  return "text-red-400";
}

/** 共识徽章(L1 列表行 / L2 身份条共用):纯展示,t 作 props 传入,判定语义在 consensus.ts。
 *  分歧不带数字;非良性共识携带主张者中的最大原生数值(σ 置信度 / abuse 分数)。 */
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
