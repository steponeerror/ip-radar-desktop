// badgesOf 纯函数:detected 过滤/置信度排序/未知类型透传/info 三件套/空态(语义见 plan Constraint 2/4/7)。
// 不做 i18n —— 词条查表与未知类型兜底(下划线换空格)在 Task 2 渲染层,故断言原样透传。
import { describe, test, expect } from "vitest";
import { badgesOf } from "../components/badges";
import type { SourceSection } from "../sources/_types";

const ir = (data: unknown): SourceSection => ({ sourceId: "ipradar", status: "ok", data });
const ab = (data: unknown): SourceSection => ({ sourceId: "abuseipdb", status: "ok", data });
const cls = (verdict: string, detected: boolean, confidence: number) =>
  ({ verdict, detected, confidence, malware_names: [] });
const threat = (is_cdn = false) => ({ verdict: "benign", confidence: 0, types: [], is_cdn });
const bareAbuse = (over: Record<string, unknown> = {}) => ({
  score: 0, totalReports: 0, numDistinctUsers: 0, isTor: false, recentComments: [], ...over,
});

describe("badgesOf 分类徽章", () => {
  test("detected 过滤 + confidence 降序,同分按 type 字典序", () => {
    const r = badgesOf([ir({
      classifications: {
        phishing: cls("malicious", true, 80),
        scanner: cls("suspicious", false, 99), // 未检出 → 过滤
        "brute-force": cls("suspicious", true, 60),
        abuse_reports: cls("informational", true, 60),
      },
    })]);
    expect(r.classes).toEqual([
      { type: "phishing", verdict: "malicious", confidence: 80 },
      { type: "abuse_reports", verdict: "informational", confidence: 60 }, // 同分 60,a 开头在前
      { type: "brute-force", verdict: "suspicious", confidence: 60 },
    ]);
  });

  test("未知类型原样透传(翻译与规范化兜底发生在渲染层)", () => {
    const r = badgesOf([ir({ classifications: { "exotic-class": cls("malicious", true, 42) } })]);
    expect(r.classes).toEqual([{ type: "exotic-class", verdict: "malicious", confidence: 42 }]);
  });
});

describe("badgesOf info 徽章", () => {
  test("三件套:is_cdn / isTor / usageType 各一(usage 原文不译)", () => {
    const r = badgesOf([
      ir({ threat: threat(true) }),
      ab(bareAbuse({ isTor: true, usageType: "Data Center/Web Hosting/Transit" })),
    ]);
    expect(r.classes).toEqual([]);
    expect(r.infos).toEqual([
      { kind: "cdn" },
      { kind: "torExit" },
      { kind: "usage", value: "Data Center/Web Hosting/Transit" },
    ]);
  });

  test("abuse needs-key 时其 info 项自然缺失(is_cdn=false 也不出 cdn)", () => {
    const r = badgesOf([ir({ threat: threat(false) }), { sourceId: "abuseipdb", status: "needs-key" }]);
    expect(r.infos).toEqual([]);
  });
});

describe("badgesOf 空态", () => {
  test("无命中无 info(error/未检出/false)→ 两数组皆空", () => {
    expect(badgesOf([])).toEqual({ classes: [], infos: [] });
    expect(badgesOf([
      { sourceId: "ipradar", status: "error", error: { status: 401, message: "x" } },
      ir({ threat: threat(false), classifications: { scanner: cls("suspicious", false, 90) } }),
      ab(bareAbuse()),
    ])).toEqual({ classes: [], infos: [] });
  });
});
