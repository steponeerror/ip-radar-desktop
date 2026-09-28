// 共识核心(纯函数,无 React):跨源等权判定的唯一真相源。
// 语义(2026-09-23 定稿;2026-09-28 改全票制):
// - 每源自报主张(claimsOf):ipradar = threat.verdict;AbuseIPDB = 分数>0 即恶意,0=弃权。
// - 全票制:参与主张的源 code 完全一致才出该 verdict;任何混合(哪怕同为非良性)= 分歧。
// - value = 主张者中的最大原生数值(σ 置信度 / abuse 分数,不归一);
//   仅非良性携带(良性无数值,分歧不带数字 —— 展示规则与语义同源)。
// - reserved 优先于一切;弃权/错误/缺 key 不参与;全不参与 = none。
// L1/L2 视图层只消费,不改判定。
import { getSources } from "../sources/registry";
import type { SourceSection, SourceClaims, VerdictCode, QuerySource } from "../sources/_types";

export type Consensus =
  | { kind: "reserved" }
  | { kind: "disagreed" }
  | { kind: "verdict"; code: VerdictCode; value?: number }
  | { kind: "none" };

// 全票制无“更坏”概念,RANK 已删(2026-09-28)。

// id→source 映射模块级缓存:源集在进程内不变(registry glob eager),避免每次共识重建
let srcMap: Map<string, QuerySource> | undefined;

function claimsOfAll(sections: SourceSection[]): SourceClaims[] {
  if (!srcMap) srcMap = new Map(getSources().map(s => [s.id, s]));
  const out: SourceClaims[] = [];
  for (const sec of sections) {
    const claims = srcMap.get(sec.sourceId)?.claimsOf?.(sec);
    if (claims) out.push(claims);
  }
  return out;
}

export function consensusOf(sections: SourceSection[]): Consensus {
  const all = claimsOfAll(sections);
  if (all.some(c => c.reserved)) return { kind: "reserved" };
  const verdicts = all
    .map(c => c.verdict)
    .filter((v): v is { code: VerdictCode; value?: number } => !!v);
  if (verdicts.length === 0) return { kind: "none" };
  // 全票制:唯一 code 才出 verdict,任何混合 = 分歧(用户拍板 2026-09-28:
  // 同时都恶意才显恶意;可疑×恶意不再塌缩到恶意)
  const codes = new Set(verdicts.map(v => v.code));
  if (codes.size > 1) return { kind: "disagreed" };
  const code = verdicts[0].code;
  let value: number | undefined;
  if (code !== "benign") {
    const vals = verdicts.map(v => v.value)
      .filter((n): n is number => typeof n === "number");
    if (vals.length > 0) value = Math.max(...vals);
  }
  return { kind: "verdict", code, value };
}

export function agreedCountry(sections: SourceSection[]): string | undefined {
  const countries = claimsOfAll(sections)
    .map(c => c.country)
    .filter((c): c is string => !!c);
  if (countries.length === 0) return undefined;
  return countries.every(c => c === countries[0]) ? countries[0] : undefined;
}
