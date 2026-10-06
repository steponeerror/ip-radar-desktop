// 共识核心(纯函数,无 React):跨源等权判定的唯一真相源。
// 语义(2026-09-23 定稿;2026-09-28 改全票制):
// - 每源自报主张(claimsOf):ipradar = threat.verdict;AbuseIPDB = 分数 ≥50 恶意主张(二元),<50 弃权(ABUSE_MALICIOUS_MIN)。
// - 全票制:参与主张的源 code 完全一致才出该 verdict;任何混合(哪怕同为非良性)= 分歧。
//   恶意是定罪级:还需无任何弃权(参与源的弃权=不支持);可疑/良性提示级单源可立(非对称)。
//   needs-key/error 源不参与计数 —— 源没接入时单源模式照常出判定。
// - value = 主张者中的最大原生数值(σ 置信度 / abuse 分数,不归一);
//   仅非良性携带(良性无数值,分歧不带数字 —— 展示规则与语义同源)。
// - reserved 优先于一切;弃权/错误/缺 key 不参与;全不参与 = none。
// L1/L2 视图层只消费,不改判定。
import { getSources } from "../sources/registry";
import type { SourceSection, SourceClaims } from "../sources/_types";

export type { Consensus } from "../../shared/intelligence";
import { consensusFromClaims, countryFromClaims } from "../../shared/intelligence";

function claimsOfAll(sections: SourceSection[]): SourceClaims[] {
  const srcMap = new Map(getSources().map(s => [s.id, s]));
  const out: SourceClaims[] = [];
  for (const sec of sections) {
    const claims = srcMap.get(sec.sourceId)?.claimsOf?.(sec);
    if (claims) out.push(claims);
  }
  return out;
}

export function consensusOf(sections: SourceSection[]) {
  return consensusFromClaims(claimsOfAll(sections));
}
export function agreedCountry(sections: SourceSection[]) {
  return countryFromClaims(claimsOfAll(sections));
}
