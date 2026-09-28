// 共识核心全分支:语义见 consensus.ts 头注(2026-09-23 定稿,2026-09-28 改全票制)。
// 用真实 registry(真实两源的 claimsOf)+ 字面量 section,不 mock 源实现。
import { describe, test, expect } from "vitest";
import { consensusOf, agreedCountry } from "../components/consensus";
import type { SourceSection } from "../sources/_types";

const ir = (data: unknown): SourceSection => ({ sourceId: "ipradar", status: "ok", data });
const ab = (score: number, countryCode?: string): SourceSection => ({
  sourceId: "abuseipdb", status: "ok",
  data: { score, totalReports: 0, numDistinctUsers: 0, isTor: false, recentComments: [], countryCode },
});
const threat = (verdict: string, confidence = 0) => ({ verdict, confidence, types: [], is_cdn: false });

describe("consensusOf 全票制共识", () => {
  test("良性 + 弃权 → 良性(无数值)", () => {
    expect(consensusOf([ir({ threat: threat("benign") }), ab(0)])).toEqual({ kind: "verdict", code: "benign" });
  });

  test("弃权 + 弃权 → none", () => {
    expect(consensusOf([ir({}), ab(0)])).toEqual({ kind: "none" });
  });

  test("良性 × 25 分恶意 → 分歧(≥25 才构成主张)", () => {
    expect(consensusOf([ir({ threat: threat("benign") }), ab(25)]))
      .toEqual({ kind: "disagreed" });
  });

  test("良性 × 24 分 → 良性(绿区 0-24 不构成主张,噪声报告不参与共识)", () => {
    expect(consensusOf([ir({ threat: threat("benign") }), ab(24)]))
      .toEqual({ kind: "verdict", code: "benign" });
  });

  test("可疑 σ45 + 恶意 85 → 分歧(全票制:code 不一致即分歧,不再取更坏)", () => {
    expect(consensusOf([ir({ threat: threat("suspicious", 45) }), ab(85)]))
      .toEqual({ kind: "disagreed" });
  });

  test("可疑 σ45 + 弃权 → 可疑 45(全票可疑携带最大原生数值)", () => {
    expect(consensusOf([ir({ threat: threat("suspicious", 45) }), ab(0)]))
      .toEqual({ kind: "verdict", code: "suspicious", value: 45 });
  });

  test("恶意 σ72 + 恶意 90 → 恶意 90(同 code 取最大原生数值)", () => {
    expect(consensusOf([ir({ threat: threat("malicious", 72) }), ab(90)]))
      .toEqual({ kind: "verdict", code: "malicious", value: 90 });
  });

  test("reserved 优先于一切(哪怕另一源主张 100 分)", () => {
    expect(consensusOf([ir({ is_reserved: true, threat: threat("benign") }), ab(100)]))
      .toEqual({ kind: "reserved" });
  });

  test("error / needs-key 源不参与共识", () => {
    const errSec: SourceSection = { sourceId: "abuseipdb", status: "error", error: { status: 429, message: "x" } };
    const needsKey: SourceSection = { sourceId: "abuseipdb", status: "needs-key" };
    expect(consensusOf([ir({ threat: threat("benign") }), errSec])).toEqual({ kind: "verdict", code: "benign" });
    expect(consensusOf([ir({ threat: threat("benign") }), needsKey])).toEqual({ kind: "verdict", code: "benign" });
    expect(consensusOf([errSec, needsKey])).toEqual({ kind: "none" });
  });

  test("ipradar verdict 码为 informational → 无主张(仅接受三码)", () => {
    expect(consensusOf([ir({ threat: threat("informational", 99) }), ab(0)])).toEqual({ kind: "none" });
  });

  test("未实现 claimsOf 的未来源(section 带 ok data)不炸、不参与", () => {
    const future: SourceSection = { sourceId: "future", status: "ok", data: { anything: true } };
    expect(consensusOf([ir({ threat: threat("benign") }), future])).toEqual({ kind: "verdict", code: "benign" });
    expect(agreedCountry([ir({ country: { value: "CN" } }), future])).toBe("CN");
  });
});

describe("agreedCountry 多源一致才显示", () => {
  test("两源一致(含归一:小写/空白)→ 返回大写值", () => {
    expect(agreedCountry([ir({ country: { value: " cn " } }), ab(0, "CN")])).toBe("CN");
  });

  test("两源不一致 → undefined", () => {
    expect(agreedCountry([ir({ country: { value: "US" } }), ab(30, "SG")])).toBeUndefined();
  });

  test("单源有值(他源弃权)→ 该值", () => {
    expect(agreedCountry([ir({ country: { value: "DE" } }), ab(0)])).toBe("DE");
  });

  test("全部无值 → undefined", () => {
    expect(agreedCountry([ir({}), ab(0)])).toBeUndefined();
  });
});
