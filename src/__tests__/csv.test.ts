// CSV 导出:csvCell 转义与公式注入防护、toCsv BOM/CRLF/列选择、exportRecord 关键值
// 与插件端 csv.ts 的 parity(t 恒等,绕开两套 i18n;列头翻译属 Task 3 的 i18n 键)。
import { describe, test, expect } from "vitest";
import { csvCell, defaultCsvName, exportRecord, toCsv, type CsvRow } from "../csv";
import { exportRecord as extExportRecord } from "../../extension/src/csv";
import type { Row } from "../../extension/src/model";
import type { SourceSection } from "../sources/_types";
import fixtures from "../../extension/src/__tests__/fixtures/intelligence.json";

const identity = (key: string) => key;

describe("csvCell", () => {
  test("普通值加引号;null/undefined → 空串;数组 ' | ' 连接", () => {
    expect(csvCell("abc")).toBe('"abc"');
    expect(csvCell(0)).toBe('"0"');
    expect(csvCell(false)).toBe('"false"');
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
    expect(csvCell([1, 2])).toBe('"1 | 2"');
  });

  test("双引号翻倍;逗号留在引号内", () => {
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
  });

  test("公式注入防护:= + - @ 前缀(含前导空白)补单引号", () => {
    expect(csvCell("=cmd")).toBe('"\'=cmd"');
    expect(csvCell("+1")).toBe('"\'+1"');
    expect(csvCell("-5")).toBe('"\'-5"');
    expect(csvCell("@risk")).toBe('"\'@risk"');
    expect(csvCell(" =cmd")).toBe('"\' =cmd"');
    expect(csvCell("safe=1")).toBe('"safe=1"'); // 仅前缀触发
  });
});

describe("toCsv", () => {
  const emptyRow: CsvRow = { ip: "9.9.9.9", sections: [], at: 0 };

  test("BOM + CRLF + 表头为 t(key);恒选 ip/country/city/score,空列剔除", () => {
    // sections 空 → 除恒选列外仅 consensus(verdict.none)/queriedAt/status 非空
    expect(toCsv([emptyRow], identity)).toBe(
      "\uFEFF" +
        [
          '"csv.col.ip","csv.col.country","csv.col.city","csv.col.score","csv.col.consensus","csv.col.queriedAt","csv.col.status"',
          '"9.9.9.9","","","","verdict.none","1970-01-01T00:00:00.000Z","done"',
        ].join("\r\n"),
    );
  });

  test("任一行非空的列入选;全空列不入", () => {
    const withTor: SourceSection[] = [
      {
        sourceId: "abuseipdb",
        status: "ok",
        data: { score: 5, totalReports: 0, numDistinctUsers: 0, isTor: true, recentComments: [] },
      },
    ];
    const out = toCsv([emptyRow, { ip: "1.1.1.1", sections: withTor, at: 0 }], identity);
    expect(out).toContain('"csv.col.tor"'); // withTor 行 isTor=true → 列入选
    expect(out).toContain('"true"');
    expect(out).not.toContain('"csv.col.usage"'); // 两行都空 → 剔除
    expect(out.split("\r\n")).toHaveLength(3); // 表头 + 2 行
  });
});

describe("exportRecord parity:桌面 ≡ 插件端(同一 fixtures)", () => {
  const AT = 1760000000000;

  test.each([0, 1])("参考 IP %s 关键值一致(score/country/city/lat/lon/reports/cdn/verdict/consensusValue)", (i) => {
    const fx = fixtures[i];
    const a = fx.abuse.data;
    const sections: SourceSection[] = [
      { sourceId: "ipradar", status: "ok", data: fx.radar },
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
    const desktop = exportRecord({ ip: fx.radar.ip, sections, at: AT }, identity);
    // 插件端 exportRecord 对 score/reports/verdict 走 Row 字段透传(lookup() 会从 sections 填充)
    const extRow: Row = {
      ip: fx.radar.ip,
      queriedAt: new Date(AT).toISOString(),
      status: "done",
      errors: [],
      sections,
      score: a.abuseConfidenceScore,
      reports: a.totalReports,
      verdict: fx.radar.threat?.verdict,
    };
    const ext = extExportRecord(extRow);
    for (const key of [
      "score",
      "country",
      "city",
      "lat",
      "lon",
      "reports",
      "cdn",
      "verdict",
      "consensusValue",
    ] as const) {
      expect(desktop[key]).toEqual(ext[key]);
    }
    expect(desktop.score).toBe(a.abuseConfidenceScore); // 分数确实来自 sections 派生
  });
});

describe("defaultCsvName", () => {
  test("ip-radar-YYYYMMDD-HHmmss.csv", () => {
    expect(defaultCsvName(new Date(2026, 9, 17, 8, 5, 3))).toBe("ip-radar-20261017-080503.csv");
    expect(defaultCsvName()).toMatch(/^ip-radar-\d{8}-\d{6}\.csv$/);
  });
});
