// 结果派生与筛选:派生值 + 筛选维度全集 + 与插件端 filterResults 的 parity。
// fixtures = 两台真实参考 IP(与插件端共用);parity 构造的 Row 只补插件端
// filterResults 会从行字段读的 city/isp(真实运行时行由 lookup() 从 sections 派生填充)。
import { describe, test, expect } from "vitest";
import {
  availableCountries,
  countryLabel,
  emptyFilters,
  filterResults,
  resultOf,
  validScoreFilter,
  VERDICT_CODES,
  type ResultFilters,
} from "../result-model";
import { filterResults as extFilterResults } from "../../extension/src/result-controls";
import type { Row } from "../../extension/src/model";
import type { SourceSection } from "../sources/_types";
import fixtures from "../../extension/src/__tests__/fixtures/intelligence.json";

type Fixture = (typeof fixtures)[number];

/** fixture(原始 AbuseIPDB 响应)→ sections,映射与 src/sources/abuseipdb.ts 同源。 */
function sectionsOf(f: Fixture): SourceSection[] {
  const a = f.abuse.data;
  return [
    { sourceId: "ipradar", status: "ok", data: f.radar },
    {
      sourceId: "abuseipdb",
      status: "ok",
      data: {
        score: a.abuseConfidenceScore,
        totalReports: a.totalReports,
        numDistinctUsers: a.numDistinctUsers,
        isTor: a.isTor,
        countryCode: a.countryCode,
        isp: a.isp,
        usageType: a.usageType,
        lastReportedAt: a.lastReportedAt,
        recentComments: [],
      },
    },
  ];
}

const [f1, f2] = fixtures; // f1 = 85.217.149.40(CA,恶意);f2 = 165.245.176.134(SG,良性)
const s1 = sectionsOf(f1);
const s2 = sectionsOf(f2);
const errSection: SourceSection = {
  sourceId: "abuseipdb",
  status: "error",
  error: { message: "boom" },
};

const rows: [string, SourceSection[]][] = [
  [f1.radar.ip, s1],
  [f2.radar.ip, s2],
  ["9.9.9.9", [errSection]], // 无任何主张:code=none、score 缺失
];

const f = (partial: Partial<ResultFilters>): ResultFilters => ({ ...emptyFilters, ...partial });

describe("resultOf", () => {
  test("radar 恶意 + abuse 满分 → malicious/100,多源一致国家取 CA", () => {
    expect(resultOf(s1)).toEqual({
      radar: f1.radar,
      abuse: expect.objectContaining({ score: 100 }),
      consensus: { kind: "verdict", code: "malicious", value: 100 },
      code: "malicious",
      value: 100,
      country: "CA",
      city: "Beauharnois",
      isp: "Modat B.V.",
      score: 100,
    });
  });

  test("radar 良性 + abuse 弃权 → benign 无数值,code 即 verdict code", () => {
    const r = resultOf(s2);
    expect(r.code).toBe("benign");
    expect(r.value).toBeUndefined();
    expect(r.consensus).toEqual({ kind: "verdict", code: "benign" });
    expect(r.country).toBe("SG");
    expect(r.score).toBe(0);
    expect(r.isp).toBe("DigitalOcean, LLC");
  });

  test("无主张 sections → code none", () => {
    expect(resultOf([errSection]).code).toBe("none");
  });
});

describe("countryLabel", () => {
  test("zh 带全角括号,en 半角", () => {
    expect(countryLabel("CA", "zh")).toBe("CA（加拿大）");
    expect(countryLabel("CA", "en")).toBe("CA (Canada)");
  });

  test("小写归一;非法代码原样;空 → undefined", () => {
    expect(countryLabel("ca")).toBe("CA（加拿大）");
    expect(countryLabel("XYZ")).toBe("XYZ");
    expect(countryLabel("")).toBeUndefined();
    expect(countryLabel(undefined)).toBeUndefined();
  });
});

describe("validScoreFilter", () => {
  test("any/missing 恒真;默认条件为真", () => {
    expect(validScoreFilter(f({ score: "abc" }))).toBe(true); // any 不看分数
    expect(validScoreFilter(f({ operator: "missing", score: "nope" }))).toBe(true);
    expect(validScoreFilter(emptyFilters)).toBe(true);
  });

  test("数值须在 0–100;between 还要求 upper ≥ score", () => {
    expect(validScoreFilter(f({ operator: "gt", score: "50" }))).toBe(true);
    expect(validScoreFilter(f({ operator: "gt", score: "" }))).toBe(false);
    expect(validScoreFilter(f({ operator: "gt", score: "abc" }))).toBe(false);
    expect(validScoreFilter(f({ operator: "gt", score: "101" }))).toBe(false);
    expect(validScoreFilter(f({ operator: "gt", score: "-1" }))).toBe(false);
    expect(validScoreFilter(f({ operator: "between", score: "10", upper: "90" }))).toBe(true);
    expect(validScoreFilter(f({ operator: "between", score: "10", upper: "5" }))).toBe(false);
    expect(validScoreFilter(f({ operator: "between", score: "10", upper: "abc" }))).toBe(false);
  });
});

describe("filterResults", () => {
  const ips = rows.map(([ip]) => ip);

  test("文本:IP 片段 / 国家代码 / ISP 片段,大小写不敏感", () => {
    expect(filterResults(rows, f({ text: "85.217" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ text: "sg" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ text: "modat" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ text: " singapore" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ text: "nomatch" }), "zh")).toEqual([]);
  });

  test("国家精确匹配(非文本包含)", () => {
    expect(filterResults(rows, f({ country: "CA" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ country: "SG" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ country: "US" }), "zh")).toEqual([]);
  });

  test("判定匹配 code(verdict 或 kind)", () => {
    expect(filterResults(rows, f({ verdict: "malicious" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ verdict: "benign" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ verdict: "none" }), "zh").map(([ip]) => ip)).toEqual([ips[2]]);
    expect(filterResults(rows, f({ verdict: "suspicious" }), "zh")).toEqual([]);
  });

  test("分数操作符全集(between 含边界)", () => {
    expect(filterResults(rows, f({ operator: "any" }), "zh")).toHaveLength(3);
    expect(filterResults(rows, f({ operator: "gt", score: "50" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ operator: "gte", score: "100" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ operator: "gt", score: "100" }), "zh")).toEqual([]);
    expect(filterResults(rows, f({ operator: "lt", score: "50" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ operator: "lte", score: "0" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ operator: "eq", score: "100" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ operator: "eq", score: "0" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ operator: "between", score: "0", upper: "100" }), "zh").map(([ip]) => ip)).toEqual([ips[0], ips[1]]);
    expect(filterResults(rows, f({ operator: "between", score: "100", upper: "100" }), "zh").map(([ip]) => ip)).toEqual([ips[0]]);
    expect(filterResults(rows, f({ operator: "between", score: "0", upper: "0" }), "zh").map(([ip]) => ip)).toEqual([ips[1]]);
    expect(filterResults(rows, f({ operator: "between", score: "1", upper: "99" }), "zh")).toEqual([]);
  });

  test("missing 只留无分数行;无效分数条件 → 空", () => {
    expect(filterResults(rows, f({ operator: "missing" }), "zh").map(([ip]) => ip)).toEqual([ips[2]]);
    expect(filterResults(rows, f({ operator: "gt", score: "abc" }), "zh")).toEqual([]);
    expect(filterResults(rows, f({ operator: "between", score: "50", upper: "10" }), "zh")).toEqual([]);
  });
});

describe("availableCountries / VERDICT_CODES / emptyFilters", () => {
  test("availableCountries 排序去重,只收多源一致国家", () => {
    expect(availableCountries(rows)).toEqual(["CA", "SG"]);
    expect(availableCountries([])).toEqual([]);
  });

  test("VERDICT_CODES 全集;emptyFilters 默认 score 50 / upper 100", () => {
    expect([...VERDICT_CODES]).toEqual([
      "malicious",
      "suspicious",
      "benign",
      "disagreed",
      "reserved",
      "none",
    ]);
    expect(emptyFilters).toEqual({
      text: "",
      operator: "any",
      score: "50",
      upper: "100",
      country: "",
      verdict: "",
    });
  });
});

describe("parity:桌面 filterResults ≡ 插件端 filterResults", () => {
  /** 插件端行:同名 sections + lookup() 会填充的行字段(筛选文本/分数兜底会读)。 */
  const extRows: Row[] = [
    {
      ip: f1.radar.ip,
      queriedAt: "",
      status: "done",
      errors: [],
      sections: s1,
      city: f1.radar.city?.value,
      isp: f1.radar.as_name?.value,
    },
    {
      ip: f2.radar.ip,
      queriedAt: "",
      status: "done",
      errors: [],
      sections: s2,
      city: f2.radar.city?.value,
      isp: f2.radar.as_name?.value,
    },
    { ip: "9.9.9.9", queriedAt: "", status: "done", errors: ["boom"], sections: [errSection] },
  ];

  const cases: ResultFilters[] = [
    emptyFilters,
    f({ text: "85.217" }),
    f({ text: "modat" }),
    f({ text: "sg" }),
    f({ country: "CA" }),
    f({ verdict: "benign" }),
    f({ verdict: "none" }),
    f({ operator: "gt", score: "50" }),
    f({ operator: "between", score: "0", upper: "100" }),
    f({ operator: "missing" }),
    f({ operator: "gt", score: "abc" }), // 无效条件:两边同为 []
  ];

  test.each(cases.map((c) => [JSON.stringify(c), c] as const))(
    "筛选 %s 两端 IP 列表一致",
    (_label, filters) => {
      const desktop = filterResults(rows, filters, "zh").map(([ip]) => ip);
      const ext = extFilterResults(extRows, filters, "zh").map((r) => r.ip);
      expect(desktop).toEqual(ext);
    },
  );
});
